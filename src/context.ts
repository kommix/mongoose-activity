import { AsyncLocalStorage } from 'async_hooks';
import { Types } from 'mongoose';

export interface ActivityContext {
  userId?: Types.ObjectId;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
  [key: string]: any;
}

class ActivityContextManager {
  private storage = new AsyncLocalStorage<ActivityContext>();

  run<T>(context: ActivityContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): ActivityContext | undefined {
    return this.storage.getStore();
  }

  set(key: string, value: any): void {
    const context = this.get();
    if (context) {
      context[key] = value;
    }
  }

  getUserId(): Types.ObjectId | undefined {
    return this.get()?.userId;
  }

  getRequestId(): string | undefined {
    return this.get()?.requestId;
  }

  clear(): void {
    const context = this.get();
    if (context) {
      Object.keys(context).forEach((key) => delete context[key]);
      // Mark context as ended to prevent further operations
      context.ended = true;
    }
  }

  /**
   * Disable the AsyncLocalStorage context entirely
   * Use this for hard resets in tests or when switching environments
   */
  disable(): void {
    this.storage.disable();
  }

  isEnded(): boolean {
    return this.get()?.ended === true;
  }
}

export const activityContext = new ActivityContextManager();
