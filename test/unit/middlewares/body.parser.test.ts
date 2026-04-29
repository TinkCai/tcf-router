import bodyParser from '../../../src/middlewares/body.parser';
import { TcfApiRequest, TcfApiResponse } from '../../../src/index';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

describe('bodyParser', () => {
  let mockRequest: Partial<TcfApiRequest>;
  let mockResponse: Partial<TcfApiResponse>;
  let next: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      body: ''
    };
    mockResponse = {};
    next = jest.fn();
  });

  it('should call next() if req.body is not set', async () => {
    mockRequest.body = undefined;
    
    await bodyParser(mockRequest as TcfApiRequest, mockResponse as TcfApiResponse, next);
    
    expect(next).toHaveBeenCalled();
  });

  it('should parse JSON body by default', async () => {
    const jsonData = { name: 'John', age: 30 };
    mockRequest.body = JSON.stringify(jsonData);
    mockRequest.headers = { 'content-type': 'application/json' };
    
    await bodyParser(mockRequest as TcfApiRequest, mockResponse as TcfApiResponse, next);
    
    expect(mockRequest.body).toEqual(jsonData);
    expect(mockRequest._body).toBe(JSON.stringify(jsonData));
    expect(next).toHaveBeenCalled();
  });

  it('should parse application/x-www-form-urlencoded body', async () => {
    mockRequest.body = 'name=John&age=30';
    mockRequest.headers = { 'content-type': 'application/x-www-form-urlencoded' };
    
    await bodyParser(mockRequest as TcfApiRequest, mockResponse as TcfApiResponse, next);
    
    expect(mockRequest.body).toEqual({ name: 'John', age: '30' });
    expect(next).toHaveBeenCalled();
  });

  it('should keep original body for unsupported content types', async () => {
    mockRequest.body = 'plain text';
    mockRequest.headers = { 'content-type': 'text/plain' };
    
    await bodyParser(mockRequest as TcfApiRequest, mockResponse as TcfApiResponse, next);
    
    expect(mockRequest.body).toBe('plain text');
    expect(mockRequest._body).toBe('plain text');
    expect(next).toHaveBeenCalled();
  });

  it('should throw error for invalid JSON', async () => {
    mockRequest.body = '{ invalid json }';
    mockRequest.headers = { 'content-type': 'application/json' };
    
    await expect(bodyParser(mockRequest as TcfApiRequest, mockResponse as TcfApiResponse, next))
      .rejects.toThrow('Failed to parse body');
  });

  it('should handle multipart/form-data', async () => {
    mockRequest.body = 'form data';
    mockRequest.headers = { 'content-type': 'multipart/form-data' };
    
    await bodyParser(mockRequest as TcfApiRequest, mockResponse as TcfApiResponse, next);
    
    expect(mockRequest.body).toBe('form data');
    expect(next).toHaveBeenCalled();
  });

  it('should handle application/xml', async () => {
    mockRequest.body = '<xml></xml>';
    mockRequest.headers = { 'content-type': 'application/xml' };
    
    await bodyParser(mockRequest as TcfApiRequest, mockResponse as TcfApiResponse, next);
    
    expect(mockRequest.body).toBe('<xml></xml>');
    expect(next).toHaveBeenCalled();
  });

  it('should handle text/xml', async () => {
    mockRequest.body = '<xml></xml>';
    mockRequest.headers = { 'content-type': 'text/xml' };
    
    await bodyParser(mockRequest as TcfApiRequest, mockResponse as TcfApiResponse, next);
    
    expect(mockRequest.body).toBe('<xml></xml>');
    expect(next).toHaveBeenCalled();
  });

  it('should handle case-insensitive content type', async () => {
    const jsonData = { test: 'data' };
    mockRequest.body = JSON.stringify(jsonData);
    mockRequest.headers = { 'content-type': 'APPLICATION/JSON' };
    
    await bodyParser(mockRequest as TcfApiRequest, mockResponse as TcfApiResponse, next);
    
    expect(mockRequest.body).toEqual(jsonData);
    expect(next).toHaveBeenCalled();
  });

  it('should handle content-type with charset', async () => {
    const jsonData = { test: 'data' };
    mockRequest.body = JSON.stringify(jsonData);
    mockRequest.headers = { 'content-type': 'application/json; charset=utf-8' };
    
    await bodyParser(mockRequest as TcfApiRequest, mockResponse as TcfApiResponse, next);
    
    expect(mockRequest.body).toEqual(jsonData);
    expect(next).toHaveBeenCalled();
  });

  it('should handle missing content-type header', async () => {
    const jsonData = { test: 'data' };
    mockRequest.body = JSON.stringify(jsonData);
    mockRequest.headers = {};
    
    await bodyParser(mockRequest as TcfApiRequest, mockResponse as TcfApiResponse, next);
    
    expect(mockRequest.body).toEqual(jsonData);
    expect(next).toHaveBeenCalled();
  });

  it('should handle empty headers object', async () => {
    const jsonData = { test: 'data' };
    mockRequest.body = JSON.stringify(jsonData);
    mockRequest.headers = {};
    
    await bodyParser(mockRequest as TcfApiRequest, mockResponse as TcfApiResponse, next);
    
    expect(mockRequest.body).toEqual(jsonData);
    expect(next).toHaveBeenCalled();
  });
});
