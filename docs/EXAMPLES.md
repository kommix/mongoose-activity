# Advanced Examples

## Table of Contents

- [High-Performance Async Logging](#high-performance-async-logging)
- [Complex Event-Driven Workflows](#complex-event-driven-workflows)
- [Transaction-Safe Logging](#transaction-safe-logging)
- [Rich Activity Feeds with Context](#rich-activity-feeds-with-context)
- [Custom Activity Types with Validation](#custom-activity-types-with-validation)
- [Scheduled Cleanup Jobs](#scheduled-cleanup-jobs)
- [Performance Optimizations](#performance-optimizations)
- [Memory Safety & Best Practices](#memory-safety--best-practices)

## High-Performance Async Logging

```typescript
// Configure for high-volume scenarios
activityConfig.configure({
  asyncLogging: true,         // Fire-and-forget logging
  retentionDays: 30,          // Auto-cleanup after 30 days
  maxListeners: 200           // Handle more event listeners
});

// All subsequent activities use async logging
// Returns: Promise<void> - Activity is logged asynchronously
await logActivity({
  userId: userId,
  entity: { type: 'click', id: elementId },
  type: 'ui_interaction',
  meta: { element: 'signup-button', page: '/landing' }
});
```

## Complex Event-Driven Workflows

```typescript
// Chain activities based on events
activityEvents.on('activity:logged', async (activity) => {
  if (activity.type === 'user_registered') {
    // Trigger welcome email activity
    // Returns: Promise<void>
    await logActivity({
      userId: activity.userId,
      entity: { type: 'email', id: new mongoose.Types.ObjectId() },
      type: 'welcome_email_sent',
      meta: {
        triggeredBy: activity._id,
        emailTemplate: 'welcome-v2'
      }
    });
  }
});

// Cancel activities before logging with before-log event
// Return false to prevent the activity from being logged
activityEvents.on('activity:before-log', (activity) => {
  // Skip noisy debug events
  if (activity.type === 'debug_event') {
    return false; // Activity will not be logged
  }

  // Skip activities from test users
  if (activity.meta?.testUser === true) {
    return false;
  }
});
```

## Transaction-Safe Logging

```typescript
const session = await mongoose.startSession();

await session.withTransaction(async () => {
  // Create order
  const order = new Order({ userId, items, total });
  await order.save({ session });

  // Log activity in same transaction
  // Returns: Promise<void> when transaction completes
  await logActivity({
    userId,
    entity: { type: 'order', id: order._id },
    type: 'order_created',
    meta: { total: order.total, itemCount: order.items.length }
  }, { session });

  // If either fails, both are rolled back
});
```

## Rich Activity Feeds with Context

```typescript
// Middleware captures rich context
app.use(activityContextMiddleware({
  extractUserId: (req) => req.user?.id,
  extractRequestId: (req) => req.headers['x-request-id'],
  extractSessionId: (req) => req.session?.id,
  extractIp: (req) => req.ip,
  extractUserAgent: (req) => req.headers['user-agent']
}));

// Activities automatically include context
// Returns: Promise<IActivity[]>
const feed = await getActivityFeed(userId);
console.log(feed[0]);
// {
//   type: 'document_updated',
//   userId: '...',
//   entity: { type: 'users', id: '...' },
//   meta: {
//     changes: { name: { from: 'Old', to: 'New' } },
//     requestId: 'req-123',
//     sessionId: 'sess-abc-456',
//     ip: '192.168.1.1',
//     userAgent: 'Mozilla/5.0...'
//   },
//   createdAt: '2024-01-15T10:30:00Z'
// }
```

## Custom Activity Types with Validation

```typescript
userSchema.plugin(activityPlugin, {
  trackedFields: ['profile.avatar', 'settings.theme'],
  activityType: 'user_profile_updated',
  collectionName: 'users'
});

// Custom activity with rich metadata
// Returns: Promise<void>
await logActivity({
  userId: userId,
  entity: { type: 'experiment', id: experimentId },
  type: 'ab_test_viewed',
  meta: {
    variant: 'B',
    experiment: 'checkout-flow-v2',
    userSegment: 'premium',
    deviceType: 'mobile',
    conversionGoal: 'purchase'
  }
});
```

## Scheduled Cleanup Jobs

```typescript
// Set up automated cleanup with node-cron or similar scheduler
// npm install node-cron
import * as cron from 'node-cron';

async function cleanupOldActivities() {
  const result = await Activity.prune({
    olderThan: '90d',
    limit: 10000  // Process in batches
  });

  console.log(`Cleaned up ${result.deletedCount} old activities`);

  // Clean specific entity types with different retention
  await Activity.prune({
    olderThan: '7d',
    entityType: 'click',
    limit: 5000
  });
}

// Run daily at 2 AM
cron.schedule('0 2 * * *', cleanupOldActivities);
```

## Performance Optimizations

### 1. Async Logging
```typescript
activityConfig.configure({ asyncLogging: true });
// Activities logged in background, won't block requests
```

### 2. TTL (Time To Live)
```typescript
activityConfig.configure({ retentionDays: 30 });
// Automatic cleanup prevents database bloat
```

### 3. Selective Field Tracking
```typescript
// Only track important fields to reduce activity volume
schema.plugin(activityPlugin, {
  trackedFields: ['status', 'email'] // Not ['createdAt', 'lastSeen', etc.]
});
```

### 4. Efficient Queries
```typescript
// Use indexes for fast queries
const recentOrders = await getActivityFeed(userId, {
  entityType: 'order',        // Uses entity.type index
  startDate: new Date(Date.now() - 7*24*60*60*1000) // Uses createdAt index
});
```

## Memory Safety & Best Practices

The plugin temporarily stores field values on documents for change detection. Follow these practices to minimize memory usage:

### 1. Selective Field Tracking
```typescript
// Good: Track only essential fields
schema.plugin(activityPlugin, {
  trackedFields: ['status', 'priority', 'assignee'] // Small, important fields
});

// Avoid: Tracking large objects or frequent-change fields
schema.plugin(activityPlugin, {
  trackedFields: ['content', 'metadata', 'lastSeen'] // Large/frequent data
});
```

### 2. Disable Original Value Tracking for Large Datasets
```typescript
// When trackOriginalValues is enabled, the plugin stores __initialState and __originalValues
// This doubles memory usage for tracked fields

schema.plugin(activityPlugin, {
  trackedFields: ['title', 'status'],
  trackOriginalValues: false, // Disables before/after change tracking to save memory
});
```

### 3. Memory Impact of Tracking Options

| Option | Memory Usage | Use Case |
|--------|-------------|----------|
| `trackOriginalValues: false` | Minimal - only current values stored | Production with memory constraints |
| `trackOriginalValues: true` | 2x - stores before/after values | Detailed audit trails, forensics |
| Large `trackedFields` arrays | Linear increase per field | Fine-grained tracking needs |
| Nested object tracking | High - deep copies stored | Rich document structures |

### 4. Document Lifecycle Considerations
```typescript
// Memory is reclaimed when documents are garbage collected
// For long-running applications processing many documents:

// Good: Process documents in batches
async function updateUserStatuses(userIds: string[]) {
  for (let i = 0; i < userIds.length; i += 100) {
    const batch = userIds.slice(i, i + 100);
    const users = await User.find({ _id: { $in: batch } });

    for (const user of users) {
      user.status = 'updated';
      await user.save(); // Activity logged, then document can be GC'd
    }
    // Batch processed, memory freed
  }
}

// Avoid: Loading many documents simultaneously
const allUsers = await User.find({}); // All documents in memory
// Each document stores __initialState, __originalValues, etc.
```

### 5. Monitoring Memory Usage
```typescript
// Monitor document memory in development
User.schema.post('save', function() {
  if (process.env.NODE_ENV === 'development') {
    const hasInitialState = '__initialState' in this;
    const hasOriginalValues = '__originalValues' in this;

    // Also monitor process memory usage
    const memUsage = process.memoryUsage();
    console.log(`Document memory: initialState=${hasInitialState}, originalValues=${hasOriginalValues}`);
    console.log(`Process memory: heap=${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, RSS=${Math.round(memUsage.rss / 1024 / 1024)}MB`);
  }
});
```

### 6. Recommendations by Scale

**Small Applications (< 10k documents/day)**
- Use `trackOriginalValues: true` for detailed audit trails
- Track all relevant fields

**Medium Applications (10k-100k documents/day)**
- Consider `trackOriginalValues: false` for high-frequency operations
- Be selective with `trackedFields`

**Large Applications (> 100k documents/day)**
- Disable `trackOriginalValues` on high-frequency schemas
- Track only critical business fields
- Use bulk operations where possible
- Monitor memory usage in production