import { TcfApiHandler, TcfApiRequest, TcfApiResponse } from '../index';
import { URLSearchParams } from 'url';

const CONTENT_TYPE = {
  MULTIPART_FORM_DATA: 'multipart/form-data',
  APPLICATION_JSON: 'application/json',
  TEXT_PLAIN: 'text/plain',
  APPLICATION_XML: 'application/xml',
  TEXT_XML: 'text/xml',
  APPLICATION_FORM_ENCODED: 'application/x-www-form-urlencoded'
};

const getContentType = (headers: { [name: string]: string }) => {
  const contentTypes = headers['content-type'];
  let types = [] as string[];
  if (!contentTypes) {
    return CONTENT_TYPE.APPLICATION_JSON;
  } else {
    if (typeof contentTypes === 'string') {
      types = contentTypes.split(';');
    } else if (
      typeof contentTypes === 'object' &&
      Array instanceof contentTypes
    ) {
      types = contentTypes;
    }
  }
  let contentType = CONTENT_TYPE.APPLICATION_JSON;
  for (let type of types) {
    switch (type.toLowerCase()) {
      case CONTENT_TYPE.MULTIPART_FORM_DATA: {
        contentType = CONTENT_TYPE.MULTIPART_FORM_DATA;
        break;
      }
      case CONTENT_TYPE.APPLICATION_JSON: {
        contentType = CONTENT_TYPE.APPLICATION_JSON;
        break;
      }
      case CONTENT_TYPE.TEXT_PLAIN: {
        contentType = CONTENT_TYPE.TEXT_PLAIN;
        break;
      }
      case CONTENT_TYPE.APPLICATION_XML: {
        contentType = CONTENT_TYPE.APPLICATION_XML;
        break;
      }
      case CONTENT_TYPE.TEXT_XML: {
        contentType = CONTENT_TYPE.TEXT_XML;
        break;
      }
      case CONTENT_TYPE.APPLICATION_FORM_ENCODED: {
        contentType = CONTENT_TYPE.APPLICATION_FORM_ENCODED;
        break;
      }
    }
  }
  return contentType;
};

const parseQuery = (queryString: string) => {
  const usp = new URLSearchParams(queryString);
  const entries = usp.entries();
  const body = {} as Record<string, any>;
  let done = false;
  let value: string[] | undefined;
  while (!done) {
    const next = entries.next();
    done = next.done as boolean;
    if (!done) {
      value = next.value || [];
      body[value[0]] = value[1];
    }
  }
  return body;
};

const parse = (async (
  req: TcfApiRequest,
  res: TcfApiResponse,
  next: () => void
) => {
  if (typeof res === 'function') {
    next = res;
    res = {} as TcfApiResponse;
  }
  if (!req.body) {
    next();
    return;
  }
  const contentType = getContentType(req.headers);
  let body;
  if (contentType === CONTENT_TYPE.APPLICATION_JSON) {
    try {
      body = JSON.parse(req.body as string);
    } catch (e) {
      throw new Error(`Not a valid json in the body: ${req.body}`);
    }
  } else if (contentType === CONTENT_TYPE.APPLICATION_FORM_ENCODED) {
    body = parseQuery(req.body as string);
  } else {
    body = req.body;
  }
  req._body = req.body as string;
  req.body = body;
  next();
}) as TcfApiHandler;

export default parse;
