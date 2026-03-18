import { TcfApiHandler, TcfApiRequest, TcfApiResponse } from '../index';
import { URLSearchParams } from 'url';

enum ContentType {
  MULTIPART_FORM_DATA = 'multipart/form-data',
  APPLICATION_JSON = 'application/json',
  TEXT_PLAIN = 'text/plain',
  APPLICATION_XML = 'application/xml',
  TEXT_XML = 'text/xml',
  APPLICATION_FORM_ENCODED = 'application/x-www-form-urlencoded'
}

/**
 * Extract content type from headers
 * @param headers - HTTP request headers
 * @returns Detected content type
 */
const getContentType = (headers: { [name: string]: string }): string => {
  const contentTypeHeader = headers['content-type'];
  
  if (!contentTypeHeader) {
    return ContentType.APPLICATION_JSON;
  }

  const types = typeof contentTypeHeader === 'string'
    ? contentTypeHeader.split(';')
    : Array.isArray(contentTypeHeader)
      ? contentTypeHeader
      : [];

  for (const type of types) {
    const normalizedType = type.toLowerCase().trim();
    
    switch (normalizedType) {
      case ContentType.MULTIPART_FORM_DATA:
        return ContentType.MULTIPART_FORM_DATA;
      case ContentType.APPLICATION_JSON:
        return ContentType.APPLICATION_JSON;
      case ContentType.TEXT_PLAIN:
        return ContentType.TEXT_PLAIN;
      case ContentType.APPLICATION_XML:
        return ContentType.APPLICATION_XML;
      case ContentType.TEXT_XML:
        return ContentType.TEXT_XML;
      case ContentType.APPLICATION_FORM_ENCODED:
        return ContentType.APPLICATION_FORM_ENCODED;
    }
  }

  return ContentType.APPLICATION_JSON;
};

/**
 * Parse query string into key-value object
 * @param queryString - URL encoded query string
 * @returns Parsed key-value object
 */
const parseQueryString = (queryString: string): Record<string, string> => {
  const usp = new URLSearchParams(queryString);
  const body: Record<string, string> = {};

  for (const [key, value] of usp.entries()) {
    body[key] = value;
  }

  return body;
};

/**
 * Body parser middleware
 * Parses request body based on Content-Type header
 * Supports JSON, form-urlencoded, and other formats
 */
const bodyParser: TcfApiHandler = async (
  req: TcfApiRequest,
  res: TcfApiResponse,
  next: () => void
) => {
  if (!req.body) {
    next();
    return;
  }

  const contentType = getContentType(req.headers);
  let parsedBody: any;

  try {
    if (contentType === ContentType.APPLICATION_JSON) {
      parsedBody = JSON.parse(req.body as string);
    } else if (contentType === ContentType.APPLICATION_FORM_ENCODED) {
      parsedBody = parseQueryString(req.body as string);
    } else {
      parsedBody = req.body;
    }
  } catch (error) {
    throw new Error(`Failed to parse body: ${req.body}`);
  }

  req._body = req.body as string;
  req.body = parsedBody;
  
  next();
};

export default bodyParser;
