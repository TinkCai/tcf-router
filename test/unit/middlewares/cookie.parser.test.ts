import cookieParser from '../../../src/middlewares/cookie.parser';
import { TcfApiRequest, TcfApiResponse } from '../../../src/index';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import * as signature from 'cookie-signature';

describe('cookieParser', () => {
  let mockRequest: Partial<TcfApiRequest>;
  let mockResponse: Partial<TcfApiResponse>;
  let next: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      headers: {}
    };
    mockResponse = {};
    next = jest.fn();
  });

  it('should call next() if cookies already exist', async () => {
    mockRequest.cookies = { existing: 'cookie' };

    await cookieParser(
      mockRequest as TcfApiRequest,
      mockResponse as TcfApiResponse,
      next
    );

    expect(next).toHaveBeenCalled();
  });

  it('should initialize cookies as empty object when no cookie header', async () => {
    await cookieParser(
      mockRequest as TcfApiRequest,
      mockResponse as TcfApiResponse,
      next
    );

    expect(mockRequest.cookies).toEqual({});
    expect(mockRequest.signedCookies).toEqual({});
    expect(next).toHaveBeenCalled();
  });

  it('should parse simple cookies', async () => {
    mockRequest.headers = { cookie: 'sessionId=abc123; userId=456' };

    await cookieParser(
      mockRequest as TcfApiRequest,
      mockResponse as TcfApiResponse,
      next
    );

    expect(mockRequest.cookies).toEqual({
      sessionId: 'abc123',
      userId: '456'
    });
    expect(next).toHaveBeenCalled();
  });

  it('should parse JSON-encoded cookies', async () => {
    const jsonData = { id: 1, name: 'John' };
    const encodedCookie = 'j:' + JSON.stringify(jsonData);
    mockRequest.headers = { cookie: `userData=${encodedCookie}` };

    await cookieParser(
      mockRequest as TcfApiRequest,
      mockResponse as TcfApiResponse,
      next
    );

    expect(mockRequest.cookies?.userData).toEqual(jsonData);
    expect(next).toHaveBeenCalled();
  });

  it('should handle invalid JSON cookies gracefully', async () => {
    mockRequest.headers = { cookie: 'badJson=j:{invalid}' };

    await cookieParser(
      mockRequest as TcfApiRequest,
      mockResponse as TcfApiResponse,
      next
    );

    expect(mockRequest.cookies?.badJson).toBe('j:{invalid}');
    expect(next).toHaveBeenCalled();
  });

  it('should parse signed cookies', async () => {
    const secret = process.env.ENCRYPTSECRET || 'scf-stack';
    const signedValue = 's:' + signature.sign('test-value', secret);
    mockRequest.headers = { cookie: `signedCookie=${signedValue}` };

    await cookieParser(
      mockRequest as TcfApiRequest,
      mockResponse as TcfApiResponse,
      next
    );

    expect(mockRequest.signedCookies?.signedCookie).toBe('test-value');
    expect(next).toHaveBeenCalled();
  });

  it('should handle invalid signed cookies', async () => {
    mockRequest.headers = { cookie: 'signedCookie=s:invalid-signature' };

    await cookieParser(
      mockRequest as TcfApiRequest,
      mockResponse as TcfApiResponse,
      next
    );

    expect(mockRequest.signedCookies?.signedCookie).toBe(false);
    expect(next).toHaveBeenCalled();
  });

  it('should handle multiple cookies', async () => {
    mockRequest.headers = {
      cookie: 'cookie1=value1; cookie2=value2; cookie3=value3'
    };

    await cookieParser(
      mockRequest as TcfApiRequest,
      mockResponse as TcfApiResponse,
      next
    );

    expect(mockRequest.cookies).toEqual({
      cookie1: 'value1',
      cookie2: 'value2',
      cookie3: 'value3'
    });
    expect(next).toHaveBeenCalled();
  });

  it('should merge signed cookies into regular cookies', async () => {
    const secret = process.env.ENCRYPTSECRET || 'scf-stack';
    const signedValue = 's:' + signature.sign('signed', secret);
    mockRequest.headers = { cookie: `regular=normal; signed=${signedValue}` };

    await cookieParser(
      mockRequest as TcfApiRequest,
      mockResponse as TcfApiResponse,
      next
    );

    expect(mockRequest.cookies?.regular).toBe('normal');
    expect(mockRequest.cookies?.signed).toBe('signed');
    expect(next).toHaveBeenCalled();
  });

  it('should handle JSON-encoded signed cookies', async () => {
    const secret = process.env.ENCRYPTSECRET || 'scf-stack';
    const jsonData = { key: 'value' };
    const signedJson =
      's:' + signature.sign('j:' + JSON.stringify(jsonData), secret);
    mockRequest.headers = { cookie: `jsonSigned=${signedJson}` };

    await cookieParser(
      mockRequest as TcfApiRequest,
      mockResponse as TcfApiResponse,
      next
    );

    expect(mockRequest.signedCookies?.jsonSigned).toEqual(jsonData);
    expect(next).toHaveBeenCalled();
  });

  it('should handle missing cookie header', async () => {
    mockRequest.headers = {};

    await cookieParser(
      mockRequest as TcfApiRequest,
      mockResponse as TcfApiResponse,
      next
    );

    expect(mockRequest.cookies).toEqual({});
    expect(mockRequest.signedCookies).toEqual({});
    expect(next).toHaveBeenCalled();
  });

  it('should handle undefined cookie header', async () => {
    mockRequest.headers = { cookie: undefined as any };

    await cookieParser(
      mockRequest as TcfApiRequest,
      mockResponse as TcfApiResponse,
      next
    );

    expect(mockRequest.cookies).toEqual({});
    expect(mockRequest.signedCookies).toEqual({});
    expect(next).toHaveBeenCalled();
  });
});
