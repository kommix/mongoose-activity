import { Types, Document, Model, ClientSession } from 'mongoose';

export interface IActivity extends Document {
  userId: Types.ObjectId;
  entity: {
    type: string;
    id: Types.ObjectId;
  };
  type: string;
  meta?: Record<string, any>;
  createdAt: Date;
}

export interface IActivityModel extends Model<IActivity> {
  prune(options?: {
    olderThan?: string | Date | number;
    entityType?: string;
    limit?: number;
  }): Promise<{ deletedCount: number }>;
}

export interface ActivityLogParams {
  userId: Types.ObjectId;
  entity: {
    type: string;
    id: Types.ObjectId;
  };
  type: string;
  meta?: Record<string, any>;
}

export interface PluginOptions {
  trackedFields?: string[];
  activityType?: string;
  collectionName?: string;
  throwOnError?: boolean;
  indexes?: boolean;
  trackOriginalValues?: boolean;
  trackDeletions?: boolean; // Enable deletion tracking
  deletionFields?: string[]; // Fields to capture before deletion
  bulkDeleteSummary?: boolean; // For deleteMany: log 1 summary instead of per-document (performance)
  bulkDeleteThreshold?: number; // Threshold above which to use summary mode (default: 100)
}

export interface LoggerOptions {
  throwOnError?: boolean;
  asyncLogging?: boolean;
  session?: ClientSession; // Mongoose session for transactions
}
