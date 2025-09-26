import { Schema, Document, Types } from 'mongoose';
import { PluginOptions } from './types';
import { logActivity } from './logger';
import { activityContext } from './context';
import { activityConfig } from './config';

// Get the actual tracked fields that should be logged based on modified paths
function getRelevantTrackedFields(
  modifiedPaths: string[],
  trackedFields: string[]
): string[] {
  const relevantFields = new Set<string>();

  modifiedPaths.forEach((modifiedPath) => {
    trackedFields.forEach((trackedField) => {
      // If the tracked field is exactly the modified path or is a child of it
      if (
        trackedField === modifiedPath ||
        trackedField.startsWith(modifiedPath + '.')
      ) {
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

// Helper function to validate field paths against schema
function validateFieldPaths(
  schema: Schema,
  fields: string[],
  fieldType: string
): string[] {
  const validFields: string[] = [];
  const isDevelopment = process.env.NODE_ENV !== 'production';

  for (const field of fields) {
    // Check if field exists in schema (handles nested paths like 'profile.avatar')
    const schemaPath = schema.path(field);
    const isVirtual = schema.virtualpath(field); // Check if virtual exists without creating it
    const isNestedPath =
      field.includes('.') && schema.path(field.split('.')[0]);

    if (schemaPath || isVirtual || isNestedPath) {
      validFields.push(field);
    } else if (isDevelopment) {
      console.warn(
        `[mongoose-activity] ${fieldType} field "${field}" not found in schema "${schema.get('collection') || 'unknown'}". ` +
          `Available paths: ${schema.paths ? Object.keys(schema.paths).join(', ') : 'none'}`
      );
    }
  }

  return validFields;
}

export function activityPlugin<T extends Document>(
  schema: Schema<T>,
  options: PluginOptions = {}
) {
  const {
    trackedFields: rawTrackedFields = [],
    activityType = 'document_updated',
    collectionName = schema.get('collection') || 'unknown',
    throwOnError = activityConfig.getThrowOnError(),
    trackOriginalValues = false,
    trackDeletions = false,
    deletionFields: rawDeletionFields = rawTrackedFields, // Default to using tracked fields for deletions
    bulkDeleteSummary = false, // Default to per-document logging
    bulkDeleteThreshold = 100, // Threshold for switching to summary mode
  } = options;

  // Validate field paths against schema in development
  const trackedFields = validateFieldPaths(
    schema,
    rawTrackedFields,
    'trackedFields'
  );
  const deletionFields = validateFieldPaths(
    schema,
    rawDeletionFields,
    'deletionFields'
  );

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
      const modifiedTrackedFields = getRelevantTrackedFields(
        modifiedPaths,
        trackedFields
      );

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
          const updatedFields = getRelevantTrackedFields(
            updateKeys,
            trackedFields
          );

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

  // Add deletion tracking hooks if enabled
  if (trackDeletions) {
    // Handle deleteOne operation
    schema.pre('deleteOne', async function () {
      try {
        const filter = this.getFilter();

        if (filter._id) {
          // Find the document before deletion to capture its data
          const docToDelete = await this.model.findById(filter._id).lean();

          if (docToDelete) {
            // Store the document data for the post hook
            (this as any).__deletionData = {
              document: docToDelete,
              userId:
                (docToDelete as any).userId ||
                (filter as any).userId ||
                activityContext.getUserId(),
            };
          }
        }
      } catch (error) {
        console.warn('[mongoose-activity] Error in deleteOne pre hook:', error);
      }
    });

    schema.post('deleteOne', async function (result: any) {
      try {
        const deletionData = (this as any).__deletionData;

        if (deletionData && result.deletedCount > 0) {
          const { document: deletedDoc, userId } = deletionData;

          if (userId) {
            // Prepare metadata with selected fields
            const meta: any = {
              deletedCount: result.deletedCount,
              operation: 'deleteOne',
            };

            // Include specific fields from the deleted document
            if (deletionFields.length > 0) {
              meta.deletedFields = {};
              deletionFields.forEach((field) => {
                meta.deletedFields[field] = deletedDoc[field];
              });
            } else {
              // Include entire document if no specific fields specified
              meta.deletedDocument = deletedDoc;
            }

            await logActivity(
              {
                userId: userId as Types.ObjectId,
                entity: {
                  type: collectionName,
                  id: deletedDoc._id as Types.ObjectId,
                },
                type: `${collectionName}_deleted`,
                meta,
              },
              { throwOnError }
            );
          }
        }
      } catch (error) {
        console.warn(
          '[mongoose-activity] Error logging deleteOne activity:',
          error
        );
      }
    });

    // Handle deleteMany operation
    schema.pre('deleteMany', async function () {
      try {
        const filter = this.getFilter();

        // Find all documents that will be deleted
        const docsToDelete = await this.model.find(filter).lean();

        if (docsToDelete.length > 0) {
          // Store the documents data for the post hook
          (this as any).__deletionData = {
            documents: docsToDelete,
            filter: filter,
          };
        }
      } catch (error) {
        console.warn(
          '[mongoose-activity] Error in deleteMany pre hook:',
          error
        );
      }
    });

    schema.post('deleteMany', async function (result: any) {
      try {
        const deletionData = (this as any).__deletionData;

        if (deletionData && result.deletedCount > 0) {
          const { documents: deletedDocs, filter } = deletionData;

          // Performance optimization: Use summary mode for large bulk operations
          const shouldUseSummaryMode =
            bulkDeleteSummary || result.deletedCount > bulkDeleteThreshold;

          if (shouldUseSummaryMode) {
            // Log a single summary activity instead of per-document
            const userId = filter.userId || activityContext.getUserId();

            // Try to get userId from first document if not in filter/context
            const firstDocUserId =
              deletedDocs.length > 0 ? deletedDocs[0].userId : null;

            const finalUserId = userId || firstDocUserId;

            if (finalUserId) {
              const meta: any = {
                deletedCount: result.deletedCount,
                operation: 'deleteMany',
                summary: true, // Indicate this is a summary entry
                documentIds: deletedDocs.map(
                  (doc: any) => doc._id as Types.ObjectId
                ),
              };

              // Include aggregated field data if specified
              if (deletionFields.length > 0) {
                meta.deletedFieldsSample = {};
                deletionFields.forEach((field) => {
                  // Include first 5 values as a sample
                  const values = deletedDocs
                    .slice(0, 5)
                    .map((doc: any) => doc[field] as unknown)
                    .filter((val: any) => val !== undefined);
                  if (values.length > 0) {
                    meta.deletedFieldsSample[field] = values;
                  }
                });
              }

              await logActivity(
                {
                  userId: finalUserId as Types.ObjectId,
                  entity: {
                    type: collectionName,
                    id: deletedDocs[0]._id as Types.ObjectId, // Use first doc as representative
                  },
                  type: `${collectionName}_deleted_bulk`,
                  meta,
                },
                { throwOnError }
              );
            }
          } else {
            // Default: Log activity for each deleted document that has a userId
            for (const deletedDoc of deletedDocs) {
              const userId =
                deletedDoc.userId ||
                filter.userId ||
                activityContext.getUserId();

              if (userId) {
                // Prepare metadata
                const meta: any = {
                  deletedCount: result.deletedCount,
                  operation: 'deleteMany',
                };

                // Include specific fields from the deleted document
                if (deletionFields.length > 0) {
                  meta.deletedFields = {};
                  deletionFields.forEach((field) => {
                    meta.deletedFields[field] = deletedDoc[field];
                  });
                } else {
                  // Include entire document if no specific fields specified
                  meta.deletedDocument = deletedDoc;
                }

                await logActivity(
                  {
                    userId: userId as Types.ObjectId,
                    entity: {
                      type: collectionName,
                      id: deletedDoc._id as Types.ObjectId,
                    },
                    type: `${collectionName}_deleted`,
                    meta,
                  },
                  { throwOnError }
                );
              }
            }
          }
        }
      } catch (error) {
        console.warn(
          '[mongoose-activity] Error logging deleteMany activity:',
          error
        );
      }
    });

    // Handle findOneAndDelete operation
    schema.pre('findOneAndDelete', async function () {
      try {
        const filter = this.getFilter();

        if (filter._id) {
          // Find the document before deletion to capture its data
          const docToDelete = await this.model.findById(filter._id).lean();

          if (docToDelete) {
            // Store the document data for the post hook
            (this as any).__deletionData = {
              document: docToDelete,
              userId:
                (docToDelete as any).userId ||
                (filter as any).userId ||
                activityContext.getUserId(),
            };
          }
        }
      } catch (error) {
        console.warn(
          '[mongoose-activity] Error in findOneAndDelete pre hook:',
          error
        );
      }
    });

    schema.post('findOneAndDelete', async function (deletedDoc: any) {
      try {
        const deletionData = (this as any).__deletionData;

        if (deletionData && deletedDoc) {
          const { userId } = deletionData;

          if (userId) {
            // Prepare metadata
            const meta: any = {
              operation: 'findOneAndDelete',
            };

            // Include specific fields from the deleted document
            if (deletionFields.length > 0) {
              meta.deletedFields = {};
              deletionFields.forEach((field) => {
                meta.deletedFields[field] = deletedDoc[field];
              });
            } else {
              // Include entire document if no specific fields specified
              meta.deletedDocument = deletedDoc.toObject
                ? deletedDoc.toObject()
                : deletedDoc;
            }

            await logActivity(
              {
                userId: userId as Types.ObjectId,
                entity: {
                  type: collectionName,
                  id: deletedDoc._id as Types.ObjectId,
                },
                type: `${collectionName}_deleted`,
                meta,
              },
              { throwOnError }
            );
          }
        }
      } catch (error) {
        console.warn(
          '[mongoose-activity] Error logging findOneAndDelete activity:',
          error
        );
      }
    });
  }
}
