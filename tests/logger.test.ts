import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Activity, logActivity, getActivityFeed, getEntityActivity } from '../src';

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
        meta: { title: 'First Post' }
      });

      await logActivity({
        userId,
        entity: { type: 'comment', id: entityId2 },
        type: 'comment_created',
        meta: { content: 'Great post!' }
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
        type: 'post_created'
      });

      await logActivity({
        userId,
        entity: { type: 'comment', id: entityId2 },
        type: 'comment_created'
      });

      const feed = await getActivityFeed(userId.toString(), {
        entityType: 'post'
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
          meta: { index: i }
        });
      }

      const page1 = await getActivityFeed(userId.toString(), {
        limit: 2,
        skip: 0
      });

      const page2 = await getActivityFeed(userId.toString(), {
        limit: 2,
        skip: 2
      });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].meta?.index).toBe(4); // Most recent first
      expect(page2[0].meta?.index).toBe(2);
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
        type: 'post_created'
      });

      await logActivity({
        userId: userId2,
        entity: { type: 'post', id: entityId },
        type: 'post_liked'
      });

      // Activity for different entity
      await logActivity({
        userId: userId1,
        entity: { type: 'post', id: new mongoose.Types.ObjectId() },
        type: 'post_created'
      });

      const entityActivity = await getEntityActivity('post', entityId.toString());

      expect(entityActivity).toHaveLength(2);
      expect(entityActivity[0].type).toBe('post_liked'); // Most recent first
      expect(entityActivity[1].type).toBe('post_created');
      expect(entityActivity.every(a => a.entity.id.toString() === entityId.toString())).toBe(true);
    });

    it('should filter entity activity by activity type', async () => {
      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      await logActivity({
        userId,
        entity: { type: 'post', id: entityId },
        type: 'post_created'
      });

      await logActivity({
        userId,
        entity: { type: 'post', id: entityId },
        type: 'post_updated'
      });

      const entityActivity = await getEntityActivity('post', entityId.toString(), {
        activityType: 'post_created'
      });

      expect(entityActivity).toHaveLength(1);
      expect(entityActivity[0].type).toBe('post_created');
    });
  });
});