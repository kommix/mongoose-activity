export interface GlobalConfig {
  collectionName?: string;
  throwOnError?: boolean;
  indexes?: boolean;
  asyncLogging?: boolean;
  retentionDays?: number;
  maxListeners?: number;
}

class ConfigManager {
  private config: GlobalConfig = {
    collectionName: 'activities',
    throwOnError: false,
    indexes: true,
    asyncLogging: false,
    retentionDays: undefined,
    maxListeners: 50,
  };

  configure(options: GlobalConfig): void {
    this.config = { ...this.config, ...options };
  }

  get(): GlobalConfig {
    return { ...this.config };
  }

  getCollectionName(): string {
    return this.config.collectionName || 'activities';
  }

  getThrowOnError(): boolean {
    return this.config.throwOnError || false;
  }

  getIndexes(): boolean {
    return this.config.indexes !== false;
  }

  getAsyncLogging(): boolean {
    return this.config.asyncLogging || false;
  }

  getRetentionDays(): number | undefined {
    return this.config.retentionDays;
  }

  getMaxListeners(): number {
    return this.config.maxListeners || 50;
  }
}

export const activityConfig = new ConfigManager();
