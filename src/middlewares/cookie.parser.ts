import { TcfApiHandler, TcfApiRequest, TcfApiResponse } from '../index';
import * as cookie from 'cookie';
import * as signature from 'cookie-signature';

const DEFAULT_SECRET = process.env.ENCRYPTSECRET || 'scf-stack';

/**
 * Cookie parser middleware
 * Parses Cookie header and populates req.cookies and req.signedCookies
 * Supports JSON-encoded cookies (j: prefix) and signed cookies (s: prefix)
 */
const cookieParser: TcfApiHandler = async (
  req: TcfApiRequest,
  res: TcfApiResponse,
  next: () => void
) => {
  if (req.cookies) {
    next();
    return;
  }

  const cookieHeader = req.headers.cookie;
  
  req.cookies = Object.create(null);
  req.signedCookies = Object.create(null);

  if (!cookieHeader) {
    next();
    return;
  }

  req.cookies = cookie.parse(cookieHeader);

  const parsedSignedCookies = parseSignedCookies(req.cookies, DEFAULT_SECRET);
  req.signedCookies = parseJsonCookies(parsedSignedCookies);

  req.cookies = parseJsonCookies(req.cookies);

  Object.assign(req.cookies, req.signedCookies);
  
  next();
};

/**
 * Parse JSON-encoded cookie value
 * @param value - Cookie value to parse
 * @returns Parsed object or undefined if not a JSON cookie
 */
function parseJsonCookie(value: string): any {
  if (typeof value !== 'string' || !value.startsWith('j:')) {
    return undefined;
  }

  try {
    return JSON.parse(value.slice(2));
  } catch {
    return undefined;
  }
}

/**
 * Parse all JSON-encoded cookies in an object
 * @param cookies - Object containing cookie key-value pairs
 * @returns New object with parsed JSON cookies
 */
function parseJsonCookies(cookies: Record<string, any>): Record<string, any> {
  const result = { ...cookies };
  
  for (const [key, value] of Object.entries(result)) {
    const parsed = parseJsonCookie(value);
    if (parsed !== undefined) {
      result[key] = parsed;
    }
  }

  return result;
}

/**
 * Verify and parse signed cookie
 * @param value - Signed cookie value
 * @param secret - Secret key(s) for verification
 * @returns Unsigned value, false if invalid, or original value if not signed
 */
function parseSignedCookie(
  value: string,
  secret: string | string[]
): string | boolean | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  if (!value.startsWith('s:')) {
    return value;
  }

  const secrets = Array.isArray(secret) ? secret : [secret];

  for (const s of secrets) {
    const unsigned = signature.unsign(value.slice(2), s);
    if (unsigned !== false) {
      return unsigned;
    }
  }

  return false;
}

/**
 * Parse all signed cookies in an object
 * @param cookies - Object containing cookie key-value pairs
 * @param secret - Secret key(s) for verification
 * @returns Object containing only signed cookies with verified values
 */
function parseSignedCookies(
  cookies: Record<string, any>,
  secret: string | string[]
): Record<string, any> {
  const signedCookies = Object.create(null);

  for (const [key, value] of Object.entries(cookies)) {
    const unsigned = parseSignedCookie(value, secret);
    if (value !== unsigned) {
      signedCookies[key] = unsigned;
      delete cookies[key];
    }
  }

  return signedCookies;
}

export default cookieParser;