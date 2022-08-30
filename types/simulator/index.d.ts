/// <reference types="node" />
/// <reference types="node" />
import * as http from 'http';
import * as https from 'https';
import { ServerOptions } from 'https';
import { TcfApiRequest, TcfContext } from '../index';
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
export declare class Simulator {
    private envConfig;
    private entrance?;
    setEnv(env: Record<string, string>): void;
    getDecoratedRequest(req: ExpressRequest, rawBody: string | Record<string, any>): TcfApiRequest;
    constructor(envConfig: EnvConfig);
    deploy(entrance: (request: TcfApiRequest, context: TcfContext) => Promise<SimpleResponse>, httpsOptions?: ServerOptions): https.Server | http.Server;
}
export {};
