# API Reference

## Plugin Options

```typescript
interface PluginOptions {
  trackedFields?: string[];       // default: [] - Fields to automatically track changes (supports nested fields)
  activityType?: string;          // default: "document_updated" - Custom activity type for updates
  collectionName?: string;        // default: schema collection name - Entity type name
  throwOnError?: boolean;         // default: false - Whether to throw errors
  indexes?: boolean;              // default: undefined - UNUSED: Use global config instead
  trackOriginalValues?: boolean;  // default: false - Track before/after values for field changes

  // 🗑️ Deletion Tracking Options
  trackDeletions?: boolean;       // default: false - Enable deletion tracking
  deletionFields?: string[];      // default: trackedFields - Fields to capture before deletion
  bulkDeleteSummary?: boolean;    // default: false - Use summary mode for deleteMany
  bulkDeleteThreshold?: number;   // default: 100 - Threshold for automatic summary mode
}
```

**Note**: The `indexes` option is present in the interface but not implemented. Indexes are controlled globally via `activityConfig.configure({ indexes: true })`.

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
  userId: Types.ObjectId;     // User who performed the action
  entity: {
    type: string;            // Entity type (e.g., 'users', 'posts')
    id: Types.ObjectId;     // Entity ID
  };
  type: string;             // Activity type (e.g., 'user_created', 'post_liked')
  meta?: Record<string, any>; // Optional metadata/payload (includes request context like requestId, ip, sessionId, userAgent)
  createdAt: Date;           // Timestamp (with optional TTL expiration)
}

interface ActivityLogParams {
  userId: Types.ObjectId;     // User who performed the action
  entity: {
    type: string;            // Entity type (e.g., 'users', 'posts')
    id: Types.ObjectId;     // Entity ID
  };
  type: string;             // Activity type (e.g., 'user_created', 'post_liked')
  meta?: Record<string, any>; // Optional metadata/payload
}
```

## Core Functions

### Query Options

```typescript
interface ActivityFeedOptions {
  limit?: number;        // default: 50 - Number of activities to return
  skip?: number;         // default: 0 - Number of activities to skip for pagination
  entityType?: string;   // default: undefined - Filter by entity type
  activityType?: string; // default: undefined - Filter by activity type
  startDate?: Date;      // default: undefined - Filter activities after date
  endDate?: Date;        // default: undefined - Filter activities before date
}

interface EntityActivityOptions {
  limit?: number;        // default: 50 - Number of activities to return
  skip?: number;         // default: 0 - Number of activities to skip for pagination
  activityType?: string; // default: undefined - Filter by activity type
  startDate?: Date;      // default: undefined - Filter activities after date
  endDate?: Date;        // default: undefined - Filter activities before date
}
```

### `logActivity(params: ActivityLogParams, options?: LoggerOptions): Promise<void>`
Manually log custom activities with optional configuration overrides.

### `getActivityFeed(userId: string, options?: ActivityFeedOptions): Promise<IActivity[]>`
Retrieve activity feed for a user with optional filtering and pagination.

### `getEntityActivity(entityType: string, entityId: string, options?: EntityActivityOptions): Promise<IActivity[]>`
Retrieve activity history for a specific entity with filtering options.

### `Activity.prune(options?): Promise<{ deletedCount: number }>`
Manual cleanup of old activities with flexible options.

**Options:**
- `olderThan?: string | Date | number` - Remove activities older than specified time (default: '90d')
  - String formats: `"90d"` (days), `"2h"` (hours), `"30m"` (minutes)
- `entityType?: string` - Optional filter by entity type
- `limit?: number` - Optional batch size limit

**Returns:** `deletedCount` represents the total number of documents removed (when using `limit`, multiple batches may run but the count reflects the total).

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
  extractUserId?: (req: any) => any;              // default: req.user?.id || req.user?._id
  extractRequestId?: (req: any) => string | undefined; // default: req.id || req.headers['x-request-id']
  extractIp?: (req: any) => string | undefined;        // default: req.ip || req.connection?.remoteAddress
  extractSessionId?: (req: any) => string | undefined; // default: req.sessionID || req.session?.id
  extractUserAgent?: (req: any) => string | undefined; // default: req.headers['user-agent']
}
```

*Note: All extractors have sensible defaults but can be overridden. Extractors must be synchronous functions. The plugin skips context capture if extractors return undefined.*

## Event System API

*Built on Node.js `EventEmitter` - supports all standard methods (`on`, `once`, `off`, `removeAllListeners`).*

### Event Types

- `activity:before-log` - Emitted before activity is saved (can cancel)
- `activity:logged` - Emitted after activity is successfully saved
- `activity:error` - Emitted when activity logging fails
- `activity:feed-queried` - Defined in types but not currently emitted

### Event Handlers

Simple error handling:
```typescript
// Basic error handler - recommended pattern
activityEvents.on('activity:error', (err) => {
  console.error('Failed to log activity:', err.message);
});
```

Full examples with typed handlers:
```typescript
// Handle logged activities
activityEvents.on('activity:logged', (activity: IActivity) => {
  // Handle logged activity
});

// Conditionally cancel logging
activityEvents.on('activity:before-log', (activity: Partial<IActivity>) => {
  // Return false to cancel logging
  return shouldLogActivity(activity);
});

// Advanced error handling with context
activityEvents.on('activity:error', (error: Error, activity?: Partial<IActivity>) => {
  // Handle logging errors with full context
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