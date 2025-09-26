import mongoose, { Schema, Document, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { activityPlugin, Activity, logActivity } from '../src';

interface ITestUser extends Document {
  userId: Types.ObjectId;
  name: string;
  email: string;
  status: string;
}

describe('mongoose-activity', () => {
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

  describe('Activity Model', () => {
    it('should create an activity with required fields', async () => {
      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      const activity = new Activity({
        userId,
        entity: {
          type: 'user',
          id: entityId,
        },
        type: 'user_created',
        meta: { test: 'data' },
      });

      await activity.save();

      expect(activity.userId).toEqual(userId);
      expect(activity.entity.type).toBe('user');
      expect(activity.entity.id).toEqual(entityId);
      expect(activity.type).toBe('user_created');
      expect(activity.meta).toEqual({ test: 'data' });
      expect(activity.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('logActivity function', () => {
    it('should log activity manually', async () => {
      const userId = new mongoose.Types.ObjectId();
      const entityId = new mongoose.Types.ObjectId();

      await logActivity({
        userId,
        entity: {
          type: 'booking',
          id: entityId,
        },
        type: 'booking_requested',
        meta: {
          amount: 100,
          currency: 'USD',
        },
      });

      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);

      const activity = activities[0];
      expect(activity.userId).toEqual(userId);
      expect(activity.entity.type).toBe('booking');
      expect(activity.entity.id).toEqual(entityId);
      expect(activity.type).toBe('booking_requested');
      expect(activity.meta).toEqual({
        amount: 100,
        currency: 'USD',
      });
    });
  });

  describe('Activity Plugin', () => {
    let TestUserModel: mongoose.Model<ITestUser>;
    let testCounter = 0;

    beforeEach(() => {
      testCounter++;
      const testUserSchema = new Schema<ITestUser>({
        userId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        status: { type: String, default: 'active' },
      });

      testUserSchema.plugin(activityPlugin, {
        trackedFields: ['name', 'email', 'status'],
        collectionName: 'users',
        trackOriginalValues: true,
      });

      const modelName = `TestUser${testCounter}`;
      TestUserModel = mongoose.model<ITestUser>(modelName, testUserSchema);
    });

    it('should log activity when a new document is created', async () => {
      const userId = new mongoose.Types.ObjectId();

      const user = new TestUserModel({
        userId,
        name: 'John Doe',
        email: 'john@example.com',
        status: 'active',
      });

      await user.save();

      // Wait a bit for the post hook to execute
      await new Promise((resolve) => setTimeout(resolve, 100));

      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);

      const activity = activities[0];
      expect(activity.userId).toEqual(userId);
      expect(activity.entity.type).toBe('users');
      expect(activity.entity.id).toEqual(user._id);
      expect(activity.type).toBe('users_created');
      expect(activity.meta).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
        status: 'active',
      });
    });

    it('should log activity when tracked fields are updated', async () => {
      const userId = new mongoose.Types.ObjectId();

      const user = new TestUserModel({
        userId,
        name: 'John Doe',
        email: 'john@example.com',
        status: 'active',
      });

      await user.save();

      // Clear existing activities
      await Activity.deleteMany({});

      // Update tracked field
      user.name = 'Jane Doe';
      user.status = 'inactive';
      await user.save();

      // Wait for post hook
      await new Promise((resolve) => setTimeout(resolve, 100));

      const activities = await Activity.find({});
      expect(activities).toHaveLength(1);

      const activity = activities[0];
      expect(activity.type).toBe('document_updated');
      expect(activity.meta?.changes).toBeDefined();
      expect(activity.meta?.changes.name.from).toBe('John Doe');
      expect(activity.meta?.changes.name.to).toBe('Jane Doe');
      expect(activity.meta?.changes.status.from).toBe('active');
      expect(activity.meta?.changes.status.to).toBe('inactive');
      expect(activity.meta?.modifiedFields).toEqual(['name', 'status']);
    });

    it('should not log activity when non-tracked fields are updated', async () => {
      const userId = new mongoose.Types.ObjectId();

      const user = new TestUserModel({
        userId,
        name: 'John Doe',
        email: 'john@example.com',
        status: 'active',
      });

      await user.save();

      // Clear existing activities
      await Activity.deleteMany({});

      // Update non-tracked field (none in this case, but let's test with a field not in trackedFields)
      // Since all fields are tracked in our test, let's create a new model
      const newSchema = new Schema<ITestUser>({
        userId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        status: { type: String, default: 'active' },
      });

      newSchema.plugin(activityPlugin, {
        trackedFields: ['name'], // Only track name
        collectionName: 'users',
      });

      const NewTestUserModel = mongoose.model<ITestUser>(
        `TestUser${testCounter}_2`,
        newSchema
      );

      const newUser = new NewTestUserModel({
        userId,
        name: 'John Doe',
        email: 'john@example.com',
        status: 'active',
      });

      await newUser.save();
      await Activity.deleteMany({});

      // Update non-tracked field
      newUser.email = 'newemail@example.com';
      await newUser.save();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const activities = await Activity.find({});
      expect(activities).toHaveLength(0);
    });

    describe('trackOriginalValues option', () => {
      it('should include detailed changes when trackOriginalValues is true', async () => {
        const userId = new mongoose.Types.ObjectId();
        const newSchema = new Schema<ITestUser>({
          userId: { type: Schema.Types.ObjectId, required: true },
          name: { type: String, required: true },
          email: { type: String, required: true },
          status: { type: String, default: 'active' },
        });

        newSchema.plugin(activityPlugin, {
          trackedFields: ['name', 'email'],
          collectionName: 'users',
          trackOriginalValues: true,
        });

        const TrackingUserModel = mongoose.model<ITestUser>(
          `TrackingUser${testCounter}`,
          newSchema
        );

        const user = new TrackingUserModel({
          userId,
          name: 'John Doe',
          email: 'john@example.com',
          status: 'active',
        });

        await user.save();
        await Activity.deleteMany({});

        // Update tracked fields
        user.name = 'Jane Doe';
        user.email = 'jane@example.com';
        await user.save();

        await new Promise((resolve) => setTimeout(resolve, 100));

        const activities = await Activity.find({});
        expect(activities).toHaveLength(1);

        const activity = activities[0];
        expect(activity.meta?.changes).toBeDefined();
        expect(activity.meta?.changes.name).toEqual({
          from: 'John Doe',
          to: 'Jane Doe',
        });
        expect(activity.meta?.changes.email).toEqual({
          from: 'john@example.com',
          to: 'jane@example.com',
        });
      });

      it('should include current values when trackOriginalValues is false (default)', async () => {
        const userId = new mongoose.Types.ObjectId();
        const newSchema = new Schema<ITestUser>({
          userId: { type: Schema.Types.ObjectId, required: true },
          name: { type: String, required: true },
          email: { type: String, required: true },
          status: { type: String, default: 'active' },
        });

        newSchema.plugin(activityPlugin, {
          trackedFields: ['name', 'email'],
          collectionName: 'users',
          trackOriginalValues: false,
        });

        const NoTrackingUserModel = mongoose.model<ITestUser>(
          `NoTrackingUser${testCounter}`,
          newSchema
        );

        const user = new NoTrackingUserModel({
          userId,
          name: 'John Doe',
          email: 'john@example.com',
          status: 'active',
        });

        await user.save();
        await Activity.deleteMany({});

        // Update tracked fields
        user.name = 'Jane Doe';
        user.email = 'jane@example.com';
        await user.save();

        await new Promise((resolve) => setTimeout(resolve, 100));

        const activities = await Activity.find({});
        expect(activities).toHaveLength(1);

        const activity = activities[0];
        expect(activity.meta?.changes).toBeUndefined();
        expect(activity.meta?.currentValues).toBeDefined();
        expect(activity.meta?.currentValues.name).toBe('Jane Doe');
        expect(activity.meta?.currentValues.email).toBe('jane@example.com');
        expect(activity.meta?.modifiedFields).toEqual(['name', 'email']);
      });
    });
  });
});
