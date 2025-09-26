import mongoose, { Schema, Document } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  Activity,
  activityPlugin,
  logActivity,
  getActivityFeed,
  getEntityActivity,
  activityConfig,
  activityEvents,
  activityContext,
  activityContextMiddleware,
  koaActivityContextMiddleware,
} from '../src';

// Test interfaces
interface ITestUser extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  status: string;
  profile?: {
    avatar?: string;
    bio?: string;
  };
}

interface ITestPost extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  content: string;
  tags: string[];
  published: boolean;
}

describe('Integration Tests - Full Plugin Ecosystem', () => {
  let mongoServer: MongoMemoryServer;
  let TestUserModel: mongoose.Model<ITestUser>;
  let TestPostModel: mongoose.Model<ITestPost>;
  let testCounter = 0;

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

    // Reset configuration
    activityConfig.configure({
      collectionName: 'activities',
      throwOnError: false,
      indexes: true,
      asyncLogging: false,
      retentionDays: undefined,
      maxListeners: 50,
    });

    // Clear event listeners
    activityEvents.removeAllListeners();
    activityContext.clear();

    // Create fresh test models
    testCounter++;

    const userSchema = new Schema<ITestUser>({
      userId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      email: { type: String, required: true },
      status: { type: String, default: 'active' },
      profile: {
        avatar: String,
        bio: String,
      },
    });

    userSchema.plugin(activityPlugin, {
      trackedFields: ['name', 'email', 'status', 'profile.avatar'],
      collectionName: 'users',
      trackOriginalValues: true,
    });

    const postSchema = new Schema<ITestPost>({
      userId: { type: Schema.Types.ObjectId, required: true },
      title: { type: String, required: true },
      content: { type: String, required: true },
      tags: [String],
      published: { type: Boolean, default: false },
    });

    postSchema.plugin(activityPlugin, {
      trackedFields: ['title', 'published', 'tags'],
      collectionName: 'posts',
      trackOriginalValues: true,
    });

    TestUserModel = mongoose.model<ITestUser>(
      `TestUser${testCounter}`,
      userSchema
    );
    TestPostModel = mongoose.model<ITestPost>(
      `TestPost${testCounter}`,
      postSchema
    );
  });

  describe('Complete Workflow Integration', () => {
    it('should handle complete user registration and posting workflow', async () => {
      const userId = new mongoose.Types.ObjectId();
      let activityCount = 0;
      let loggedActivities: any[] = [];

      // Set up event listeners to track all activities
      activityEvents.on('activity:logged', (activity) => {
        activityCount++;
        loggedActivities.push(activity);
      });

      // Step 1: User registration (auto-tracked via plugin)
      const user = new TestUserModel({
        userId,
        name: 'John Doe',
        email: 'john@example.com',
        status: 'active',
        profile: { avatar: 'avatar.jpg' },
      });

      await user.save();
      await new Promise((resolve) => setTimeout(resolve, 50)); // Allow event processing

      // Step 2: Manual activity logging for additional context
      await logActivity({
        userId,
        entity: { type: 'system', id: userId },
        type: 'user_email_verified',
        meta: { verificationMethod: 'email_link' },
      });

      // Step 3: Create a post (auto-tracked)
      const post = new TestPostModel({
        userId,
        title: 'My First Post',
        content: 'This is my first blog post!',
        tags: ['intro', 'blogging'],
        published: false,
      });

      await post.save();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Step 4: Update user profile (should trigger activity)
      user.profile!.avatar = 'new-avatar.jpg';
      user.status = 'premium';
      await user.save();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Step 5: Publish the post (should trigger activity)
      post.published = true;
      post.tags.push('published');
      await post.save();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify all activities were logged
      expect(activityCount).toBe(5); // user_created, manual_log, post_created, user_updated, post_updated

      // Verify activity types and content
      const activities = await Activity.find({}).sort({ createdAt: 1 }).lean();
      expect(activities).toHaveLength(5);

      // Check user creation activity
      const userCreated = activities[0];
      expect(userCreated.type).toBe('users_created');
      expect(userCreated.entity.type).toBe('users');
      expect(userCreated.meta?.initialValues?.name).toBe('John Doe');
      expect(userCreated.meta?.initialValues?.['profile.avatar']).toBe('avatar.jpg');

      // Check manual activity
      const emailVerified = activities[1];
      expect(emailVerified.type).toBe('user_email_verified');
      expect(emailVerified.entity.type).toBe('system');
      expect(emailVerified.meta?.verificationMethod).toBe('email_link');

      // Check post creation
      const postCreated = activities[2];
      expect(postCreated.type).toBe('posts_created');
      expect(postCreated.entity.type).toBe('posts');
      expect(postCreated.meta?.initialValues?.title).toBe('My First Post');
      expect(postCreated.meta?.initialValues?.published).toBe(false);

      // Check user update
      const userUpdated = activities[3];
      expect(userUpdated.type).toBe('document_updated');
      expect(userUpdated.meta?.changes?.['profile.avatar']?.from).toBe(
        'avatar.jpg'
      );
      expect(userUpdated.meta?.changes?.['profile.avatar']?.to).toBe(
        'new-avatar.jpg'
      );
      expect(userUpdated.meta?.changes?.status?.from).toBe('active');
      expect(userUpdated.meta?.changes?.status?.to).toBe('premium');

      // Check post update
      const postUpdated = activities[4];
      expect(postUpdated.type).toBe('document_updated');
      expect(postUpdated.meta?.changes?.published?.from).toBe(false);
      expect(postUpdated.meta?.changes?.published?.to).toBe(true);

      // Test activity feed retrieval
      const userFeed = await getActivityFeed(userId.toString());
      expect(userFeed).toHaveLength(5);

      // Test entity-specific activity
      const userEntityActivity = await getEntityActivity(
        'users',
        (user._id as mongoose.Types.ObjectId).toString()
      );
      expect(userEntityActivity).toHaveLength(2); // creation + update

      const postEntityActivity = await getEntityActivity(
        'posts',
        (post._id as mongoose.Types.ObjectId).toString()
      );
      expect(postEntityActivity).toHaveLength(2); // creation + update
    });
  });

  describe('Configuration and Runtime Changes', () => {
    it('should handle runtime configuration changes', async () => {
      const userId = new mongoose.Types.ObjectId();
      let activities: any[] = [];

      activityEvents.on('activity:logged', (activity) => {
        activities.push(activity);
      });

      // Test with sync logging (default)
      await logActivity({
        userId,
        entity: { type: 'test', id: new mongoose.Types.ObjectId() },
        type: 'sync_test',
      });

      expect(activities).toHaveLength(1);
      activities = [];

      // Switch to async logging
      activityConfig.configure({ asyncLogging: true });

      await logActivity({
        userId,
        entity: { type: 'test', id: new mongoose.Types.ObjectId() },
        type: 'async_test',
      });

      // Wait for async completion
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe('async_test');

      // Test error throwing configuration
      activityConfig.configure({ throwOnError: true, asyncLogging: false });

      await expect(
        logActivity({
          userId,
          entity: { type: '', id: new mongoose.Types.ObjectId() }, // Invalid empty type
          type: 'error_test',
        })
      ).rejects.toThrow();

      // Reset to non-throwing
      activityConfig.configure({ throwOnError: false });

      // This should not throw
      await expect(
        logActivity({
          userId,
          entity: { type: '', id: new mongoose.Types.ObjectId() },
          type: 'no_error_test',
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Middleware Integration with Context', () => {
    it('should work with Express middleware and context', async () => {
      const middleware = activityContextMiddleware();
      let capturedActivities: any[] = [];

      activityEvents.on('activity:logged', (activity) => {
        capturedActivities.push(activity);
      });

      // Simulate Express request
      const req = {
        user: { id: new mongoose.Types.ObjectId() },
        headers: {
          'x-request-id': 'req-12345',
          'user-agent': 'Mozilla/5.0',
        },
        ip: '192.168.1.100',
        sessionID: 'sess-98765',
      };

      const res = {
        on: jest.fn(),
      };

      const next = jest.fn();

      // Simulate middleware execution
      const originalRun = activityContext.run;
      await new Promise<void>((resolve) => {
        activityContext.run = (context, callback) => {
          expect(context.userId).toEqual(req.user.id);
          expect(context.requestId).toBe('req-12345');
          expect(context.ip).toBe('192.168.1.100');
          expect(context.sessionId).toBe('sess-98765');
          expect(context.userAgent).toBe('Mozilla/5.0');

          const result = callback();
          resolve();
          return result;
        };

        middleware(req, res, next);
      });

      // Restore original function
      activityContext.run = originalRun;

      // Now test logging with context
      activityContext.run(
        {
          userId: req.user.id,
          requestId: 'req-12345',
          ip: '192.168.1.100',
          sessionId: 'sess-98765',
          userAgent: 'Mozilla/5.0',
        },
        async () => {
          // Note: userId will be taken from context
          await logActivity({
            userId: req.user.id, // Explicitly provide userId for TypeScript
            entity: { type: 'action', id: new mongoose.Types.ObjectId() },
            type: 'user_action',
            meta: { action: 'clicked_button' },
          });
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(capturedActivities).toHaveLength(1);
      const activity = capturedActivities[0];
      expect(activity.userId).toEqual(req.user.id);
      expect(activity.meta.requestId).toBe('req-12345');
      expect(activity.meta.ip).toBe('192.168.1.100');
      expect(activity.meta.sessionId).toBe('sess-98765');
      expect(activity.meta.action).toBe('clicked_button');
    });

    it('should work with Koa middleware', async () => {
      const middleware = koaActivityContextMiddleware();
      let capturedActivities: any[] = [];

      activityEvents.on('activity:logged', (activity) => {
        capturedActivities.push(activity);
      });

      const ctx = {
        state: { user: { id: new mongoose.Types.ObjectId() } },
        request: {
          header: {
            'x-request-id': 'koa-req-67890',
            'user-agent': 'Koa-Agent/1.0',
          },
          ip: '10.0.0.1',
        },
        ip: '192.168.1.200',
        session: { id: 'koa-sess-54321' },
      };

      const next = jest.fn().mockResolvedValue(undefined);

      // Simulate Koa middleware execution
      const originalRun = activityContext.run;
      await new Promise<void>(async (resolve) => {
        activityContext.run = (context, callback) => {
          expect(context.userId).toEqual(ctx.state.user.id);
          expect(context.requestId).toBe('koa-req-67890');
          expect(context.ip).toBe('192.168.1.200');
          expect(context.sessionId).toBe('koa-sess-54321');
          expect(context.userAgent).toBe('Koa-Agent/1.0');

          const result = callback();
          resolve();
          return result;
        };

        await middleware(ctx, next);
      });

      // Restore original function
      activityContext.run = originalRun;

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Event System Integration', () => {
    it('should handle complex event scenarios with cancellation and chaining', async () => {
      const userId = new mongoose.Types.ObjectId();
      let beforeLogCount = 0;
      let loggedCount = 0;
      let errorCount = 0;
      let cancelledTypes: string[] = [];

      // Set up event listeners
      activityEvents.on('activity:before-log', (activity) => {
        beforeLogCount++;

        // Cancel certain activity types
        if (activity.type === 'cancelled_activity') {
          cancelledTypes.push(activity.type);
          return false; // Cancel
        }

        // Modify activity before logging
        if (activity.type === 'modified_activity') {
          activity.meta = { ...activity.meta, modified: true };
        }

        return true; // Proceed
      });

      activityEvents.on('activity:logged', (activity) => {
        loggedCount++;

        // Chain another activity when a specific one is logged
        if (activity.type === 'trigger_chain') {
          setImmediate(async () => {
            await logActivity({
              userId: activity.userId,
              entity: { type: 'chain', id: new mongoose.Types.ObjectId() },
              type: 'chained_activity',
              meta: { triggeredBy: activity.type },
            });
          });
        }
      });

      activityEvents.on('activity:error', (error, activity) => {
        errorCount++;
      });

      // Test normal activity
      await logActivity({
        userId,
        entity: { type: 'normal', id: new mongoose.Types.ObjectId() },
        type: 'normal_activity',
      });

      // Test cancelled activity
      await logActivity({
        userId,
        entity: { type: 'cancel', id: new mongoose.Types.ObjectId() },
        type: 'cancelled_activity',
      });

      // Test modified activity
      await logActivity({
        userId,
        entity: { type: 'modify', id: new mongoose.Types.ObjectId() },
        type: 'modified_activity',
        meta: { original: true },
      });

      // Test chained activity
      await logActivity({
        userId,
        entity: { type: 'chain', id: new mongoose.Types.ObjectId() },
        type: 'trigger_chain',
      });

      // Wait for chain completion
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(beforeLogCount).toBe(5); // All activities hit before-log (including chained)
      expect(loggedCount).toBe(4); // 3 original + 1 chained (cancelled one doesn't get logged)
      expect(cancelledTypes).toContain('cancelled_activity');

      const activities = await Activity.find({}).sort({ createdAt: 1 }).lean();
      expect(activities).toHaveLength(4);

      // Check that cancelled activity is not in database
      const cancelledActivity = activities.find(
        (a) => a.type === 'cancelled_activity'
      );
      expect(cancelledActivity).toBeUndefined();

      // Check that modified activity has the modification
      const modifiedActivity = activities.find(
        (a) => a.type === 'modified_activity'
      );
      expect(modifiedActivity?.meta?.modified).toBe(true);
      expect(modifiedActivity?.meta?.original).toBe(true);

      // Check that chained activity exists
      const chainedActivity = activities.find(
        (a) => a.type === 'chained_activity'
      );
      expect(chainedActivity?.meta?.triggeredBy).toBe('trigger_chain');
    });
  });

  describe('TTL and Cleanup Integration', () => {
    it('should handle TTL configuration and manual pruning', async () => {
      const userId = new mongoose.Types.ObjectId();

      // Configure TTL for 1 day
      activityConfig.configure({ retentionDays: 1 });

      // Create test activities with different timestamps
      const now = new Date();
      const activities = [
        {
          userId,
          entity: { type: 'old', id: new mongoose.Types.ObjectId() },
          type: 'old_activity',
          createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        },
        {
          userId,
          entity: { type: 'recent', id: new mongoose.Types.ObjectId() },
          type: 'recent_activity',
          createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000), // 12 hours ago
        },
      ];

      await Activity.insertMany(activities);

      // Test manual pruning
      const pruneResult = await Activity.prune({ olderThan: '2d' });
      expect(pruneResult.deletedCount).toBe(1); // Only the 5-day-old activity

      const remaining = await Activity.find({});
      expect(remaining).toHaveLength(1);
      expect(remaining[0].type).toBe('recent_activity');

      // Test pruning with entity type filter
      await Activity.insertMany([
        {
          userId,
          entity: { type: 'typeA', id: new mongoose.Types.ObjectId() },
          type: 'old_typeA',
          createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        },
        {
          userId,
          entity: { type: 'typeB', id: new mongoose.Types.ObjectId() },
          type: 'old_typeB',
          createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        },
      ]);

      const filteredPruneResult = await Activity.prune({
        olderThan: '1d',
        entityType: 'typeA',
      });

      expect(filteredPruneResult.deletedCount).toBe(1);

      const finalActivities = await Activity.find({});
      const typeAActivities = finalActivities.filter(
        (a) => a.entity.type === 'typeA'
      );
      const typeBActivities = finalActivities.filter(
        (a) => a.entity.type === 'typeB'
      );

      expect(typeAActivities).toHaveLength(0); // Pruned
      expect(typeBActivities).toHaveLength(1); // Not pruned
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle all error scenarios gracefully', async () => {
      const userId = new mongoose.Types.ObjectId();
      let errorEvents: any[] = [];

      activityEvents.on('activity:error', (error, activity) => {
        errorEvents.push({ error, activity });
      });

      // Test missing userId with context warning (provide dummy userId for TypeScript)
      await logActivity({
        userId: new mongoose.Types.ObjectId(), // Will be ignored, context provides userId
        entity: { type: 'test', id: new mongoose.Types.ObjectId() },
        type: 'no_user_test',
      });

      // Test with context providing userId
      await activityContext.run({ userId }, async () => {
        await logActivity({
          userId, // Explicitly provide for TypeScript
          entity: { type: 'test', id: new mongoose.Types.ObjectId() },
          type: 'context_user_test',
        });
      });

      // Test validation error (non-throwing mode)
      await logActivity({
        userId,
        entity: { type: '', id: new mongoose.Types.ObjectId() }, // Empty type
        type: 'validation_error_test',
      });

      expect(errorEvents).toHaveLength(1); // Only the validation error

      const activities = await Activity.find({});
      expect(activities).toHaveLength(2); // no_user_test and context_user_test succeeded

      const contextActivity = activities.find(
        (a) => a.type === 'context_user_test'
      );
      expect(contextActivity?.userId).toEqual(userId);
    });

    it('should handle concurrent operations safely', async () => {
      const userIds = Array.from(
        { length: 5 },
        () => new mongoose.Types.ObjectId()
      );
      const activities: any[] = [];

      activityEvents.on('activity:logged', (activity) => {
        activities.push(activity);
      });

      // Create multiple concurrent activities
      const promises = userIds.map(async (userId, index) => {
        return activityContext.run(
          { userId, requestId: `req-${index}` },
          async () => {
            await logActivity({
              userId, // Explicitly provide for TypeScript
              entity: { type: 'concurrent', id: new mongoose.Types.ObjectId() },
              type: 'concurrent_test',
              meta: { index },
            });
          }
        );
      });

      await Promise.all(promises);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(activities).toHaveLength(5);

      // Verify each activity has correct context
      const dbActivities = await Activity.find({}).sort({ 'meta.index': 1 });
      dbActivities.forEach((activity, index) => {
        expect(activity.userId).toEqual(userIds[index]);
        expect(activity.meta?.requestId).toBe(`req-${index}`);
        expect(activity.meta?.index).toBe(index);
      });
    });
  });
});
