import { Activity } from './model';
import { ActivityLogParams, LoggerOptions } from './types';
import { activityContext } from './context';
import { activityEvents } from './events';
import { activityConfig } from './config';

// Track pending async operations for graceful shutdown
const pendingOperations = new Set<Promise<void>>();

export async function logActivity(
  params: ActivityLogParams,
  options: LoggerOptions = {}
): Promise<void> {
  const {
    throwOnError = false,
    asyncLogging = activityConfig.getAsyncLogging(),
    session,
  } = options;

  try {
    // Get context if available
    const context = activityContext.get();

    // Warn if context is missing and no userId provided
    if (!context && !params.userId) {
      console.warn(
        '[mongoose-activity] ActivityContext not initialized for this request. Consider using activityContext.run() in your middleware or provide userId explicitly.'
      );
    }

    // Merge context data
    const contextMeta = {
      ...(context?.requestId && { requestId: context.requestId }),
      ...(context?.ip && { ip: context.ip }),
      ...(context?.sessionId && { sessionId: context.sessionId }),
    };

    const meta = { ...params.meta, ...contextMeta };
    const activityData: any = {
      userId: params.userId || context?.userId,
      entity: {
        type: params.entity.type,
        id: params.entity.id,
      },
      type: params.type,
      createdAt: new Date(),
    };

    // Only add meta if there's content to add
    if (Object.keys(meta).length > 0) {
      activityData.meta = meta;
    }

    // Warn if no userId will be set
    if (!activityData.userId) {
      console.warn(
        '[mongoose-activity] No userId provided, activity may not be linked to a user'
      );
    }

    // Emit before-log event (allows cancellation)
    let shouldCancel = false;
    const listeners = activityEvents.listeners('activity:before-log');
    for (const listener of listeners) {
      const result = (listener as any)(activityData);
      if (result === false) {
        shouldCancel = true;
        break;
      }
    }
    if (shouldCancel) {
      return;
    }

    const activity = new Activity(activityData);

    // Support async logging (fire-and-forget) for performance
    if (asyncLogging) {
      // Fire-and-forget: don't await, but track for graceful shutdown
      const savePromise = activity
        .save(session ? { session } : {})
        .then(() => {
          // Emit logged event for real-time integrations
          activityEvents.emit('activity:logged', activity.toObject());
        })
        .catch((error) => {
          activityEvents.emit('activity:error', error as Error, params);
          console.warn(
            '[mongoose-activity] Async activity save failed:',
            error
          );
        })
        .finally(() => {
          pendingOperations.delete(savePromise);
        });

      pendingOperations.add(savePromise);
    } else {
      // Synchronous logging: await the save
      await activity.save(session ? { session } : {});

      // Emit logged event for real-time integrations
      activityEvents.emit('activity:logged', activity.toObject());
    }
  } catch (error) {
    // Always emit error event and log with prefix
    activityEvents.emit('activity:error', error as Error, params);
    console.warn('[mongoose-activity] Failed to log activity:', error);

    // Optionally throw error if configured to do so
    if (throwOnError) {
      throw error;
    }
  }
}

export async function getActivityFeed(
  userId: string,
  options: {
    limit?: number;
    skip?: number;
    entityType?: string;
    activityType?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const {
    limit = 50,
    skip = 0,
    entityType,
    activityType,
    startDate,
    endDate,
  } = options;

  const query: any = { userId };

  if (entityType) {
    query['entity.type'] = entityType;
  }

  if (activityType) {
    query.type = activityType;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }

  return Activity.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean()
    .exec();
}

export async function getEntityActivity(
  entityType: string,
  entityId: string,
  options: {
    limit?: number;
    skip?: number;
    activityType?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const { limit = 50, skip = 0, activityType, startDate, endDate } = options;

  const query: any = {
    'entity.type': entityType,
    'entity.id': entityId,
  };

  if (activityType) {
    query.type = activityType;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }

  return Activity.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean()
    .exec();
}

/**
 * Flush all pending async activity logging operations
 * Useful for graceful shutdown to ensure all activities are saved
 *
 * @param timeout Maximum time to wait in milliseconds (default: 30000)
 * @param signal Optional AbortSignal for cancellation support
 * @returns Promise that resolves when all operations complete or timeout is reached
 */
export async function flushActivities(
  timeout: number = 30000,
  signal?: AbortSignal
): Promise<void> {
  if (pendingOperations.size === 0) {
    return;
  }

  const operations = Array.from(pendingOperations);

  // Create a timeout promise
  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `Activity flush timeout after ${timeout}ms with ${pendingOperations.size} operations still pending`
        )
      );
    }, timeout);
  });

  // Create abort promise if signal is provided
  const abortPromise = signal
    ? new Promise<void>((_, reject) => {
        if (signal.aborted) {
          reject(new Error('Activity flush aborted'));
          return;
        }
        signal.addEventListener('abort', () => {
          reject(new Error('Activity flush aborted'));
        });
      })
    : null;

  try {
    const promises = [Promise.allSettled(operations), timeoutPromise];
    if (abortPromise) promises.push(abortPromise);

    // Race between all operations completing, timeout, and abort signal
    await Promise.race(promises);
  } catch (error) {
    console.warn('[mongoose-activity] Flush interrupted:', error);
    throw error;
  }
}
