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
      return import(targetPath);
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

export type RoutePath = TcfApiHandler | string | string[];

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
    paths: RoutePath,
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

  put(paths: RoutePath, handler?: TcfApiHandler) {
    this.add(paths, handler, 'PUT');
  }

  get(paths: RoutePath, handler?: TcfApiHandler) {
    this.add(paths, handler, 'GET');
  }

  post(paths: RoutePath, handler?: TcfApiHandler) {
    this.add(paths, handler, 'POST');
  }

  del(paths: RoutePath, handler?: TcfApiHandler) {
    this.add(paths, handler, 'DELETE');
  }

  use(paths: RoutePath, handler?: TcfApiHandler) {
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

export { Simulator } from './simulator';

export class MpFunctionResponse {
  public result: any;
  private finalEvent: (res: MpFunctionResponse) => void;
  _end: boolean;

  constructor() {
    this.finalEvent = () => {
    };
    this._end = false;
  }

  finally(callback: (res: MpFunctionResponse) => void) {
    this.finalEvent = callback;
  }

  end(value: any) {
    this.result = value;
    this._end = true;
    this.finalEvent(this);
  }
}

export type MpFunctionHandler = (
  req: any,
  res: MpFunctionResponse,
  next: () => void,
  options?: Record<string, any>
) => Promise<void>;

export type MpRoutePath = MpFunctionHandler | string | string[];

export class MpFunctionRouter {
  private _handlers: any[];
  private _request: { body: any; path: string, params?: any };
  private _response: MpFunctionResponse;
  private context: any;


  constructor(event: any, context?: any) {
    this._handlers = [];
    this._request = { body: event, path: event.$url };
    delete event.$url;
    this._response = new MpFunctionResponse();
    this.context = context;
  }

  use(path: MpRoutePath, handler?: MpFunctionHandler) {
    if (typeof path === 'function') {
      handler = path;
      path = '';
    }

    this.add(path, handler);
  }

  add(paths: string | string[], handler?: MpFunctionHandler) {
    if (typeof paths === 'function') {
      handler = paths;
      this._handlers.push({ func: handler });
      return;
    }
    if (!(paths instanceof Array)) {
      paths = [paths as string];
    }
    for (const path of paths) {
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

  executeHandler(
    handler: {
      func: MpFunctionHandler;
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
          this.context
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
