import { Schema, model, Types } from 'mongoose';
import { IActivity, IActivityModel } from './types';
import { activityConfig } from './config';

const ActivitySchema = new Schema<IActivity>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    entity: {
      type: {
        type: String,
        required: true,
      },
      id: {
        type: Schema.Types.ObjectId,
        required: true,
      },
    },
    type: {
      type: String,
      required: true,
      index: true,
    },
    meta: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
      ...(activityConfig.getRetentionDays() && {
        expires: `${activityConfig.getRetentionDays()}d`,
      }),
    },
  },
  {
    collection: activityConfig.getCollectionName(),
    timestamps: false,
  }
);

// Compound indexes for efficient querying (configurable)
if (activityConfig.getIndexes()) {
  ActivitySchema.index({ userId: 1, createdAt: -1 });
  ActivitySchema.index({ 'entity.id': 1, createdAt: -1 });
  ActivitySchema.index({ 'entity.type': 1, createdAt: -1 });
  ActivitySchema.index({ type: 1, createdAt: -1 });

  // Compound index for entity queries
  ActivitySchema.index({ 'entity.type': 1, 'entity.id': 1, createdAt: -1 });
}

// Add static methods to the Activity model
ActivitySchema.statics.prune = async function (
  options: {
    olderThan?: string | Date | number;
    entityType?: string;
    limit?: number;
  } = {}
) {
  const { olderThan = '90d', entityType, limit } = options;

  let cutoffDate: Date;
  if (typeof olderThan === 'string') {
    // Parse strings like '90d', '30h', '60m'
    const match = olderThan.match(/^(\d+)([dhm])$/);
    if (match) {
      const [, amount, unit] = match;
      const now = new Date();
      switch (unit) {
        case 'd':
          cutoffDate = new Date(
            now.getTime() - parseInt(amount) * 24 * 60 * 60 * 1000
          );
          break;
        case 'h':
          cutoffDate = new Date(
            now.getTime() - parseInt(amount) * 60 * 60 * 1000
          );
          break;
        case 'm':
          cutoffDate = new Date(now.getTime() - parseInt(amount) * 60 * 1000);
          break;
        default:
          cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // Default 90 days
      }
    } else {
      cutoffDate = new Date(olderThan);
    }
  } else if (typeof olderThan === 'number') {
    cutoffDate = new Date(olderThan);
  } else {
    cutoffDate = olderThan;
  }

  // Check for invalid date
  if (isNaN(cutoffDate.getTime())) {
    // Invalid date, return early with no deletions
    return { deletedCount: 0 };
  }

  const query: any = { createdAt: { $lt: cutoffDate } };
  if (entityType) {
    query['entity.type'] = entityType;
  }

  // Handle batch deletion properly since deleteMany().limit() is ignored by MongoDB
  if (limit) {
    // Find documents to delete in batches
    const docsToDelete = (await this.find(query)
      .select('_id')
      .limit(limit)
      .lean()) as { _id: Types.ObjectId }[];

    if (docsToDelete.length === 0) {
      return { deletedCount: 0 };
    }

    const deleteResult = await this.deleteMany({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      _id: { $in: docsToDelete.map((doc) => doc._id) },
    });

    return { deletedCount: deleteResult.deletedCount || 0 };
  }

  const deleteResult = await this.deleteMany(query);
  return { deletedCount: deleteResult.deletedCount || 0 };
};

export const Activity: IActivityModel = model<IActivity, IActivityModel>(
  'Activity',
  ActivitySchema
);
