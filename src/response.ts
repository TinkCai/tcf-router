import * as fs from 'fs';
import * as path from 'path';
import * as ejs from 'ejs';
import * as cookie from 'cookie';
import { Options, Data } from 'ejs';
import * as jwt from 'jsonwebtoken';
import { TcfApiRequest, TcfApiResponse } from './index';

const SECRET = process.env.ENCRYPTSECRET || 'scf-stack';

const CONTENT_TYPE_MAPPER = {
  '.aac': 'audio/aac',
  '.abw': 'application/x-abiword',
  '.arc': 'application/x-freearc',
  '.avi': 'video/x-msvideo',
  '.azw': 'application/vnd".amazon".ebook',
  '.bin': 'application/octet-stream',
  '.bmp': 'image/bmp',
  '.bz': 'application/x-bzip',
  '.bz2': 'application/x-bzip2',
  '.csh': 'application/x-csh',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd".openxmlformats-officedocument".wordprocessingml".document',
  '.eot': 'application/vnd".ms-fontobject',
  '.epub': 'application/epub+zip',
  '.gz': 'application/gzip',
  '.gif': 'image/gif',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.ico': 'image/vnd".microsoft".icon',
  '.ics': 'text/calendar',
  '.jar': 'application/java-archive',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.jsonld': 'application/ld+json',
  '.mid': 'audio/midi audio/x-midi',
  '.midi': 'audio/midi audio/x-midi',
  '.mjs': 'text/javascript',
  '.mp3': 'audio/mpeg',
  '.mpeg': 'video/mpeg',
  '.mpkg': 'application/vnd".apple".installer+xml',
  '.odp': 'application/vnd".oasis".opendocument".presentation',
  '.ods': 'application/vnd".oasis".opendocument".spreadsheet',
  '.odt': 'application/vnd".oasis".opendocument".text',
  '.oga': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.ogx': 'application/ogg',
  '.opus': 'audio/opus',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.php': 'application/x-httpd-php',
  '.ppt': 'application/vnd".ms-powerpoint',
  '.pptx':
    'application/vnd".openxmlformats-officedocument".presentationml".presentation',
  '.rar': 'application/vnd".rar',
  '.rtf': 'application/rtf',
  '.sh': 'application/x-sh',
  '.svg': 'image/svg+xml',
  '.swf': 'application/x-shockwave-flash',
  '.tar': 'application/x-tar',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.ts': 'video/mp2t',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.vsd': 'application/vnd".visio',
  '.wav': 'audio/wav',
  '.weba': 'audio/webm',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xhtml': 'application/xhtml+xml',
  '.xls': 'application/vnd".ms-excel',
  '.xlsx':
    'application/vnd".openxmlformats-officedocument".spreadsheetml".sheet',
  '.xml': 'application/xml',
  '.xul': 'application/vnd".mozilla".xul+xml',
  '.zip': 'application/zip',
  '.3gp': 'video/3gpp',
  '.3g2': 'video/3gpp2',
  '.7z': 'application/x-7z-compressed'
} as Record<string, string>;

const resourceNotFound = (path: string): SimpleResponse => {
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
    this.finalEvent = () => {};
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
    this._end = true;
    const onFinishEventResults = [];
    for (const event of this.eventsOnFinish) {
      onFinishEventResults.push(event(this));
    }
    Promise.all(onFinishEventResults).then(() => {
      if (typeof value === 'object' && (value as SimpleResponse).statusCode) {
        (value as SimpleResponse).headers = Object.assign(
          (value as TcfApiResponse).headers,
          this.headers
        );
      } else {
        value = {
          statusCode: this.statusCode || 200,
          headers: {
            'content-type': 'application/json',
            ...this.headers
          },
          body: value
        };
      }
      if ((value as TcfApiResponse).headers) {
        for (let key in (value as TcfApiResponse).headers) {
          if (
            (
              (value as TcfApiResponse).headers as Record<
                string,
                string | string[]
              >
            )[key] instanceof Array
          ) {
            if (!(value as TcfApiResponse).multiValueHeaders) {
              (value as TcfApiResponse).multiValueHeaders = {};
            }
            (
              (value as TcfApiResponse).multiValueHeaders as Record<string, any>
            )[key] = (value as TcfApiResponse).headers[key];
            delete (value as TcfApiResponse).headers[key];
          }
        }
      }
      this.result = value as SimpleResponse;
      this.finalEvent(this);
    });
  }

  json(value: Record<string, any> | any[]) {
    this.end(value);
    return this;
  }

  file(filePath: string) {
    if (fs.existsSync(filePath)) {
      let contentType;
      const filename = path.basename(filePath);
      if (filePath.indexOf('.') === -1) {
        contentType = 'text/plain';
      } else {
        const names = filename.split('.');
        const extension = names[names.length - 1];
        contentType = CONTENT_TYPE_MAPPER[`.${extension}`];
      }
      const body = fs.readFileSync(filePath).toString('base64');
      const response = {
        isBase64Encoded: true,
        statusCode: 200,
        headers: {
          'content-type': contentType
        },
        body
      } as SimpleResponse;
      this.end(response);
    } else {
      this.end(resourceNotFound(filePath));
    }
  }

  render(view: string, data: Data, options: Options) {
    if (this.options?.templateFolder) {
      const filePath = path.join(this.options.templateFolder, view + '.ejs');
      if (fs.existsSync(filePath)) {
        const tempResponse = {
          statusCode: this.statusCode || 200,
          headers: {
            'content-type': 'text/html'
          }
        };
        if (this.options.defaultTemplateData) {
          data = Object.assign(this.options.defaultTemplateData, data);
        }
        const headers = Object.assign(tempResponse.headers, this.headers);
        let template = fs.readFileSync(filePath, 'utf-8');
        options = options || { views: [this.options.templateFolder] };
        const body = ejs.render(template, data, options);
        const response = { ...tempResponse, headers, body };
        this.end(response);
      } else {
        this.end(resourceNotFound(view));
      }
    } else {
      this.end(resourceNotFound(view));
    }
  }

  redirect(url: string) {
    this.end({
      statusCode: this.statusCode || 302,
      headers: {
        'content-type': 'text/html',
        location: url.replace(/([^\u0000-\u00FF])/g, function ($) {
          return encodeURI($);
        }),
        ...this.headers
      }
    });
  }

  cookie(
    name: string,
    value: string | number | Record<string, any>,
    opts = {} as Record<string, any>
  ) {
    let maxAge, signedValue;
    let cookies = [];
    let val =
      typeof value === 'object' ? 'j:' + JSON.stringify(value) : String(value);
    if (opts.maxAge) {
      maxAge = opts.maxAge - 0;
      if (isNaN(maxAge)) throw new Error('maxAge should be a Number');
    }
    opts.path = opts.path || '/';
    opts.maxAge = opts.maxAge || 7200;
    const prevCookie = this.headers['Set-Cookie'] || '';
    if (opts.signed) {
      let signOption = opts.maxAge ? { expiresIn: opts.maxAge } : undefined;
      signedValue = jwt.sign(
        {
          data: val
        },
        SECRET,
        signOption
      );
      signedValue = 's:' + signedValue;
    } else {
      signedValue = val;
    }
    if (prevCookie) {
      if (prevCookie instanceof Array) {
        cookies = prevCookie;
      } else {
        cookies.push(prevCookie);
      }
    }
    const latestCookie = cookie.serialize(name, String(signedValue), opts);
    cookies.push(latestCookie);
    this.headers['Set-Cookie'] = cookies;
    return this;
  }

  clearCookie(name: string, options?: Record<string, any>) {
    const opts = Object.assign({ expires: new Date(1), path: '/' }, options);
    return this.cookie(name, '', opts);
  }

  error(e: Error | Record<string, any>) {
    let body,
      headers,
      statusCode = this.statusCode || 500;
    const createResponseBody = () => {
      if (e instanceof Error) {
        body = { statusCode: statusCode, message: e.message, stack: e.stack };
      } else if (typeof e === 'object') {
        body = { statusCode: statusCode, data: e };
      } else {
        body = { statusCode: statusCode, message: e };
      }
      headers = {
        'content-type': 'application/json'
      };
    };
    if (this.req.httpMethod === 'GET') {
      if (!isJsonRequest(this.req.headers)) {
        headers = {
          'content-type': 'text/plain'
        };
        if (e instanceof Error) {
          body = `${e.stack}`;
        } else if (typeof e === 'object') {
          body = JSON.stringify(e);
        } else {
          body = e;
        }
      } else {
        createResponseBody();
      }
    } else {
      createResponseBody();
    }
    this.end({
      statusCode,
      headers,
      body
    });
  }

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
