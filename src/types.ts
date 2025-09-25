import { ObjectId, Document } from 'mongoose';

export interface IActivity extends Document {
  userId: ObjectId;
  entity: {
    type: string;
    id: ObjectId;
  };
  type: string;
  meta?: Record<string, any>;
  createdAt: Date;
}

export interface ActivityLogParams {
  userId: ObjectId;
  entity: {
    type: string;
    id: ObjectId;
  };
  type: string;
  meta?: Record<string, any>;
}

export interface PluginOptions {
  trackedFields?: string[];
  activityType?: string;
  collectionName?: string;
}