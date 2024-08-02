import { Options, Data } from 'ejs';
import { TcfApiRequest } from './index';
export declare const resourceNotFound: (path: string) => SimpleResponse;
export interface SimpleResponse {
    body: {
        [name: string]: any;
    } | string;
    isBase64Encoded?: boolean;
    statusCode: number;
    headers?: {
        [name: string]: any;
    };
    multiValueHeaders?: {
        [name: string]: any;
    };
}
export declare class Response {
    private req;
    private _res;
    private options?;
    private readonly headers;
    private readonly eventsOnFinish;
    private finalEvent;
    statusCode: number;
    private _end;
    result?: SimpleResponse;
    constructor(req: TcfApiRequest, options?: Record<string, any>);
    onFinish(callback: (res: Response) => any): void;
    finally(callback: (res: Response) => void): void;
    _setStatus(code: number): void;
    status(code: number): this;
    end(value: string | Record<string, any> | any[] | SimpleResponse): void;
    json(value: Record<string, any> | any[]): this;
    file(filePath: string): void;
    render(view: string, data: Data, options: Options): void;
    redirect(url: string): void;
    cookie(name: string, value: string | number | Record<string, any>, opts?: Record<string, any>): this;
    clearCookie(name: string, options?: Record<string, any>): this;
    error(e: Error | Record<string, any>): void;
    notAuthorized(e: Error | Record<string, any>): void;
    text(str: string): void;
}
