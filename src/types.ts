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
  /**
   * Fields to automatically track changes for (supports nested fields like 'profile.avatar')
   *
   * MEMORY IMPACT: Each tracked field increases memory usage per document.
   * When trackOriginalValues=true, memory usage doubles for these fields.
   * Recommendation: Track only essential fields, avoid large objects.
   */
  trackedFields?: string[];

  activityType?: string;
  collectionName?: string;
  throwOnError?: boolean;
  indexes?: boolean;

  /**
   * Enable before/after change detection for tracked fields
   *
   * MEMORY IMPACT: When enabled, stores __initialState (on init) and __originalValues (on save)
   * This roughly doubles memory usage for tracked fields but provides detailed change logs.
   *
   * - false: Logs current values only (memory efficient)
   * - true: Logs before/after values (memory intensive, detailed audit)
   */
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
