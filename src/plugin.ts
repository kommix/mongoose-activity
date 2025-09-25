import { Schema, Document, Types } from 'mongoose';
import { PluginOptions } from './types';
import { logActivity } from './logger';

export function activityPlugin<T extends Document>(schema: Schema<T>, options: PluginOptions = {}) {
  const {
    trackedFields = [],
    activityType = 'document_updated',
    collectionName = schema.get('collection') || 'unknown'
  } = options;

  // Store original values for comparison
  schema.pre('save', function(next) {
    if (this.isNew) {
      next();
      return;
    }

    // Store modified paths for later comparison
    if (trackedFields.length > 0) {
      const modifiedTrackedFields = this.modifiedPaths().filter(path =>
        trackedFields.includes(path)
      );

      if (modifiedTrackedFields.length > 0) {
        (this as any).__modifiedTrackedFields = modifiedTrackedFields;
        (this as any).__originalValues = {};

        // Store original values
        modifiedTrackedFields.forEach(field => {
          (this as any).__originalValues[field] = this.get(field);
        });
      }
    }

    next();
  });

  // Log activity after successful save
  schema.post('save', async function(doc: T & { userId?: Types.ObjectId }) {
    try {
      if (doc.isNew) {
        // New document created
        if (doc.userId) {
          await logActivity({
            userId: doc.userId,
            entity: {
              type: collectionName,
              id: doc._id as Types.ObjectId
            },
            type: `${collectionName}_created`,
            meta: trackedFields.length > 0 ?
              trackedFields.reduce((acc, field) => {
                acc[field] = doc.get(field);
                return acc;
              }, {} as Record<string, any>) : undefined
          });
        }
      } else {
        // Document updated
        const modifiedFields = (doc as any).__modifiedTrackedFields;
        if (modifiedFields && modifiedFields.length > 0 && doc.userId) {
          const changes: Record<string, { from: any; to: any }> = {};

          modifiedFields.forEach((field: string) => {
            changes[field] = {
              from: (doc as any).__originalValues[field],
              to: doc.get(field)
            };
          });

          await logActivity({
            userId: doc.userId,
            entity: {
              type: collectionName,
              id: doc._id as Types.ObjectId
            },
            type: activityType,
            meta: {
              changes,
              modifiedFields
            }
          });
        }
      }
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  });

  // Handle updateOne, updateMany, findOneAndUpdate operations
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function() {
    // Store the filter for later use in post hook
    (this as any).__filter = this.getFilter();
    (this as any).__update = this.getUpdate();
  });

  schema.post(['updateOne', 'updateMany', 'findOneAndUpdate'], async function(_result: any) {
    try {
      const filter = (this as any).__filter;
      const update = (this as any).__update;

      // Only proceed if we have an _id in the filter and relevant updates
      if (filter._id && update && trackedFields.length > 0) {
        const updatedFields = Object.keys(update.$set || update).filter(field =>
          trackedFields.includes(field)
        );

        if (updatedFields.length > 0) {
          // Try to extract userId from the update or filter
          const userId = update.userId || update.$set?.userId || filter.userId;

          if (userId) {
            await logActivity({
              userId: userId as Types.ObjectId,
              entity: {
                type: collectionName,
                id: filter._id as Types.ObjectId
              },
              type: activityType,
              meta: {
                updatedFields,
                updateOperation: (this as any).op
              }
            });
          }
        }
      }
    } catch (error) {
      console.error('Error logging activity in update operation:', error);
    }
  });
}