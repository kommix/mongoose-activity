import { activityContext } from './context';

export interface MiddlewareOptions {
  extractUserId?: (req: any) => any;
  extractRequestId?: (req: any) => string | undefined;
  extractIp?: (req: any) => string | undefined;
  extractSessionId?: (req: any) => string | undefined;
  extractUserAgent?: (req: any) => string | undefined;
}

/**
 * Express/Connect middleware for automatic activity context setup
 *
 * @param options Configuration for extracting context data from request
 * @returns Express middleware function
 *
 * @example
 * ```ts
 * import { activityContextMiddleware } from '@kommix/mongoose-activity';
 *
 * app.use(activityContextMiddleware({
 *   extractUserId: (req) => req.user?.id,
 *   extractRequestId: (req) => req.id || req.headers['x-request-id'],
 * }));
 * ```
 */
export function activityContextMiddleware(options: MiddlewareOptions = {}) {
  const {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    extractUserId = (req: any) => req.user?.id || req.user?._id || undefined,
    extractRequestId = (req: any) =>
      (req.id ||
        req.headers['x-request-id'] ||
        req.headers['request-id'] ||
        undefined) as string | undefined,
    extractIp = (req: any) =>
      (req.ip ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        undefined) as string | undefined,
    extractSessionId = (req: any) =>
      (req.sessionID || req.session?.id || undefined) as string | undefined,
    extractUserAgent = (req: any) =>
      req.headers['user-agent'] as string | undefined,
  } = options;

  return (req: any, res: any, next: any) => {
    const context = {
      ...(extractUserId && { userId: extractUserId(req) }),
      ...(extractRequestId && { requestId: extractRequestId(req) }),
      ...(extractIp && { ip: extractIp(req) }),
      ...(extractSessionId && { sessionId: extractSessionId(req) }),
      ...(extractUserAgent && { userAgent: extractUserAgent(req) }),
    };

    // Run the request within the activity context
    activityContext.run(context, () => {
      // Clean up context when response finishes
      res.on('finish', () => {
        activityContext.set('ended', true);
      });

      // Clean up context on connection close (covers abrupt disconnects)
      res.on('close', () => {
        activityContext.set('ended', true);
      });

      next();
    });
  };
}

/**
 * Koa middleware for automatic activity context setup
 *
 * @param options Configuration for extracting context data from request
 * @returns Koa middleware function
 */
export function koaActivityContextMiddleware(options: MiddlewareOptions = {}) {
  const {
    extractUserId = (ctx: any) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      ctx.state?.user?.id || ctx.user?.id || undefined,
    extractRequestId = (ctx: any) =>
      (ctx.request.header['x-request-id'] ||
        ctx.request.header['request-id'] ||
        undefined) as string | undefined,
    extractIp = (ctx: any) =>
      (ctx.ip || ctx.request.ip || undefined) as string | undefined,
    extractSessionId = (ctx: any) =>
      (ctx.sessionId || ctx.session?.id || undefined) as string | undefined,
    extractUserAgent = (ctx: any) =>
      ctx.request.header['user-agent'] as string | undefined,
  } = options;

  return async (ctx: any, next: any) => {
    const context = {
      ...(extractUserId && { userId: extractUserId(ctx) }),
      ...(extractRequestId && { requestId: extractRequestId(ctx) }),
      ...(extractIp && { ip: extractIp(ctx) }),
      ...(extractSessionId && { sessionId: extractSessionId(ctx) }),
      ...(extractUserAgent && { userAgent: extractUserAgent(ctx) }),
    };

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
