import * as fs from 'fs';
import * as path from 'path';
import * as ejs from 'ejs';
import * as cookie from 'cookie';
import { Options, Data } from 'ejs';
import { TcfApiRequest } from './index';
import * as signature from 'cookie-signature';
import * as mime from 'mime-types';
import { CookieOptions } from 'express';

const DEFAULT_SECRET = process.env.ENCRYPTSECRET || 'scf-stack';

export const resourceNotFound = (path: string): SimpleResponse => {
  return {
    statusCode: 404,
    headers: {
      'content-type': 'application/html'
    },
    body: '<h1>404 Resource Not Found</h1>' + `<label>${path || ''}</label>`
  };
};

const isJsonRequest = (headers: Record<string, any>) => {
  if (headers.referer) {
    const accepts = headers.accept.split(',');
    for (const accept of accepts) {
      if (accept.includes('application/json')) {
        return true;
      }
    }
  }
  return false;
};

export interface SimpleResponse {
  body: { [name: string]: any } | string;
  isBase64Encoded?: boolean;
  statusCode: number;
  headers?: { [name: string]: any };
  multiValueHeaders?: { [name: string]: any };
}

export class Response {
  private req: TcfApiRequest;
  private _res: SimpleResponse;
  private options?: Record<string, any>;
  private readonly headers = {} as Record<string, any>;
  private readonly eventsOnFinish: ((res: Response) => any)[];
  private finalEvent: (res: Response) => void;
  public statusCode: number;
  private _end = false;
  public result?: SimpleResponse;

  constructor(req: TcfApiRequest, options?: Record<string, any>) {
    this.req = req;
    this._res = { body: '', statusCode: 0 };
    this.headers = {};
    this.options = options;
    this.eventsOnFinish = [];
    this.finalEvent = () => {
    };
    this.statusCode = 0;
  }

  onFinish(callback: (res: Response) => any) {
    this.eventsOnFinish.push(callback);
  }

  finally(callback: (res: Response) => void) {
    this.finalEvent = callback;
  }

  _setStatus(code: number) {
    this.statusCode = code;
    this._res.statusCode = code;
  }

  status(code: number) {
    this._setStatus(code);
    return this;
  }

  end(value: string | Record<string, any> | any[] | SimpleResponse) {
    if (this._end) {
      console.warn('Response has already been sent');
      return;
    }

    this._end = true;
    const onFinishEventResults = this.eventsOnFinish.map(event => event(this));

    Promise.all(onFinishEventResults).then(() => {
      const formattedResponse = this.formatResponse(value);
      if (formattedResponse.headers) {
        for (let key in formattedResponse.headers) {
          if (formattedResponse.headers[key] instanceof Array) {
            if (!formattedResponse.multiValueHeaders) {
              formattedResponse.multiValueHeaders = {};
            }
            formattedResponse.multiValueHeaders[key] = formattedResponse.headers[key];
            delete formattedResponse.headers[key];
          }
        }
      }
      this.result = formattedResponse;
      this.finalEvent(this);
    });
  }

  private formatResponse(value: string | Record<string, any> | any[] | SimpleResponse): SimpleResponse {
    if (this.isSimpleResponse(value)) {
      return {
        ...value,
        headers: Object.assign({}, value.headers ?? {}, this.headers)
      };
    }

    return {
      statusCode: this.statusCode || 200,
      headers: {
        'content-type': 'application/json',
        ...this.headers
      },
      body: value
    };
  }

  private isSimpleResponse(value: any): value is SimpleResponse {
    return typeof value === 'object' && value !== null && 'statusCode' in value;
  }

  json(value: Record<string, any> | any[]) {
    this.end(value);
    return this;
  }

  file(filePath: string): void {
    if (!fs.existsSync(filePath)) {
      this.end(resourceNotFound(filePath));
      return;
    }

    try {
      const contentType = mime.lookup(filePath) || 'text/plain';
      const body = fs.readFileSync(filePath).toString('base64');

      const response: SimpleResponse = {
        isBase64Encoded: true,
        statusCode: 200,
        headers: {
          'content-type': contentType
        },
        body
      };

      this.end(response);
    } catch (error) {
      this.end(resourceNotFound(filePath));
    }
  }

  render(view: string, data: Data = {}, options: Options = {}): void {
    const templateFolder = this.options?.templateFolder;

    if (!templateFolder) {
      this.end(resourceNotFound(view));
      return;
    }

    const filePath = path.join(templateFolder, `${view}.ejs`);

    if (!fs.existsSync(filePath)) {
      this.end(resourceNotFound(view));
      return;
    }

    try {
      const mergedData = this.options?.defaultTemplateData
        ? { ...this.options.defaultTemplateData, ...data }
        : data;

      const template = fs.readFileSync(filePath, 'utf-8');
      const renderOptions: Options = {
        views: [templateFolder],
        ...options
      };

      const body = ejs.render(template, mergedData, renderOptions);

      const response: SimpleResponse = {
        statusCode: this.statusCode || 200,
        headers: {
          'content-type': 'text/html',
          ...this.headers
        },
        body
      };

      this.end(response);
    } catch (error) {
      this.error(error instanceof Error ? error : new Error('Template rendering failed'));
    }
  }

  redirect(url: string) {
    const encodedUrl = url.replace(/([^\u0000-\u00FF])/g, (match) => encodeURI(match));

    this.end({
      statusCode: this.statusCode || 302,
      headers: {
        'content-type': 'text/html',
        location: encodedUrl,
        ...this.headers
      }
    });
  }

  cookie(
    name: string,
    value: string | number | Record<string, any>,
    options?: CookieOptions
  ) {
    const serializedValue = this.serializeCookieValue(value);
    const opts = this.normalizeCookieOptions(options);

    const existingCookies = this.getExistingCookies();

    const finalValue = opts.signed
      ? signature.sign(serializedValue, DEFAULT_SECRET)
      : serializedValue;

    const cookieString = cookie.serialize(name, finalValue, opts);
    existingCookies.push(cookieString);

    this.headers['Set-Cookie'] = existingCookies;
    return this;
  }

  private serializeCookieValue(value: string | number | Record<string, any>): string {
    if (typeof value === 'object') {
      return 'j:' + JSON.stringify(value);
    }
    return String(value);
  }

  private normalizeCookieOptions(options?: CookieOptions): CookieOptions {
    const opts = { ...options };

    if (opts.maxAge != null) {
      const maxAge = parseInt(String(opts.maxAge), 10);
      if (isNaN(maxAge)) {
        throw new Error('maxAge should be a Number');
      }
      opts.maxAge = maxAge;
    }

    opts.path = opts.path ?? '/';

    return opts;
  }

  private getExistingCookies(): string[] {
    const existingCookies = this.headers['Set-Cookie'];
    if (!existingCookies) {
      return [];
    }
    return Array.isArray(existingCookies) ? existingCookies : [existingCookies];
  }

  clearCookie(name: string, options?: Record<string, any>) {
    const opts: CookieOptions = {
      ...options,
      expires: new Date(1),
      path: '/'
    };
    return this.cookie(name, '', opts);
  }

  error(e: Error | Record<string, any>) {
    const statusCode = this.statusCode || 500;
    const response = this.createErrorResponse(e, statusCode);
    this.end(response);
  }

  private createErrorResponse(e: Error | Record<string, any>, statusCode: number): SimpleResponse {
    const isGetRequest = this.req.httpMethod === 'GET';
    const isJson = isJsonRequest(this.req.headers);

    if (isGetRequest && !isJson) {
      return this.createPlainTextError(e);
    }

    return this.createJsonError(e, statusCode);
  }

  private createPlainTextError(e: Error | Record<string, any>): SimpleResponse {
    let body: string;
    if (e instanceof Error) {
      body = e.stack ?? e.message;
    } else if (typeof e === 'object') {
      body = JSON.stringify(e);
    } else {
      body = String(e);
    }

    return {
      statusCode: this.statusCode || 500,
      headers: {
        'content-type': 'text/plain'
      },
      body
    };
  }

  private createJsonError(e: Error | Record<string, any>, statusCode: number): SimpleResponse {
    let body: Record<string, any>;

    if (e instanceof Error) {
      body = {
        statusCode,
        message: e.message,
        stack: e.stack
      };
    } else if (typeof e === 'object') {
      body = { statusCode, data: e };
    } else {
      body = { statusCode, message: e };
    }

    return {
      statusCode,
      headers: {
        'content-type': 'application/json'
      },
      body
    };
  }

  /**
   * Send unauthorized response
   */
  notAuthorized(e: Error | Record<string, any>) {
    this.end({
      statusCode: this.statusCode || 401,
      headers: {
        'content-type': isJsonRequest(this.req.headers)
          ? 'application/json'
          : 'text/html'
      },
      body: e
    });
  }

  /**
   * Send plain text response
   */
  text(str: string) {
    this.end({
      statusCode: this.statusCode || 200,
      headers: {
        'content-type': 'text/plain'
      },
      body: str
    });
  }
}
