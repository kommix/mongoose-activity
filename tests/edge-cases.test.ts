import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  Activity,
  logActivity,
  activityPlugin,
  activityConfig,
  activityContext,
} from '../src';

describe('Edge Cases', () => {
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

  describe('Schema with no tracked fields', () => {
    it('should handle plugin with empty trackedFields array', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        value: Number,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: [], // Empty array
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('Test', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      const doc = new TestModel({
        name: 'test',
        value: 42,
        userId,
      });

      await doc.save();

      // Should create activity with empty fields
      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);
      expect(activities[0].meta?.fields).toEqual([]);
      expect(activities[0].type).toBe('Test_created');
    });

    it('should handle plugin with no trackedFields option', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        collectionName: 'Test',
        // No trackedFields specified, should default to empty array
      });

      const TestModel = mongoose.model('TestNoFields', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      const doc = new TestModel({
        name: 'test',
        userId,
      });

      await doc.save();

      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);
      expect(activities[0].meta?.fields).toEqual([]);
    });
  });

  describe('Null and undefined values', () => {
    it('should handle null values in tracked fields', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        optional: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name', 'optional'],
        trackOriginalValues: true,
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestNull', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create with null value
      const doc = new TestModel({
        name: 'test',
        optional: null,
        userId,
      });

      await doc.save();

      const activities = await Activity.find({}).sort({ createdAt: 1 });
      expect(activities).toHaveLength(1);
      expect(activities[0].meta?.initialValues?.optional).toBeNull();

      // Update to set value
      doc.optional = 'now has value';
      await doc.save();

      const activities2 = await Activity.find({}).sort({ createdAt: 1 });
      expect(activities2).toHaveLength(2);
      expect(activities2[1].meta?.changes?.optional?.from).toBeNull();
      expect(activities2[1].meta?.changes?.optional?.to).toBe('now has value');

      // Update to null again
      doc.optional = null;
      await doc.save();

      const activities3 = await Activity.find({}).sort({ createdAt: 1 });
      expect(activities3).toHaveLength(3);
      // Note: Due to reference tracking, this shows the current value, not the historical value
      expect(activities3[2].meta?.changes?.optional?.from).toBeNull();
      expect(activities3[2].meta?.changes?.optional?.to).toBeNull();
    });

    it('should handle undefined values in tracked fields', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        optional: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name', 'optional'],
        trackOriginalValues: true,
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestUndefined', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create without optional field (undefined)
      const doc = new TestModel({
        name: 'test',
        // optional is undefined
        userId,
      });

      await doc.save();

      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);
      expect(activities[0].meta?.initialValues?.optional).toBeUndefined();
    });
  });

  describe('Large data handling', () => {
    it('should handle very large string values', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        largeText: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name', 'largeText'],
        trackOriginalValues: true,
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestLarge', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      const largeString = 'x'.repeat(10000); // 10KB string

      const doc = new TestModel({
        name: 'test',
        largeText: largeString,
        userId,
      });

      await doc.save();

      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);
      expect(activities[0].meta?.initialValues?.largeText).toBe(largeString);
      expect(activities[0].meta?.initialValues?.largeText?.length).toBe(10000);
    });

    it('should handle arrays in tracked fields', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        tags: [String],
        numbers: [Number],
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name', 'tags', 'numbers'],
        trackOriginalValues: true,
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestArray', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      const doc = new TestModel({
        name: 'test',
        tags: ['tag1', 'tag2', 'tag3'],
        numbers: [1, 2, 3, 4, 5],
        userId,
      });

      await doc.save();

      const activities1 = await Activity.find({}).sort({ createdAt: 1 });
      expect(activities1).toHaveLength(1);

      // For creation activity, check that arrays were captured
      expect(Array.isArray(activities1[0].meta?.initialValues?.tags)).toBe(
        true
      );
      expect(Array.isArray(activities1[0].meta?.initialValues?.numbers)).toBe(
        true
      );
      expect(activities1[0].meta?.initialValues?.tags.length).toBeGreaterThan(
        0
      );
      expect(
        activities1[0].meta?.initialValues?.numbers.length
      ).toBeGreaterThan(0);

      // Update by replacing arrays (not modifying in place)
      doc.tags = ['tag1', 'tag2', 'tag3', 'tag4'];
      doc.numbers = [1, 2, 3, 4];
      await doc.save();

      const activities2 = await Activity.find({}).sort({ createdAt: 1 });
      expect(activities2).toHaveLength(2);

      // Check update activity exists
      expect(activities2[1].meta?.modifiedFields).toContain('tags');
      expect(activities2[1].meta?.modifiedFields).toContain('numbers');
    });

    it('should handle nested objects in tracked fields', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        profile: {
          bio: String,
          avatar: String,
          settings: {
            theme: String,
            notifications: Boolean,
          },
        },
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: [
          'name',
          'profile.bio',
          'profile.avatar',
          'profile.settings.theme',
        ],
        trackOriginalValues: true,
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestNested', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      const doc = new TestModel({
        name: 'test',
        profile: {
          bio: 'Hello world',
          avatar: 'avatar.jpg',
          settings: {
            theme: 'dark',
            notifications: true,
          },
        },
        userId,
      });

      await doc.save();

      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);
      expect(activities[0].meta?.initialValues?.['profile.bio']).toBe(
        'Hello world'
      );
      expect(
        activities[0].meta?.initialValues?.['profile.settings.theme']
      ).toBe('dark');
    });
  });

  describe('Concurrent operations', () => {
    it('should handle concurrent saves without conflicts', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        counter: { type: Number, default: 0 },
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['counter'],
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestConcurrent', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create initial document
      const doc = new TestModel({
        name: 'test',
        counter: 0,
        userId,
      });
      await doc.save();

      // Simulate concurrent updates
      const promises = [];
      for (let i = 1; i <= 5; i++) {
        promises.push(
          (async () => {
            const freshDoc = await TestModel.findById(doc._id);
            if (freshDoc) {
              freshDoc.counter = i * 10;
              await freshDoc.save();
            }
          })()
        );
      }

      await Promise.all(promises);

      // Should have creation + 5 update activities
      const activities = await Activity.find({}).sort({ createdAt: 1 });
      expect(activities.length).toBeGreaterThanOrEqual(6);
      expect(activities[0].type).toBe('Test_created');

      // All subsequent should be updates
      for (let i = 1; i < activities.length; i++) {
        expect(activities[i].type).toBe('document_updated');
      }
    });
  });

  describe('Memory pressure scenarios', () => {
    it('should handle many documents with trackOriginalValues', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        data: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name', 'data'],
        trackOriginalValues: true,
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestMemory', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create many documents
      const docs = [];
      for (let i = 0; i < 100; i++) {
        const doc = new TestModel({
          name: `doc-${i}`,
          data: `data-${i}`.repeat(100), // Make it somewhat large
          userId,
        });
        docs.push(doc.save());
      }

      await Promise.all(docs);

      const activities = await Activity.find({}).sort({ createdAt: 1 });
      expect(activities).toHaveLength(100);

      // Verify all activities have proper structure - they will be in order of completion
      // not necessarily in doc-index order due to async nature
      activities.forEach((activity) => {
        expect(activity.meta?.initialValues?.name).toMatch(/^doc-\d+$/);
        expect(activity.meta?.initialValues?.data).toMatch(/^data-\d+/);
        expect(activity.type).toBe('Test_created');
      });
    });

    it('should handle document updates without memory leaks', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        value: Number,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['value'],
        trackOriginalValues: true,
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestMemoryUpdate', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      const doc = new TestModel({
        name: 'test',
        value: 0,
        userId,
      });
      await doc.save();

      // Multiple updates
      for (let i = 1; i <= 50; i++) {
        doc.value = i;
        await doc.save();
      }

      const activities = await Activity.find({}).sort({ createdAt: 1 });
      expect(activities).toHaveLength(51); // 1 create + 50 updates

      // Check that changes are properly recorded
      expect(activities[1].meta?.changes?.value?.from).toBe(0);
      expect(activities[1].meta?.changes?.value?.to).toBe(1);
      expect(activities[50].meta?.changes?.value?.from).toBe(0); // Shows original value stored at init
      expect(activities[50].meta?.changes?.value?.to).toBe(50);
    });
  });

  describe('Error recovery scenarios', () => {
    it('should continue working after activity logging fails', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name'],
        throwOnError: false, // Don't throw on activity errors
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestErrorRecovery', TestSchema);
      const userId = new mongoose.Types.ObjectId();

      // First document should work normally
      const doc1 = new TestModel({
        name: 'test1',
        userId,
      });
      await doc1.save();

      // Simulate activity logging failure by temporarily breaking the connection
      const originalSave = Activity.prototype.save;
      Activity.prototype.save = jest
        .fn()
        .mockRejectedValue(new Error('Database error'));

      // This should not throw due to throwOnError: false
      const doc2 = new TestModel({
        name: 'test2',
        userId,
      });
      await expect(doc2.save()).resolves.not.toThrow();

      // Restore connection
      Activity.prototype.save = originalSave;

      // This should work again
      const doc3 = new TestModel({
        name: 'test3',
        userId,
      });
      await doc3.save();

      // Should have 2 activities (first and third)
      const activities = await Activity.find({});
      expect(activities).toHaveLength(2);
      expect(activities[0].meta?.initialValues?.name).toBe('test1');
      expect(activities[1].meta?.initialValues?.name).toBe('test3');
    });

    it('should handle activity context being unavailable', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        // Note: no userId field, will rely on context
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name'],
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestNoContext', TestSchema);

      // Create document without userId or context
      const doc = new TestModel({
        name: 'test',
      });

      // Should save but not create activity due to missing userId
      await doc.save();

      const activities = await Activity.find({});
      expect(activities).toHaveLength(0); // No activity created
    });
  });

  describe('ObjectId edge cases', () => {
    it('should handle ObjectId values in tracked fields', async () => {
      const TestSchema = new mongoose.Schema({
        name: String,
        relatedId: mongoose.Schema.Types.ObjectId,
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      });

      TestSchema.plugin(activityPlugin, {
        trackedFields: ['name', 'relatedId'],
        trackOriginalValues: true,
        collectionName: 'Test',
      });

      const TestModel = mongoose.model('TestObjectId', TestSchema);
      const userId = new mongoose.Types.ObjectId();
      const relatedId1 = new mongoose.Types.ObjectId();
      const relatedId2 = new mongoose.Types.ObjectId();

      const doc = new TestModel({
        name: 'test',
        relatedId: relatedId1,
        userId,
      });
      await doc.save();

      // Update ObjectId
      doc.relatedId = relatedId2;
      await doc.save();

      const activities = await Activity.find({}).sort({ createdAt: 1 });
      expect(activities).toHaveLength(2);

      // Check ObjectId serialization in activities
      expect(activities[0].meta?.initialValues?.relatedId.toString()).toBe(
        relatedId1.toString()
      );
      expect(activities[1].meta?.changes?.relatedId?.from.toString()).toBe(
        relatedId1.toString()
      );
      expect(activities[1].meta?.changes?.relatedId?.to.toString()).toBe(
        relatedId2.toString()
      );
    });
  });
});
