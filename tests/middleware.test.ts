import {
  activityContextMiddleware,
  koaActivityContextMiddleware,
  activityContext,
} from '../src';

describe('Activity Middleware', () => {
  beforeEach(() => {
    // Clear context before each test
    activityContext.clear();
    // Clear console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Express Middleware', () => {
    it('should extract context from request with default extractors', () => {
      const middleware = activityContextMiddleware();

      const req = {
        user: { id: 'user123', _id: 'user456' },
        id: 'req123',
        headers: {
          'x-request-id': 'header-req-id',
          'user-agent': 'test-agent',
        },
        ip: '192.168.1.1',
        sessionID: 'session123',
      };

      const res = {
        on: jest.fn(),
      };

      const next = jest.fn();

      let capturedContext: any;
      // Mock activityContext.run to capture the context
      const originalRun = activityContext.run;
      activityContext.run = jest.fn((context, callback) => {
        capturedContext = context;
        return callback();
      });

      try {
        middleware(req, res, next);

        expect(capturedContext).toEqual({
          userId: 'user123', // Should prefer id over _id
          requestId: 'req123', // Should prefer req.id over headers
          ip: '192.168.1.1',
          sessionId: 'session123',
          userAgent: 'test-agent',
        });

        expect(next).toHaveBeenCalled();
        expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
        expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
      } finally {
        activityContext.run = originalRun;
      }
    });

    it('should use custom extractors when provided', () => {
      const middleware = activityContextMiddleware({
        extractUserId: (req) => req.customUser?.customId,
        extractRequestId: (req) => req.customRequestId,
        extractIp: (req) => req.customIp,
        extractSessionId: (req) => req.customSession,
        extractUserAgent: (req) => req.customAgent,
      });

      const req = {
        customUser: { customId: 'custom-user-id' },
        customRequestId: 'custom-request-id',
        customIp: '10.0.0.1',
        customSession: 'custom-session',
        customAgent: 'custom-agent',
      };

      const res = {
        on: jest.fn(),
      };

      const next = jest.fn();

      let capturedContext: any;
      const originalRun = activityContext.run;
      activityContext.run = jest.fn((context, callback) => {
        capturedContext = context;
        return callback();
      });

      try {
        middleware(req, res, next);

        expect(capturedContext).toEqual({
          userId: 'custom-user-id',
          requestId: 'custom-request-id',
          ip: '10.0.0.1',
          sessionId: 'custom-session',
          userAgent: 'custom-agent',
        });
      } finally {
        activityContext.run = originalRun;
      }
    });

    it('should handle missing context values gracefully', () => {
      const middleware = activityContextMiddleware();

      const req = { headers: {} }; // Empty request with headers
      const res = {
        on: jest.fn(),
      };
      const next = jest.fn();

      let capturedContext: any;
      const originalRun = activityContext.run;
      activityContext.run = jest.fn((context, callback) => {
        capturedContext = context;
        return callback();
      });

      try {
        middleware(req, res, next);

        // Should only include properties where extractors returned truthy values
        expect(capturedContext).toEqual({});
      } finally {
        activityContext.run = originalRun;
      }
    });

    it('should handle x-forwarded-for header correctly', () => {
      const middleware = activityContextMiddleware();

      const req = {
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1, 172.16.0.1',
        },
      };

      const res = {
        on: jest.fn(),
      };
      const next = jest.fn();

      let capturedContext: any;
      const originalRun = activityContext.run;
      activityContext.run = jest.fn((context, callback) => {
        capturedContext = context;
        return callback();
      });

      try {
        middleware(req, res, next);

        expect(capturedContext.ip).toBe('192.168.1.1'); // Should get first IP
      } finally {
        activityContext.run = originalRun;
      }
    });

    it('should handle x-forwarded-for with spaces and empty values', () => {
      const middleware = activityContextMiddleware();

      const req = {
        headers: {
          'x-forwarded-for': '  , , 10.0.0.2  ,  , 192.168.1.200',
        },
      };

      const res = { on: jest.fn() };
      const next = jest.fn();

      let capturedContext: any;
      const originalRun = activityContext.run;
      activityContext.run = jest.fn((context, callback) => {
        capturedContext = context;
        return callback();
      });

      try {
        middleware(req, res, next);
        expect(capturedContext.ip).toBe('10.0.0.2'); // Should get first non-empty IP
      } finally {
        activityContext.run = originalRun;
      }
    });

    it('should handle extractor function errors gracefully', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development'; // Enable console warnings

      const errorExtractor = () => {
        throw new Error('Extractor failed');
      };

      const middleware = activityContextMiddleware({
        extractUserId: errorExtractor,
        extractRequestId: errorExtractor,
        extractIp: errorExtractor,
        extractSessionId: errorExtractor,
        extractUserAgent: errorExtractor,
      });

      const req = { headers: {} };
      const res = { on: jest.fn() };
      const next = jest.fn();

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      expect(() => middleware(req, res, next)).not.toThrow();
      expect(next).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(5); // One for each extractor
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[mongoose-activity] Failed to extract userId:',
        expect.any(Error)
      );

      process.env.NODE_ENV = originalEnv; // Restore original env
    });

    it('should handle event binding failures gracefully', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development'; // Enable console warnings

      const middleware = activityContextMiddleware();
      const req = {};
      const res = {
        on: jest.fn(() => {
          throw new Error('Event binding failed');
        }),
      };
      const next = jest.fn();

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      expect(() => middleware(req, res, next)).not.toThrow();
      expect(next).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[mongoose-activity] Failed to bind cleanup events:',
        expect.any(Error)
      );

      process.env.NODE_ENV = originalEnv; // Restore original env
    });

    it('should handle missing response methods gracefully', () => {
      const middleware = activityContextMiddleware();
      const req = {};
      const res = {}; // No 'on' method
      const next = jest.fn();

      expect(() => middleware(req, res, next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Koa Middleware', () => {
    it('should handle x-forwarded-for in Koa context', async () => {
      const middleware = koaActivityContextMiddleware();

      const ctx = {
        request: {
          header: {
            'x-forwarded-for': '10.0.0.1, 192.168.1.100',
          },
        },
      };

      const next = jest.fn().mockResolvedValue(undefined);

      let capturedContext: any;
      const originalRun = activityContext.run;
      activityContext.run = jest.fn((context, callback) => {
        capturedContext = context;
        return callback();
      });

      try {
        await middleware(ctx, next);
        expect(capturedContext.ip).toBe('10.0.0.1'); // Should get first IP
      } finally {
        activityContext.run = originalRun;
      }
    });

    it('should handle extractor errors in Koa middleware', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development'; // Enable console warnings

      const errorExtractor = () => {
        throw new Error('Koa extractor failed');
      };

      const middleware = koaActivityContextMiddleware({
        extractUserId: errorExtractor,
        extractRequestId: errorExtractor,
        extractIp: errorExtractor,
        extractSessionId: errorExtractor,
        extractUserAgent: errorExtractor,
      });

      const ctx = {
        request: { header: {} },
      };

      const next = jest.fn().mockResolvedValue(undefined);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await expect(middleware(ctx, next)).resolves.not.toThrow();
      expect(next).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(5);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[mongoose-activity] Failed to extract userId:',
        expect.any(Error)
      );

      process.env.NODE_ENV = originalEnv; // Restore original env
    });

    it('should extract context from Koa context with default extractors', async () => {
      const middleware = koaActivityContextMiddleware();

      const ctx = {
        state: { user: { id: 'user123' } },
        request: {
          header: {
            'x-request-id': 'koa-req-id',
            'user-agent': 'koa-agent',
          },
          ip: '192.168.1.2',
        },
        ip: '192.168.1.1',
        session: { id: 'koa-session' },
      };

      const next = jest.fn().mockResolvedValue(undefined);

      let capturedContext: any;
      const originalRun = activityContext.run;
      activityContext.run = jest.fn((context, callback) => {
        capturedContext = context;
        return callback();
      });

      try {
        await middleware(ctx, next);

        expect(capturedContext).toEqual({
          userId: 'user123',
          requestId: 'koa-req-id',
          ip: '192.168.1.1', // ctx.ip takes precedence
          sessionId: 'koa-session',
          userAgent: 'koa-agent',
        });

        expect(next).toHaveBeenCalled();
      } finally {
        activityContext.run = originalRun;
      }
    });

    it('should use custom extractors for Koa', async () => {
      const middleware = koaActivityContextMiddleware({
        extractUserId: (ctx) => ctx.customUser?.id,
        extractRequestId: (ctx) => ctx.customRequestId,
      });

      const ctx = {
        customUser: { id: 'custom-koa-user' },
        customRequestId: 'custom-koa-request',
        request: { header: {}, ip: '' },
        session: {},
      };

      const next = jest.fn().mockResolvedValue(undefined);

      let capturedContext: any;
      const originalRun = activityContext.run;
      activityContext.run = jest.fn((context, callback) => {
        capturedContext = context;
        return callback();
      });

      try {
        await middleware(ctx, next);

        expect(capturedContext).toEqual({
          userId: 'custom-koa-user',
          requestId: 'custom-koa-request',
        });
      } finally {
        activityContext.run = originalRun;
      }
    });

    it('should handle Koa middleware errors gracefully', async () => {
      const middleware = koaActivityContextMiddleware();

      const ctx = {
        state: { user: { id: 'user123' } },
        request: { header: {}, ip: '' },
        session: {},
      };

      const next = jest.fn().mockRejectedValue(new Error('Middleware error'));

      let capturedContext: any;
      const originalRun = activityContext.run;
      activityContext.run = jest.fn((context, callback) => {
        capturedContext = context;
        return callback();
      });

      try {
        await expect(middleware(ctx, next)).rejects.toThrow('Middleware error');

        // Context should still be captured
        expect(capturedContext).toEqual({
          userId: 'user123',
        });
      } finally {
        activityContext.run = originalRun;
      }
    });

    it('should clean up context on completion', async () => {
      const middleware = koaActivityContextMiddleware();

      const ctx = {
        state: { user: { id: 'user123' } },
        request: { header: {}, ip: '' },
        session: {},
      };

      const next = jest.fn().mockResolvedValue(undefined);

      const originalRun = activityContext.run;
      const originalSet = activityContext.set;
      const setMock = jest.fn();
      activityContext.set = setMock;
      activityContext.run = jest.fn((context, callback) => {
        return callback();
      });

      try {
        await middleware(ctx, next);

        // Should set 'ended' to true in finally block
        expect(setMock).toHaveBeenCalledWith('ended', true);
      } finally {
        activityContext.run = originalRun;
        activityContext.set = originalSet;
      }
    });
  });
});
