import { TcfApiHandler, TcfApiRequest, TcfApiResponse } from '../index';
import * as cookie from 'cookie';
import * as signature from 'cookie-signature';

const SECRET = process.env.ENCRYPTSECRET || 'scf-stack';

const cookieParser: TcfApiHandler = async (
  req: TcfApiRequest,
  res: TcfApiResponse,
  next: () => void
) => {
  if (req.cookies) {
    return next();
  }
  const cookies = req.headers.cookie;
  req.cookies = Object.create(null);
  req.signedCookies = Object.create(null);

  // no cookies
  if (!cookies) {
    return next();
  }
  req.cookies = cookie.parse(cookies, {});

  // parse signed cookies
  req.signedCookies = signedCookies(req.cookies, SECRET);
  req.signedCookies = JSONCookies(req.signedCookies);

  // parse JSON cookies
  req.cookies = JSONCookies(req.cookies);

  // merge
  req.cookies = Object.assign(req.cookies, req.signedCookies);
  next();
};

function JSONCookie(str: string): any | undefined {
  if (typeof str !== 'string' || str.substr(0, 2) !== 'j:') {
    return undefined;
  }

  try {
    return JSON.parse(str.slice(2));
  } catch (err) {
    return undefined;
  }
}

function JSONCookies(obj: Record<string, any>): Record<string, any> {
  const cookies: string[] = Object.keys(obj);
  let key: string;
  let val: any;

  for (let i = 0; i < cookies.length; i++) {
    key = cookies[i];
    val = JSONCookie(obj[key]);

    if (val) {
      obj[key] = val;
    }
  }

  return obj;
}

function signedCookie(str: string, secret: string | string[]): string | boolean | undefined {
  if (typeof str !== 'string') {
    return undefined;
  }

  if (str.substr(0, 2) !== 's:') {
    return str;
  }

  const secrets: string[] = secret ? (Array.isArray(secret) ? secret : [secret]) : [secret];

  for (let i = 0; i < secrets.length; i++) {
    const val: string | false = signature.unsign(str.slice(2), secrets[i]);

    if (val !== false) {
      return val;
    }
  }

  return false;
}

function signedCookies(obj: Record<string, any>, secret: string | string[]): Record<string, any> {
  const cookies: string[] = Object.keys(obj);
  let dec: string | boolean | undefined;
  let key: string;
  const ret: Record<string, any> = Object.create(null);
  let val: any;

  for (let i = 0; i < cookies.length; i++) {
    key = cookies[i];
    val = obj[key];
    dec = signedCookie(val, secret);

    if (val !== dec) {
      ret[key] = dec;
      delete obj[key];
    }
  }

  return ret;
}

export default cookieParser;