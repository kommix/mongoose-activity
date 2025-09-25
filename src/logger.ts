import { Activity } from './model';
import { ActivityLogParams } from './types';
import { activityContext } from './context';
import { activityEvents } from './events';

export async function logActivity(params: ActivityLogParams): Promise<void> {
  try {
    // Get context if available
    const context = activityContext.get();

    // Merge context data
    const activityData = {
      userId: params.userId || context?.userId,
      entity: {
        type: params.entity.type,
        id: params.entity.id
      },
      type: params.type,
      meta: {
        ...params.meta,
        ...(context?.requestId && { requestId: context.requestId }),
        ...(context?.ip && { ip: context.ip }),
        ...(context?.sessionId && { sessionId: context.sessionId })
      },
      createdAt: new Date()
    };

    // Emit before-log event (allows cancellation)
    const shouldLog = activityEvents.emit('activity:before-log', activityData);
    if (shouldLog === false) {
      return;
    }

    const activity = new Activity(activityData);
    await activity.save();

    // Emit logged event for real-time integrations
    activityEvents.emit('activity:logged', activity.toObject());
  } catch (error) {
    activityEvents.emit('activity:error', error as Error, params);
    console.error('Failed to log activity:', error);
    throw error;
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
    endDate
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
  const {
    limit = 50,
    skip = 0,
    activityType,
    startDate,
    endDate
  } = options;

  const query: any = {
    'entity.type': entityType,
    'entity.id': entityId
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