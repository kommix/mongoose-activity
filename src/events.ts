import { EventEmitter } from 'events';
import { IActivity } from './types';
import { activityConfig } from './config';

export type ActivityEventType =
  | 'activity:before-log'
  | 'activity:logged'
  | 'activity:error'
  | 'activity:feed-queried';

export interface ActivityEventHandlers {
  'activity:before-log': (activity: Partial<IActivity>) => boolean | void;
  'activity:logged': (activity: IActivity) => void;
  'activity:error': (error: Error, activity?: Partial<IActivity>) => void;
  'activity:feed-queried': (query: any, results: IActivity[]) => void;
}

class ActivityEventEmitter extends EventEmitter {
  emit<K extends ActivityEventType>(
    event: K,
    ...args: Parameters<ActivityEventHandlers[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  on<K extends ActivityEventType>(
    event: K,
    listener: ActivityEventHandlers[K]
  ): this {
    return super.on(event, listener);
  }

  once<K extends ActivityEventType>(
    event: K,
    listener: ActivityEventHandlers[K]
  ): this {
    return super.once(event, listener);
  }

  off<K extends ActivityEventType>(
    event: K,
    listener: ActivityEventHandlers[K]
  ): this {
    return super.off(event, listener);
  }
}

export const activityEvents = new ActivityEventEmitter();

// Set configurable max listeners (default 50, or unlimited if set to 0)
activityEvents.setMaxListeners(activityConfig.getMaxListeners());
