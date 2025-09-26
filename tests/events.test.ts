import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { activityEvents, logActivity, Activity } from '../src';

describe('Activity Events', () => {
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
    activityEvents.removeAllListeners();
  });

  describe('Event Emission', () => {
    it('should emit before-log event and allow cancellation', async () => {
      const beforeLogHandler = jest.fn(() => false); // Cancel the activity
      activityEvents.on('activity:before-log', beforeLogHandler);

      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      await logActivity({
        userId,
        entity: { type: 'post', id: entityId },
        type: 'post_created',
      });

      expect(beforeLogHandler).toHaveBeenCalled();

      // Activity should not be saved due to cancellation
      const activities = await Activity.find({});
      expect(activities).toHaveLength(0);
    });

    it('should emit before-log event and proceed when not cancelled', async () => {
      const beforeLogHandler = jest.fn(() => true);
      activityEvents.on('activity:before-log', beforeLogHandler);

      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      await logActivity({
        userId,
        entity: { type: 'post', id: entityId },
        type: 'post_created',
      });

      expect(beforeLogHandler).toHaveBeenCalled();

      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);
    });

    it('should emit logged event after successful save', async () => {
      const loggedHandler = jest.fn();
      activityEvents.on('activity:logged', loggedHandler);

      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      await logActivity({
        userId,
        entity: { type: 'post', id: entityId },
        type: 'post_created',
        meta: { title: 'Test Post' },
      });

      expect(loggedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: userId,
          entity: { type: 'post', id: entityId },
          type: 'post_created',
          meta: { title: 'Test Post' },
        })
      );
    });

    it('should emit error event on logging failure', async () => {
      const errorHandler = jest.fn();
      activityEvents.on('activity:error', errorHandler);

      // Force an error by providing invalid data
      await logActivity({
        userId: null as any, // Invalid userId
        entity: { type: 'post', id: new mongoose.Types.ObjectId() },
        type: 'post_created',
      });

      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          entity: expect.objectContaining({ type: 'post' }),
          type: 'post_created',
        })
      );
    });

    it('should handle multiple event listeners', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      activityEvents.on('activity:logged', handler1);
      activityEvents.on('activity:logged', handler2);

      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      await logActivity({
        userId,
        entity: { type: 'post', id: entityId },
        type: 'post_created',
      });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should support event listener removal', async () => {
      const handler = jest.fn();
      activityEvents.on('activity:logged', handler);
      activityEvents.off('activity:logged', handler);

      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      await logActivity({
        userId,
        entity: { type: 'post', id: entityId },
        type: 'post_created',
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support once listeners', async () => {
      const handler = jest.fn();
      activityEvents.once('activity:logged', handler);

      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      // Log two activities
      await logActivity({
        userId,
        entity: { type: 'post', id: entityId },
        type: 'post_created',
      });

      await logActivity({
        userId,
        entity: { type: 'post', id: new mongoose.Types.ObjectId() },
        type: 'post_updated',
      });

      // Handler should only be called once
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Max Listeners Configuration', () => {
    it('should have configurable max listeners', () => {
      expect(activityEvents.getMaxListeners()).toBe(50); // Default from config
    });
  });
});