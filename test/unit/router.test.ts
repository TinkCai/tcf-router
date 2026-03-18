import { Router, TcfApiResponse } from '../../src/index';
import { Response } from '../../src/response';
import { TcfApiRequest } from '../../src/index';
import { createMockRequest } from '../setup';
import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { TcfApiHandler } from '../../src';

describe('Router', () => {
  let mockRequest: TcfApiRequest;
  let router: Router;

  beforeEach(() => {
    mockRequest = createMockRequest() as TcfApiRequest;
    router = new Router(mockRequest);
  });

  describe('constructor', () => {
    it('should create Router instance', () => {
      expect(router).toBeInstanceOf(Router);
      expect(router._response).toBeInstanceOf(Response);
    });

    it('should accept options', () => {
      const options = { pathPrefix: '/api' };
      const routerWithOptions = new Router(mockRequest, options);
      expect(routerWithOptions).toBeInstanceOf(Router);
    });
  });

  describe('add', () => {
    it('should add handler without path', () => {
      const handler = jest.fn();
      router.add(handler as unknown as TcfApiHandler);

      expect(router.getHandles()).toHaveLength(1);
    });

    it('should add handler with path match', () => {
      const handler = jest.fn();
      mockRequest.path = '/users';
      router = new Router(mockRequest);

      router.add('/users', handler as unknown as TcfApiHandler, 'GET');

      expect(router.getHandles()).toHaveLength(1);
    });

    it('should filter by HTTP method', () => {
      const handler = jest.fn();
      mockRequest.httpMethod = 'POST';
      mockRequest.path = '/users';
      router = new Router(mockRequest);

      router.add('/users', handler as unknown as TcfApiHandler, 'GET');

      expect(router.getHandles()).toHaveLength(0);
    });

    it('should match ALL methods', () => {
      const handler = jest.fn();
      mockRequest.path = '/users';
      router = new Router(mockRequest);

      router.use('/users', handler as unknown as TcfApiHandler);

      expect(router.getHandles()).toHaveLength(1);
    });
  });

  describe('HTTP method helpers', () => {
    beforeEach(() => {
      mockRequest.path = '/test';
      router = new Router(mockRequest);
    });

    it('get should add GET handler', () => {
      const handler = jest.fn();
      mockRequest.httpMethod = 'GET';
      router = new Router(mockRequest);

      router.get('/test', handler as unknown as TcfApiHandler);

      expect(router.getHandles()).toHaveLength(1);
    });

    it('post should add POST handler', () => {
      const handler = jest.fn();
      mockRequest.httpMethod = 'POST';
      router = new Router(mockRequest);

      router.post('/test', handler as unknown as TcfApiHandler);

      expect(router.getHandles()).toHaveLength(1);
    });

    it('put should add PUT handler', () => {
      const handler = jest.fn();
      mockRequest.httpMethod = 'PUT';
      router = new Router(mockRequest);

      router.put('/test', handler as unknown as TcfApiHandler);

      expect(router.getHandles()).toHaveLength(1);
    });

    it('del should add DELETE handler', () => {
      const handler = jest.fn();
      mockRequest.httpMethod = 'DELETE';
      router = new Router(mockRequest);

      router.del('/test', handler as unknown as TcfApiHandler);

      expect(router.getHandles()).toHaveLength(1);
    });
  });

  describe('extends', () => {
    it('should extend router with prefix', () => {
      const handler = jest.fn();
      mockRequest.path = '/users';
      router.extends((subRouter) => {
        subRouter.get('/users', handler as unknown as TcfApiHandler);
      });

      expect(router.getHandles().length).toBeGreaterThan(0);
    });

    it('should extend router without prefix', () => {
      const handler = jest.fn();

      router.extends((subRouter) => {
        subRouter.get(handler as unknown as TcfApiHandler);
      });

      expect(router.getHandles().length).toBeGreaterThan(0);
    });
  });

  describe('serve', () => {
    it('should execute handlers in order', async () => {
      const executionOrder: number[] = [];

      const handler1 = jest.fn(async (_req, _res, next: () => void) => {
        executionOrder.push(1);
        next();
      });

      const handler2 = jest.fn(async (_req, res: TcfApiResponse, _next) => {
        executionOrder.push(2);
        res.json({ result: 'success' });
      });

      mockRequest.path = '/test';
      router = new Router(mockRequest);
      router.use('/test', handler1 as unknown as TcfApiHandler);
      router.use('/test', handler2 as unknown as TcfApiHandler);

      await router.serve();

      expect(executionOrder).toEqual([1, 2]);
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should stop at first response', async () => {
      const handler1 = jest.fn(async (_req, res: TcfApiResponse, _next) => {
        res.json({ result: 'first' });
      });

      const handler2 = jest.fn();

      mockRequest.path = '/test';
      router = new Router(mockRequest);
      router.use('/test', handler1 as unknown as TcfApiHandler);
      router.use('/test', handler2 as unknown as TcfApiHandler);

      await router.serve();

      expect(handler1).toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should return undefined when no handlers match', async () => {
      mockRequest.path = '/nonexistent';
      router = new Router(mockRequest);

      const result = await router.serve();

      expect(result).toBeUndefined();
    });
  });

  describe('path parameters', () => {
    it('should extract path parameters', async () => {
      const handler = jest.fn(
        async (req: TcfApiRequest, res: TcfApiResponse, _next) => {
          res.json({ userId: req.params?.id });
        }
      );

      mockRequest.path = '/users/123';
      mockRequest.httpMethod = 'GET';
      router = new Router(mockRequest);

      router.get('/users/:id', handler as unknown as TcfApiHandler);

      await router.serve();

      expect(handler).toHaveBeenCalled();
    });

    it('should handle multiple path parameters', async () => {
      const handler = jest.fn(
        async (req: TcfApiRequest, res: TcfApiResponse, _next) => {
          res.json({
            category: req.params?.category,
            productId: req.params?.productId
          });
        }
      );

      mockRequest.path = '/products/electronics/456';
      mockRequest.httpMethod = 'GET';
      router = new Router(mockRequest);

      router.get(
        '/products/:category/:productId',
        handler as unknown as TcfApiHandler
      );

      await router.serve();

      expect(handler).toHaveBeenCalled();
    });
  });
});
