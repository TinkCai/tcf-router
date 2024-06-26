/// <reference types="node" />
import { Response } from './response';
export type TcfApiHandler = (req: TcfApiRequest, res: TcfApiResponse, next: () => void, options?: Record<string, any>) => Promise<void>;
export type AddRoutes = (sr: Router) => {};
export type ContinueFlag = {
    result?: any;
    next: boolean;
};
export { default as bodyParser } from './middlewares/body.parser';
export { default as staticHandler } from './middlewares/static.handler';
export { default as cookieParser } from './middlewares/cookie.parser';
export declare class LayerLoader {
    rootPath: string;
    layers: string[];
    constructor(layers?: string[], rootPath?: string);
    load(filename: string): Promise<any>;
}
export interface TcfApiRequest {
    params?: {
        [name: string]: string | undefined;
    };
    _body?: string | Buffer | ArrayBuffer | Uint8Array;
    body?: string | Buffer | ArrayBuffer | Uint8Array | {
        [name: string]: any;
    };
    cookies?: {
        [name: string]: any;
    };
    sd?: {
        [name: string]: any;
    };
    meta?: {
        [name: string]: any;
    };
    headers: {
        [name: string]: string;
    };
    multiValueHeaders?: {
        [name: string]: string[] | undefined;
    };
    httpMethod: string;
    isBase64Encoded: boolean;
    path: string;
    queryStringParameters?: {
        [name: string]: string | undefined;
    };
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
    }[];
    dependencies: {
        [name: string]: string;
    };
    devDependencies?: {
        [name: string]: string;
    };
    triggers?: {
        name: string;
        type: string;
        config: string;
    }[];
}
export type RoutePath = TcfApiHandler | string | string[];
export declare class Router {
    private readonly _handlers;
    private readonly _request;
    private readonly options;
    _response: Response;
    constructor(request: TcfApiRequest, options?: Record<string, any>);
    add(paths: RoutePath, handler?: TcfApiHandler, method?: string): void;
    extends(prefix: string | AddRoutes, addRoute?: AddRoutes | string): void;
    put(paths: RoutePath, handler?: TcfApiHandler): void;
    get(paths: RoutePath, handler?: TcfApiHandler): void;
    post(paths: RoutePath, handler?: TcfApiHandler): void;
    del(paths: RoutePath, handler?: TcfApiHandler): void;
    use(paths: RoutePath, handler?: TcfApiHandler): void;
    executeHandler(handler: {
        func: TcfApiHandler;
        params: Record<string, string>;
    }, flags: ContinueFlag): Promise<{
        continue: boolean;
        result?: any;
    }>;
    /**
     * start the route server
     */
    serve(): Promise<any>;
}
export { Simulator } from './simulator';
export declare class MpFunctionResponse {
    result: any;
    private finalEvent;
    _end: boolean;
    constructor();
    finally(callback: (res: MpFunctionResponse) => void): void;
    end(value: any): void;
}
export type MpFunctionHandler = (req: any, res: MpFunctionResponse, next: () => void, options?: Record<string, any>) => Promise<void>;
export type MpRoutePath = MpFunctionHandler | string | string[];
export declare class MpFunctionRouter {
    private _handlers;
    private _request;
    private _response;
    private context;
    constructor(event: any, context?: any);
    use(path: MpRoutePath, handler?: MpFunctionHandler): void;
    add(paths: string | string[], handler?: MpFunctionHandler): void;
    executeHandler(handler: {
        func: MpFunctionHandler;
        params: Record<string, string>;
    }, flags: ContinueFlag): Promise<{
        continue: boolean;
        result?: any;
    }>;
    /**
     * start the route server
     */
    serve(): Promise<any>;
}
