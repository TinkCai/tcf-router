import * as http from 'http';
import * as https from 'https';
import { ServerOptions } from 'https';
import express = require('express');
import bodyParser = require('body-parser');
import { TcfApiRequest, TcfContext } from '../index';
import { SimpleResponse } from '../response';
import { Server } from 'http';

export interface EnvConfig {
  appPath: string;
  functionEnvVariables: Record<string, string>;
  context?: Record<string, any>;
  devServer?: {
    https: ServerOptions | boolean;
    port: number;
  };
}

export interface DeploymentConfig {
  appPath: string;
  envVariables: Record<string, string>;
  secretId: string;
  secretKey: string;
  envId: string;
  ignoreFuncName: string[];
  focusFuncName: string[];
}

interface ExpressRequest {
  headers: Record<string, any>;
  method: string;
  httpVersion: string;
  connection: {
    remoteAddress: string;
  };
  url: string;
  body: string | Record<string, any>;
}

interface ExpressResponse {
  status: (statusCode: number) => ExpressResponse;
  send: (value: any) => void;
  set: (headers: Record<string, any>) => ExpressResponse;
  end: (value: any) => void;
}

const parse = (rawBody: string): Record<string, string> => {
  if (!rawBody || typeof rawBody !== 'string') {
    return {};
  }

  const params = rawBody.split('&');
  const body: Record<string, string> = {};

  for (const param of params) {
    if (!param) continue;

    const equalIndex = param.indexOf('=');
    if (equalIndex === -1) {
      body[decodeURIComponent(param)] = '';
    } else {
      const key = decodeURIComponent(param.substring(0, equalIndex));
      body[key] = decodeURIComponent(param.substring(equalIndex + 1));
    }
  }

  return body;
};

export class Simulator {
  private envConfig: EnvConfig;
  private entrance?: (
    request: TcfApiRequest,
    context: TcfContext
  ) => Promise<SimpleResponse>;

  setEnv(env: Record<string, string>) {
    for (const key in env) {
      process.env[key] = env[key];
    }
  }

  getDecoratedRequest(
    req: ExpressRequest,
    rawBody: string | Record<string, any>
  ): TcfApiRequest {
    const getPathAndParameters = (
      url: string
    ): { path: string; parameters: Record<string, string> } => {
      const queryIndex = url.indexOf('?');
      const pathEndIndex = queryIndex > -1 ? queryIndex : url.length;

      return {
        path: url.substring(0, pathEndIndex),
        parameters:
          queryIndex === -1 ? {} : parse(url.substring(queryIndex + 1))
      };
    };

    const request: TcfApiRequest = {
      headers: { ...req.headers },
      path: '',
      httpMethod: req.method,
      requestContext: {
        requestId: `mock-request-${Date.now()}`,
        envId: this.envConfig.context?.envId,
        appId: this.envConfig.context?.appId,
        uin: this.envConfig.context?.uin
      },
      queryStringParameters: {},
      body: '',
      isBase64Encoded: false
    };

    const queryObject = getPathAndParameters(req.url);
    request.path = queryObject.path;
    request.queryStringParameters = queryObject.parameters;

    if (
      request.headers['content-type']?.includes(
        'application/x-www-form-urlencoded'
      )
    ) {
      const formParams: string[] = [];
      const bodyObj = rawBody as Record<string, string>;

      for (const key in bodyObj) {
        if (Object.prototype.hasOwnProperty.call(bodyObj, key)) {
          formParams.push(
            `${encodeURIComponent(key)}=${encodeURIComponent(bodyObj[key])}`
          );
        }
      }

      request.body = formParams.join('&');
    } else {
      request.body =
        typeof rawBody === 'object' ? JSON.stringify(rawBody) : rawBody;
    }

    if (req.headers) {
      const protocol = this.envConfig.devServer?.https ? 'https' : 'http';
      request.headers['x-forwarded-proto'] = protocol;
      request.headers['x-client-proto'] = protocol;
      request.headers['x-client-proto-ver'] = `HTTP/${req.httpVersion}`;
      request.headers['x-real-ip'] = req.connection.remoteAddress;
      request.headers['x-forwarded-for'] = req.connection.remoteAddress;
    }

    request.isBase64Encoded = false;

    return request;
  }

  constructor(envConfig: EnvConfig) {
    this.envConfig = envConfig;
    this.setEnv(envConfig.functionEnvVariables);
  }

  deploy(
    entrance: (
      request: TcfApiRequest,
      context: TcfContext
    ) => Promise<SimpleResponse>,
    httpsOptions?: ServerOptions
  ): Server {
    this.entrance = entrance;
    const app = express();
    app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
    app.use(bodyParser.json({ limit: '50mb' }));

    // @ts-expect-error not reloaded func
    app.use((req: ExpressRequest, res: ExpressResponse) => {
      const handleRequest = async () => {
        try {
          const handler = this.entrance as (
            request: TcfApiRequest,
            context: TcfContext
          ) => Promise<SimpleResponse>;

          const response = await handler(
            this.getDecoratedRequest(req, req.body),
            {} as TcfContext
          );

          this.sendResponse(res, response);
        } catch (error: any) {
          console.error(error?.stack);
          res.status(500).send(error?.message || 'Internal Server Error');
        }
      };

      handleRequest();
    });

    const server = this.envConfig?.devServer?.https
      ? https.createServer(httpsOptions || {}, app)
      : http.createServer(app);

    const port = this.envConfig?.devServer?.port || 3001;
    server.listen(port);

    const protocol = this.envConfig?.devServer?.https ? 'https' : 'http';
    console.log(`The service is running at ${protocol}://localhost:${port}`);

    return server;
  }

  private sendResponse(
    res: ExpressResponse,
    response: SimpleResponse | string | number | Record<string, any>
  ): void {
    if (typeof response === 'string' || typeof response === 'number') {
      this.sendTextResponse(res, response.toString());
      return;
    }

    if (typeof response === 'object') {
      if ('statusCode' in response) {
        this.sendStructuredResponse(res, response as SimpleResponse);
      } else {
        this.sendJsonResponse(res, response);
      }
    }
  }

  private sendTextResponse(res: ExpressResponse, body: string): void {
    res
      .status(200)
      .set({
        'Content-Length': Buffer.byteLength(body),
        'Content-Type': 'text/plain'
      })
      .end(body);
  }

  private sendJsonResponse(
    res: ExpressResponse,
    data: Record<string, any>
  ): void {
    const body = JSON.stringify(data);
    res
      .status(200)
      .set({
        'Content-Length': Buffer.byteLength(body),
        'Content-Type': 'application/json'
      })
      .end(body);
  }

  private sendStructuredResponse(
    res: ExpressResponse,
    response: SimpleResponse
  ): void {
    const typedResponse = { ...response };

    if (typedResponse.multiValueHeaders) {
      typedResponse.headers = typedResponse.headers || {};

      for (const [key, values] of Object.entries(
        typedResponse.multiValueHeaders
      )) {
        if (Array.isArray(values)) {
          typedResponse.headers[key] =
            values.length > 1 ? values : values[0] || '';
        }
      }
    }

    const body = this.formatResponseBody(typedResponse);

    res
      .status(typedResponse.statusCode)
      .set(typedResponse.headers || {})
      .end(body);
  }

  private formatResponseBody(response: SimpleResponse): string | Buffer {
    const { body, isBase64Encoded } = response;

    if (isBase64Encoded && typeof body === 'string') {
      return Buffer.from(body, 'base64');
    }

    if (typeof body === 'object' && body !== null) {
      return JSON.stringify(body);
    }

    return body ?? '';
  }
}
