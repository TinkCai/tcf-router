import { Response } from './response';
import { match } from 'path-to-regexp';
import fs from 'fs';
import * as console from 'node:console';

export type TcfApiHandler = (
  req: TcfApiRequest,
  res: TcfApiResponse,
  next: () => void,
  options?: Record<string, any>
) => Promise<void> | void;

export type AddRoutes = (sr: Router) => void;

export type ContinueFlag = { result?: any; next: boolean };

export { default as bodyParser } from './middlewares/body.parser';
export { default as staticHandler } from './middlewares/static.handler';
export { default as cookieParser } from './middlewares/cookie.parser';

/**
 * LayerLoader for loading shared code from cloud function layers
 */
export class LayerLoader {
  rootPath: string;
  layers: string[];

  constructor(layers?: string[], rootPath?: string) {
    this.rootPath = rootPath || process.env.LAYER_PATH || '/opt';

    if (layers) {
      this.layers = layers;
    } else if (process.env.LAYER_NAMES) {
      this.layers = process.env.LAYER_NAMES.split(',').filter(
        (name) => name.trim() !== ''
      );
    } else {
      this.layers = [];
    }
  }

  async load(filename: string): Promise<any> {
    let targetPath = '';

    for (const layer of this.layers) {
      const tsPath = `${this.rootPath}/${layer}/${filename}.ts`;
      const jsPath = `${this.rootPath}/${layer}/${filename}.js`;

      if (fs.existsSync(tsPath)) {
        targetPath = tsPath;
        break;
      }

      if (fs.existsSync(jsPath)) {
        targetPath = jsPath;
        break;
      }
    }

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
  signedCookies?: { [name: string]: any };
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

export interface TcfContext extends Record<string, any> {}

export interface TcfFunctionApp {
  path: string;
  name: string;
  entrance: {
    main: (
      req: TcfApiRequest,
      context: Record<string, any>
    ) => any | Promise<any>;
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
  }[];
  dependencies: { [name: string]: string };
  devDependencies?: { [name: string]: string };
  triggers?: { name: string; type: string; config: string }[];
}

export type RoutePath = TcfApiHandler | string | string[];

interface Handler {
  func?: TcfApiHandler;
  params?: Record<string, string>;
  path?: string;
}

/**
 * Router class for handling HTTP routes in TCF environment
 * Provides Express-like routing functionality
 */
export class Router {
  private readonly _handlers: Handler[];
  private readonly _request: TcfApiRequest;
  private readonly options: Record<string, any>;
  public _response: Response;

  constructor(request: TcfApiRequest, options?: Record<string, any>) {
    this._handlers = [];
    this._request = request;
    this.options = options || {};
    this._response = new Response(this._request, this.options);
  }

  add(paths: RoutePath, handler?: TcfApiHandler, method?: string): void {
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
        paths = [paths as string];
      }

      fixedPaths = (paths as string[]).map((path) => `${pathPrefix}${path}`);

      for (const path of fixedPaths) {
        const matcher = match(path, { decode: decodeURIComponent });
        const testResult = matcher(this._request.path);
        if (testResult) {
          this._handlers.push({
            func: handler,
            params: testResult.params as Record<string, string>,
            path
          });
        }
      }
    }
  }

  extends(prefix: string | AddRoutes, addRoute?: AddRoutes): void {
    let sr: Router;

    if (typeof prefix === 'function') {
      sr = new Router(this._request);
      addRoute = prefix;
    } else {
      sr = new Router(this._request, { pathPrefix: prefix });
    }

    if (typeof addRoute === 'function') {
      addRoute(sr);

      for (const handler of sr._handlers) {
        this._handlers.push(handler);
      }
    }
  }

  getHandles() {
    return this._handlers;
  }

  put(paths: RoutePath, handler?: TcfApiHandler): void {
    this.add(paths, handler, 'PUT');
  }

  get(paths: RoutePath, handler?: TcfApiHandler): void {
    this.add(paths, handler, 'GET');
  }

  post(paths: RoutePath, handler?: TcfApiHandler): void {
    this.add(paths, handler, 'POST');
  }

  del(paths: RoutePath, handler?: TcfApiHandler): void {
    this.add(paths, handler, 'DELETE');
  }

  use(paths: RoutePath, handler?: TcfApiHandler): void {
    this.add(paths, handler, 'ALL');
  }

  executeHandler(
    handler: Handler,
    flags: ContinueFlag
  ): Promise<{ continue: boolean; result?: any }> {
    return new Promise((resolve, reject) => {
      const onFinally = () => {
        if (flags.next) {
          console.error('the next() was executed, so there is no result');
        } else {
          flags.result = true;
          resolve({
            continue: false,
            result: this._response.result
          });
        }
      };

      this._response.finally(onFinally);

      if (handler.params) {
        this._request.params = { ...handler.params };
      }

      if (handler.func) {
        handler
          .func(
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
          )
      }
    });
  }

  /**
   * Execute all matched handlers and return the response
   * @returns Promise resolving to response result
   */
  async serve(): Promise<any> {
    for (const handler of this._handlers) {
      const flags: ContinueFlag = {
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

/**
 * Response wrapper for Mini Program cloud functions
 */
export class MpFunctionResponse {
  public result: any;
  private finalEvent: (res: MpFunctionResponse) => void;
  _end: boolean;

  constructor() {
    this.finalEvent = () => {};
    this._end = false;
  }

  finally(callback: (res: MpFunctionResponse) => void): void {
    this.finalEvent = callback;
  }

  end(value: any): void {
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

interface MpHandler {
  func?: MpFunctionHandler;
  params?: Record<string, string>;
  path?: string;
}

/**
 * Router class for WeChat Mini Program cloud functions
 */
export class MpFunctionRouter {
  private readonly _handlers: MpHandler[];
  private _request: { body: any; path: string; params?: any };
  private _response: MpFunctionResponse;
  private context: any;

  constructor(event: any, context?: any) {
    this._handlers = [];
    this._request = {
      body: { ...event },
      path: event.$url
    };

    this.context = context;
    this._response = new MpFunctionResponse();
  }

  use(path: MpRoutePath, handler?: MpFunctionHandler): void {
    if (typeof path === 'function') {
      handler = path;
      path = '';
    }

    this.add(path as string | string[], handler);
  }

  add(
    paths: string | string[] | MpFunctionHandler,
    handler?: MpFunctionHandler
  ): void {
    if (typeof paths === 'function') {
      handler = paths;
      this._handlers.push({ func: handler });
      return;
    }

    const pathArray: string[] =
      paths instanceof Array ? paths : [paths as string];

    for (const path of pathArray) {
      const matcher = match(path, { decode: decodeURIComponent });
      const testResult = matcher(this._request.path);

      if (testResult) {
        this._handlers.push({
          func: handler,
          params: testResult.params as Record<string, string>,
          path
        });
      }
    }
  }

  executeHandler(
    handler: MpHandler,
    flags: ContinueFlag
  ): Promise<{ continue: boolean; result?: any }> {
    return new Promise((resolve, reject) => {
      const onFinally = () => {
        if (flags.next) {
          console.error('the next() was executed, so there is no result');
        } else {
          flags.result = true;
          resolve({
            continue: false,
            result: this._response.result
          });
        }
      };

      this._response.finally(onFinally);

      if (handler.params) {
        this._request.params = { ...handler.params };
      }

      if (handler.func) {
        handler
          .func(
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
          )
          .catch(reject);
      }
    });
  }

  /**
   * Execute all matched handlers and return the response
   * @returns Promise resolving to response result
   */
  async serve(): Promise<any> {
    for (const handler of this._handlers) {
      const flags: ContinueFlag = {
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
