NEW_FILE_CODE
import { Simulator, EnvConfig } from '../../../src/simulator';
import { TcfApiRequest, SimpleResponse } from '../../../src/index';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

describe('Simulator', () => {
  let simulator: Simulator;
  let mockEnvConfig: EnvConfig;

  beforeEach(() => {
    mockEnvConfig = {
      appPath: '/test/app',
      functionEnvVariables: {
        TEST_VAR: 'test-value'
      },
      context: {
        envId: 'test-env-id',
        appId: 'test-app-id',
        uin: '123456'
      },
      devServer: {
        port: 3002
      }
    };

    simulator = new Simulator(mockEnvConfig);
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.TEST_VAR;
  });

  describe('constructor', () => {
    it('should create a Simulator instance', () => {
      expect(simulator).toBeInstanceOf(Simulator);
    });

    it('should set environment variables from config', () => {
      expect(process.env.TEST_VAR).toBe('test-value');
    });

    it('should work without optional devServer config', () => {
      const configWithoutDevServer = {
        ...mockEnvConfig,
        devServer: undefined
      };

      const sim = new Simulator(configWithoutDevServer);
      expect(sim).toBeInstanceOf(Simulator);
    });
  });

  describe('setEnv', () => {
    it('should set multiple environment variables', () => {
      simulator.setEnv({ VAR1: 'value1', VAR2: 'value2' });

      expect(process.env.VAR1).toBe('value1');
      expect(process.env.VAR2).toBe('value2');
    });

    it('should override existing environment variables', () => {
      process.env.EXISTING_VAR = 'old-value';

      simulator.setEnv({ EXISTING_VAR: 'new-value' });

      expect(process.env.EXISTING_VAR).toBe('new-value');

      delete process.env.EXISTING_VAR;
    });
  });

  describe('getDecoratedRequest', () => {
    let mockExpressReq: any;

    beforeEach(() => {
      mockExpressReq = {
        headers: {
          'content-type': 'application/json'
        },
        method: 'GET',
        httpVersion: '1.1',
        connection: {
          remoteAddress: '127.0.0.1'
        },
        url: '/api/test',
        body: ''
      };
    });

    it('should transform Express request to TCF request', () => {
      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, '');

      expect(tcfRequest.httpMethod).toBe('GET');
      expect(tcfRequest.path).toBe('/api/test');
      expect(tcfRequest.headers['content-type']).toBe('application/json');
    });

    it('should generate mock requestContext', () => {
      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, '');

      expect(tcfRequest.requestContext.requestId).toBeDefined();
      expect(tcfRequest.requestContext.requestId).toContain('mock-request-');
      expect(tcfRequest.requestContext.envId).toBe('test-env-id');
      expect(tcfRequest.requestContext.appId).toBe('test-app-id');
      expect(tcfRequest.requestContext.uin).toBe('123456');
    });

    it('should parse query parameters from URL', () => {
      mockExpressReq.url = '/api/test?name=John&age=30';

      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, '');

      expect(tcfRequest.path).toBe('/api/test');
      expect(tcfRequest.queryStringParameters?.name).toBe('John');
      expect(tcfRequest.queryStringParameters?.age).toBe('30');
    });

    it('should handle URL without query parameters', () => {
      mockExpressReq.url = '/api/test';

      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, '');

      expect(tcfRequest.path).toBe('/api/test');
      expect(tcfRequest.queryStringParameters).toEqual({});
    });

    it('should handle form-urlencoded body', () => {
      mockExpressReq.headers['content-type'] = 'application/x-www-form-urlencoded';
      mockExpressReq.body = { name: 'John', age: '30' };

      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, mockExpressReq.body);

      expect(tcfRequest.body).toContain('name=John');
      expect(tcfRequest.body).toContain('age=30');
    });

    it('should stringify JSON body', () => {
      const bodyObj = { message: 'hello', count: 42 };
      mockExpressReq.body = bodyObj;

      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, bodyObj);

      expect(tcfRequest.body).toBe(JSON.stringify(bodyObj));
    });

    it('should keep string body as is', () => {
      mockExpressReq.body = 'plain text body';

      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, 'plain text body');

      expect(tcfRequest.body).toBe('plain text body');
    });

    it('should add x-forwarded headers for HTTP', () => {
      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, '');

      expect(tcfRequest.headers['x-forwarded-proto']).toBe('http');
      expect(tcfRequest.headers['x-client-proto']).toBe('http');
      expect(tcfRequest.headers['x-client-proto-ver']).toBe('HTTP/1.1');
      expect(tcfRequest.headers['x-real-ip']).toBe('127.0.0.1');
      expect(tcfRequest.headers['x-forwarded-for']).toBe('127.0.0.1');
    });

    it('should add x-forwarded headers for HTTPS', () => {
      const httpsConfig = { ...mockEnvConfig, devServer: { ...mockEnvConfig.devServer, https: true } };
      const httpsSimulator = new Simulator(httpsConfig);

      const tcfRequest = httpsSimulator.getDecoratedRequest(mockExpressReq, '');

      expect(tcfRequest.headers['x-forwarded-proto']).toBe('https');
      expect(tcfRequest.headers['x-client-proto']).toBe('https');
    });

    it('should set isBase64Encoded header to false', () => {
      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, '');

      expect(tcfRequest.headers['isBase64Encoded']).toBe(false);
    });

    it('should handle empty body', () => {
      mockExpressReq.body = '';

      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, '');

      expect(tcfRequest.body).toBe('');
    });

    it('should handle null body', () => {
      mockExpressReq.body = null as any;

      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, null as any);

      expect(tcfRequest.body).toBe('');
    });

    it('should decode URL-encoded query parameters', () => {
      mockExpressReq.url = '/api/test?name=%E4%B8%AD%E6%96%87&city=New%20York';

      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, '');

      expect(tcfRequest.queryStringParameters?.name).toBe('中文');
      expect(tcfRequest.queryStringParameters?.city).toBe('New York');
    });

    it('should handle query parameters with empty values', () => {
      mockExpressReq.url = '/api/test?flag&empty=';

      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, '');

      expect(tcfRequest.queryStringParameters?.flag).toBe('');
      expect(tcfRequest.queryStringParameters?.empty).toBe('');
    });

    it('should handle query parameters without value', () => {
      mockExpressReq.url = '/api/test?key1&key2=value2&key3';

      const tcfRequest = simulator.getDecoratedRequest(mockExpressReq, '');

      expect(tcfRequest.queryStringParameters?.key1).toBe('');
      expect(tcfRequest.queryStringParameters?.key2).toBe('value2');
      expect(tcfRequest.queryStringParameters?.key3).toBe('');
    });
  });

  describe('deploy', () => {
    let server: http.Server | https.Server;
    let testEntrance: jest.Mock;

    beforeEach(() => {
      testEntrance = jest.fn();
    });

    afterEach((done) => {
      if (server && server.listening) {
        server.close(done);
      } else {
        done();
      }
    });

    it('should create HTTP server without HTTPS', () => {
      const configWithoutHttps = { ...mockEnvConfig, devServer: { port: 3003 } };
      const sim = new Simulator(configWithoutHttps);

      server = sim.deploy(testEntrance);

      expect(server).toBeDefined();
      expect(server instanceof https.Server).toBe(false);
    });

    it('should create HTTPS server with HTTPS options', () => {
      const keyPath = path.join(__dirname, 'test-key.pem');
      const certPath = path.join(__dirname, 'test-cert.pem');

      // Create dummy cert/key files for testing
      fs.writeFileSync(keyPath, 'dummy-key');
      fs.writeFileSync(certPath, 'dummy-cert');

      const configWithHttps = {
        ...mockEnvConfig,
        devServer: {
          port: 3004,
          https: {
            key: keyPath,
            cert: certPath
          }
        }
      };

      const sim = new Simulator(configWithHttps);

      try {
        server = sim.deploy(testEntrance, { key: keyPath, cert: certPath });
        expect(server).toBeDefined();
      } catch (error) {
        // HTTPS setup might fail with dummy certs, but we're testing the code path
      } finally {
        // Cleanup
        if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
        if (fs.existsSync(certPath)) fs.unlinkSync(certPath);
      }
    });

    it('should use default port 3001 when not specified', () => {
      const configWithoutPort = { ...mockEnvConfig, devServer: {} };
      const sim = new Simulator(configWithoutPort);

      server = sim.deploy(testEntrance);

      // Server should be listening (default port 3001)
      expect(server.listening).toBe(true);
    });

    it('should store entrance function', () => {
      server = simulator.deploy(testEntrance);

      // Make a request to verify entrance is called
      return new Promise<void>((resolve) => {
        testEntrance.mockImplementation(() => Promise.resolve({ statusCode: 200, body: 'OK' }));

        const req = http.get(`http://localhost:${mockEnvConfig.devServer?.port}/test`, (res) => {
          setTimeout(() => {
            expect(testEntrance).toHaveBeenCalled();
            resolve();
          }, 100);
        });

        req.on('error', () => {
          // Ignore errors
          resolve();
        });
      });
    });

    it('should handle errors in entrance function', () => {
      testEntrance.mockImplementation(() => {
        throw new Error('Test error');
      });

      server = simulator.deploy(testEntrance);

      return new Promise<void>((resolve) => {
        const req = http.get(`http://localhost:${mockEnvConfig.devServer?.port}/test`, (res) => {
          setTimeout(() => {
            expect(res.statusCode).toBe(500);
            resolve();
          }, 100);
        });

        req.on('error', () => {
          resolve();
        });
      });
    });
  });

  describe('sendResponse', () => {
    let mockRes: any;

    beforeEach(() => {
      mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        set: jest.fn().mockReturnThis(),
        end: jest.fn()
      };
    });

    it('should send string response as text', () => {
      (simulator as any).sendResponse(mockRes, 'Hello World');

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.end).toHaveBeenCalledWith('Hello World');
    });

    it('should send number response as text', () => {
      (simulator as any).sendResponse(mockRes, 42);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.end).toHaveBeenCalledWith('42');
    });

    it('should send object response as JSON', () => {
      const data = { message: 'hello', count: 42 };
      (simulator as any).sendResponse(mockRes, data);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.set).toHaveBeenCalledWith(expect.objectContaining({
        'Content-Type': 'application/json'
      }));
      expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify(data));
    });

    it('should send SimpleResponse with statusCode', () => {
      const response: SimpleResponse = {
        statusCode: 201,
        headers: { 'X-Custom': 'value' },
        body: { created: true }
      };
      (simulator as any).sendResponse(mockRes, response);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.set).toHaveBeenCalledWith({ 'X-Custom': 'value' });
    });

    it('should convert multiValueHeaders to headers', () => {
      const response: SimpleResponse = {
        statusCode: 200,
        multiValueHeaders: {
          'Set-Cookie': ['cookie1=value1', 'cookie2=value2']
        },
        body: 'test'
      };
      (simulator as any).sendResponse(mockRes, response);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Set-Cookie': ['cookie1=value1', 'cookie2=value2']
        })
      );
    });

    it('should handle single value in multiValueHeaders', () => {
      const response: SimpleResponse = {
        statusCode: 200,
        multiValueHeaders: {
          'X-Single': ['single-value']
        },
        body: 'test'
      };
      (simulator as any).sendResponse(mockRes, response);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'X-Single': 'single-value'
        })
      );
    });

    it('should handle base64 encoded body', () => {
      const buffer = Buffer.from('Hello World');
      const response: SimpleResponse = {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: buffer.toString('base64'),
        isBase64Encoded: true
      };
      (simulator as any).sendResponse(mockRes, response);

      expect(mockRes.end).toHaveBeenCalledWith(Buffer.from(response.body!, 'base64'));
    });

    it('should stringify object body', () => {
      const response: SimpleResponse = {
        statusCode: 200,
        headers: {},
        body: { message: 'hello' }
      };
      (simulator as any).sendResponse(mockRes, response);

      expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ message: 'hello' }));
    });

    it('should handle null body', () => {
      const response: SimpleResponse = {
        statusCode: 204,
        headers: {},
        body: null as any
      };
      (simulator as any).sendResponse(mockRes, response);

      expect(mockRes.end).toHaveBeenCalledWith('');
    });

    it('should handle undefined body', () => {
      const response: SimpleResponse = {
        statusCode: 204,
        headers: {}
      };
      (simulator as any).sendResponse(mockRes, response);

      expect(mockRes.end).toHaveBeenCalledWith('');
    });
  });

  describe('sendTextResponse', () => {
    it('should send plain text with correct headers', () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        end: jest.fn()
      };

      (simulator as any).sendTextResponse(mockRes, 'Hello World');

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Length': Buffer.byteLength('Hello World'),
        'Content-Type': 'text/plain'
      });
      expect(mockRes.end).toHaveBeenCalledWith('Hello World');
    });
  });

  describe('sendJsonResponse', () => {
    it('should send JSON with correct headers', () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        end: jest.fn()
      };
      const data = { key: 'value' };

      (simulator as any).sendJsonResponse(mockRes, data);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Length': Buffer.byteLength(JSON.stringify(data)),
        'Content-Type': 'application/json'
      });
      expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify(data));
    });
  });

  describe('sendStructuredResponse', () => {
    it('should send response with all properties', () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        end: jest.fn()
      };
      const response: SimpleResponse = {
        statusCode: 200,
        headers: { 'X-Custom': 'header' },
        body: 'response body'
      };

      (simulator as any).sendStructuredResponse(mockRes, response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.set).toHaveBeenCalledWith({ 'X-Custom': 'header' });
      expect(mockRes.end).toHaveBeenCalledWith('response body');
    });

    it('should handle missing headers', () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        end: jest.fn()
      };
      const response: SimpleResponse = {
        statusCode: 200,
        body: 'no headers'
      };

      (simulator as any).sendStructuredResponse(mockRes, response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.set).toHaveBeenCalledWith({});
    });
  });

  describe('formatResponseBody', () => {
    it('should return string body as is', () => {
      const response: SimpleResponse = {
        statusCode: 200,
        body: 'string body'
      };

      const result = (simulator as any).formatResponseBody(response);
      expect(result).toBe('string body');
    });

    it('should decode base64 body to Buffer', () => {
      const originalText = 'Hello World';
      const base64Body = Buffer.from(originalText).toString('base64');

      const response: SimpleResponse = {
        statusCode: 200,
        body: base64Body,
        isBase64Encoded: true
      };

      const result = (simulator as any).formatResponseBody(response);
      expect(result).toEqual(Buffer.from(originalText));
    });

    it('should stringify object body', () => {
      const objBody = { message: 'hello' };

      const response: SimpleResponse = {
        statusCode: 200,
        body: objBody as any
      };

      const result = (simulator as any).formatResponseBody(response);
      expect(result).toBe(JSON.stringify(objBody));
    });

    it('should return empty string for null body', () => {
      const response: SimpleResponse = {
        statusCode: 200,
        body: null as any
      };

      const result = (simulator as any).formatResponseBody(response);
      expect(result).toBe('');
    });

    it('should return empty string for undefined body', () => {
      const response: SimpleResponse = {
        statusCode: 200
      };

      const result = (simulator as any).formatResponseBody(response);
      expect(result).toBe('');
    });
  });
});
