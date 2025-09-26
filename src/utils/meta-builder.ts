/**
 * Standardized meta payload structures for activity logging
 * Provides consistent schema for forensic/audit systems
 */

export interface BaseMetadata {
  operation: string; // The operation that triggered the activity (e.g., 'create', 'update', 'delete')
  timestamp: Date; // When the operation occurred
  fields?: string[]; // Fields that were affected by the operation
  context?: Record<string, any>; // Additional context data
}

export interface CreateMetadata extends BaseMetadata {
  operation: 'create';
  initialValues?: Record<string, any>; // Initial field values for new documents
}

export interface UpdateMetadata extends BaseMetadata {
  operation: 'update';
  modifiedFields: string[]; // Fields that were actually modified
  changes?: Record<string, { from: any; to: any }>; // Detailed before/after changes (when trackOriginalValues is enabled)
  currentValues?: Record<string, any>; // Current field values (when not tracking original values)
  updateType?: 'document' | 'query' | 'bulk'; // Whether it was a document save, query update, or bulk operation
  queryOperation?: string; // The specific query operation (updateOne, updateMany, findOneAndUpdate)
  filter?: Record<string, any>; // Query filter used for bulk operations
}

export interface DeleteMetadata extends BaseMetadata {
  operation: 'delete' | 'bulkDelete';
  deletedCount?: number; // Number of documents deleted
  deleteType: 'deleteOne' | 'deleteMany' | 'findOneAndDelete';
  deletedFields?: Record<string, any>; // Specific fields from deleted document(s)
  deletedDocument?: any; // Complete document data (when no specific fields configured)
  summary?: boolean; // Indicates if this is a bulk operation summary
  documentIds?: string[]; // IDs of all deleted documents (for bulk operations)
  deletedFieldsSample?: Record<string, any[]>; // Sample of field values from bulk deletions
}

/**
 * Builder class for creating standardized meta payloads
 */
export class MetaBuilder {
  /**
   * Build metadata for document creation
   */
  static forCreate(fields: string[], fieldValues?: Record<string, any>): CreateMetadata {
    return {
      operation: 'create',
      timestamp: new Date(),
      fields,
      initialValues: fieldValues,
    };
  }

  /**
   * Build metadata for document updates
   */
  static forUpdate(
    modifiedFields: string[],
    options: {
      changes?: Record<string, { from: any; to: any }>;
      currentValues?: Record<string, any>;
      updateType?: 'document' | 'query' | 'bulk';
      queryOperation?: string;
      filter?: Record<string, any>;
    } = {}
  ): UpdateMetadata {
    const { changes, currentValues, updateType = 'document', queryOperation, filter } = options;

    return {
      operation: 'update',
      timestamp: new Date(),
      fields: modifiedFields,
      modifiedFields,
      changes,
      currentValues,
      updateType,
      queryOperation,
      filter,
    };
  }

  /**
   * Build metadata for document deletion
   */
  static forDelete(
    deleteType: 'deleteOne' | 'deleteMany' | 'findOneAndDelete',
    options: {
      deletedCount?: number;
      deletedFields?: Record<string, any>;
      deletedDocument?: any;
      fields?: string[];
    } = {}
  ): DeleteMetadata {
    const { deletedCount = 1, deletedFields, deletedDocument, fields } = options;

    return {
      operation: 'delete',
      timestamp: new Date(),
      fields,
      deletedCount,
      deleteType,
      deletedFields,
      deletedDocument,
    };
  }

  /**
   * Build metadata for bulk delete operations
   */
  static forBulkDelete(
    deletedCount: number,
    options: {
      documentIds?: string[];
      deletedFieldsSample?: Record<string, any[]>;
      fields?: string[];
    } = {}
  ): DeleteMetadata {
    const { documentIds, deletedFieldsSample, fields } = options;

    return {
      operation: 'bulkDelete',
      timestamp: new Date(),
      fields,
      deletedCount,
      deleteType: 'deleteMany',
      summary: true,
      documentIds,
      deletedFieldsSample,
    };
  }

  /**
   * Add context information to any metadata object
   */
  static withContext<T extends BaseMetadata>(metadata: T, context: Record<string, any>): T {
    return {
      ...metadata,
      context: {
        ...metadata.context,
        ...context,
      },
    };
  }

  /**
   * Legacy compatibility - convert old meta format to new standardized format
   * This helps migrate existing code gradually
   */
  static fromLegacy(legacyMeta: Record<string, any>): BaseMetadata {
    const base: BaseMetadata = {
      operation: legacyMeta.operation || 'unknown',
      timestamp: new Date(),
    };

    // Detect and convert legacy patterns
    if (legacyMeta.modifiedFields) {
      return {
        ...base,
        operation: 'update',
        fields: legacyMeta.modifiedFields,
        modifiedFields: legacyMeta.modifiedFields,
        changes: legacyMeta.changes,
        currentValues: legacyMeta.currentValues,
      } as UpdateMetadata;
    }

    if (legacyMeta.deletedCount !== undefined) {
      return {
        ...base,
        operation: legacyMeta.summary ? 'bulkDelete' : 'delete',
        deletedCount: legacyMeta.deletedCount,
        deleteType: legacyMeta.operation || 'deleteOne',
        deletedFields: legacyMeta.deletedFields,
        deletedDocument: legacyMeta.deletedDocument,
        summary: legacyMeta.summary,
        documentIds: legacyMeta.documentIds,
        deletedFieldsSample: legacyMeta.deletedFieldsSample,
      } as DeleteMetadata;
    }

    return base;
  }
}