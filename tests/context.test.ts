import mongoose from 'mongoose';
import { activityContext } from '../src/context';

describe('Activity Context', () => {
  beforeEach(() => {
    activityContext.clear();
  });

  afterEach(() => {
    activityContext.clear();
  });

  describe('Context Management', () => {
    it('should store and retrieve context data', () => {
      const testContext = {
        userId: new mongoose.Types.ObjectId(),
        requestId: 'req456',
        ip: '192.168.1.1',
      };

      activityContext.run(testContext, () => {
        const context = activityContext.get();
        expect(context).toEqual(testContext);
      });
    });

    it('should return empty object when no context is set', () => {
      const context = activityContext.get();
      expect(context).toEqual({});
    });

    it('should set individual context properties', () => {
      const initialContext = {
        userId: new mongoose.Types.ObjectId(),
        requestId: 'req456',
      };

      activityContext.run(initialContext, () => {
        activityContext.set('ip', '192.168.1.1');
        activityContext.set('sessionId', 'session789');

        const context = activityContext.get();
        expect(context).toEqual({
          userId: new mongoose.Types.ObjectId(),
          requestId: 'req456',
          ip: '192.168.1.1',
          sessionId: 'session789',
        });
      });
    });

    it('should handle nested context runs', () => {
      const outerContext = { userId: new mongoose.Types.ObjectId() };
      const innerContext = { userId: new mongoose.Types.ObjectId(), requestId: 'inner-req' };

      activityContext.run(outerContext, () => {
        expect(activityContext.get()).toEqual(outerContext);

        activityContext.run(innerContext, () => {
          expect(activityContext.get()).toEqual(innerContext);
        });

        // Should return to outer context
        expect(activityContext.get()).toEqual(outerContext);
      });
    });

    it('should maintain context isolation between different runs', () => {
      const context1 = { userId: new mongoose.Types.ObjectId(), requestId: 'req1' };
      const context2 = { userId: new mongoose.Types.ObjectId(), requestId: 'req2' };

      let capturedContext1: any;
      let capturedContext2: any;

      activityContext.run(context1, () => {
        capturedContext1 = activityContext.get();
      });

      activityContext.run(context2, () => {
        capturedContext2 = activityContext.get();
      });

      expect(capturedContext1).toEqual(context1);
      expect(capturedContext2).toEqual(context2);
      expect(capturedContext1).not.toEqual(capturedContext2);
    });

    it('should handle asynchronous operations', async () => {
      const testContext = {
        userId: new mongoose.Types.ObjectId(),
        requestId: 'async-req',
      };

      await activityContext.run(testContext, async () => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10));

        const context = activityContext.get();
        expect(context).toEqual(testContext);
      });
    });

    it('should clear context properly', () => {
      const testContext = { userId: 'user123' };

      activityContext.run(testContext, () => {
        expect(activityContext.get()).toEqual(testContext);

        activityContext.clear();

        // Context should be cleared
        expect(activityContext.get()).toEqual({});
      });
    });

    it('should handle context updates within run', () => {
      const initialContext = { userId: new mongoose.Types.ObjectId() };

      activityContext.run(initialContext, () => {
        activityContext.set('requestId', 'new-request');
        activityContext.set('ip', '10.0.0.1');

        const updatedContext = activityContext.get();
        expect(updatedContext).toEqual({
          userId: initialContext.userId,
          requestId: 'new-request',
          ip: '10.0.0.1',
        });
      });

      // Context should not persist outside of run
      expect(activityContext.get()).toEqual({});
    });

    it('should handle concurrent context operations', async () => {
      const contexts = [
        { userId: new mongoose.Types.ObjectId(), requestId: 'req1' },
        { userId: new mongoose.Types.ObjectId(), requestId: 'req2' },
        { userId: new mongoose.Types.ObjectId(), requestId: 'req3' },
      ];

      const results: any[] = [];

      // Run multiple contexts concurrently
      const promises = contexts.map((context, index) =>
        activityContext.run(context, async () => {
          // Add some async delay
          await new Promise(resolve => setTimeout(resolve, Math.random() * 50));

          const retrievedContext = activityContext.get();
          results[index] = retrievedContext;

          return retrievedContext;
        })
      );

      await Promise.all(promises);

      // Each context should be maintained correctly
      contexts.forEach((expectedContext, index) => {
        expect(results[index]).toEqual(expectedContext);
      });
    });
  });
});