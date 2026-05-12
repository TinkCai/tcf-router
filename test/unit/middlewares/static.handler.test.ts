import staticHandler from '../../../src/middlewares/static.handler';
import { TcfApiRequest, TcfApiResponse } from '../../../src/index';
import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach
} from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('staticHandler', () => {
  const staticBasePath = path.join(__dirname, 'static-test');
  let mockRequest: TcfApiRequest;
  let mockResponse: Partial<TcfApiResponse>;
  let next: jest.Mock;

  beforeEach(() => {
    // Create test directory and files
    if (!fs.existsSync(staticBasePath)) {
      fs.mkdirSync(staticBasePath, { recursive: true });
    }
    fs.writeFileSync(path.join(staticBasePath, 'test.txt'), 'Test content');
    fs.mkdirSync(path.join(staticBasePath, 'subdir'), { recursive: true });
    fs.writeFileSync(
      path.join(staticBasePath, 'subdir', 'nested.txt'),
      'Nested content'
    );

    mockRequest = {
      httpMethod: 'GET',
      path: 'test.txt',
      headers: {},
      isBase64Encoded: false,
      queryStringParameters: {},
      requestContext: {
        appId: 'test-app-id',
        envId: 'test-env-id',
        requestId: 'test-request-id',
        uin: '123456'
      }
    };
    mockResponse = {
      file: jest.fn(),
      end: jest.fn()
    };
    next = jest.fn();
  });

  afterEach(() => {
    if (fs.existsSync(staticBasePath)) {
      fs.rmSync(staticBasePath, { recursive: true });
    }
  });

  it('should serve static file', async () => {
    const handler = staticHandler(staticBasePath);

    await handler(mockRequest, mockResponse as TcfApiResponse, next);

    expect(mockResponse.file).toHaveBeenCalledWith(
      path.join(staticBasePath, 'test.txt')
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() for non-GET/HEAD requests', async () => {
    mockRequest.httpMethod = 'POST';
    const handler = staticHandler(staticBasePath);

    await handler(mockRequest, mockResponse as TcfApiResponse, next);

    expect(next).toHaveBeenCalled();
    expect(mockResponse.file).not.toHaveBeenCalled();
  });

  it('should call next() if file does not exist', async () => {
    mockRequest.path = '/nonexistent.txt';
    const handler = staticHandler(staticBasePath);

    await handler(mockRequest, mockResponse as TcfApiResponse, next);

    expect(next).toHaveBeenCalled();
    expect(mockResponse.file).not.toHaveBeenCalled();
  });

  it('should prevent directory traversal attacks', async () => {
    mockRequest.path = '/../etc/passwd';
    const handler = staticHandler(staticBasePath);

    await handler(mockRequest, mockResponse as TcfApiResponse, next);

    expect(mockResponse.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() for directories', async () => {
    mockRequest.path = '/subdir';
    const handler = staticHandler(staticBasePath);

    await handler(mockRequest, mockResponse as TcfApiResponse, next);

    expect(next).toHaveBeenCalled();
    expect(mockResponse.file).not.toHaveBeenCalled();
  });

  it('should handle HEAD requests', async () => {
    mockRequest.httpMethod = 'HEAD';
    const handler = staticHandler(staticBasePath);

    await handler(mockRequest, mockResponse as TcfApiResponse, next);

    expect(mockResponse.file).toHaveBeenCalledWith(
      path.join(staticBasePath, 'test.txt')
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle nested files', async () => {
    mockRequest.path = '/subdir/nested.txt';
    const handler = staticHandler(staticBasePath);

    await handler(mockRequest, mockResponse as TcfApiResponse, next);

    expect(mockResponse.file).toHaveBeenCalledWith(
      path.join(staticBasePath, 'subdir', 'nested.txt')
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should decode URL-encoded paths', async () => {
    const fileName = 'test file.txt';
    fs.writeFileSync(path.join(staticBasePath, fileName), 'Space content');
    mockRequest.path = '/' + encodeURIComponent(fileName);

    const handler = staticHandler(staticBasePath);
    await handler(mockRequest, mockResponse as TcfApiResponse, next);

    expect(mockResponse.file).toHaveBeenCalledWith(
      path.join(staticBasePath, fileName)
    );
    expect(next).not.toHaveBeenCalled();
  });
});
