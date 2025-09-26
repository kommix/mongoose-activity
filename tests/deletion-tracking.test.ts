import mongoose, { Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  Activity,
  activityPlugin,
  activityConfig,
  activityEvents,
  activityContext,
} from '../src';

describe('Deletion Tracking', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Reset configuration to defaults
    activityConfig.reset();

    // Clear all collections
    const collections = await mongoose.connection.db?.collections();
    if (collections) {
      for (const collection of collections) {
        await collection.drop().catch(() => {}); // Ignore errors if collection doesn't exist
      }
    }

    // Remove all event listeners
    activityEvents.removeAllListeners();
  });

  describe('deleteOne operations', () => {
    it('should track deleteOne operations with trackDeletions enabled', async () => {
      const userSchema = new Schema({
        userId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        status: { type: String, default: 'active' },
      });

      userSchema.plugin(activityPlugin, {
        trackedFields: ['name', 'email', 'status'],
        collectionName: 'users',
        trackDeletions: true,
        deletionFields: ['name', 'email'], // Only capture specific fields
      });

      const UserModel = mongoose.model('TestUser', userSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create a user
      const user = new UserModel({
        userId,
        name: 'John Doe',
        email: 'john@example.com',
        status: 'active',
      });
      await user.save();

      // Clear existing activities
      await Activity.deleteMany({});

      // Delete the user using deleteOne
      await UserModel.deleteOne({ _id: user._id });

      // Verify deletion activity was logged
      const activities = await Activity.find({}).sort({ createdAt: -1 }).lean();
      expect(activities).toHaveLength(1);

      const deletionActivity = activities[0];
      expect(deletionActivity.type).toBe('users_deleted');
      expect(deletionActivity.userId.toString()).toBe(userId.toString());
      expect(deletionActivity.entity.type).toBe('users');
      expect(deletionActivity.entity.id.toString()).toBe(user._id.toString());
      expect(deletionActivity.meta?.operation).toBe('deleteOne');
      expect(deletionActivity.meta?.deletedCount).toBe(1);
      expect(deletionActivity.meta?.deletedFields.name).toBe('John Doe');
      expect(deletionActivity.meta?.deletedFields.email).toBe(
        'john@example.com'
      );
      expect(deletionActivity.meta?.deletedFields.status).toBeUndefined(); // Not in deletionFields
    });

    it('should capture entire document when no deletionFields specified', async () => {
      const userSchema = new Schema({
        userId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        status: { type: String, default: 'active' },
      });

      userSchema.plugin(activityPlugin, {
        collectionName: 'users',
        trackDeletions: true,
        // No deletionFields specified - should capture entire document
      });

      const UserModel = mongoose.model('TestUserFull', userSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create a user
      const user = new UserModel({
        userId,
        name: 'Jane Doe',
        email: 'jane@example.com',
        status: 'premium',
      });
      await user.save();

      // Clear existing activities
      await Activity.deleteMany({});

      // Delete the user
      await UserModel.deleteOne({ _id: user._id });

      // Verify deletion activity was logged with full document
      const activities = await Activity.find({}).lean();
      expect(activities).toHaveLength(1);

      const deletionActivity = activities[0];
      expect(deletionActivity.meta?.deletedDocument).toBeDefined();
      expect(deletionActivity.meta?.deletedDocument.name).toBe('Jane Doe');
      expect(deletionActivity.meta?.deletedDocument.email).toBe(
        'jane@example.com'
      );
      expect(deletionActivity.meta?.deletedDocument.status).toBe('premium');
    });

    it('should not track deletions when trackDeletions is false', async () => {
      const userSchema = new Schema({
        userId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
      });

      userSchema.plugin(activityPlugin, {
        collectionName: 'users',
        trackDeletions: false, // Explicitly disabled
      });

      const UserModel = mongoose.model('TestUserNoDeletion', userSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create and delete a user
      const user = new UserModel({
        userId,
        name: 'No Tracking',
        email: 'no@track.com',
      });
      await user.save();

      // Clear existing activities
      await Activity.deleteMany({});

      // Delete the user
      await UserModel.deleteOne({ _id: user._id });

      // Verify no deletion activity was logged
      const activities = await Activity.find({}).lean();
      expect(activities).toHaveLength(0);
    });
  });

  describe('deleteMany operations', () => {
    it('should track deleteMany operations for multiple documents', async () => {
      const userSchema = new Schema({
        userId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        status: { type: String, default: 'active' },
        department: { type: String, required: true },
      });

      userSchema.plugin(activityPlugin, {
        collectionName: 'users',
        trackDeletions: true,
        deletionFields: ['name', 'department'],
      });

      const UserModel = mongoose.model('TestUserMany', userSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create multiple users
      const users = await UserModel.create([
        { userId, name: 'User 1', department: 'Engineering' },
        { userId, name: 'User 2', department: 'Engineering' },
        { userId, name: 'User 3', department: 'Marketing' },
      ]);

      // Clear existing activities
      await Activity.deleteMany({});

      // Delete all Engineering users
      await UserModel.deleteMany({ department: 'Engineering' });

      // Verify deletion activities were logged for each deleted document
      const activities = await Activity.find({}).sort({ createdAt: 1 }).lean();
      expect(activities).toHaveLength(2); // Should have 2 activities for 2 deleted users

      for (const activity of activities) {
        expect(activity.type).toBe('users_deleted');
        expect(activity.meta?.operation).toBe('deleteMany');
        expect(activity.meta?.deletedCount).toBe(2); // Total count for the operation
        expect(activity.meta?.deletedFields.department).toBe('Engineering');
        expect(['User 1', 'User 2']).toContain(
          activity.meta?.deletedFields.name
        );
      }
    });

    it('should handle deleteMany with no matching documents', async () => {
      const userSchema = new Schema({
        userId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        status: { type: String, default: 'active' },
      });

      userSchema.plugin(activityPlugin, {
        collectionName: 'users',
        trackDeletions: true,
      });

      const UserModel = mongoose.model('TestUserEmpty', userSchema);

      // Clear existing activities
      await Activity.deleteMany({});

      // Try to delete non-existent users
      await UserModel.deleteMany({ status: 'nonexistent' });

      // Verify no activities were logged
      const activities = await Activity.find({}).lean();
      expect(activities).toHaveLength(0);
    });
  });

  describe('findOneAndDelete operations', () => {
    it('should track findOneAndDelete operations', async () => {
      const userSchema = new Schema({
        userId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        role: { type: String, default: 'user' },
      });

      userSchema.plugin(activityPlugin, {
        collectionName: 'users',
        trackDeletions: true,
        deletionFields: ['name', 'role'],
      });

      const UserModel = mongoose.model('TestUserFindDelete', userSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create a user
      const user = new UserModel({
        userId,
        name: 'To Be Deleted',
        email: 'delete@example.com',
        role: 'admin',
      });
      await user.save();

      // Clear existing activities
      await Activity.deleteMany({});

      // Delete using findOneAndDelete
      const deletedUser = await UserModel.findOneAndDelete({ _id: user._id });

      expect(deletedUser).toBeDefined();

      // Verify deletion activity was logged
      const activities = await Activity.find({}).lean();
      expect(activities).toHaveLength(1);

      const deletionActivity = activities[0];
      expect(deletionActivity.type).toBe('users_deleted');
      expect(deletionActivity.meta?.operation).toBe('findOneAndDelete');
      expect(deletionActivity.meta?.deletedFields.name).toBe('To Be Deleted');
      expect(deletionActivity.meta?.deletedFields.role).toBe('admin');
      expect(deletionActivity.meta?.deletedFields.email).toBeUndefined(); // Not in deletionFields
    });
  });

  describe('Context Integration', () => {
    it('should use activity context for userId when not available in document', async () => {
      const postSchema = new Schema({
        title: { type: String, required: true },
        content: { type: String, required: true },
        authorId: { type: Schema.Types.ObjectId, required: true },
      });

      postSchema.plugin(activityPlugin, {
        collectionName: 'posts',
        trackDeletions: true,
        deletionFields: ['title'],
      });

      const PostModel = mongoose.model('TestPost', postSchema);
      const authorId = new mongoose.Types.ObjectId();

      // Create a post without userId field
      const post = new PostModel({
        title: 'Test Post',
        content: 'This is a test',
        authorId,
      });
      await post.save();

      // Clear existing activities
      await Activity.deleteMany({});

      // Use activity context to provide userId
      await activityContext.run({ userId: authorId }, async () => {
        await PostModel.deleteOne({ _id: post._id });
      });

      // Verify deletion activity was logged with context userId
      const activities = await Activity.find({}).lean();
      expect(activities).toHaveLength(1);

      const deletionActivity = activities[0];
      expect(deletionActivity.userId.toString()).toBe(authorId.toString());
      expect(deletionActivity.meta?.deletedFields.title).toBe('Test Post');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully and not interrupt deletion operations', async () => {
      const userSchema = new Schema({
        userId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
      });

      // Simulate an error in the activity logging
      const originalLogActivity = require('../src/logger').logActivity;
      jest
        .spyOn(require('../src/logger'), 'logActivity')
        .mockImplementation(async () => {
          throw new Error('Simulated logging error');
        });

      userSchema.plugin(activityPlugin, {
        collectionName: 'users',
        trackDeletions: true,
      });

      const UserModel = mongoose.model('TestUserError', userSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create a user
      const user = new UserModel({
        userId,
        name: 'Error Test',
      });
      await user.save();

      // Delete should still work despite logging error
      await expect(
        UserModel.deleteOne({ _id: user._id })
      ).resolves.not.toThrow();

      // Verify user was actually deleted
      const foundUser = await UserModel.findById(user._id);
      expect(foundUser).toBeNull();

      // Restore the original function
      jest.restoreAllMocks();
    });
  });

  describe('Schema Validation', () => {
    it('should warn about invalid field names in development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const userSchema = new Schema({
        name: { type: String, required: true },
        email: { type: String, required: true },
      });

      userSchema.plugin(activityPlugin, {
        trackedFields: ['name', 'invalidField', 'anotherInvalidField'],
        deletionFields: ['email', 'nonExistentField'],
        trackDeletions: true,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[mongoose-activity] trackedFields field "invalidField" not found'
        ),
        undefined
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[mongoose-activity] deletionFields field "nonExistentField" not found'
        ),
        undefined
      );

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('should accept nested field paths', async () => {
      const userSchema = new Schema({
        name: { type: String, required: true },
        profile: {
          avatar: { type: String },
          bio: { type: String },
        },
      });

      // Should not warn about nested paths
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      userSchema.plugin(activityPlugin, {
        trackedFields: ['name', 'profile.avatar'],
        trackDeletions: true,
      });

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('profile.avatar')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Bulk Performance Optimization', () => {
    it('should use summary mode when bulkDeleteSummary is enabled', async () => {
      const userSchema = new Schema({
        userId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        department: { type: String, required: true },
      });

      userSchema.plugin(activityPlugin, {
        collectionName: 'users',
        trackDeletions: true,
        bulkDeleteSummary: true,
        deletionFields: ['name'],
      });

      const UserModel = mongoose.model('TestUserBulkSummary', userSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create multiple users
      await UserModel.create([
        { userId, name: 'User 1', department: 'Engineering' },
        { userId, name: 'User 2', department: 'Engineering' },
        { userId, name: 'User 3', department: 'Engineering' },
      ]);

      // Clear existing activities
      await Activity.deleteMany({});

      // Delete all Engineering users
      await UserModel.deleteMany({ department: 'Engineering' });

      // Should log only 1 summary activity instead of 3 individual ones
      const activities = await Activity.find({}).lean();
      expect(activities).toHaveLength(1);

      const summaryActivity = activities[0];
      expect(summaryActivity.type).toBe('users_deleted_bulk');
      expect(summaryActivity.meta?.summary).toBe(true);
      expect(summaryActivity.meta?.deletedCount).toBe(3);
      expect(summaryActivity.meta?.documentIds).toHaveLength(3);
      expect(summaryActivity.meta?.deletedFieldsSample.name).toHaveLength(3);
      expect(summaryActivity.meta?.deletedFieldsSample.name).toEqual(
        expect.arrayContaining(['User 1', 'User 2', 'User 3'])
      );
    });

    it('should use summary mode when deletion count exceeds threshold', async () => {
      const userSchema = new Schema({
        userId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        status: { type: String, default: 'active' },
      });

      userSchema.plugin(activityPlugin, {
        collectionName: 'users',
        trackDeletions: true,
        bulkDeleteThreshold: 2, // Low threshold for testing
      });

      const UserModel = mongoose.model('TestUserBulkThreshold', userSchema);
      const userId = new mongoose.Types.ObjectId();

      // Create 3 users (exceeds threshold of 2)
      await UserModel.create([
        { userId, name: 'User 1' },
        { userId, name: 'User 2' },
        { userId, name: 'User 3' },
      ]);

      // Clear existing activities
      await Activity.deleteMany({});

      // Delete all users
      await UserModel.deleteMany({});

      // Should automatically use summary mode
      const activities = await Activity.find({}).lean();
      expect(activities).toHaveLength(1);

      const summaryActivity = activities[0];
      expect(summaryActivity.type).toBe('users_deleted_bulk');
      expect(summaryActivity.meta?.summary).toBe(true);
    });
  });

  describe('Event System Integration', () => {
    it('should emit events for deletion activities', async () => {
      const userSchema = new Schema({
        userId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
      });

      userSchema.plugin(activityPlugin, {
        collectionName: 'users',
        trackDeletions: true,
      });

      const UserModel = mongoose.model('TestUserEvents', userSchema);
      const userId = new mongoose.Types.ObjectId();

      let loggedActivity: any;
      activityEvents.on('activity:logged', (activity) => {
        loggedActivity = activity;
      });

      // Create and delete a user
      const user = new UserModel({
        userId,
        name: 'Event Test',
      });
      await user.save();

      // Clear existing activities
      await Activity.deleteMany({});

      await UserModel.deleteOne({ _id: user._id });

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify event was emitted
      expect(loggedActivity).toBeDefined();
      expect(loggedActivity.type).toBe('users_deleted');
      expect(loggedActivity.meta?.operation).toBe('deleteOne');
    });
  });
});
