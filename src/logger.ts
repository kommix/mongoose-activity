import { Activity } from './model';
import { ActivityLogParams, LoggerOptions } from './types';
import { activityContext } from './context';
import { activityEvents } from './events';

export async function logActivity(
  params: ActivityLogParams,
  options: LoggerOptions = {}
): Promise<void> {
  const { throwOnError = false } = options;

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
    await activity.save();

    // Emit logged event for real-time integrations
    activityEvents.emit('activity:logged', activity.toObject());
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
