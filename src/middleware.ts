/* eslint-disable no-console */
import { activityContext } from './context';
import { buildContext, ExtractorConfig } from './utils';

// Type definition for UserId - supports string, number, or objects with toString method
export type UserId = string | number | { toString(): string } | undefined;

// Internal constraint interfaces (not exported - for type safety only)
interface InternalRequestLike {
  readonly [key: string]: any;

  // Strongly typed common patterns based on actual usage
  readonly headers?: Record<string, string | string[] | undefined>;
  readonly user?: {
    readonly id?: any;
    readonly _id?: any;
    readonly [key: string]: any;
  };
  readonly id?: string | number;
  readonly ip?: string;
  readonly session?: {
    readonly id?: string;
    readonly [key: string]: unknown;
  };
  readonly sessionID?: string;
  readonly connection?: {
    readonly remoteAddress?: string;
    readonly [key: string]: unknown;
  };
  readonly socket?: {
    readonly remoteAddress?: string;
    readonly [key: string]: unknown;
  };
}

interface InternalResponseLike {
  readonly [key: string]: unknown;
  readonly on?: (
    event: string,
    handler: (...args: unknown[]) => void
  ) => unknown;
}

interface InternalKoaContextLike {
  readonly [key: string]: any;
  readonly state?: {
    readonly user?: {
      readonly id?: any;
      readonly [key: string]: any;
    };
    readonly [key: string]: any;
  };
  readonly user?: {
    readonly id?: any;
    readonly [key: string]: any;
  };
  readonly request?: {
    readonly header?: Record<string, string | string[] | undefined>;
    readonly ip?: string;
    readonly [key: string]: any;
  };
  readonly ip?: string;
  readonly session?: {
    readonly id?: string;
    readonly [key: string]: unknown;
  };
  readonly sessionId?: string;
}

// Internal Next function types (framework-specific)
interface InternalExpressNext {
  (error?: any): void;
}

interface InternalKoaNext {
  (): Promise<any>;
}

// Enhanced option interfaces with generics for type safety
interface ExpressMiddlewareOptions<
  TReq extends InternalRequestLike = InternalRequestLike,
> {
  readonly extractUserId?: (req: TReq) => UserId;
  readonly extractRequestId?: (req: TReq) => string | undefined;
  readonly extractIp?: (req: TReq) => string | undefined;
  readonly extractSessionId?: (req: TReq) => string | undefined;
  readonly extractUserAgent?: (req: TReq) => string | undefined;
}

interface KoaMiddlewareOptions<
  TCtx extends InternalKoaContextLike = InternalKoaContextLike,
> {
  readonly extractUserId?: (ctx: TCtx) => UserId;
  readonly extractRequestId?: (ctx: TCtx) => string | undefined;
  readonly extractIp?: (ctx: TCtx) => string | undefined;
  readonly extractSessionId?: (ctx: TCtx) => string | undefined;
  readonly extractUserAgent?: (ctx: TCtx) => string | undefined;
}

// Legacy interface for backward compatibility (exported)
export interface MiddlewareOptions<TReq = any> {
  extractUserId?: (req: TReq) => UserId;
  extractRequestId?: (req: TReq) => string | undefined;
  extractIp?: (req: TReq) => string | undefined;
  extractSessionId?: (req: TReq) => string | undefined;
  extractUserAgent?: (req: TReq) => string | undefined;
}

/**
 * Express/Connect middleware for automatic activity context setup
 *
 * @template TReq - Request type, defaults to InternalRequestLike with common Express properties
 * @template TRes - Response type, defaults to InternalResponseLike with common Express response methods
 * @template TNext - Next function type, defaults to standard Express next function
 * @param options Configuration for extracting context data from request
 * @returns Express middleware function
 *
 * @example Basic usage (works with any framework)
 * ```ts
 * import { activityContextMiddleware } from '@kommix/mongoose-activity';
 *
 * app.use(activityContextMiddleware({
 *   extractUserId: (req) => req.user?.id,
 *   extractRequestId: (req) => req.id || req.headers?.['x-request-id'],
 * }));
 * ```
 *
 * @example Enhanced type safety with Express
 * ```ts
 * import { Request, Response } from 'express';
 * import { activityContextMiddleware } from '@kommix/mongoose-activity';
 *
 * app.use(activityContextMiddleware<Request, Response>({
 *   extractUserId: (req) => req.user?.id,  // Full IntelliSense
 *   extractRequestId: (req) => req.headers?.['x-request-id'],
 * }));
 * ```
 *
 * @example Custom framework integration
 * ```ts
 * interface MyRequest {
 *   authenticatedUser: { userId: string };
 *   customHeaders: Record<string, string>;
 * }
 *
 * app.use(activityContextMiddleware<MyRequest>({
 *   extractUserId: (req) => req.authenticatedUser.userId,
 *   extractRequestId: (req) => req.customHeaders.requestId,
 * }));
 * ```
 */
export function activityContextMiddleware<
  TReq extends InternalRequestLike = InternalRequestLike,
  TRes extends InternalResponseLike = InternalResponseLike,
  TNext extends InternalExpressNext = InternalExpressNext,
>(
  options: ExpressMiddlewareOptions<TReq> = {}
): (req: TReq, res: TRes, next: TNext) => void {
  const {
    extractUserId = (req: TReq): UserId =>
      (req.user?.id || req.user?._id || undefined) as UserId,
    extractRequestId = (req: TReq) =>
      (req.id ||
        req.headers?.['x-request-id'] ||
        req.headers?.['request-id'] ||
        undefined) as string | undefined,
    extractIp = (req: TReq) => {
      // Improved IP extraction with better x-forwarded-for handling
      const forwardedFor = req.headers?.['x-forwarded-for'];
      if (forwardedFor) {
        const ips =
          typeof forwardedFor === 'string'
            ? forwardedFor
                .split(',')
                .map((ip) => ip.trim())
                .filter(Boolean)
            : [];
        if (ips.length > 0) return ips[0];
      }
      return (
        req.ip ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        undefined
      );
    },
    extractSessionId = (req: TReq) =>
      req.sessionID || req.session?.id || undefined,
    extractUserAgent = (req: TReq) =>
      req.headers?.['user-agent'] as string | undefined,
  } = options;

  return (req: TReq, res: TRes, next: TNext) => {
    // Safely extract context with error handling using helper function
    const extractors: ExtractorConfig[] = [
      {
        extractor: extractUserId ? () => extractUserId(req) : undefined,
        fieldName: 'userId',
        contextKey: 'userId',
      },
      {
        extractor: extractRequestId ? () => extractRequestId(req) : undefined,
        fieldName: 'requestId',
        contextKey: 'requestId',
      },
      {
        extractor: extractIp ? () => extractIp(req) : undefined,
        fieldName: 'IP',
        contextKey: 'ip',
      },
      {
        extractor: extractSessionId ? () => extractSessionId(req) : undefined,
        fieldName: 'sessionId',
        contextKey: 'sessionId',
      },
      {
        extractor: extractUserAgent ? () => extractUserAgent(req) : undefined,
        fieldName: 'userAgent',
        contextKey: 'userAgent',
      },
    ];
    const context = buildContext(extractors);

    // Run the request within the activity context
    activityContext.run(context, () => {
      // Clean up context when response finishes
      if (res.on) {
        try {
          res.on('finish', () => {
            activityContext.set('ended', true);
          });

          // Clean up context on connection close (covers abrupt disconnects)
          res.on('close', () => {
            activityContext.set('ended', true);
          });
        } catch (error) {
          // If event binding fails, we still want the middleware to work
          if (process.env.NODE_ENV !== 'test') {
            console.warn(
              '[mongoose-activity] Failed to bind cleanup events:',
              error
            );
          }
        }
      }

      next();
    });
  };
}

/**
 * Koa middleware for automatic activity context setup
 *
 * @template TCtx - Context type, defaults to InternalKoaContextLike with common Koa properties
 * @template TNext - Next function type, defaults to standard Koa async next function
 * @param options Configuration for extracting context data from request
 * @returns Koa middleware function
 *
 * @example Basic usage
 * ```ts
 * import { koaActivityContextMiddleware } from '@kommix/mongoose-activity';
 *
 * app.use(koaActivityContextMiddleware({
 *   extractUserId: (ctx) => ctx.state.user?.id,
 *   extractRequestId: (ctx) => ctx.request.header['x-request-id'],
 * }));
 * ```
 *
 * @example Enhanced type safety with Koa
 * ```ts
 * import { Context } from 'koa';
 * import { koaActivityContextMiddleware } from '@kommix/mongoose-activity';
 *
 * app.use(koaActivityContextMiddleware<Context>({
 *   extractUserId: (ctx) => ctx.state.user?.id,  // Full IntelliSense
 *   extractIp: (ctx) => ctx.ip,
 * }));
 * ```
 *
 * @example Custom Koa context
 * ```ts
 * interface MyKoaContext {
 *   state: { authenticatedUser: { id: string } };
 *   customRequest: { headers: Record<string, string> };
 * }
 *
 * app.use(koaActivityContextMiddleware<MyKoaContext>({
 *   extractUserId: (ctx) => ctx.state.authenticatedUser.id,
 *   extractRequestId: (ctx) => ctx.customRequest.headers.requestId,
 * }));
 * ```
 */
export function koaActivityContextMiddleware<
  TCtx extends InternalKoaContextLike = InternalKoaContextLike,
  TNext extends InternalKoaNext = InternalKoaNext,
>(
  options: KoaMiddlewareOptions<TCtx> = {}
): (ctx: TCtx, next: TNext) => Promise<any> {
  const {
    extractUserId = (ctx: TCtx): UserId =>
      (ctx.state?.user?.id || ctx.user?.id || undefined) as UserId,
    extractRequestId = (ctx: TCtx) =>
      (ctx.request?.header?.['x-request-id'] ||
        ctx.request?.header?.['request-id'] ||
        undefined) as string | undefined,
    extractIp = (ctx: TCtx) => {
      // Improved IP extraction with better x-forwarded-for handling
      const forwardedFor = ctx.request?.header?.['x-forwarded-for'];
      if (forwardedFor) {
        const ips =
          typeof forwardedFor === 'string'
            ? forwardedFor
                .split(',')
                .map((ip) => ip.trim())
                .filter(Boolean)
            : [];
        if (ips.length > 0) return ips[0];
      }
      return ctx.ip || ctx.request?.ip || undefined;
    },
    extractSessionId = (ctx: TCtx) =>
      ctx.sessionId || ctx.session?.id || undefined,
    extractUserAgent = (ctx: TCtx) =>
      ctx.request?.header?.['user-agent'] as string | undefined,
  } = options;

  return async (ctx: TCtx, next: TNext) => {
    // Safely extract context with error handling using helper function
    const extractors: ExtractorConfig[] = [
      {
        extractor: extractUserId ? () => extractUserId(ctx) : undefined,
        fieldName: 'userId',
        contextKey: 'userId',
      },
      {
        extractor: extractRequestId ? () => extractRequestId(ctx) : undefined,
        fieldName: 'requestId',
        contextKey: 'requestId',
      },
      {
        extractor: extractIp ? () => extractIp(ctx) : undefined,
        fieldName: 'IP',
        contextKey: 'ip',
      },
      {
        extractor: extractSessionId ? () => extractSessionId(ctx) : undefined,
        fieldName: 'sessionId',
        contextKey: 'sessionId',
      },
      {
        extractor: extractUserAgent ? () => extractUserAgent(ctx) : undefined,
        fieldName: 'userAgent',
        contextKey: 'userAgent',
      },
    ];
    const context = buildContext(extractors);

    // Run the request within the activity context
    return activityContext.run(context, async () => {
      try {
        await next();
      } finally {
        // Clean up context when request finishes
        activityContext.set('ended', true);
      }
    });
  };
}
