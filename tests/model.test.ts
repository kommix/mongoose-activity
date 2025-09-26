import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Activity, activityConfig } from '../src';

describe('Activity Model', () => {
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
    // Reset config to defaults
    activityConfig.configure({
      collectionName: 'activities',
      throwOnError: false,
      indexes: true,
      asyncLogging: false,
      retentionDays: undefined,
      maxListeners: 50,
    });
  });

  describe('TTL Support', () => {
    it('should set TTL when retentionDays is configured', async () => {
      // Configure TTL
      activityConfig.configure({ retentionDays: 30 });

      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      const activity = new Activity({
        userId,
        entity: {
          type: 'user',
          id: entityId,
        },
        type: 'user_created',
      });

      await activity.save();

      // Check that the document has the expected structure
      expect(activity.createdAt).toBeInstanceOf(Date);
      expect(activity.userId).toEqual(userId);
      expect(activity.entity.type).toBe('user');
      expect(activity.type).toBe('user_created');

      // Verify TTL index exists (this is set at schema level)
      const collection = mongoose.connection.collection('activities');
      const indexes = await collection.indexes();

      // Look for TTL index on createdAt field
      const ttlIndex = indexes.find(index =>
        index.key &&
        index.key.createdAt === 1 &&
        index.expireAfterSeconds !== undefined
      );

      expect(ttlIndex).toBeDefined();
      // TTL should be 30 days in seconds
      expect(ttlIndex?.expireAfterSeconds).toBe(30 * 24 * 60 * 60);
    });

    it('should not set TTL when retentionDays is undefined', async () => {
      // Ensure retentionDays is undefined (default)
      activityConfig.configure({ retentionDays: undefined });

      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      const activity = new Activity({
        userId,
        entity: { type: 'user', id: entityId },
        type: 'user_created',
      });

      await activity.save();

      // Activity should be saved without TTL
      expect(activity.createdAt).toBeInstanceOf(Date);

      // When no TTL is set, check indexes don't include expiry
      const collection = mongoose.connection.collection('activities');
      const indexes = await collection.indexes();

      const createdAtIndex = indexes.find(index =>
        index.key &&
        index.key.createdAt === 1
      );

      // Should have index but no expiry
      if (createdAtIndex) {
        expect(createdAtIndex.expireAfterSeconds).toBeUndefined();
      }
    });
  });

  describe('Activity.prune() Method', () => {
    beforeEach(async () => {
      const userId = new mongoose.Types.ObjectId();

      // Create test activities with different dates
      const now = new Date();
      const activities = [
        {
          userId,
          entity: { type: 'post', id: new mongoose.Types.ObjectId() },
          type: 'post_created',
          createdAt: new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
        },
        {
          userId,
          entity: { type: 'comment', id: new mongoose.Types.ObjectId() },
          type: 'comment_created',
          createdAt: new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000), // 50 days ago
        },
        {
          userId,
          entity: { type: 'like', id: new mongoose.Types.ObjectId() },
          type: 'like_created',
          createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        },
      ];

      await Activity.insertMany(activities);
    });

    it('should prune activities older than default 90 days', async () => {
      const result = await Activity.prune();

      expect(result.deletedCount).toBe(1); // Only the 100-day-old activity

      const remaining = await Activity.find({});
      expect(remaining).toHaveLength(2);
    });

    it('should prune activities older than specified days', async () => {
      const result = await Activity.prune({ olderThan: '60d' });

      expect(result.deletedCount).toBe(1); // Only the 100-day-old activity

      const remaining = await Activity.find({});
      expect(remaining).toHaveLength(2);
    });

    it('should prune activities older than specified hours', async () => {
      const result = await Activity.prune({ olderThan: '72h' }); // 3 days

      expect(result.deletedCount).toBe(2); // 100-day and 50-day old activities

      const remaining = await Activity.find({});
      expect(remaining).toHaveLength(1);
    });

    it('should prune activities older than specified minutes', async () => {
      const result = await Activity.prune({ olderThan: '1440m' }); // 24 hours

      expect(result.deletedCount).toBe(3); // All test activities are older than 24 hours

      const remaining = await Activity.find({});
      expect(remaining).toHaveLength(0);
    });

    it('should prune activities by entity type', async () => {
      const result = await Activity.prune({
        olderThan: '30d',
        entityType: 'post'
      });

      expect(result.deletedCount).toBe(1); // Only the post activity

      const remaining = await Activity.find({});
      expect(remaining).toHaveLength(2);

      // Verify the post activity was removed
      const postActivities = await Activity.find({ 'entity.type': 'post' });
      expect(postActivities).toHaveLength(0);
    });

    it('should limit number of activities pruned', async () => {
      // Add more old activities
      const userId = new mongoose.Types.ObjectId();
      const oldActivities = Array.from({ length: 5 }, (_, i) => ({
        userId,
        entity: { type: 'old', id: new mongoose.Types.ObjectId() },
        type: 'old_activity',
        createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // 200 days ago
      }));

      await Activity.insertMany(oldActivities);

      const result = await Activity.prune({
        olderThan: '180d',
        limit: 3
      });

      expect(result.deletedCount).toBe(3); // Should only delete 3 due to limit

      const remaining = await Activity.find({ 'entity.type': 'old' });
      expect(remaining).toHaveLength(2); // 2 old activities should remain
    });

    it('should handle Date object as olderThan parameter', async () => {
      const cutoffDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

      const result = await Activity.prune({ olderThan: cutoffDate });

      expect(result.deletedCount).toBe(1); // Only the 100-day-old activity
    });

    it('should handle timestamp number as olderThan parameter', async () => {
      const cutoffTimestamp = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days ago

      const result = await Activity.prune({ olderThan: cutoffTimestamp });

      expect(result.deletedCount).toBe(1); // Only the 100-day-old activity
    });

    it('should handle invalid time format gracefully', async () => {
      const result = await Activity.prune({ olderThan: 'invalid' });

      // Should fall back to treating 'invalid' as a date string, which will create an invalid date
      // The function will then use the invalid date, which might not match any documents
      expect(result.deletedCount).toBe(0);
    });
  });

  describe('Collection Name Configuration', () => {
    it('should use configured collection name', () => {
      activityConfig.configure({ collectionName: 'custom_activities' });

      // The Activity model should use the configured collection name
      expect(Activity.collection.name).toBe('custom_activities');
    });
  });
});