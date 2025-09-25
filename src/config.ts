export interface GlobalConfig {
  collectionName?: string;
  throwOnError?: boolean;
  indexes?: boolean;
}

class ConfigManager {
  private config: GlobalConfig = {
    collectionName: 'activities',
    throwOnError: false,
    indexes: true,
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
}

export const activityConfig = new ConfigManager();
