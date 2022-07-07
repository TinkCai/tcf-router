import { TcfApiHandler, TcfApiRequest, TcfApiResponse } from '../index';

const SECRET = process.env.ENCRYPTSECRET || 'scf-stack';
import * as jwt from 'jsonwebtoken';
import * as cookie from 'cookie';
import { JwtPayload } from 'jsonwebtoken';

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

  // no cookies
  if (!cookies) {
    return next();
  }
  // parse signed cookies
  const unSignedCookies = unSignCookies(cookies);

  // parse JSON cookies
  req.cookies = convertCookieToJson(unSignedCookies);

  next();
};

function parseCookie(str: string | undefined) {
  if (typeof str === 'string' && str.startsWith('j:')) {
    try {
      return JSON.parse(str.slice(2));
    } catch (err) {
      return null;
    }
  } else {
    return str;
  }
}

function convertCookieToJson(obj: Record<string, any>) {
  const result = {} as Record<string, any>;
  for (let key in obj) {
    const val = parseCookie(obj[key]);
    if (val) {
      result[key] = val;
    }
  }
  return result;
}

function unSignCookies(cookiesFromHeader: string) {
  return cookie.parse(cookiesFromHeader, {
    decode: (str) => {
      const decodedStr = decodeURIComponent(str);
      if (decodedStr.startsWith('s:')) {
        try {
          return (jwt.verify(decodedStr.substr(2), SECRET) as JwtPayload).data;
        } catch (e) {
          return null;
        }
      } else {
        return decodedStr;
      }
    }
  });
}

export default cookieParser;
