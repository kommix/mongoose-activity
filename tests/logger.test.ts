import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  Activity,
  logActivity,
  getActivityFeed,
  getEntityActivity,
  flushActivities,
  clearPendingActivities,
  activityConfig,
  activityEvents,
} from '../src';

describe('Activity Logger', () => {
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
    activityEvents.removeAllListeners();
  });

  describe('getActivityFeed', () => {
    it('should retrieve activity feed for a user', async () => {
      const userId = new mongoose.Types.ObjectId();
      const entityId1 = new mongoose.Types.ObjectId();
      const entityId2 = new mongoose.Types.ObjectId();

      // Log multiple activities
      await logActivity({
        userId,
        entity: { type: 'post', id: entityId1 },
        type: 'post_created',
        meta: { title: 'First Post' },
      });

      await logActivity({
        userId,
        entity: { type: 'comment', id: entityId2 },
        type: 'comment_created',
        meta: { content: 'Great post!' },
      });

      const feed = await getActivityFeed(userId.toString());

      expect(feed).toHaveLength(2);
      expect(feed[0].type).toBe('comment_created'); // Most recent first
      expect(feed[1].type).toBe('post_created');
    });

    it('should filter activity feed by entity type', async () => {
      const userId = new mongoose.Types.ObjectId();
      const entityId1 = new mongoose.Types.ObjectId();
      const entityId2 = new mongoose.Types.ObjectId();

      await logActivity({
        userId,
        entity: { type: 'post', id: entityId1 },
        type: 'post_created',
      });

      await logActivity({
        userId,
        entity: { type: 'comment', id: entityId2 },
        type: 'comment_created',
      });

      const feed = await getActivityFeed(userId.toString(), {
        entityType: 'post',
      });

      expect(feed).toHaveLength(1);
      expect(feed[0].entity.type).toBe('post');
    });

    it('should paginate activity feed', async () => {
      const userId = new mongoose.Types.ObjectId();

      // Create 5 activities
      for (let i = 0; i < 5; i++) {
        await logActivity({
          userId,
          entity: { type: 'post', id: new mongoose.Types.ObjectId() },
          type: 'post_created',
          meta: { index: i },
        });
        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const page1 = await getActivityFeed(userId.toString(), {
        limit: 2,
        skip: 0,
      });

      const page2 = await getActivityFeed(userId.toString(), {
        limit: 2,
        skip: 2,
      });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].meta?.index).toBe(4); // Most recent first (index 4)
      expect(page2[0].meta?.index).toBe(2); // Third most recent (index 2)
    });
  });

  describe('getEntityActivity', () => {
    it('should retrieve activity for a specific entity', async () => {
      const userId1 = new mongoose.Types.ObjectId();
      const userId2 = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      await logActivity({
        userId: userId1,
        entity: { type: 'post', id: entityId },
        type: 'post_created',
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await logActivity({
        userId: userId2,
        entity: { type: 'post', id: entityId },
        type: 'post_liked',
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Activity for different entity
      await logActivity({
        userId: userId1,
        entity: { type: 'post', id: new mongoose.Types.ObjectId() },
        type: 'post_created',
      });

      const entityActivity = await getEntityActivity(
        'post',
        entityId.toString()
      );

      expect(entityActivity).toHaveLength(2);
      expect(entityActivity[0].type).toBe('post_liked'); // Most recent first
      expect(entityActivity[1].type).toBe('post_created');
      expect(
        entityActivity.every(
          (a) => a.entity.id.toString() === entityId.toString()
        )
      ).toBe(true);
    });

    it('should filter entity activity by activity type', async () => {
      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      await logActivity({
        userId,
        entity: { type: 'post', id: entityId },
        type: 'post_created',
      });

      await logActivity({
        userId,
        entity: { type: 'post', id: entityId },
        type: 'post_updated',
      });

      const entityActivity = await getEntityActivity(
        'post',
        entityId.toString(),
        {
          activityType: 'post_created',
        }
      );

      expect(entityActivity).toHaveLength(1);
      expect(entityActivity[0].type).toBe('post_created');
    });
  });

  describe('Async Logging', () => {
    it('should support async logging mode', async () => {
      activityConfig.configure({ asyncLogging: true });

      const loggedHandler = jest.fn();
      activityEvents.on('activity:logged', loggedHandler);

      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      // logActivity should return immediately in async mode
      await logActivity({
        userId,
        entity: { type: 'post', id: entityId },
        type: 'post_created',
        meta: { title: 'Async Post' },
      });

      // Wait for async save to complete via event
      await new Promise((resolve) => {
        activityEvents.once('activity:logged', resolve);
      });

      // Activity should be saved
      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);
      expect(activities[0].meta?.title).toBe('Async Post');

      // Logged event should be emitted
      expect(loggedHandler).toHaveBeenCalled();
    });

    it('should handle async logging errors gracefully', async () => {
      activityConfig.configure({ asyncLogging: true });

      const errorHandler = jest.fn();
      activityEvents.on('activity:error', errorHandler);

      // Log activity with invalid data that will cause save error
      await logActivity({
        userId: 'invalid' as any,
        entity: { type: 'post', id: new mongoose.Types.ObjectId() },
        type: 'post_created',
      });

      // Wait for async error handling via event
      await new Promise((resolve) => {
        activityEvents.once('activity:error', resolve);
      });

      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ type: 'post_created' })
      );
    });
  });

  describe('Session Support', () => {
    it('should accept session parameter without errors', async () => {
      // Note: MongoDB Memory Server doesn't support transactions,
      // so we just test that session parameter is accepted
      const session = await mongoose.startSession();

      try {
        const userId = new mongoose.Types.ObjectId();
        const entityId = new mongoose.Types.ObjectId();

        await logActivity(
          {
            userId,
            entity: { type: 'order', id: entityId },
            type: 'order_created',
            meta: { amount: 100 },
          },
          { session }
        );

        // Activity should be saved (without actual transaction support in memory server)
        const activities = await Activity.find({});
        expect(activities).toHaveLength(1);
        expect(activities[0].type).toBe('order_created');
      } finally {
        await session.endSession();
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw errors when throwOnError is true', async () => {
      activityConfig.configure({ throwOnError: true });

      // Provide missing required field to force a validation error
      await expect(
        logActivity({
          userId: new mongoose.Types.ObjectId(),
          entity: { type: '', id: new mongoose.Types.ObjectId() }, // Empty type should cause validation error
          type: 'post_created',
        })
      ).rejects.toThrow();
    });

    it('should not throw errors when throwOnError is false (default)', async () => {
      // Provide invalid data but expect no throw (should just log warning)
      await expect(
        logActivity({
          userId: new mongoose.Types.ObjectId(),
          entity: { type: '', id: new mongoose.Types.ObjectId() }, // Empty type should cause validation error
          type: 'post_created',
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Flush Activities', () => {
    beforeEach(async () => {
      // Ensure clean state before each flush test
      try {
        await flushActivities(10);
      } catch {
        // Ignore timeout errors during cleanup
      }
    });

    afterEach(() => {
      // Restore any mocked methods and clear pending operations
      jest.restoreAllMocks();
      clearPendingActivities();
    });

    it('should flush pending async operations', async () => {
      activityConfig.configure({ asyncLogging: true });

      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      // Start multiple async logging operations
      const promises = Array.from({ length: 5 }, (_, i) =>
        logActivity({
          userId,
          entity: { type: 'post', id: entityId },
          type: 'post_created',
          meta: { index: i },
        })
      );

      // Wait for logActivity calls to complete (but not the async saves)
      await Promise.all(promises);

      // Flush should wait for all pending operations
      await flushActivities(5000);

      // All activities should be saved
      const activities = await Activity.find({});
      expect(activities).toHaveLength(5);
    });

    it('should return immediately when no pending operations', async () => {
      const startTime = Date.now();
      await flushActivities();
      const endTime = Date.now();

      // Should return quickly when no operations are pending
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should timeout if operations take too long', async () => {
      activityConfig.configure({ asyncLogging: true });

      // Create a hanging promise by mocking the Activity.save to never resolve
      jest
        .spyOn(Activity.prototype, 'save')
        .mockImplementation(() => new Promise(() => {})); // Never resolves

      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      // Start an async operation that will hang
      logActivity({
        userId,
        entity: { type: 'post', id: entityId },
        type: 'post_created',
      });

      // Flush with very short timeout should reject
      await expect(flushActivities(50)).rejects.toThrow(
        'Activity flush timeout after 50ms'
      );
    });

    it('should handle concurrent flush calls', async () => {
      activityConfig.configure({ asyncLogging: false }); // Use sync logging to avoid timing issues

      // With sync logging, flushActivities should return immediately
      const flushPromises = [
        flushActivities(1000),
        flushActivities(1000),
        flushActivities(1000),
      ];

      // All should resolve immediately since there are no pending operations
      const start = Date.now();
      await Promise.all(flushPromises);
      const elapsed = Date.now() - start;

      // Should complete very quickly since there are no pending operations
      expect(elapsed).toBeLessThan(100);
    });
  });
});
