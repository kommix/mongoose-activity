/**
 * Type safety tests for middleware improvements
 * These tests verify that our TypeScript enhancements work correctly
 */

import {
  activityContextMiddleware,
  koaActivityContextMiddleware,
  MiddlewareOptions,
} from '../src';
import { activityContext } from '../src/context';

// Define some mock interfaces for testing
interface MockExpressRequest {
  user?: {
    id: string;
    name: string;
  };
  headers: Record<string, string>;
  ip: string;
  customProperty: string;
}

interface MockExpressResponse {
  [key: string]: unknown;
  on: (event: string, handler: () => void) => void;
  send: (data: any) => void;
}

interface MockKoaContext {
  state: {
    user?: {
      id: string;
      name: string;
    };
  };
  request: {
    header: Record<string, string>;
    ip: string;
  };
  customProperty: string;
}

describe('Middleware Type Safety', () => {
  describe('Backward Compatibility', () => {
    it('should work with legacy any types', () => {
      // These should compile without issues (backward compatibility)
      const middleware1 = activityContextMiddleware();
      const middleware2 = koaActivityContextMiddleware();

      expect(typeof middleware1).toBe('function');
      expect(typeof middleware2).toBe('function');
    });

    it('should work with legacy MiddlewareOptions interface', () => {
      const legacyOptions: MiddlewareOptions = {
        extractUserId: (req) => req.user?.id,
        extractRequestId: (req) => req.id,
        extractIp: (req) => req.ip,
      };

      const middleware = activityContextMiddleware(legacyOptions);
      expect(typeof middleware).toBe('function');
    });
  });

  describe('Enhanced Type Safety', () => {
    it('should provide improved IntelliSense with default constraint types', () => {
      const expressMiddleware = activityContextMiddleware({
        extractUserId: (req) => {
          // req should have IntelliSense for common properties
          const userId = req.user?.id; // Should suggest .user
          const ip = req.ip; // Should suggest .ip
          const headers = req.headers; // Should suggest .headers
          return userId;
        },
        extractIp: (req) => req.ip, // Should autocomplete
        extractRequestId: (req) => {
          const header = req.headers?.['x-request-id'];
          return Array.isArray(header) ? header[0] : header;
        },
      });

      const koaMiddleware = koaActivityContextMiddleware({
        extractUserId: (ctx) => {
          // ctx should have IntelliSense for common Koa properties
          const userId = ctx.state?.user?.id; // Should suggest .state
          const userIdAlt = ctx.user?.id; // Should suggest .user
          const ip = ctx.ip; // Should suggest .ip
          return userId || userIdAlt;
        },
        extractIp: (ctx) => ctx.ip || ctx.request?.ip,
      });

      expect(typeof expressMiddleware).toBe('function');
      expect(typeof koaMiddleware).toBe('function');
    });

    it('should work with custom typed requests', () => {
      // Test with custom Express-like types
      const customExpressMiddleware = activityContextMiddleware<
        MockExpressRequest,
        MockExpressResponse
      >({
        extractUserId: (req) => {
          // Should have full typing for MockExpressRequest
          return req.user?.id; // Full IntelliSense
        },
        extractRequestId: (req) => req.customProperty, // Custom property access
        extractIp: (req) => req.ip,
      });

      // Test with custom Koa-like types
      const customKoaMiddleware = koaActivityContextMiddleware<MockKoaContext>({
        extractUserId: (ctx) => {
          // Should have full typing for MockKoaContext
          return ctx.state.user?.id; // Full IntelliSense
        },
        extractRequestId: (ctx) => ctx.customProperty, // Custom property access
        extractIp: (ctx) => ctx.request.ip,
      });

      expect(typeof customExpressMiddleware).toBe('function');
      expect(typeof customKoaMiddleware).toBe('function');
    });
  });

  describe('Function Return Types', () => {
    it('should have correct Express middleware return type', () => {
      const middleware = activityContextMiddleware();

      // Should be a function that takes (req, res, next) => void
      const mockReq = { user: { id: 'test' }, headers: {}, ip: '127.0.0.1' };
      const mockRes = {
        on: jest.fn(),
      };
      const mockNext = jest.fn();

      // This should compile and work
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should have correct Koa middleware return type', async () => {
      const middleware = koaActivityContextMiddleware();

      // Should be an async function that takes (ctx, next) => Promise<any>
      const mockCtx = {
        state: { user: { id: 'test' } },
        request: { header: {}, ip: '127.0.0.1' },
        ip: '127.0.0.1',
      };
      const mockNext = jest.fn().mockResolvedValue(undefined);

      // This should compile and work
      await middleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Type Safety Edge Cases', () => {
    it('should handle optional response methods gracefully', () => {
      // Test that optional res.on doesn't break
      const middleware = activityContextMiddleware();

      const mockReq = { user: { id: 'test' }, headers: {}, ip: '127.0.0.1' };
      const mockRes = {}; // No 'on' method
      const mockNext = jest.fn();

      // Should not throw even if res.on is undefined
      expect(() => {
        middleware(mockReq, mockRes, mockNext);
      }).not.toThrow();

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle extractors returning undefined', () => {
      const middleware = activityContextMiddleware({
        extractUserId: () => undefined,
        extractRequestId: () => undefined,
        extractIp: () => undefined,
      });

      const mockReq = {};
      const mockRes = { on: jest.fn() };
      const mockNext = jest.fn();

      expect(() => {
        middleware(mockReq, mockRes, mockNext);
      }).not.toThrow();

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Extractor Function Types', () => {
    it('should accept various return types for extractUserId', () => {
      // Should accept string, number, ObjectId-like, etc.
      const middleware1 = activityContextMiddleware({
        extractUserId: () => 'string-id',
      });

      const middleware2 = activityContextMiddleware({
        extractUserId: () => 12345,
      });

      const middleware3 = activityContextMiddleware({
        extractUserId: () => ({ toString: () => 'object-id' }),
      });

      expect(typeof middleware1).toBe('function');
      expect(typeof middleware2).toBe('function');
      expect(typeof middleware3).toBe('function');
    });

    it('should require string return types for other extractors', () => {
      const middleware = activityContextMiddleware({
        extractRequestId: (): string => 'request-id',
        extractIp: (): string => '127.0.0.1',
        extractSessionId: (): string => 'session-id',
        extractUserAgent: (): string => 'test-agent',
      });

      expect(typeof middleware).toBe('function');
    });
  });

  describe('Context Cleanup Verification', () => {
    beforeEach(() => {
      jest.spyOn(activityContext, 'run');
      jest.spyOn(activityContext, 'set');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should clean up context on response finish event', () => {
      const middleware = activityContextMiddleware();
      const mockReq = { headers: {}, ip: '127.0.0.1' };
      const onHandlers: Record<string, Function> = {};
      const mockRes = {
        on: jest.fn((event: string, handler: Function) => {
          onHandlers[event] = handler;
        }),
      };
      const mockNext = jest.fn();

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));
      expect(mockRes.on).toHaveBeenCalledWith('close', expect.any(Function));

      // Simulate finish event
      onHandlers['finish']();
      expect(activityContext.set).toHaveBeenCalledWith('ended', true);
    });

    it('should clean up context on response close event', () => {
      const middleware = activityContextMiddleware();
      const mockReq = { headers: {}, ip: '127.0.0.1' };
      const onHandlers: Record<string, Function> = {};
      const mockRes = {
        on: jest.fn((event: string, handler: Function) => {
          onHandlers[event] = handler;
        }),
      };
      const mockNext = jest.fn();

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.on).toHaveBeenCalledWith('close', expect.any(Function));

      // Simulate close event
      onHandlers['close']();
      expect(activityContext.set).toHaveBeenCalledWith('ended', true);
    });

    it('should clean up Koa context even if next() throws an error', async () => {
      const middleware = koaActivityContextMiddleware();
      const mockCtx = {
        state: {},
        request: { header: {}, ip: '127.0.0.1' },
        ip: '127.0.0.1',
      };
      const mockNext = jest.fn().mockRejectedValue(new Error('Test error'));

      await expect(middleware(mockCtx, mockNext)).rejects.toThrow('Test error');

      // Verify cleanup was still called in the finally block
      expect(activityContext.set).toHaveBeenCalledWith('ended', true);
    });

    it('should clean up Koa context after successful request', async () => {
      const middleware = koaActivityContextMiddleware();
      const mockCtx = {
        state: { user: { id: 'test-user' } },
        request: { header: {}, ip: '127.0.0.1' },
        ip: '127.0.0.1',
      };
      const mockNext = jest.fn().mockResolvedValue(undefined);

      await middleware(mockCtx, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(activityContext.set).toHaveBeenCalledWith('ended', true);
    });
  });

  describe('Multiple Extractors Interaction', () => {
    it('should combine all extractors in Express middleware context', () => {
      const mockUserId = 'user-123';
      const mockRequestId = 'req-456';
      const mockIp = '192.168.1.1';
      const mockSessionId = 'session-789';
      const mockUserAgent = 'Mozilla/5.0';

      const middleware = activityContextMiddleware({
        extractUserId: () => mockUserId,
        extractRequestId: () => mockRequestId,
        extractIp: () => mockIp,
        extractSessionId: () => mockSessionId,
        extractUserAgent: () => mockUserAgent,
      });

      const mockReq = {
        user: { id: mockUserId },
        headers: {
          'x-request-id': mockRequestId,
          'user-agent': mockUserAgent,
        },
        ip: mockIp,
        sessionID: mockSessionId,
      };
      const mockRes = { on: jest.fn() };
      const mockNext = jest.fn();

      // Spy on activityContext.run to capture the context
      let capturedContext: any;
      jest
        .spyOn(activityContext, 'run')
        .mockImplementation((context, callback) => {
          capturedContext = context;
          return callback();
        });

      middleware(mockReq, mockRes, mockNext);

      // Verify all extractors contributed to the context
      expect(capturedContext).toEqual({
        userId: mockUserId,
        requestId: mockRequestId,
        ip: mockIp,
        sessionId: mockSessionId,
        userAgent: mockUserAgent,
      });

      expect(mockNext).toHaveBeenCalled();
      jest.restoreAllMocks();
    });

    it('should combine all extractors in Koa middleware context', async () => {
      const mockUserId = 'koa-user-123';
      const mockRequestId = 'koa-req-456';
      const mockIp = '10.0.0.1';
      const mockSessionId = 'koa-session-789';
      const mockUserAgent = 'Safari/1.0';

      const middleware = koaActivityContextMiddleware({
        extractUserId: () => mockUserId,
        extractRequestId: () => mockRequestId,
        extractIp: () => mockIp,
        extractSessionId: () => mockSessionId,
        extractUserAgent: () => mockUserAgent,
      });

      const mockCtx = {
        state: { user: { id: mockUserId } },
        request: {
          header: {
            'x-request-id': mockRequestId,
            'user-agent': mockUserAgent,
          },
          ip: mockIp,
        },
        ip: mockIp,
        sessionId: mockSessionId,
      };
      const mockNext = jest.fn().mockResolvedValue(undefined);

      // Spy on activityContext.run to capture the context
      let capturedContext: any;
      jest
        .spyOn(activityContext, 'run')
        .mockImplementation((context, callback) => {
          capturedContext = context;
          return callback();
        });

      await middleware(mockCtx, mockNext);

      // Verify all extractors contributed to the context
      expect(capturedContext).toEqual({
        userId: mockUserId,
        requestId: mockRequestId,
        ip: mockIp,
        sessionId: mockSessionId,
        userAgent: mockUserAgent,
      });

      expect(mockNext).toHaveBeenCalled();
      jest.restoreAllMocks();
    });

    it('should only include defined values in context', () => {
      const middleware = activityContextMiddleware({
        extractUserId: () => 'user-123',
        extractRequestId: () => undefined, // Should not appear in context
        extractIp: () => '192.168.1.1',
        extractSessionId: () => undefined, // Should not appear in context
        extractUserAgent: () => 'TestAgent',
      });

      const mockReq = { headers: {} };
      const mockRes = { on: jest.fn() };
      const mockNext = jest.fn();

      // Spy on activityContext.run to capture the context
      let capturedContext: any;
      jest
        .spyOn(activityContext, 'run')
        .mockImplementation((context, callback) => {
          capturedContext = context;
          return callback();
        });

      middleware(mockReq, mockRes, mockNext);

      // Verify only defined values are in context
      expect(capturedContext).toEqual({
        userId: 'user-123',
        ip: '192.168.1.1',
        userAgent: 'TestAgent',
      });
      expect(capturedContext.requestId).toBeUndefined();
      expect(capturedContext.sessionId).toBeUndefined();

      expect(mockNext).toHaveBeenCalled();
      jest.restoreAllMocks();
    });
  });
});
