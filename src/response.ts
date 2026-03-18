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

/**
 * Creates a 404 Not Found response
 * @param path - The resource path that was not found
 * @returns A SimpleResponse object with 404 status and HTML body
 */
export const resourceNotFound = (path: string): SimpleResponse => {
  return {
    statusCode: 404,
    headers: {
      'content-type': 'application/html'
    },
    body: '<h1>404 Resource Not Found</h1>' + `<label>${path || ''}</label>`
  };
};

/**
 * Determines if the request expects JSON response based on Accept header
 * @param headers - HTTP request headers
 * @returns true if application/json is in the Accept header, false otherwise
 */
const isJsonRequest = (headers: Record<string, any>): boolean => {
  if (!headers?.accept) {
    return false;
  }

  const accepts = headers.accept.split(',');
  return accepts.some((accept: string | string[]) => accept.includes('application/json'));
};

/**
 * SimpleResponse interface representing the HTTP response structure
 */
export interface SimpleResponse {
  body: { [name: string]: any } | string;
  isBase64Encoded?: boolean;
  statusCode: number;
  headers?: { [name: string]: any };
  multiValueHeaders?: { [name: string]: any };
}

/**
 * Response class for handling HTTP responses in TCF API
 * Provides methods for sending various response types (JSON, HTML, files, cookies, etc.)
 */
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

  /**
   * Register a callback to be executed when the response finishes
   * @param callback - Function to execute with the Response instance
   */
  onFinish(callback: (res: Response) => any) {
    this.eventsOnFinish.push(callback);
  }

  /**
   * Set the final event callback that executes after response completion
   * @param callback - Function to execute with the Response instance
   */
  finally(callback: (res: Response) => void) {
    this.finalEvent = callback;
  }

  /**
   * Internal method to set HTTP status code
   * @param code - HTTP status code
   */
  _setStatus(code: number) {
    this.statusCode = code;
    this._res.statusCode = code;
  }

  /**
   * Set HTTP status code and return this for chaining
   * @param code - HTTP status code (e.g., 200, 404, 500)
   * @returns This Response instance for method chaining
   */
  status(code: number) {
    this._setStatus(code);
    return this;
  }

  /**
   * End the response and send the final data
   * @param value - Response data (string, object, array, or SimpleResponse)
   */
  end(value: string | Record<string, any> | any[] | SimpleResponse) {
    if (this._end) {
      console.warn('Response has already been sent');
      return;
    }
    this._end = true;
    const onFinishEventResults = this.eventsOnFinish.map((event) => event(this));

    Promise.all(onFinishEventResults).then(() => {
      const formattedResponse = this.formatResponse(value);

      if (formattedResponse.headers) {
        for (const key in formattedResponse.headers) {
          if (Array.isArray(formattedResponse.headers[key])) {
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

  /**
   * Format response data into proper SimpleResponse structure
   * @param value - The response value to format
   * @returns Formatted SimpleResponse object
   */
  private formatResponse(value: string | Record<string, any> | any[] | SimpleResponse): SimpleResponse {
    if (this.isSimpleResponse(value)) {
      return {
        ...value,
        headers: { ...value.headers, ...this.headers }
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

  /**
   * Type guard to check if value is a SimpleResponse
   * @param value - Value to check
   * @returns true if value is SimpleResponse, false otherwise
   */
  private isSimpleResponse(value: any): value is SimpleResponse {
    return typeof value === 'object' && value !== null && 'statusCode' in value;
  }

  /**
   * Send JSON response
   * @param value - JSON-serializable object or array
   * @returns This Response instance for method chaining
   */
  json(value: Record<string, any> | any[]) {
    this.end(value);
    return this;
  }

  /**
   * Send file response by reading and encoding file content
   * @param filePath - Absolute path to the file to send
   */
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

  /**
   * Render EJS template and send HTML response
   * @param view - Template name (without .ejs extension)
   * @param data - Template data variables
   * @param options - EJS render options
   */
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

  /**
   * Send HTTP redirect response
   * @param url - URL to redirect to
   */
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

  /**
   * Set a cookie in the response headers
   * @param name - Cookie name
   * @param value - Cookie value (string, number, or object)
   * @param options - Cookie options (path, expires, signed, etc.)
   * @returns This Response instance for method chaining
   */
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

  /**
   * Serialize cookie value, converting objects to JSON with 'j:' prefix
   * @param value - Cookie value to serialize
   * @returns Serialized cookie value string
   */
  private serializeCookieValue(value: string | number | Record<string, any>): string {
    if (typeof value === 'object') {
      return 'j:' + JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Normalize and validate cookie options
   * @param options - Raw cookie options
   * @returns Normalized CookieOptions with validated maxAge and default path
   * @throws Error if maxAge is provided but not a valid number
   */
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

  /**
   * Get existing cookies from Set-Cookie header as an array
   * @returns Array of existing cookie strings
   */
  private getExistingCookies(): string[] {
    const existingCookies = this.headers['Set-Cookie'];
    if (!existingCookies) {
      return [];
    }
    return Array.isArray(existingCookies) ? existingCookies : [existingCookies];
  }

  /**
   * Clear a cookie by setting its expiration to epoch time
   * @param name - Name of the cookie to clear
   * @param options - Additional cookie options
   * @returns This Response instance for method chaining
   */
  clearCookie(name: string, options?: Record<string, any>) {
    const opts: CookieOptions = {
      ...options,
      expires: new Date(1),
      path: '/'
    };
    return this.cookie(name, '', opts);
  }

  /**
   * Send error response with appropriate status code and content type
   * @param e - Error object, plain object, or error message string
   */
  error(e: Error | Record<string, any> | string) {
    const statusCode = this.statusCode || 500;
    const response = this.createErrorResponse(e, statusCode);
    this.end(response);
  }

  /**
   * Create error response based on request type (JSON vs plain text)
   * @param e - Error data
   * @param statusCode - HTTP status code
   * @returns SimpleResponse with error details
   */
  private createErrorResponse(e: Error | Record<string, any> | string, statusCode: number): SimpleResponse {
    const httpMethod = this.req.httpMethod || 'GET';
    const headers = this.req.headers || {};
    const isGetRequest = httpMethod === 'GET';
    const isJson = isJsonRequest(headers);

    if (isGetRequest && !isJson) {
      return this.createPlainTextError(e);
    }

    return this.createJsonError(e, statusCode);
  }

  /**
   * Create plain text error response
   * @param e - Error data
   * @returns SimpleResponse with plain text error body
   */
  private createPlainTextError(e: Error | Record<string, any> | string): SimpleResponse {
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

  /**
   * Create JSON formatted error response
   * @param e - Error data
   * @param statusCode - HTTP status code
   * @returns SimpleResponse with JSON error body containing statusCode and message/stack
   */
  private createJsonError(e: Error | Record<string, any> | string, statusCode: number): SimpleResponse {
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
   * Send 401 Unauthorized response
   * @param e - Error object, plain object, or message string
   */
  notAuthorized(e: Error | Record<string, any> | string) {
    const isErrorObject = e instanceof Error;
    const responseData = isErrorObject
      ? { statusCode: 401, message: e.message }
      : typeof e === 'object'
        ? { statusCode: 401, data: e }
        : { statusCode: 401, message: String(e) };

    this.end({
      statusCode: this.statusCode || 401,
      headers: {
        'content-type': isJsonRequest(this.req.headers || {})
          ? 'application/json'
          : 'text/html'
      },
      body: responseData
    });
  }

  /**
   * Send plain text response
   * @param str - Plain text string to send
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
