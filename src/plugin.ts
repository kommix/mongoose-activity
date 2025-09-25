import { Schema, Document, Types } from 'mongoose';
import { PluginOptions } from './types';
import { logActivity } from './logger';
import { activityContext } from './context';

export function activityPlugin<T extends Document>(
  schema: Schema<T>,
  options: PluginOptions = {}
) {
  const {
    trackedFields = [],
    activityType = 'document_updated',
    collectionName = schema.get('collection') || 'unknown',
  } = options;

  // Store original document state after loading from DB
  schema.post('init', function () {
    if (trackedFields.length > 0) {
      (this as any).__initialState = {};
      trackedFields.forEach((field) => {
        (this as any).__initialState[field] = this.get(field);
      });
    }
  });

  // Store original values for comparison and track if document is new
  schema.pre('save', function (next) {
    // Store whether this is a new document
    (this as any).__wasNew = this.isNew;

    if (this.isNew) {
      next();
      return;
    }

    // Store modified paths for later comparison
    if (trackedFields.length > 0) {
      const modifiedTrackedFields = this.modifiedPaths().filter((path) =>
        trackedFields.includes(path)
      );

      if (modifiedTrackedFields.length > 0) {
        (this as any).__modifiedTrackedFields = modifiedTrackedFields;
        (this as any).__originalValues = {};

        // Store the original values from initial state
        modifiedTrackedFields.forEach((field) => {
          // Use the value from when document was loaded from DB
          const initialState = (this as any).__initialState || {};
          (this as any).__originalValues[field] = initialState[field];
        });
      }
    }

    next();
  });

  // Log activity after successful save
  schema.post('save', async function (doc: T & { userId?: Types.ObjectId }) {
    try {
      if ((doc as any).__wasNew) {
        // New document created - store initial state for future change tracking
        if (trackedFields.length > 0) {
          (doc as any).__initialState = {};
          trackedFields.forEach((field) => {
            (doc as any).__initialState[field] = doc.get(field);
          });
        }

        if (doc.userId) {
          await logActivity({
            userId: doc.userId,
            entity: {
              type: collectionName,
              id: doc._id as Types.ObjectId,
            },
            type: `${collectionName}_created`,
            meta:
              trackedFields.length > 0
                ? trackedFields.reduce(
                    (acc, field) => {
                      acc[field] = doc.get(field);
                      return acc;
                    },
                    {} as Record<string, any>
                  )
                : undefined,
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
              to: doc.get(field),
            };
          });

          await logActivity({
            userId: doc.userId,
            entity: {
              type: collectionName,
              id: doc._id as Types.ObjectId,
            },
            type: activityType,
            meta: {
              changes,
              modifiedFields,
            },
          });
        }
      }
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  });

  // Handle updateOne, updateMany, findOneAndUpdate operations
  // Note: updateMany affects multiple documents but logs only one activity (schema-level tracking)
  // For per-document tracking on bulk operations, consider using individual updates
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
    // Store the filter for later use in post hook
    (this as any).__filter = this.getFilter();
    (this as any).__update = this.getUpdate();
  });

  schema.post(
    ['updateOne', 'updateMany', 'findOneAndUpdate'],
    async function (_result: any) {
      try {
        const filter = (this as any).__filter;
        const update = (this as any).__update;

        // Only proceed if we have an _id in the filter and relevant updates
        if (filter._id && update && trackedFields.length > 0) {
          const updatedFields = Object.keys(update.$set || update).filter(
            (field) => trackedFields.includes(field)
          );

          if (updatedFields.length > 0) {
            // Try to extract userId from update, filter, or context as fallback
            const userId =
              update.userId ||
              update.$set?.userId ||
              filter.userId ||
              activityContext.getUserId();

            if (userId) {
              await logActivity({
                userId: userId as Types.ObjectId,
                entity: {
                  type: collectionName,
                  id: filter._id as Types.ObjectId,
                },
                type: activityType,
                meta: {
                  updatedFields,
                  updateOperation: (this as any).op,
                },
              });
            }
          }
        }
      } catch (error) {
        console.error('Error logging activity in update operation:', error);
      }
    }
  );
}
