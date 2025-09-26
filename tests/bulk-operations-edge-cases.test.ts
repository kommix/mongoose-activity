import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  Activity,
  activityPlugin,
  activityConfig,
  activityContext,
} from '../src';

describe('Bulk Operations Edge Cases', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.db?.dropDatabase();
    activityConfig.configure({
      collectionName: 'activities',
      throwOnError: false,
      indexes: true,
      asyncLogging: false,
    });
  });

  describe('deleteMany threshold edge cases', () => {
    it('should switch to summary mode at exact threshold', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name'],
        trackDeletions: true,
        deletionFields: ['name'],
        bulkDeleteThreshold: 3, // Low threshold for testing
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestThreshold', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create exactly threshold number of documents
      const docs = [];
      for (let i = 0; i < 3; i++) {
        docs.push(
          new TestModel({
            name: `doc-${i}`,
            userId,
          })
        );
      }

      await Promise.all(docs.map((doc) => doc.save()));

      // Clear creation activities
      await Activity.deleteMany({});

      // Delete all at once - should trigger summary mode
      await TestModel.deleteMany({ userId });

      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe('Test_deleted_bulk');
      expect(activities[0].meta?.deletedCount).toBe(3);
      expect(activities[0].meta?.summary).toBe(true);
    });

    it('should use individual mode below threshold', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name'],
        trackDeletions: true,
        deletionFields: ['name'],
        bulkDeleteThreshold: 3, // Low threshold for testing
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestBelowThreshold', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create fewer than threshold documents
      const docs = [];
      for (let i = 0; i < 2; i++) {
        docs.push(
          new TestModel({
            name: `doc-${i}`,
            userId,
          })
        );
      }

      await Promise.all(docs.map((doc) => doc.save()));

      // Clear creation activities
      await Activity.deleteMany({});

      // Delete all at once - should use individual mode
      await TestModel.deleteMany({ userId });

      const activities = await Activity.find({});
      expect(activities).toHaveLength(2); // Individual activity per document
      activities.forEach((activity) => {
        expect(activity.type).toBe('Test_deleted');
      });
    });

    it('should respect bulkDeleteSummary override', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name'],
        trackDeletions: true,
        deletionFields: ['name'],
        bulkDeleteSummary: true, // Force summary mode
        bulkDeleteThreshold: 100, // High threshold
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestForceSummary', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create only 2 documents (way below threshold)
      const docs = [];
      for (let i = 0; i < 2; i++) {
        docs.push(
          new TestModel({
            name: `doc-${i}`,
            userId,
          })
        );
      }

      await Promise.all(docs.map((doc) => doc.save()));

      // Clear creation activities
      await Activity.deleteMany({});

      // Delete all - should still use summary mode due to bulkDeleteSummary: true
      await TestModel.deleteMany({ userId });

      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe('Test_deleted_bulk');
      expect(activities[0].meta?.summary).toBe(true);
    });
  });

  describe('deleteMany with missing userId edge cases', () => {
    it('should handle deleteMany when no documents have userId', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        // No userId field
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name'],
        trackDeletions: true,
        deletionFields: ['name'],
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestNoUserId', TestSchema);

      // Create documents without userId
      const docs = [];
      for (let i = 0; i < 3; i++) {
        docs.push(
          new TestModel({
            name: `doc-${i}`,
          })
        );
      }

      await Promise.all(docs.map((doc) => doc.save()));

      // Clear creation activities (there shouldn't be any without userId)
      await Activity.deleteMany({});

      // Delete all - should not create activities due to missing userId
      await TestModel.deleteMany({});

      const activities = await Activity.find({});
      expect(activities).toHaveLength(0);
    });

    it('should handle deleteMany with mixed userId presence', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        userId: mongoose.Schema.Types.ObjectId, // Optional
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name'],
        trackDeletions: true,
        deletionFields: ['name'],
        bulkDeleteThreshold: 10,
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestMixedUserId', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create some documents with userId, some without
      const docs = [];
      for (let i = 0; i < 5; i++) {
        docs.push(
          new TestModel({
            name: `doc-${i}`,
            userId: i < 3 ? userId : undefined, // First 3 have userId
          })
        );
      }

      await Promise.all(docs.map((doc) => doc.save()));

      // Clear creation activities
      await Activity.deleteMany({});

      // Delete all documents
      await TestModel.deleteMany({});

      const activities = await Activity.find({});
      // Should only create activities for the 3 documents with userId
      expect(activities).toHaveLength(3);
      activities.forEach((activity) => {
        expect(activity.userId.toString()).toBe(userId.toString());
      });
    });
  });

  describe('deleteMany with session edge cases', () => {
    it('should pass session to bulk delete operations', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name'],
        trackDeletions: true,
        deletionFields: ['name'],
        bulkDeleteSummary: true,
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestBulkSession', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create documents
      const docs = [];
      for (let i = 0; i < 3; i++) {
        docs.push(
          new TestModel({
            name: `doc-${i}`,
            userId,
          })
        );
      }

      await Promise.all(docs.map((doc) => doc.save()));

      // Clear creation activities
      await Activity.deleteMany({});

      const session = await mongoose.startSession();

      try {
        // Delete with session (Note: MongoDB Memory Server doesn't support transactions,
        // but we can still test that the session is passed through)
        await TestModel.deleteMany({ userId }, { session });

        const activities = await Activity.find({});
        expect(activities).toHaveLength(1);
        expect(activities[0].type).toBe('Test_deleted_bulk');
      } finally {
        await session.endSession();
      }
    });
  });

  describe('Large bulk operations', () => {
    it('should handle very large bulk deletions efficiently', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        data: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name', 'data'],
        trackDeletions: true,
        deletionFields: ['name'], // Only track name to reduce memory
        bulkDeleteSummary: true,
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestLargeBulk', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create many documents
      const docs = [];
      for (let i = 0; i < 500; i++) {
        docs.push(
          new TestModel({
            name: `doc-${i}`,
            data: `data-${i}`.repeat(10), // Some data to make it more realistic
            userId,
          })
        );
      }

      // Save in batches to avoid memory issues
      for (let i = 0; i < docs.length; i += 100) {
        await Promise.all(docs.slice(i, i + 100).map((doc) => doc.save()));
      }

      // Clear creation activities
      await Activity.deleteMany({});

      const startTime = Date.now();

      // Delete all at once
      await TestModel.deleteMany({ userId });

      const endTime = Date.now();
      const deletionTime = endTime - startTime;

      // Should create single summary activity
      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe('Test_deleted_bulk');
      expect(activities[0].meta?.deletedCount).toBe(500);
      expect(activities[0].meta?.summary).toBe(true);

      // Check that sample data is limited (not all 500 documents)
      expect(activities[0].meta?.documentIds?.length).toBe(500);
      if (activities[0].meta?.deletedFieldsSample?.name) {
        expect(
          activities[0].meta.deletedFieldsSample.name.length
        ).toBeLessThanOrEqual(5);
      }

      // Should be reasonably fast (less than 2 seconds for bulk operation)
      expect(deletionTime).toBeLessThan(2000);
    });
  });

  describe('Empty bulk operations', () => {
    it('should handle deleteMany with no matching documents', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name'],
        trackDeletions: true,
        deletionFields: ['name'],
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestEmptyBulk', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // Don't create any documents

      // Try to delete non-existent documents
      const result = await TestModel.deleteMany({ userId });

      expect(result.deletedCount).toBe(0);

      // Should not create any activities
      const activities = await Activity.find({});
      expect(activities).toHaveLength(0);
    });
  });

  describe('Bulk operation error scenarios', () => {
    it('should handle errors during bulk deletion gracefully', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name'],
        trackDeletions: true,
        deletionFields: ['name'],
        throwOnError: false,
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestBulkError', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create documents
      const docs = [];
      for (let i = 0; i < 3; i++) {
        docs.push(
          new TestModel({
            name: `doc-${i}`,
            userId,
          })
        );
      }

      await Promise.all(docs.map((doc) => doc.save()));

      // Clear creation activities
      await Activity.deleteMany({});

      // Mock Activity.save to fail
      const originalSave = Activity.prototype.save;
      Activity.prototype.save = jest
        .fn()
        .mockRejectedValue(new Error('Database error'));

      // Delete should still work even if activity logging fails
      await expect(TestModel.deleteMany({ userId })).resolves.not.toThrow();

      // Restore
      Activity.prototype.save = originalSave;

      // Should not have any activities due to the error
      const activities = await Activity.find({});
      expect(activities).toHaveLength(0);
    });
  });

  describe('updateMany operations', () => {
    it('should handle updateMany with session', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        status: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name', 'status'],
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestUpdateMany', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create documents
      const docs = [];
      for (let i = 0; i < 3; i++) {
        docs.push(
          new TestModel({
            name: `doc-${i}`,
            status: 'pending',
            userId,
          })
        );
      }

      await Promise.all(docs.map((doc) => doc.save()));

      // Clear creation activities
      await Activity.deleteMany({});

      const session = await mongoose.startSession();

      try {
        // Update all documents at once
        await TestModel.updateMany(
          { userId },
          { status: 'completed', userId }, // Include userId in update
          { session }
        );

        // Should create one bulk activity for updateMany
        const activities = await Activity.find({});
        expect(activities).toHaveLength(1);
        expect(activities[0].type).toBe('Test_updated_bulk');
        expect(activities[0].meta?.updateType).toBe('bulk');
        expect(activities[0].meta?.queryOperation).toBe('updateMany');
      } finally {
        await session.endSession();
      }
    });
  });
});
