import { Types, Document, Model } from 'mongoose';

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
}

export interface LoggerOptions {
  throwOnError?: boolean;
  asyncLogging?: boolean;
  session?: any; // Mongoose session for transactions
}
