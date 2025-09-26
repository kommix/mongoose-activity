import { Schema, Document, Types } from 'mongoose';
import { PluginOptions } from './types';
import { logActivity } from './logger';
import { activityContext } from './context';
import { activityConfig } from './config';

// Helper function to check if a field path is tracked or is a parent/child of tracked fields
function isFieldTracked(modifiedPath: string, trackedFields: string[]): boolean {
  return trackedFields.some((trackedField) => {
    // Exact match
    if (modifiedPath === trackedField) return true;
    // Modified path is a parent of tracked field (e.g., 'profile' modified, tracking 'profile.avatar')
    if (trackedField.startsWith(modifiedPath + '.')) return true;
    // Modified path is a child of tracked field (e.g., 'profile.avatar' modified, tracking 'profile')
    if (modifiedPath.startsWith(trackedField + '.')) return true;
    return false;
  });
}

// Get the actual tracked fields that should be logged based on modified paths
function getRelevantTrackedFields(modifiedPaths: string[], trackedFields: string[]): string[] {
  const relevantFields = new Set<string>();

  modifiedPaths.forEach((modifiedPath) => {
    trackedFields.forEach((trackedField) => {
      // If the tracked field is exactly the modified path or is a child of it
      if (trackedField === modifiedPath || trackedField.startsWith(modifiedPath + '.')) {
        relevantFields.add(trackedField);
      }
      // If the modified path is a child of the tracked field
      else if (modifiedPath.startsWith(trackedField + '.')) {
        relevantFields.add(trackedField);
      }
    });
  });

  return Array.from(relevantFields);
}

export function activityPlugin<T extends Document>(
  schema: Schema<T>,
  options: PluginOptions = {}
) {
  const {
    trackedFields = [],
    activityType = 'document_updated',
    collectionName = schema.get('collection') || 'unknown',
    throwOnError = activityConfig.getThrowOnError(),
    trackOriginalValues = false,
  } = options;

  // Store original document state after loading from DB (only if tracking original values)
  schema.post('init', function () {
    if (trackOriginalValues && trackedFields.length > 0) {
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
      const modifiedPaths = this.modifiedPaths();
      const modifiedTrackedFields = getRelevantTrackedFields(modifiedPaths, trackedFields);

      if (modifiedTrackedFields.length > 0) {
        (this as any).__modifiedTrackedFields = modifiedTrackedFields;

        if (trackOriginalValues) {
          (this as any).__originalValues = {};

          // Store the original values from initial state
          modifiedTrackedFields.forEach((field) => {
            // Use the value from when document was loaded from DB
            const initialState = (this as any).__initialState || {};
            (this as any).__originalValues[field] = initialState[field];
          });
        }
      }
    }

    next();
  });

  // Log activity after successful save
  schema.post('save', async function (doc: T & { userId?: Types.ObjectId }) {
    try {
      if ((doc as any).__wasNew) {
        // New document created - store initial state for future change tracking (only if enabled)
        if (trackOriginalValues && trackedFields.length > 0) {
          (doc as any).__initialState = {};
          trackedFields.forEach((field) => {
            (doc as any).__initialState[field] = doc.get(field);
          });
        }

        if (doc.userId) {
          await logActivity(
            {
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
            },
            { throwOnError }
          );
        }
      } else {
        // Document updated
        const modifiedFields = (doc as any).__modifiedTrackedFields;
        if (modifiedFields && modifiedFields.length > 0 && doc.userId) {
          const meta: any = { modifiedFields };

          if (trackOriginalValues) {
            // Include detailed before/after changes when tracking original values
            const changes: Record<string, { from: any; to: any }> = {};

            modifiedFields.forEach((field: string) => {
              changes[field] = {
                from: (doc as any).__originalValues?.[field],
                to: doc.get(field),
              };
            });

            meta.changes = changes;
          } else {
            // When not tracking original values, just include current values
            const currentValues: Record<string, any> = {};
            modifiedFields.forEach((field: string) => {
              currentValues[field] = doc.get(field);
            });
            meta.currentValues = currentValues;
          }

          await logActivity(
            {
              userId: doc.userId,
              entity: {
                type: collectionName,
                id: doc._id as Types.ObjectId,
              },
              type: activityType,
              meta,
            },
            { throwOnError }
          );
        }
      }
    } catch (error) {
      console.warn('[mongoose-activity] Error logging activity:', error);
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
          const updateKeys = Object.keys(update.$set || update);
          const updatedFields = getRelevantTrackedFields(updateKeys, trackedFields);

          if (updatedFields.length > 0) {
            // Try to extract userId from update, filter, or context as fallback
            const userId =
              update.userId ||
              update.$set?.userId ||
              filter.userId ||
              activityContext.getUserId();

            if (userId) {
              await logActivity(
                {
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
                },
                { throwOnError }
              );
            }
          }
        }
      } catch (error) {
        console.warn(
          '[mongoose-activity] Error logging activity in update operation:',
          error
        );
      }
    }
  );
}
