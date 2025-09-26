import {
  MetaBuilder,
  CreateMetadata,
  UpdateMetadata,
  DeleteMetadata,
} from '../src/utils';

describe('MetaBuilder', () => {
  // Helper to check if timestamp is recent (within last second)
  const expectRecentTimestamp = (timestamp: Date) => {
    const now = Date.now();
    const diff = Math.abs(now - timestamp.getTime());
    expect(diff).toBeLessThan(1000);
  };

  describe('forCreate', () => {
    it('should build create metadata with initial values', () => {
      const fields = ['name', 'email'];
      const initialValues = { name: 'John', email: 'john@example.com' };

      const meta = MetaBuilder.forCreate(fields, initialValues);

      expect(meta.operation).toBe('create');
      expect(meta.fields).toEqual(fields);
      expect(meta.initialValues).toEqual(initialValues);
      expectRecentTimestamp(meta.timestamp);
    });

    it('should build create metadata without initial values', () => {
      const fields = ['name'];

      const meta = MetaBuilder.forCreate(fields);

      expect(meta.operation).toBe('create');
      expect(meta.fields).toEqual(fields);
      expect(meta.initialValues).toBeUndefined();
      expectRecentTimestamp(meta.timestamp);
    });

    it('should handle empty fields array', () => {
      const meta = MetaBuilder.forCreate([]);

      expect(meta.fields).toEqual([]);
      expect(meta.operation).toBe('create');
    });
  });

  describe('forUpdate', () => {
    it('should build update metadata with changes (document update)', () => {
      const modifiedFields = ['email', 'profile.avatar'];
      const changes = {
        email: { from: 'old@example.com', to: 'new@example.com' },
        'profile.avatar': { from: 'old.jpg', to: 'new.jpg' }
      };

      const meta = MetaBuilder.forUpdate(modifiedFields, {
        changes,
        updateType: 'document'
      });

      expect(meta.operation).toBe('update');
      expect(meta.fields).toEqual(modifiedFields);
      expect(meta.modifiedFields).toEqual(modifiedFields);
      expect(meta.changes).toEqual(changes);
      expect(meta.updateType).toBe('document');
      expect(meta.currentValues).toBeUndefined();
      expect(meta.queryOperation).toBeUndefined();
      expectRecentTimestamp(meta.timestamp);
    });

    it('should build update metadata with current values (no tracking)', () => {
      const modifiedFields = ['name'];
      const currentValues = { name: 'Updated Name' };

      const meta = MetaBuilder.forUpdate(modifiedFields, {
        currentValues,
        updateType: 'document'
      });

      expect(meta.operation).toBe('update');
      expect(meta.fields).toEqual(modifiedFields);
      expect(meta.modifiedFields).toEqual(modifiedFields);
      expect(meta.currentValues).toEqual(currentValues);
      expect(meta.updateType).toBe('document');
      expect(meta.changes).toBeUndefined();
      expect(meta.queryOperation).toBeUndefined();
      expectRecentTimestamp(meta.timestamp);
    });

    it('should build update metadata for query operations', () => {
      const modifiedFields = ['status'];

      const meta = MetaBuilder.forUpdate(modifiedFields, {
        updateType: 'query',
        queryOperation: 'updateMany'
      });

      expect(meta.operation).toBe('update');
      expect(meta.fields).toEqual(modifiedFields);
      expect(meta.modifiedFields).toEqual(modifiedFields);
      expect(meta.updateType).toBe('query');
      expect(meta.queryOperation).toBe('updateMany');
      expect(meta.changes).toBeUndefined();
      expect(meta.currentValues).toBeUndefined();
      expectRecentTimestamp(meta.timestamp);
    });

    it('should default to document update type', () => {
      const meta = MetaBuilder.forUpdate(['field']);

      expect(meta.updateType).toBe('document');
    });
  });

  describe('forDelete', () => {
    it('should build delete metadata with deleted fields', () => {
      const deletedFields = { name: 'John', email: 'john@example.com' };
      const fields = ['name', 'email'];

      const meta = MetaBuilder.forDelete('deleteOne', {
        deletedCount: 1,
        deletedFields,
        fields
      });

      expect(meta.operation).toBe('delete');
      expect(meta.fields).toEqual(fields);
      expect(meta.deletedCount).toBe(1);
      expect(meta.deleteType).toBe('deleteOne');
      expect(meta.deletedFields).toEqual(deletedFields);
      expect(meta.deletedDocument).toBeUndefined();
      expectRecentTimestamp(meta.timestamp);
    });

    it('should build delete metadata with full document', () => {
      const deletedDocument = { _id: '123', name: 'John', email: 'john@example.com' };

      const meta = MetaBuilder.forDelete('findOneAndDelete', {
        deletedDocument
      });

      expect(meta.operation).toBe('delete');
      expect(meta.fields).toBeUndefined();
      expect(meta.deletedCount).toBe(1);
      expect(meta.deleteType).toBe('findOneAndDelete');
      expect(meta.deletedDocument).toEqual(deletedDocument);
      expect(meta.deletedFields).toBeUndefined();
      expectRecentTimestamp(meta.timestamp);
    });

    it('should default deletedCount to 1', () => {
      const meta = MetaBuilder.forDelete('deleteOne');

      expect(meta.deletedCount).toBe(1);
    });
  });

  describe('forBulkDelete', () => {
    it('should build bulk delete metadata with samples', () => {
      const documentIds = ['id1', 'id2', 'id3'];
      const deletedFieldsSample = {
        name: ['John', 'Jane', 'Bob'],
        status: ['active', 'inactive']
      };
      const fields = ['name', 'status'];

      const meta = MetaBuilder.forBulkDelete(3, {
        documentIds,
        deletedFieldsSample,
        fields
      });

      expect(meta.operation).toBe('bulkDelete');
      expect(meta.fields).toEqual(fields);
      expect(meta.deletedCount).toBe(3);
      expect(meta.deleteType).toBe('deleteMany');
      expect(meta.summary).toBe(true);
      expect(meta.documentIds).toEqual(documentIds);
      expect(meta.deletedFieldsSample).toEqual(deletedFieldsSample);
      expectRecentTimestamp(meta.timestamp);
    });

    it('should build bulk delete metadata with minimal info', () => {
      const meta = MetaBuilder.forBulkDelete(5);

      expect(meta.operation).toBe('bulkDelete');
      expect(meta.fields).toBeUndefined();
      expect(meta.deletedCount).toBe(5);
      expect(meta.deleteType).toBe('deleteMany');
      expect(meta.summary).toBe(true);
      expect(meta.documentIds).toBeUndefined();
      expect(meta.deletedFieldsSample).toBeUndefined();
      expectRecentTimestamp(meta.timestamp);
    });
  });

  describe('withContext', () => {
    it('should add context to metadata', () => {
      const meta = MetaBuilder.forCreate(['name']);
      const context = { sessionId: 'sess123', ipAddress: '192.168.1.1' };

      const metaWithContext = MetaBuilder.withContext(meta, context);

      expect(metaWithContext.context).toEqual(context);
      expect(metaWithContext.operation).toBe('create');
    });

    it('should merge contexts', () => {
      const meta = MetaBuilder.forCreate(['name']);
      meta.context = { requestId: 'req123' };
      const additionalContext = { sessionId: 'sess123' };

      const metaWithContext = MetaBuilder.withContext(meta, additionalContext);

      expect(metaWithContext.context).toEqual({
        requestId: 'req123',
        sessionId: 'sess123'
      });
    });
  });

  describe('fromLegacy', () => {
    it('should convert legacy update metadata', () => {
      const legacyMeta = {
        modifiedFields: ['name', 'email'],
        changes: {
          name: { from: 'John', to: 'Jane' }
        },
        currentValues: { email: 'jane@example.com' }
      };

      const converted = MetaBuilder.fromLegacy(legacyMeta);

      expect(converted.operation).toBe('update');
      expect((converted as UpdateMetadata).modifiedFields).toEqual(['name', 'email']);
      expect((converted as UpdateMetadata).changes).toEqual(legacyMeta.changes);
    });

    it('should convert legacy delete metadata', () => {
      const legacyMeta = {
        deletedCount: 3,
        operation: 'deleteMany',
        summary: true,
        documentIds: ['id1', 'id2', 'id3'],
        deletedFieldsSample: { name: ['John', 'Jane'] }
      };

      const converted = MetaBuilder.fromLegacy(legacyMeta);

      expect(converted.operation).toBe('bulkDelete');
      expect((converted as DeleteMetadata).deletedCount).toBe(3);
      expect((converted as DeleteMetadata).summary).toBe(true);
    });

    it('should handle unknown legacy format', () => {
      const legacyMeta = { someProperty: 'value' };

      const converted = MetaBuilder.fromLegacy(legacyMeta);

      expect(converted.operation).toBe('unknown');
      expectRecentTimestamp(converted.timestamp);
    });
  });
});