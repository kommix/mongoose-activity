import { Types, Document } from 'mongoose';

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
}
