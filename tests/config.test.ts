import { activityConfig } from '../src/config';

describe('Activity Configuration', () => {
  beforeEach(() => {
    // Reset config to defaults before each test
    activityConfig.configure({
      collectionName: 'activities',
      throwOnError: false,
      indexes: true,
      asyncLogging: false,
      retentionDays: undefined,
      maxListeners: 50,
    });
  });

  describe('Configuration Management', () => {
    it('should have default configuration values', () => {
      expect(activityConfig.getCollectionName()).toBe('activities');
      expect(activityConfig.getThrowOnError()).toBe(false);
      expect(activityConfig.getIndexes()).toBe(true);
      expect(activityConfig.getAsyncLogging()).toBe(false);
      expect(activityConfig.getRetentionDays()).toBeUndefined();
      expect(activityConfig.getMaxListeners()).toBe(50);
    });

    it('should update configuration values', () => {
      activityConfig.configure({
        collectionName: 'custom_activities',
        throwOnError: true,
        indexes: false,
        asyncLogging: true,
        retentionDays: 30,
        maxListeners: 100,
      });

      expect(activityConfig.getCollectionName()).toBe('custom_activities');
      expect(activityConfig.getThrowOnError()).toBe(true);
      expect(activityConfig.getIndexes()).toBe(false);
      expect(activityConfig.getAsyncLogging()).toBe(true);
      expect(activityConfig.getRetentionDays()).toBe(30);
      expect(activityConfig.getMaxListeners()).toBe(100);
    });

    it('should partially update configuration', () => {
      activityConfig.configure({ collectionName: 'partial_update' });

      expect(activityConfig.getCollectionName()).toBe('partial_update');
      // Other values should remain default
      expect(activityConfig.getThrowOnError()).toBe(false);
      expect(activityConfig.getIndexes()).toBe(true);
    });

    it('should get entire configuration object', () => {
      const config = activityConfig.get();

      expect(config).toEqual({
        collectionName: 'activities',
        throwOnError: false,
        indexes: true,
        asyncLogging: false,
        retentionDays: undefined,
        maxListeners: 50,
      });
    });
  });
});