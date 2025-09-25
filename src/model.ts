import { Schema, model, Model } from 'mongoose';
import { IActivity } from './types';

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
    },
  },
  {
    collection: 'activities',
    timestamps: false,
  }
);

// Compound indexes for efficient querying
ActivitySchema.index({ userId: 1, createdAt: -1 });
ActivitySchema.index({ 'entity.id': 1, createdAt: -1 });
ActivitySchema.index({ 'entity.type': 1, createdAt: -1 });
ActivitySchema.index({ type: 1, createdAt: -1 });

// Compound index for entity queries
ActivitySchema.index({ 'entity.type': 1, 'entity.id': 1, createdAt: -1 });

export const Activity: Model<IActivity> = model<IActivity>(
  'Activity',
  ActivitySchema
);
