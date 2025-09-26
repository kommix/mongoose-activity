import { ActivityErrorHandler } from '../src/utils';
import { activityEvents } from '../src';

describe('ActivityErrorHandler', () => {
  let consoleWarnSpy: jest.SpyInstance;
  let eventEmitSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    eventEmitSpy = jest.spyOn(activityEvents, 'emit').mockImplementation();
    // Reset NODE_ENV
    delete (process.env as any).NODE_ENV;
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    eventEmitSpy.mockRestore();
  });

  describe('logError', () => {
    it('should log error with prefix and emit event', () => {
      const error = new Error('Test error');
      const context = { userId: 'test123' };

      ActivityErrorHandler.logError('Something went wrong', error, context);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[mongoose-activity] Something went wrong',
        error
      );
      expect(eventEmitSpy).toHaveBeenCalledWith('activity:error', error, context);
    });

    it('should create error object when none provided', () => {
      ActivityErrorHandler.logError('No error object provided');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[mongoose-activity] No error object provided',
        undefined
      );
      expect(eventEmitSpy).toHaveBeenCalledWith(
        'activity:error',
        expect.any(Error),
        undefined
      );
    });

    it('should convert non-Error objects to Error', () => {
      const nonErrorObj = 'string error';

      ActivityErrorHandler.logError('String error occurred', nonErrorObj);

      expect(eventEmitSpy).toHaveBeenCalledWith(
        'activity:error',
        expect.any(Error),
        undefined
      );

      const emittedError = eventEmitSpy.mock.calls[0][1];
      expect(emittedError.message).toBe('string error');
    });
  });

  describe('logDevelopmentWarning', () => {
    it('should log warning in development mode', () => {
      process.env.NODE_ENV = 'development';

      ActivityErrorHandler.logDevelopmentWarning('Dev warning', { detail: 'test' });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[mongoose-activity] Dev warning',
        { detail: 'test' }
      );
    });

    it('should not log warning in production mode', () => {
      process.env.NODE_ENV = 'production';

      ActivityErrorHandler.logDevelopmentWarning('Dev warning');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should log warning when NODE_ENV is not set (defaults to development)', () => {
      ActivityErrorHandler.logDevelopmentWarning('Dev warning');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[mongoose-activity] Dev warning',
        undefined
      );
    });
  });

  describe('logActivityError', () => {
    it('should log activity error with context', () => {
      const error = new Error('Activity failed');
      const params = {
        userId: 'user123',
        entity: { type: 'post', id: 'post123' },
        type: 'post_created'
      } as any;

      ActivityErrorHandler.logActivityError('Activity logging failed', error, params);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[mongoose-activity] Activity logging failed',
        error
      );
      expect(eventEmitSpy).toHaveBeenCalledWith('activity:error', error, params);
    });
  });

  describe('logHookError', () => {
    it('should log hook error with operation context', () => {
      const error = new Error('Hook failed');
      const context = { documentId: 'doc123' };

      ActivityErrorHandler.logHookError('post save', error, context);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[mongoose-activity] Error in post save hook:',
        error
      );
      expect(eventEmitSpy).toHaveBeenCalledWith('activity:error', error, context);
    });
  });

  describe('logFieldValidationWarning', () => {
    it('should log field validation warning with details', () => {
      const availableFields = ['name', 'email', 'profile.avatar'];

      ActivityErrorHandler.logFieldValidationWarning(
        'trackedFields',
        'invalidField',
        'User',
        availableFields
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[mongoose-activity] trackedFields field "invalidField" not found in schema "User". Available paths: name, email, profile.avatar',
        undefined
      );
    });

    it('should not log in production', () => {
      process.env.NODE_ENV = 'production';

      ActivityErrorHandler.logFieldValidationWarning(
        'trackedFields',
        'invalidField',
        'User',
        ['name', 'email']
      );

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});