import { Response } from '../../src/response';
import { TcfApiRequest } from '../../src/index';
import { createMockRequest } from '../setup';
import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import * as console from 'node:console';
import { flushPromises } from './helpers/flush-promises';

describe.skip('Response', () => {
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
  });

  describe('json', () => {
    it('should send JSON response', (done) => {
      const testData = { message: 'Hello World', count: 42 };

      response.onFinish(() => {
        expect(response.result).toBeDefined();
        expect(response.result?.statusCode).toBe(200);
        expect(response.result?.headers?.['content-type']).toBe(
          'application/json'
        );
        expect(JSON.parse(response.result?.body as string)).toEqual(testData);
        done();
      });

      response.json(testData);
    });

    it('should handle arrays as JSON', (done) => {
      const testArray = [1, 2, 3, { name: 'test' }];

      response.onFinish(() => {
        expect(response.result?.statusCode).toBe(200);
        expect(JSON.parse(response.result?.body as string)).toEqual(testArray);
        done();
      });

      response.json(testArray);
    });
  });

  describe('text', () => {
    it.skip('should send plain text response', (done) => {
      const finishEvent = () => {};
      const testText = 'Hello World';

      response.onFinish(finishEvent);
      response.text(testText);
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

    it('should handle SimpleResponse objects', (done) => {
      const customResponse = {
        statusCode: 201,
        headers: { 'X-Custom': 'value' },
        body: { created: true }
      };

      response.onFinish(() => {
        expect(response.result?.statusCode).toBe(201);
        expect(response.result?.headers?.['X-Custom']).toBe('value');
        done();
      });

      response.end(customResponse);
    });
  });

  describe('onFinish', () => {
    it('should register callback to execute on finish', (done) => {
      let callbackExecuted = false;

      response.onFinish(() => {
        callbackExecuted = true;
      });

      response.json({ test: 'data' });

      setTimeout(() => {
        expect(callbackExecuted).toBe(true);
        done();
      }, 10);
    });

    it('should support multiple onFinish callbacks', (done) => {
      const executionOrder: number[] = [];

      response.onFinish(() => executionOrder.push(1));
      response.onFinish(() => executionOrder.push(2));
      response.onFinish(() => executionOrder.push(3));

      response.json({ test: 'data' });

      setTimeout(() => {
        expect(executionOrder).toEqual([1, 2, 3]);
        done();
      }, 10);
    });
  });

  describe('finally', () => {
    it('should execute final callback after response completion', (done) => {
      let finallyCalled = false;

      response.finally(() => {
        finallyCalled = true;
      });

      response.json({ test: 'data' });

      setTimeout(() => {
        expect(finallyCalled).toBe(true);
        done();
      }, 10);
    });
  });

  describe('error', () => {
    it('should handle Error objects', (done) => {
      const testError = new Error('Test error');

      response.onFinish(() => {
        expect(response.result?.statusCode).toBe(500);
        expect(response.result?.body).toContain('Test error');
        done();
      });

      response.error(testError);
    });

    it('should handle string messages', (done) => {
      response.onFinish(() => {
        expect(response.result?.statusCode).toBe(500);
        expect(response.result?.body).toBe('Something went wrong');
        done();
      });

      response.error('Something went wrong');
    });

    it('should handle object errors', (done) => {
      const errorObj = { code: 'ERR_TEST', message: 'Test error' };

      response.onFinish(() => {
        expect(response.result?.statusCode).toBe(500);
        const body = JSON.parse(response.result?.body as string);
        expect(body.data).toEqual(errorObj);
        done();
      });

      response.error(errorObj);
    });
  });

  describe('notAuthorized', () => {
    it('should send 401 response', (done) => {
      response.onFinish(() => {
        expect(response.result?.statusCode).toBe(401);
        done();
      });

      response.notAuthorized('Unauthorized access');
    });
  });

  describe('redirect', () => {
    it('should send redirect response', (done) => {
      response.onFinish(() => {
        expect(response.result?.statusCode).toBe(302);
        expect(response.result?.headers?.location).toBe('https://example.com');
        done();
      });

      response.redirect('https://example.com');
    });

    it('should encode special characters in URL', (done) => {
      response.onFinish(() => {
        expect(response.result?.headers?.location).toContain(encodeURI('中文'));
        done();
      });

      response.redirect('https://example.com/path?param=中文');
    });
  });

  describe('cookie', () => {
    it('should set cookie header', (done) => {
      response.cookie('sessionId', 'abc123');

      response.onFinish(() => {
        expect(response.result?.headers?.['Set-Cookie']).toBeDefined();
        const cookieHeader = response.result?.headers?.['Set-Cookie'][0];
        expect(cookieHeader).toContain('sessionId=abc123');
        done();
      });

      response.json({ logged: true });
    });

    it('should accept cookie options', (done) => {
      response.cookie('token', 'xyz', {
        httpOnly: true,
        secure: true,
        maxAge: 3600
      });

      response.onFinish(() => {
        const cookieHeader = response.result?.headers?.['Set-Cookie'][0];
        expect(cookieHeader).toContain('HttpOnly');
        done();
      });

      response.json({ logged: true });
    });

    it('should serialize JSON cookies with j: prefix', (done) => {
      response.cookie('userData', { id: 1, name: 'John' });

      response.onFinish(() => {
        const cookieHeader = response.result?.headers?.['Set-Cookie'][0];
        expect(cookieHeader).toContain('j:');
        done();
      });

      response.json({ success: true });
    });
  });

  describe('clearCookie', () => {
    it('should clear cookie by setting expiry to past', async () => {
      response.clearCookie('sessionId');
      response.text('end');
      await flushPromises();
      const cookieHeader = response.result?.headers?.['Set-Cookie'];
      expect(cookieHeader).toContain('sessionId=');
      expect(cookieHeader).toContain('Expires=Thu, 01 Jan 1970');
    });
  });
});
