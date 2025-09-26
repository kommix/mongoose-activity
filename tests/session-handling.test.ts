import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  Activity,
  logActivity,
  activityPlugin,
  activityConfig,
  activityEvents,
} from '../src';

// Test schema with plugin
const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  {
    collection: 'users', // Explicitly set collection name
  }
);

UserSchema.plugin(activityPlugin, {
  trackedFields: ['name', 'email'],
  trackDeletions: true,
  deletionFields: ['name', 'email'],
  collectionName: 'User', // Override collection name for activity logging
});

describe('Session Handling', () => {
  let mongoServer: MongoMemoryServer;
  let User: mongoose.Model<any>;
  let logActivitySpy: jest.SpyInstance;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    User = mongoose.model('User', UserSchema);
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
    activityEvents.removeAllListeners();

    // Spy on logActivity to verify session is passed
    logActivitySpy = jest.spyOn(require('../src/logger'), 'logActivity');
  });

  afterEach(() => {
    logActivitySpy.mockRestore();
  });

  describe('Document operations with sessions', () => {
    it('should pass session to logActivity on document save', async () => {
      const session = await mongoose.startSession();

      try {
        const userId = new mongoose.Types.ObjectId();

        const user = new User({
          name: 'John Doe',
          email: 'john@example.com',
          userId,
        });

        // Save with session (Note: MongoDB Memory Server doesn't support transactions,
        // but we can still test that the session parameter is extracted and passed)
        await user.save({ session });

        // Verify logActivity was called with session
        expect(logActivitySpy).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            type: 'User_created',
          }),
          expect.objectContaining({
            throwOnError: false,
          })
        );

        // Verify session was passed (check for session property existence)
        const callArgs = logActivitySpy.mock.calls[0];
        expect(callArgs[1]).toHaveProperty('session');
        expect(callArgs[1].session).toBeTruthy();
      } finally {
        await session.endSession();
      }
    });

    it('should pass session to logActivity on document update', async () => {
      const session = await mongoose.startSession();

      try {
        const userId = new mongoose.Types.ObjectId();

        // Create user first
        const user = new User({
          name: 'John Doe',
          email: 'john@example.com',
          userId,
        });
        await user.save();

        // Clear the spy from creation
        logActivitySpy.mockClear();

        // Update with session
        user.name = 'Jane Doe';
        await user.save({ session });

        // Verify logActivity was called with session for update
        expect(logActivitySpy).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            type: 'document_updated',
          }),
          expect.objectContaining({
            throwOnError: false,
          })
        );

        // Verify session was passed
        const callArgs = logActivitySpy.mock.calls[0];
        expect(callArgs[1]).toHaveProperty('session');
        expect(callArgs[1].session).toBeTruthy();
      } finally {
        await session.endSession();
      }
    });
  });

  describe('Query operations with sessions', () => {
    it('should pass session to logActivity on updateOne', async () => {
      const session = await mongoose.startSession();

      try {
        const userId = new mongoose.Types.ObjectId();

        // Create user first
        const user = new User({
          name: 'John Doe',
          email: 'john@example.com',
          userId,
        });
        await user.save();

        logActivitySpy.mockClear();

        // Update using query with session
        await User.updateOne(
          { _id: user._id },
          { name: 'Jane Doe', userId },
          { session }
        );

        // Verify logActivity was called with session
        expect(logActivitySpy).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            type: 'document_updated',
          }),
          expect.objectContaining({
            throwOnError: false,
          })
        );

        // Verify session was passed
        const callArgs = logActivitySpy.mock.calls[0];
        expect(callArgs[1]).toHaveProperty('session');
        expect(callArgs[1].session).toBeTruthy();
      } finally {
        await session.endSession();
      }
    });

    it('should pass session to logActivity on deleteOne', async () => {
      const session = await mongoose.startSession();

      try {
        const userId = new mongoose.Types.ObjectId();

        // Create user first
        const user = new User({
          name: 'John Doe',
          email: 'john@example.com',
          userId,
        });
        await user.save();

        logActivitySpy.mockClear();

        // Delete using query with session
        await User.deleteOne({ _id: user._id }, { session });

        // Verify logActivity was called with session
        expect(logActivitySpy).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            type: 'User_deleted',
          }),
          expect.objectContaining({
            throwOnError: false,
          })
        );

        // Verify session was passed
        const callArgs = logActivitySpy.mock.calls[0];
        expect(callArgs[1]).toHaveProperty('session');
        expect(callArgs[1].session).toBeTruthy();
      } finally {
        await session.endSession();
      }
    });

    it('should pass session to logActivity on findOneAndDelete', async () => {
      const session = await mongoose.startSession();

      try {
        const userId = new mongoose.Types.ObjectId();

        // Create user first
        const user = new User({
          name: 'John Doe',
          email: 'john@example.com',
          userId,
        });
        await user.save();

        logActivitySpy.mockClear();

        // Delete using findOneAndDelete with session
        await User.findOneAndDelete({ _id: user._id }, { session });

        // Verify logActivity was called with session
        expect(logActivitySpy).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            type: 'User_deleted',
          }),
          expect.objectContaining({
            throwOnError: false,
          })
        );

        // Verify session was passed
        const callArgs = logActivitySpy.mock.calls[0];
        expect(callArgs[1]).toHaveProperty('session');
        expect(callArgs[1].session).toBeTruthy();
      } finally {
        await session.endSession();
      }
    });
  });

  describe('Direct logActivity with session', () => {
    it('should accept and use session parameter', async () => {
      const session = await mongoose.startSession();

      try {
        const userId = new mongoose.Types.ObjectId();
        const entityId = new mongoose.Types.ObjectId();

        // Call logActivity directly with session
        await logActivity(
          {
            userId,
            entity: { type: 'test', id: entityId },
            type: 'test_action',
          },
          { session }
        );

        // Verify activity was saved (session would be used if this was a real replica set)
        const activities = await Activity.find({});
        expect(activities).toHaveLength(1);
        expect(activities[0].userId.toString()).toBe(userId.toString());
        expect(activities[0].type).toBe('test_action');
      } finally {
        await session.endSession();
      }
    });

    it('should work without session parameter', async () => {
      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      // Call logActivity without session
      await logActivity({
        userId,
        entity: { type: 'test', id: entityId },
        type: 'test_action_no_session',
      });

      // Verify activity was saved
      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe('test_action_no_session');
    });
  });
});
