import * as http from 'http';
import * as https from 'https';
import { ServerOptions } from 'https';
import express = require('express');
import bodyParser = require('body-parser');
import { TcfApiRequest, TcfApiResponse, TcfContext } from '../index';
import { SimpleResponse } from '../response';

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

const parse = (rawBody: string) => {
  const params = rawBody.split('&');
  const body = {} as Record<string, any>;
  for (let param of params) {
    const str = param.split('=');
    body[str[0]] = str[1];
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
    for (let key in env) {
      process.env[key] = env[key];
    }
  }

  getDecoratedRequest(
    req: ExpressRequest,
    rawBody: string | Record<string, any>
  ) {
    const getPathAndParameters = (url: string) => {
      let pathEndIndex = url.indexOf('?');
      pathEndIndex = pathEndIndex > -1 ? pathEndIndex : url.length;
      return {
        path: url.substring(0, pathEndIndex),
        parameters:
          pathEndIndex === url.length
            ? {}
            : parse(url.substring(pathEndIndex + 1))
      };
    };
    const request = {} as TcfApiRequest;
    const queryObject = getPathAndParameters(req.url);
    request.headers = req.headers;
    request.path = queryObject.path;
    request.httpMethod = req.method;
    request.requestContext = {
      requestId: 'mock-request-' + new Date().getTime(),
      envId: this.envConfig.context?.envId,
      appId: this.envConfig.context?.appId,
      uin: this.envConfig.context?.uin
    };
    request.queryStringParameters = queryObject.parameters;
    if (typeof rawBody === 'object') {
      request.body = JSON.stringify(rawBody);
    } else {
      request.body = rawBody;
    }
    if (req.headers) {
      req.headers[`x-forwarded-proto`] = req.headers[`x-client-proto`] = this
        .envConfig.devServer?.https
        ? 'https'
        : 'http';
      req.headers[`x-client-proto-ver`] = `HTTP/${req.httpVersion}`;
      req.headers[`x-real-ip`] = req.headers[`x-forwarded-for`] =
        req.connection.remoteAddress;
    }
    req.headers[`isBase64Encoded`] = false;
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
  ) {
    this.entrance = entrance;
    const app = express();
    app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
    app.use(bodyParser.json({ limit: '50mb' }));

    const self = this;
    // @ts-ignore
    app.use((req: ExpressRequest, res: ExpressResponse) => {
      (
        self.entrance as (
          request: TcfApiRequest,
          context: TcfContext
        ) => Promise<SimpleResponse>
      )(
        this.getDecoratedRequest(req, req.body) as TcfApiRequest,
        {} as TcfContext
      )
        .then(
          (
            response: SimpleResponse | string | number | Record<string, any>
          ) => {
            if (typeof response === 'string' || typeof response === 'number') {
              res
                .status(200)
                .set({
                  'Content-Length': Buffer.byteLength(response + ''),
                  'Content-Type': 'text/plain'
                })
                .end(response);
            } else if (typeof response === 'object') {
              if (response.statusCode) {
                response.headers = Object.assign(
                  response.headers,
                  response.multiValueHeaders || {}
                );
                if (typeof response.body === 'object') {
                  res
                    .status(response.statusCode)
                    .set(response.headers)
                    .send(response.body);
                } else {
                  let body;
                  if (response.isBase64Encoded) {
                    body = new Buffer(response.body, 'base64');
                  } else {
                    body = response.body;
                  }
                  res
                    .status(response.statusCode)
                    .set(response.headers)
                    .end(body);
                }
              } else {
                res
                  .status(200)
                  .set({
                    'Content-Length': Buffer.byteLength(
                      JSON.stringify(response)
                    ),
                    'Content-Type': 'application/json'
                  })
                  .end(JSON.stringify(response));
              }
            }
          }
        )
        .catch((e) => {
          console.error(e.stack);
          res.status(500).send(e.message);
        });
    });
    let server;
    if (this.envConfig?.devServer?.https) {
      server = https.createServer(httpsOptions || {}, app);
    } else {
      server = http.createServer(app);
    }
    server.listen(this.envConfig?.devServer?.port || 3001);
    console.log(
      `the service is running at ${
        this.envConfig?.devServer?.https ? 'https' : 'http'
      }://localhost:${this.envConfig?.devServer?.port || 3001}`
    );
    return server;
  }
}
