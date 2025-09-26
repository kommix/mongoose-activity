# API Reference

## Plugin Options

```typescript
interface PluginOptions {
  trackedFields?: string[];       // Fields to automatically track changes (supports nested fields)
  activityType?: string;          // Custom activity type for updates (default: "document_updated")
  collectionName?: string;        // Entity type name (default: schema collection name)
  throwOnError?: boolean;         // Whether to throw errors (default: false)
  indexes?: boolean;              // Whether to create indexes (default: true)
  trackOriginalValues?: boolean;  // Track before/after values for field changes (default: false)

  // 🗑️ Deletion Tracking Options
  trackDeletions?: boolean;       // Enable deletion tracking (default: false)
  deletionFields?: string[];      // Fields to capture before deletion (default: trackedFields)
  bulkDeleteSummary?: boolean;    // Use summary mode for deleteMany (default: false)
  bulkDeleteThreshold?: number;   // Threshold for automatic summary mode (default: 100)
}
```

## Logger Options

```typescript
interface LoggerOptions {
  throwOnError?: boolean;      // Override global throwOnError setting
  asyncLogging?: boolean;      // Override global asyncLogging setting
  session?: mongoose.Session;  // Include in MongoDB transaction
}
```

## Global Configuration

```typescript
interface GlobalConfig {
  collectionName?: string;     // Collection name (default: 'activities')
  throwOnError?: boolean;      // Throw errors vs silent handling (default: false)
  indexes?: boolean;           // Create performance indexes (default: true)
  asyncLogging?: boolean;      // Fire-and-forget logging (default: false)
  retentionDays?: number;      // TTL expiration in days (default: undefined)
  maxListeners?: number;       // EventEmitter max listeners (default: 50)
}
```

## Activity Schema

```typescript
interface IActivity {
  userId: ObjectId;           // User who performed the action
  entity: {
    type: string;            // Entity type (e.g., 'users', 'posts')
    id: ObjectId;           // Entity ID
  };
  type: string;             // Activity type (e.g., 'user_created', 'post_liked')
  meta?: Record<string, any>; // Optional metadata/payload (includes request context)
  createdAt: Date;           // Timestamp (with optional TTL expiration)
}
```

## Core Functions

### `logActivity(params: ActivityLogParams, options?: LoggerOptions)`
Manually log custom activities with optional configuration overrides.

### `getActivityFeed(userId: string, options?)`
Retrieve activity feed for a user with optional filtering and pagination.

**Options:**
- `limit?: number` - Number of activities to return (default: 50)
- `skip?: number` - Number of activities to skip for pagination
- `entityType?: string` - Filter by entity type
- `activityType?: string` - Filter by activity type
- `startDate?: Date` - Filter activities after date
- `endDate?: Date` - Filter activities before date

### `getEntityActivity(entityType: string, entityId: string, options?)`
Retrieve activity history for a specific entity with the same filtering options.

### `Activity.prune(options?)`
Manual cleanup of old activities with flexible options.

**Options:**
- `olderThan?: string | Date | number` - Remove activities older than specified time (default: '90d')
- `entityType?: string` - Optional filter by entity type
- `limit?: number` - Optional batch size limit

## Middleware API

### Express Middleware

```typescript
activityContextMiddleware(options?: MiddlewareOptions)
```

### Koa Middleware

```typescript
koaActivityContextMiddleware(options?: MiddlewareOptions)
```

### Middleware Options

```typescript
interface MiddlewareOptions {
  extractUserId?: (req: any) => any;
  extractRequestId?: (req: any) => string | undefined;
  extractIp?: (req: any) => string | undefined;
  extractSessionId?: (req: any) => string | undefined;
  extractUserAgent?: (req: any) => string | undefined;
}
```

## Event System API

### Event Types

- `activity:before-log` - Emitted before activity is saved (can cancel)
- `activity:logged` - Emitted after activity is successfully saved
- `activity:error` - Emitted when activity logging fails
- `activity:feed-queried` - Emitted when activity feeds are queried

### Event Handlers

```typescript
// Typed event handlers
activityEvents.on('activity:logged', (activity: IActivity) => {
  // Handle logged activity
});

activityEvents.on('activity:before-log', (activity: Partial<IActivity>) => {
  // Return false to cancel logging
  return shouldLogActivity(activity);
});

activityEvents.on('activity:error', (error: Error, activity?: Partial<IActivity>) => {
  // Handle logging errors
});
```

## Database Indexes

The plugin automatically creates optimized indexes for fast queries:

- `{ userId: 1, createdAt: -1 }` - User activity feeds
- `{ 'entity.id': 1, createdAt: -1 }` - Entity history
- `{ 'entity.type': 1, createdAt: -1 }` - Entity type queries
- `{ type: 1, createdAt: -1 }` - Activity type queries
- `{ 'entity.type': 1, 'entity.id': 1, createdAt: -1 }` - Combined entity queries
- TTL index on `createdAt` (when retentionDays is configured)