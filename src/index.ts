import { Response } from './response';
import { match } from 'path-to-regexp';

const fs = require('fs');

export type TcfApiHandler = (
  req: TcfApiRequest,
  res: TcfApiResponse,
  next: () => void,
  options?: Record<string, any>
) => Promise<void>;
export type AddRoutes = (sr: Router) => {};
export type ContinueFlag = { result?: any; next: boolean };
export { default as bodyParser } from './middlewares/body.parser';
export { default as staticHandler } from './middlewares/static.handler';
export { default as cookieParser } from './middlewares/cookie.parser';
export { default as protocolMiddleware } from './middlewares/protocol.middleware';

export class LayerLoader {
  rootPath: string;
  layers: string[];

  constructor(layers?: string[], rootPath?: string, ) {
    this.rootPath = rootPath || process.env.LAYER_PATH || '/opt';
    this.layers = layers || (process.env.LAYER_NAMES ? process.env.LAYER_NAMES?.split(',') : '') || [];
  }

  async load(filename: string) {
    let targetPath = '';
    this.layers.forEach((layer) => {
      const pathA = fs.existsSync(`${this.rootPath}/${layer}/${filename}.ts`);
      const pathB = fs.existsSync(`${this.rootPath}/${layer}/${filename}.js`);
      if (pathA || pathB) {
        targetPath = `${this.rootPath}/${layer}/${filename}`;
      }
    });
    if (targetPath) {
      return await import(targetPath);
    } else {
      throw new Error(`module not found: ${filename}`);
    }
  }
}

export interface TcfApiRequest {
  params?: { [name: string]: string | undefined };
  _body?: string | Buffer | ArrayBuffer | Uint8Array;
  body?: string | Buffer | ArrayBuffer | Uint8Array | { [name: string]: any };
  cookies?: { [name: string]: any };
  sd?: { [name: string]: any };
  meta?: { [name: string]: any };
  headers: { [name: string]: string };
  multiValueHeaders?: { [name: string]: string[] | undefined };
  httpMethod: string;
  isBase64Encoded: boolean;
  path: string;
  queryStringParameters?: { [name: string]: string | undefined };
  requestContext: {
    appId: string;
    envId: string;
    requestId: string;
    uin: string;
  };
}

export interface TcfApiResponse extends Response {
  multiValueHeaders?: Record<string, any>;
}

export interface TcfContext extends Record<string, string> {
}

export interface TcfFunctionApp {
  path: string;
  name: string;
  entrance: {
    main: TcfApiHandler;
    createApp: (req: TcfApiRequest, context: Record<string, any>) => Router;
  };
}

export interface TcfFunctionConfig {
  functionPath: string;
  path: string;
  name: string;
  timeout?: number;
  runtime?: string;
  envVariables: string[];
  isCompressed: boolean;
  layers: {
    name: string;
    version?: number;
  }[],
  dependencies: { [name: string]: string },
  devDependencies?: { [name: string]: string }
}

export class Router {
  private readonly _handlers: any[];
  private readonly _request: TcfApiRequest;
  private readonly options: Record<string, any>;
  public _response: Response;

  constructor(request: TcfApiRequest, options?: Record<string, any>) {
    this._handlers = [];
    this._request = request;
    this.options = options || {};
    this._response = new Response(this._request, this.options);
  }

  add(
    paths: TcfApiHandler | string | string[],
    handler?: TcfApiHandler,
    method?: string
  ) {
    let fixedPaths: string[];
    const pathPrefix = this.options.pathPrefix || '';
    if (typeof paths === 'function') {
      handler = paths;
      if (!pathPrefix) {
        this._handlers.push({ func: handler });
        return;
      } else {
        paths = [''];
        fixedPaths = [pathPrefix || ''];
      }
    }
    if (method === 'ALL' || method === this._request.httpMethod) {
      if (!(paths instanceof Array)) {
        paths = [paths];
      }
      fixedPaths = paths.map((path) => {
        return `${pathPrefix}${path}`;
      });
      for (const path of fixedPaths) {
        const regTester = match(path, { decode: decodeURIComponent });
        const testResult = regTester(this._request.path);
        if (testResult) {
          this._handlers.push({
            func: handler,
            params: testResult.params,
            path
          });
        }
      }
    }
  }

  extends(prefix: string | AddRoutes, addRoute?: AddRoutes | string) {
    let sr;
    if (typeof prefix === 'function') {
      sr = new Router(this._request);
      addRoute = prefix;
    } else {
      sr = new Router(this._request, { pathPrefix: prefix });
    }
    (addRoute as AddRoutes)(sr);
    for (const handler of sr._handlers) {
      this._handlers.push(handler);
    }
  }

  put(paths: string | TcfApiHandler, handler?: TcfApiHandler) {
    this.add(paths, handler, 'PUT');
  }

  get(paths: string | TcfApiHandler, handler?: TcfApiHandler) {
    this.add(paths, handler, 'GET');
  }

  post(paths: string | TcfApiHandler, handler?: TcfApiHandler) {
    this.add(paths, handler, 'POST');
  }

  del(paths: string | TcfApiHandler, handler?: TcfApiHandler) {
    this.add(paths, handler, 'DELETE');
  }

  use(paths: string | TcfApiHandler, handler?: TcfApiHandler) {
    this.add(paths, handler, 'ALL');
  }

  executeHandler(
    handler: {
      func: TcfApiHandler;
      params: Record<string, string>;
    },
    flags: ContinueFlag
  ): Promise<{ continue: boolean; result?: any }> {
    return new Promise(async (resolve, reject) => {
      try {
        this._response.finally(() => {
          if (flags.next) {
            console.error('the next() was executed, so there is no result');
          } else {
            flags.result = true;
            resolve({
              continue: false,
              result: this._response.result
            });
          }
        });
        this._request.params = handler.params;
        await handler.func(
          this._request,
          this._response,
          () => {
            if (flags.result) {
              console.error('the response has been responded');
            } else {
              flags.next = true;
              resolve({
                continue: true
              });
            }
          },
          this.options
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * start the route server
   */
  async serve() {
    for (const handler of this._handlers) {
      const flags = {
        next: false,
        result: false
      };
      const out = await this.executeHandler(handler, flags);
      if (!out.continue) {
        return out.result;
      }
    }
  }
}
