import { Response, resourceNotFound } from '../../src/response';
import { TcfApiRequest } from '../../src/index';
import { createMockRequest } from '../setup';
import { describe, expect, it, beforeEach, jest, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Response', () => {
  let mockRequest: TcfApiRequest;
  let response: Response;

  beforeEach(() => {
    mockRequest = createMockRequest();
    response = new Response(mockRequest);
  });

  describe('constructor', () => {
    it('should create a Response instance with default values', () => {
      expect(response).toBeInstanceOf(Response);
      expect(response.statusCode).toBe(0);
      expect(response.result).toBeUndefined();
    });

    it('should accept options in constructor', () => {
      const options = { templateFolder: '/views' };
      const respWithOptions = new Response(mockRequest, options);
      expect(respWithOptions).toBeInstanceOf(Response);
    });

    it('should initialize headers as empty object', () => {
      const resp = new Response(mockRequest);
      // Access private property through bracket notation for testing
      expect((resp as any).headers).toEqual({});
    });

    it('should initialize eventsOnFinish as empty array', () => {
      const resp = new Response(mockRequest);
      expect((resp as any).eventsOnFinish).toEqual([]);
    });
  });

  describe('status', () => {
    it('should set status code and return this for chaining', () => {
      const result = response.status(200);
      expect(result).toBe(response);
      expect(response.statusCode).toBe(200);
    });

    it('should accept various HTTP status codes', () => {
      const statusCodes = [200, 201, 400, 404, 500];

      statusCodes.forEach((code) => {
        response.status(code);
        expect(response.statusCode).toBe(code);
      });
    });

    it('should update internal _res statusCode', () => {
      response.status(404);
      expect((response as any)._res.statusCode).toBe(404);
    });
  });

  describe('end', () => {
    it('should prevent multiple sends', () => {
      const consoleSpy = jest.spyOn(console, 'warn');

      response.end('First response');
      response.end('Second response');

      expect(consoleSpy).toHaveBeenCalledWith('Response has already been sent');
      consoleSpy.mockRestore();
    });

    it('should handle SimpleResponse objects', () => {
      const customResponse = {
        statusCode: 201,
        headers: { 'X-Custom': 'value' },
        body: { created: true }
      };

      response.onFinish(() => {
        expect(response.result?.statusCode).toBe(201);
        expect(response.result?.headers?.['X-Custom']).toBe('value');
      });

      response.end(customResponse);
    });

    it('should convert array headers to multiValueHeaders', () => {
      (response as any).headers['Set-Cookie'] = ['cookie1=value1', 'cookie2=value2'];
      
      response.end({ body: 'test' });
      
      expect(response.result?.multiValueHeaders?.['Set-Cookie']).toEqual([
        'cookie1=value1',
        'cookie2=value2'
      ]);
      expect(response.result?.headers?.['Set-Cookie']).toBeUndefined();
    });

    it('should execute finalEvent after response completion', () => {
      let finalEventCalled = false;
      response.finally(() => {
        finalEventCalled = true;
      });

      response.end('test');
      
      expect(finalEventCalled).toBe(true);
    });

    it('should set default content-type to application/json for non-SimpleResponse', () => {
      response.end({ message: 'hello' });
      expect(response.result?.headers?.['content-type']).toBe('application/json');
    });
  });

  describe('formatResponse', () => {
    it('should merge headers when formatting SimpleResponse', () => {
      (response as any).headers['X-Custom-Header'] = 'custom-value';
      
      response.end({
        statusCode: 200,
        headers: { 'X-Another': 'value' },
        body: 'test'
      });

      expect(response.result?.headers?.['X-Custom-Header']).toBe('custom-value');
      expect(response.result?.headers?.['X-Another']).toBe('value');
    });

    it('should use default status code 200 when not set', () => {
      response.end({ data: 'test' });
      expect(response.result?.statusCode).toBe(200);
    });

    it('should use custom status code when set', () => {
      response.status(201);
      response.end({ data: 'created' });
      expect(response.result?.statusCode).toBe(201);
    });
  });

  describe('isSimpleResponse', () => {
    it('should return true for objects with statusCode', () => {
      const result = (response as any).isSimpleResponse({ statusCode: 200, body: 'test' });
      expect(result).toBe(true);
    });

    it('should return false for objects without statusCode', () => {
      const result = (response as any).isSimpleResponse({ message: 'test' });
      expect(result).toBe(false);
    });

    it('should return false for null', () => {
      const result = (response as any).isSimpleResponse(null);
      expect(result).toBe(false);
    });
  });

  describe('json', () => {
    it('should send JSON response', () => {
      const testData = { message: 'Hello World', count: 42 };

      response.onFinish(() => {
        expect(response.result).toBeDefined();
        expect(response.result?.statusCode).toBe(200);
        expect(response.result?.headers?.['content-type']).toBe(
          'application/json'
        );
        expect(response.result?.body).toEqual(testData);
      });

      response.json(testData);
    });

    it('should handle arrays as JSON', () => {
      const testArray = [1, 2, 3, { name: 'test' }];
      
      response.finally(() => {
        expect(response.result?.statusCode).toBe(200);
        expect(response.result?.body).toEqual(testArray);
      });

      response.json(testArray);
    });

    it('should return this for chaining', () => {
      const result = response.json({ test: 'data' });
      expect(result).toBe(response);
    });
  });

  describe('text', () => {
    it('should send plain text response', () => {
      const finishEvent = () => {
        expect(response.result?.body).toBe('Hello World');
      };
      const testText = 'Hello World';

      response.onFinish(finishEvent);
      response.text(testText);
    });

    it('should set content-type to text/plain', () => {
      response.text('test');
      expect(response.result?.headers?.['content-type']).toBe('text/plain');
    });

    it('should use custom status code if set', () => {
      response.status(201);
      response.text('Created');
      expect(response.result?.statusCode).toBe(201);
    });
  });

  describe('file', () => {
    const testFilePath = path.join(__dirname, 'test-file.txt');
    const nonExistentFile = path.join(__dirname, 'non-existent.txt');

    beforeAll(() => {
      fs.writeFileSync(testFilePath, 'Test file content', 'utf-8');
    });

    afterAll(() => {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    });

    it('should send file content as base64', () => {
      response.file(testFilePath);
      
      expect(response.result?.statusCode).toBe(200);
      expect(response.result?.isBase64Encoded).toBe(true);
      expect(response.result?.headers?.['content-type']).toBeDefined();
      
      const decodedContent = Buffer.from(
        response.result?.body as string,
        'base64'
      ).toString('utf-8');
      expect(decodedContent).toBe('Test file content');
    });

    it('should handle non-existent files', () => {
      response.file(nonExistentFile);
      
      expect(response.result?.statusCode).toBe(404);
      expect(response.result?.body).toContain('Resource Not Found');
    });

    it('should detect correct mime type', () => {
      const jsonFilePath = path.join(__dirname, 'test-file.json');
      fs.writeFileSync(jsonFilePath, '{"test": "data"}', 'utf-8');

      response.file(jsonFilePath);
      
      expect(response.result?.headers?.['content-type']).toContain('application/json');
      
      fs.unlinkSync(jsonFilePath);
    });
  });

  describe('render', () => {
    const templateFolder = path.join(__dirname, 'templates');
    const templatePath = path.join(templateFolder, 'test.ejs');

    beforeAll(() => {
      if (!fs.existsSync(templateFolder)) {
        fs.mkdirSync(templateFolder);
      }
      fs.writeFileSync(templatePath, '<h1>Hello <%= name %></h1>', 'utf-8');
    });

    afterAll(() => {
      if (fs.existsSync(templatePath)) {
        fs.unlinkSync(templatePath);
      }
      if (fs.existsSync(templateFolder)) {
        fs.rmdirSync(templateFolder);
      }
    });

    it('should render EJS template', () => {
      const respWithOptions = new Response(mockRequest, { templateFolder });
      respWithOptions.render('test', { name: 'World' });
      
      expect(respWithOptions.result?.statusCode).toBe(200);
      expect(respWithOptions.result?.headers?.['content-type']).toBe('text/html');
      expect(respWithOptions.result?.body).toContain('<h1>Hello World</h1>');
    });

    it('should handle missing templateFolder', () => {
      const respWithoutOptions = new Response(mockRequest);
      respWithoutOptions.render('test', { name: 'World' });
      
      expect(respWithoutOptions.result?.statusCode).toBe(404);
    });

    it('should handle non-existent template file', () => {
      const respWithOptions = new Response(mockRequest, { templateFolder });
      respWithOptions.render('non-existent', { name: 'World' });
      
      expect(respWithOptions.result?.statusCode).toBe(404);
    });

    it('should merge defaultTemplateData with data', () => {
      const respWithOptions = new Response(mockRequest, { 
        templateFolder,
        defaultTemplateData: { site: 'MySite' }
      });
      
      fs.writeFileSync(templatePath, '<%= site %> - <%= name %>', 'utf-8');
      respWithOptions.render('test', { name: 'Page' });
      
      expect(respWithOptions.result?.body).toContain('MySite - Page');
    });
  });

  describe('redirect', () => {
    it('should send redirect response', () => {
      response.onFinish(() => {
        expect(response.result?.statusCode).toBe(302);
        expect(response.result?.headers?.location).toBe('https://example.com');
      });

      response.redirect('https://example.com');
    });

    it('should encode special characters in URL', () => {
      response.onFinish(() => {
        expect(response.result?.headers?.location).toContain(encodeURI('中文'));
      });

      response.redirect('https://example.com/path?param=中文');
    });

    it('should use custom status code if set', () => {
      response.status(301);
      response.redirect('https://example.com');
      
      expect(response.result?.statusCode).toBe(301);
    });

    it('should set content-type to text/html', () => {
      response.redirect('https://example.com');
      expect(response.result?.headers?.['content-type']).toBe('text/html');
    });
  });

  describe('cookie', () => {
    it('should set cookie header', () => {
      response.cookie('sessionId', 'abc123');

      response.onFinish(() => {
        expect(response.result?.multiValueHeaders?.['Set-Cookie']).toBeDefined();
        const cookieHeader = response.result?.multiValueHeaders?.['Set-Cookie'][0];
        expect(cookieHeader).toContain('sessionId=abc123');
      });

      response.json({ logged: true });
    });

    it('should accept cookie options', () => {
      response.cookie('token', 'xyz', {
        httpOnly: true,
        secure: true,
        maxAge: 3600
      });

      response.onFinish(() => {
        const cookieHeader = response.result?.multiValueHeaders?.['Set-Cookie'][0];
        expect(cookieHeader).toContain('HttpOnly');
      });

      response.json({ logged: true });
    });

    it('should serialize JSON cookies with j: prefix', () => {
      response.cookie('userData', { id: 1, name: 'John' });

      response.onFinish(() => {
        const cookieHeader = response.result?.multiValueHeaders?.['Set-Cookie'][0];
        expect(cookieHeader).toContain(encodeURIComponent('j:'));
      });

      response.json({ success: true });
    });

    it('should sign cookies when signed option is true', () => {
      response.cookie('signedCookie', 'value', { signed: true });
      
      response.onFinish(() => {
        const cookieHeader = response.result?.multiValueHeaders?.['Set-Cookie'][0];
        expect(cookieHeader).toContain('signedCookie=');
      });

      response.json({ test: true });
    });

    it('should support multiple cookies', () => {
      response.cookie('cookie1', 'value1');
      response.cookie('cookie2', 'value2');

      response.onFinish(() => {
        const cookies = response.result?.multiValueHeaders?.['Set-Cookie'];
        expect(cookies).toHaveLength(2);
        expect(cookies[0]).toContain('cookie1=value1');
        expect(cookies[1]).toContain('cookie2=value2');
      });

      response.json({ test: true });
    });

    it('should throw error for invalid maxAge', () => {
      expect(() => {
        response.cookie('test', 'value', { maxAge: 'invalid' as any });
      }).toThrow('maxAge should be a Number');
    });
  });

  describe('clearCookie', () => {
    it('should clear cookie by setting expiry to past', () => {
      response.clearCookie('sessionId');
      response.text('end');
      const cookieHeader = response.result?.multiValueHeaders?.['Set-Cookie'][0];
      expect(cookieHeader).toContain('sessionId=');
      expect(cookieHeader).toContain('Expires=Thu, 01 Jan 1970');
    });

    it('should accept additional options', () => {
      response.clearCookie('sessionId', { domain: '.example.com' });
      response.text('end');
      const cookieHeader = response.result?.multiValueHeaders?.['Set-Cookie'][0];
      expect(cookieHeader).toContain('Domain=.example.com');
    });
  });

  describe('error', () => {
    it('should handle Error objects', () => {
      const testError = new Error('Test error');

      response.onFinish(() => {
        expect(response.result?.statusCode).toBe(500);
        expect(response.result?.body).toContain('Test error');
      });

      response.error(testError);
    });

    it('should handle string messages', () => {
      response.onFinish(() => {
        expect(response.result?.statusCode).toBe(500);
        expect(response.result?.body).toBe('Something went wrong');
      });

      response.error('Something went wrong');
    });

    it('should handle object errors', () => {
      const errorObj = { code: 'ERR_TEST', message: 'Test error' };

      response.onFinish(() => {
        expect(response.result?.statusCode).toBe(500);
        const body = response.result?.body;
        expect(body).toEqual(JSON.stringify(errorObj));
      });

      response.error(errorObj);
    });

    it('should use custom status code if set', () => {
      response.status(503);
      response.error('Service Unavailable');
      
      expect(response.result?.statusCode).toBe(503);
    });

    it('should send JSON error for JSON requests', () => {
      mockRequest.headers.accept = 'application/json';
      response.error(new Error('API Error'));
      
      expect(response.result?.headers?.['content-type']).toBe('application/json');
      expect((response.result?.body as Error).message).toBe('API Error');
    });

    it('should send plain text error for non-JSON GET requests', () => {
      mockRequest.httpMethod = 'GET';
      mockRequest.headers.accept = 'text/html';
      response.error(new Error('Page Error'));
      
      expect(response.result?.headers?.['content-type']).toBe('text/plain');
    });
  });

  describe('notAuthorized', () => {
    it('should send 401 response', () => {
      response.onFinish(() => {
        expect(response.result?.statusCode).toBe(401);
      });

      response.notAuthorized('Unauthorized access');
    });

    it('should handle Error objects', () => {
      response.notAuthorized(new Error('Not authenticated'));
      
      expect(response.result?.statusCode).toBe(401);
      const body = response.result?.body;
      expect((body as Error).message).toBe('Not authenticated');
    });

    it('should handle object errors', () => {
      response.notAuthorized({ code: 'AUTH_ERROR', reason: 'Token expired' });
      
      expect(response.result?.statusCode).toBe(401);
      const body = response.result?.body;
      expect((body as Record<string, any>).data).toEqual({ code: 'AUTH_ERROR', reason: 'Token expired' });
    });

    it('should use custom status code if set', () => {
      response.status(403);
      response.notAuthorized('Forbidden');
      
      expect(response.result?.statusCode).toBe(403);
    });
  });

  describe('onFinish', () => {
    it('should register callback to execute on finish', () => {
      let callbackExecuted = false;

      response.onFinish(() => {
        callbackExecuted = true;
      });

      response.json({ test: 'data' });

      expect(callbackExecuted).toBe(true);
    });

    it('should support multiple onFinish callbacks', () => {
      const executionOrder: number[] = [];

      response.onFinish(() => executionOrder.push(1));
      response.onFinish(() => executionOrder.push(2));
      response.onFinish(() => executionOrder.push(3));

      response.json({ test: 'data' });

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should pass response instance to callbacks', () => {
      response.onFinish((resp) => {
        expect(resp).toBe(response);
        expect(resp).toBeInstanceOf(Response);
      });

      response.json({ test: 'data' });
    });
  });

  describe('finally', () => {
    it('should execute final callback after response completion', () => {
      let finallyCalled = false;

      response.finally(() => {
        finallyCalled = true;
      });

      response.json({ test: 'data' });

      expect(finallyCalled).toBe(true);
    });

    it('should pass response instance to callback', () => {
      response.finally((resp) => {
        expect(resp).toBe(response);
      });

      response.json({ test: 'data' });
    });
  });

  describe('helper functions', () => {
    describe('resourceNotFound', () => {
      it('should create 404 response with path', () => {
        const notFoundResp = resourceNotFound('/api/test');
        expect(notFoundResp.statusCode).toBe(404);
        expect(notFoundResp.body).toContain('/api/test');
        expect(notFoundResp.headers?.['content-type']).toBe('application/html');
      });

      it('should handle empty path', () => {
        const notFoundResp = resourceNotFound('');
        expect(notFoundResp.statusCode).toBe(404);
        expect(notFoundResp.body).toContain('Resource Not Found');
      });
    });

    describe('isJsonRequest (indirect testing)', () => {
      it('should send JSON error when Accept header includes application/json', () => {
        mockRequest.headers.accept = 'application/json';
        response.error(new Error('API Error'));
        
        expect(response.result?.headers?.['content-type']).toBe('application/json');
        const body = response.result?.body;
        expect(body).toHaveProperty('message', 'API Error');
      });

      it('should send plain text error for GET request without JSON accept header', () => {
        mockRequest.httpMethod = 'GET';
        mockRequest.headers.accept = 'text/html';
        response.error(new Error('Page Error'));
        
        expect(response.result?.headers?.['content-type']).toBe('text/plain');
        expect(response.result?.body).toContain('Page Error');
      });

      it('should send JSON error for POST request even without JSON accept header', () => {
        mockRequest.httpMethod = 'POST';
        mockRequest.headers.accept = 'text/html';
        response.error(new Error('Post Error'));
        
        expect(response.result?.headers?.['content-type']).toBe('application/json');
      });

      it('should handle missing accept header', () => {
        mockRequest.headers.accept = '';
        mockRequest.httpMethod = 'GET';
        response.error(new Error('No Accept Header'));
        
        expect(response.result?.headers?.['content-type']).toBe('text/plain');
      });

      it('should detect JSON in multiple accept values', () => {
        mockRequest.headers.accept = 'text/html, application/json, */*';
        response.error(new Error('Multiple Accept Headers'));
        
        expect(response.result?.headers?.['content-type']).toBe('application/json');
      });
    });
  });
});
