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

  configure(options: Partial<GlobalConfig>): void {
    this.config = { ...this.config, ...options };

    // Update EventEmitter max listeners if changed
    if (options.maxListeners !== undefined) {
      // Use dynamic import to avoid circular dependency
      import('./events')
        .then(({ activityEvents }) => {
          activityEvents.setMaxListeners(options.maxListeners!);
        })
        .catch(() => {
          // Silently ignore errors during shutdown/cleanup
        });
    }
  }

  reset(): void {
    const defaults: GlobalConfig = {
      collectionName: 'activities',
      throwOnError: false,
      indexes: true,
      asyncLogging: false,
      retentionDays: undefined,
      maxListeners: 50,
    };

    this.config = defaults;

    // Reset EventEmitter max listeners
    import('./events')
      .then(({ activityEvents }) => {
        activityEvents.setMaxListeners(defaults.maxListeners!);
      })
      .catch(() => {
        // Silently ignore errors during shutdown/cleanup
      });
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
