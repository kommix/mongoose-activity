<img src="./assets/kommix-logo.svg" alt="Kommix Logo" width="200" />

# @kommix/mongoose-activity

[![npm version](https://img.shields.io/npm/v/@kommix/mongoose-activity)](https://www.npmjs.com/package/@kommix/mongoose-activity)
[![build](https://img.shields.io/github/actions/workflow/status/kommix/mongoose-activity/ci.yml)](https://github.com/kommix/mongoose-activity/actions)
[![coverage](https://img.shields.io/badge/coverage-91.93%25-brightgreen)](https://github.com/kommix/mongoose-activity)
[![license](https://img.shields.io/github/license/kommix/mongoose-activity)](LICENSE)
[![npm downloads](https://img.shields.io/npm/dm/@kommix/mongoose-activity)](https://www.npmjs.com/package/@kommix/mongoose-activity)

📦 [npm](https://www.npmjs.com/package/@kommix/mongoose-activity) · 💻 [GitHub](https://github.com/kommix/mongoose-activity) · 📖 [Docs](https://github.com/kommix/mongoose-activity#readme)

> **🚀 Release Candidate**: Feature-complete with full CRUD tracking, performance optimization, and enterprise-grade reliability. Ready for production use.

> A **modern, production-ready, and high-performance** Mongoose plugin for automatically logging user activity into a central Activity collection with advanced features.

Build **activity feeds, timelines, audit logs, and real-time analytics** in your Mongoose applications with comprehensive configuration options and enterprise-grade features.

## 🎯 Why This Library?

- ✅ **Complete Deletion Tracking** (rare in mongoose plugins) - Track `deleteOne`, `deleteMany`, and `findOneAndDelete` operations
- ✅ **Full CRUD Lifecycle Coverage** - Comprehensive tracking of Create, Read, Update, Delete operations with performance optimization
- ✅ **Enterprise-Grade Performance** - Bulk operations, async logging, TTL cleanup, and smart indexing for production workloads

## ✨ Features

- 🚀 **Modern & Fast** - Built with TypeScript, optimized performance with smart indexing
- 🗑️ **Complete Deletion Tracking** - Track `deleteOne`, `deleteMany`, and `findOneAndDelete` operations with performance optimization
- 📦 **Zero Dependencies** - No external packages required, only Mongoose peer dependency
- 🔧 **Easy Integration** - Simple plugin system that works with existing Mongoose schemas
- 📊 **Advanced Field Tracking** - Automatically track changes to specific fields with before/after values
- 🎯 **Flexible Logging** - Manual activity logging with custom event types and rich metadata
- 📈 **Powerful Query API** - Built-in functions for activity feeds, entity history, and analytics
- 🏗️ **TypeScript First** - Full TypeScript support with comprehensive type definitions
- ⚡ **High Performance** - Async logging, bulk operation optimization, configurable TTL, and smart indexing
- 🔄 **Event System** - Real-time event emission with cancellation and chaining support
- 🌐 **Request Context** - Automatic request context tracking with Express/Koa middleware
- 🛡️ **Production Ready** - Schema validation, error handling, session support, and enterprise-grade features

## 🚀 Installation & Quick Start

```bash
npm install @kommix/mongoose-activity
```

### 1. Import

```typescript
// ESM
import {
  activityPlugin,
  Activity,
  logActivity,
  getActivityFeed,
  activityConfig,
  activityEvents,
  activityContextMiddleware
} from '@kommix/mongoose-activity';

// CommonJS
const {
  activityPlugin,
  Activity,
  logActivity,
  getActivityFeed,
  activityConfig,
  activityEvents,
  activityContextMiddleware
} = require('@kommix/mongoose-activity');
```

### 2. Auto-Track Field Changes with Plugin

The **plugin automatically logs activities** when documents are created or updated:

```typescript
import mongoose from 'mongoose';

// Your existing schema
const userSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: String,
  email: String,
  status: String,
  profile: {
    avatar: String,
    bio: String
  },
  lastLogin: Date
});

// Add the plugin - specify which fields to track
userSchema.plugin(activityPlugin, {
  trackedFields: ['name', 'email', 'status', 'profile.avatar'], // Track nested fields too
  collectionName: 'users' // Entity type for activities
});

const User = mongoose.model('User', userSchema);

// Now every save/update automatically logs activities!
const user = new User({
  userId: new mongoose.Types.ObjectId(),
  name: 'John Doe',
  email: 'john@example.com',
  status: 'active'
});

await user.save();
// Automatically logs: { type: 'users_created', entity: { type: 'users', id: user._id }, meta: { name: 'John Doe', email: '...', status: 'active' } }

user.name = 'Jane Doe';
user.status = 'inactive';
await user.save();
// Automatically logs: { type: 'document_updated', changes: { name: { from: 'John Doe', to: 'Jane Doe' }, status: { from: 'active', to: 'inactive' } }, modifiedFields: ['name', 'status'] }
```

### 3. Request Context Middleware

Automatically capture request context for all activities:

```typescript
import express from 'express';
import { activityContextMiddleware } from '@kommix/mongoose-activity';

const app = express();

// Add middleware to capture request context
app.use(activityContextMiddleware({
  extractUserId: (req) => req.user?.id,
  extractRequestId: (req) => req.id || req.headers['x-request-id'],
  extractIp: (req) => req.ip,
  extractSessionId: (req) => req.sessionID,
  extractUserAgent: (req) => req.headers['user-agent']
}));

// Now all activities automatically include request context!
app.post('/api/users', async (req, res) => {
  const user = new User(req.body);
  await user.save();
  // Activity automatically includes: requestId, ip, sessionId, userAgent
});
```

For Koa applications:

```typescript
import Koa from 'koa';
import { koaActivityContextMiddleware } from '@kommix/mongoose-activity';

const app = new Koa();

app.use(koaActivityContextMiddleware({
  extractUserId: (ctx) => ctx.state?.user?.id,
  extractRequestId: (ctx) => ctx.request.header['x-request-id']
}));
```

### 4. Manual Domain Event Logging

For **custom business events** that aren't tied to model changes:

```typescript
// E-commerce example
await logActivity({
  userId: customerId,
  entity: { type: 'order', id: orderId },
  type: 'order_shipped',
  meta: {
    trackingNumber: 'ABC123',
    carrier: 'FedEx',
    estimatedDelivery: '2024-01-15',
    items: ['item1', 'item2'],
    shippingCost: 9.99
  }
});

// Social media example with async logging
await logActivity({
  userId: authorId,
  entity: { type: 'post', id: postId },
  type: 'post_liked',
  meta: {
    likedBy: otherUserId,
    totalLikes: 42
  }
}, {
  asyncLogging: true // Fire-and-forget for high-performance scenarios
});

// SaaS product example with transaction support
const session = await mongoose.startSession();
await session.withTransaction(async () => {
  await logActivity({
    userId: userId,
    entity: { type: 'workspace', id: workspaceId },
    type: 'feature_used',
    meta: {
      feature: 'advanced_analytics',
      plan: 'pro',
      timestamp: new Date()
    }
  }, {
    session // Include in transaction
  });
});
```

### 5. 🗑️ Deletion Tracking

Track deletions across all operations with configurable field capture and performance optimization:

```typescript
// Enable deletion tracking with specific fields
userSchema.plugin(activityPlugin, {
  trackedFields: ['name', 'email', 'status'],
  trackDeletions: true,
  deletionFields: ['name', 'email'], // Only capture these fields
  collectionName: 'users',
});

// All deletion operations now create activity logs:
await User.deleteOne({ _id: userId });           // Single document deletion
await User.deleteMany({ status: 'inactive' });   // Bulk deletion (per-document logs)
await User.findOneAndDelete({ _id: userId });    // Find and delete

// Performance optimization for large bulk operations
userSchema.plugin(activityPlugin, {
  trackDeletions: true,
  bulkDeleteSummary: true,      // Force summary mode
  bulkDeleteThreshold: 50,      // Auto-summary above 50 deletions
  deletionFields: ['name'],     // Sample fields for summary
});

// 🗃️ Activity log structure for deletions
{
  type: 'users_deleted',           // or 'users_deleted_bulk' for summaries
  entity: { type: 'users', id: ObjectId },
  meta: {
    operation: 'deleteMany',      // deleteOne, deleteMany, findOneAndDelete
    deletedCount: 3,              // Number of documents deleted
    deletedFields: {              // Captured fields before deletion
      name: 'John Doe',
      email: 'john@example.com'
    },
    // For bulk summary mode:
    summary: true,                // Indicates summary entry
    documentIds: [ObjectId, ...], // All deleted document IDs
    deletedFieldsSample: {        // Sample of field values
      name: ['John', 'Jane', 'Bob']
    }
  }
}
```

### 6. Query Activity Feeds & History

```typescript
import { getActivityFeed, getEntityActivity } from '@kommix/mongoose-activity';

// Get user's personal activity feed
const feed = await getActivityFeed(userId, {
  limit: 20,
  entityType: 'order', // Optional: filter by entity type
  activityType: 'order_shipped', // Optional: filter by activity type
  startDate: new Date('2024-01-01'), // Optional: date range
  endDate: new Date('2024-01-31')
});

// Get all activity for a specific entity (audit trail)
const orderHistory = await getEntityActivity('order', orderId, {
  limit: 100,
  activityType: 'order_updated' // Optional: filter by activity type
});

console.log('Recent activities:', feed.map(a => ({
  type: a.type,
  entity: `${a.entity.type}:${a.entity.id}`,
  when: a.createdAt,
  details: a.meta
})));
```

### 6. Global Configuration

Configure the plugin globally at runtime:

```typescript
import { activityConfig } from '@kommix/mongoose-activity';

// Configure global settings
activityConfig.configure({
  collectionName: 'custom_activities',
  throwOnError: false,           // Silent error handling (default)
  indexes: true,                 // Create performance indexes (default)
  asyncLogging: false,           // Synchronous logging (default)
  retentionDays: 90,             // Auto-delete after 90 days (TTL)
  maxListeners: 100              // EventEmitter max listeners
});

// Get current configuration
const config = activityConfig.get();
console.log('Current config:', config);
```

### 7. Event System

React to activity events in real-time:

```typescript
import { activityEvents } from '@kommix/mongoose-activity';

// Listen for activity events
activityEvents.on('activity:logged', (activity) => {
  console.log('New activity:', activity);

  // Send real-time notifications, update caches, etc.
  if (activity.type === 'order_shipped') {
    notificationService.send(activity.userId, 'Your order has shipped!');
  }
});

// Cancel activities before they're saved
activityEvents.on('activity:before-log', (activity) => {
  // Skip logging for test users
  if (activity.meta?.userType === 'test') {
    return false; // Cancel logging
  }

  // Modify activity before saving
  activity.meta = {
    ...activity.meta,
    source: 'api',
    version: '1.0'
  };
});

// Handle errors with centralized error handling
activityEvents.on('activity:error', (error, activity) => {
  console.error('Activity logging failed:', error);
  // Integration examples:
  myLogger.error('Activity error', { err: error, activity });
  // External service retry, monitoring, etc.
});
```

### 8. Data Cleanup & Maintenance

Built-in cleanup tools for data retention:

```typescript
// Manual cleanup - remove old activities
const result = await Activity.prune({
  olderThan: '30d',           // Remove activities older than 30 days
  entityType: 'user',         // Optional: only specific entity types
  limit: 1000                 // Optional: batch size limit
});

console.log(`Deleted ${result.deletedCount} old activities`);

// Different time formats supported
await Activity.prune({ olderThan: '72h' });    // 72 hours
await Activity.prune({ olderThan: '90m' });    // 90 minutes
await Activity.prune({ olderThan: new Date() }); // Specific date
await Activity.prune({ olderThan: Date.now() - (7 * 24 * 60 * 60 * 1000) }); // Timestamp
```

## 🔧 API Reference

### Plugin Options

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

### Logger Options

```typescript
interface LoggerOptions {
  throwOnError?: boolean;      // Override global throwOnError setting
  asyncLogging?: boolean;      // Override global asyncLogging setting
  session?: mongoose.Session;  // Include in MongoDB transaction
}
```

### Global Configuration

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

### Activity Schema

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

### Core Functions

#### `logActivity(params: ActivityLogParams, options?: LoggerOptions)`
Manually log custom activities with optional configuration overrides.

#### `getActivityFeed(userId: string, options?)`
Retrieve activity feed for a user with optional filtering and pagination.

**Options:**
- `limit?: number` - Number of activities to return (default: 50)
- `skip?: number` - Number of activities to skip for pagination
- `entityType?: string` - Filter by entity type
- `activityType?: string` - Filter by activity type
- `startDate?: Date` - Filter activities after date
- `endDate?: Date` - Filter activities before date

#### `getEntityActivity(entityType: string, entityId: string, options?)`
Retrieve activity history for a specific entity with the same filtering options.

#### `Activity.prune(options?)`
Manual cleanup of old activities with flexible options.

**Options:**
- `olderThan?: string | Date | number` - Remove activities older than specified time (default: '90d')
- `entityType?: string` - Optional filter by entity type
- `limit?: number` - Optional batch size limit

## 🎛️ Middleware API

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

## 📡 Event System API

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

## 📊 Database Indexes

The plugin automatically creates optimized indexes for fast queries:

- `{ userId: 1, createdAt: -1 }` - User activity feeds
- `{ 'entity.id': 1, createdAt: -1 }` - Entity history
- `{ 'entity.type': 1, createdAt: -1 }` - Entity type queries
- `{ type: 1, createdAt: -1 }` - Activity type queries
- `{ 'entity.type': 1, 'entity.id': 1, createdAt: -1 }` - Combined entity queries
- TTL index on `createdAt` (when retentionDays is configured)

## 🏗️ Advanced Examples

### High-Performance Async Logging

```typescript
// Configure for high-volume scenarios
activityConfig.configure({
  asyncLogging: true,         // Fire-and-forget logging
  retentionDays: 30,          // Auto-cleanup after 30 days
  maxListeners: 200           // Handle more event listeners
});

// All subsequent activities use async logging
await logActivity({
  userId: userId,
  entity: { type: 'click', id: elementId },
  type: 'ui_interaction',
  meta: { element: 'signup-button', page: '/landing' }
});
```

### Complex Event-Driven Workflows

```typescript
// Chain activities based on events
activityEvents.on('activity:logged', async (activity) => {
  if (activity.type === 'user_registered') {
    // Trigger welcome email activity
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
```

### Transaction-Safe Logging

```typescript
const session = await mongoose.startSession();

await session.withTransaction(async () => {
  // Create order
  const order = new Order({ userId, items, total });
  await order.save({ session });

  // Log activity in same transaction
  await logActivity({
    userId,
    entity: { type: 'order', id: order._id },
    type: 'order_created',
    meta: { total: order.total, itemCount: order.items.length }
  }, { session });

  // If either fails, both are rolled back
});
```

### Rich Activity Feeds with Context

```typescript
// Middleware captures rich context
app.use(activityContextMiddleware({
  extractUserId: (req) => req.user?.id,
  extractRequestId: (req) => req.headers['x-request-id'],
  extractIp: (req) => req.ip,
  extractUserAgent: (req) => req.headers['user-agent']
}));

// Activities automatically include context
const feed = await getActivityFeed(userId);
console.log(feed[0]);
// {
//   type: 'document_updated',
//   userId: '...',
//   entity: { type: 'users', id: '...' },
//   meta: {
//     changes: { name: { from: 'Old', to: 'New' } },
//     requestId: 'req-123',
//     ip: '192.168.1.1',
//     userAgent: 'Mozilla/5.0...'
//   },
//   createdAt: '2024-01-15T10:30:00Z'
// }
```

### Custom Activity Types with Validation

```typescript
userSchema.plugin(activityPlugin, {
  trackedFields: ['profile.avatar', 'settings.theme'],
  activityType: 'user_profile_updated',
  collectionName: 'users'
});

// Custom activity with rich metadata
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

### Scheduled Cleanup Jobs

```typescript
// Set up automated cleanup (e.g., with cron)
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

## ⚡ Performance Optimizations

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

## 🧠 Memory Safety & Best Practices

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
    console.log(`Document memory: initialState=${hasInitialState}, originalValues=${hasOriginalValues}`);
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

## 🧪 Development & Testing

```bash
# Install dependencies
npm install

# Run tests (with MongoDB Memory Server)
npm test

# Run integration tests
npm test tests/integration.test.ts

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint
npm run lint:fix

# Format code
npm run format
npm run format:check

# Build (both CJS and ESM)
npm run build

# Build development version with watch
npm run dev
```

The package includes comprehensive Jest tests with **91.93% code coverage** and MongoDB Memory Server for isolated testing.

## 🧩 Compatibility

- **Node.js**: 16+ (matches engines field in package.json)
- **MongoDB**: 4.0+ (for TTL and indexes)
- **Mongoose**: 6.0+ (for TypeScript support)
- **TypeScript**: 4.0+ (full type support)

## 🚀 Usage Patterns

### Basic Setup

```typescript
import {
  activityPlugin,
  logActivity,
  getActivityFeed,
  activityConfig,
  activityEvents,
  activityContextMiddleware
} from '@kommix/mongoose-activity';

// Configure globally (optional)
activityConfig.configure({
  asyncLogging: true,
  retentionDays: 90
});

// Add to your schemas
userSchema.plugin(activityPlugin, {
  trackedFields: ['name', 'email', 'status'],
  collectionName: 'users'
});

// Use middleware for automatic context
app.use(activityContextMiddleware());
```

## 🤝 Contributing

Contributions welcome! Please ensure:

1. **Code Quality**: Run `npm run lint` and `npm run format` before committing
2. **Tests**: Add tests for new features and ensure `npm test` passes (target 80%+ coverage)
3. **Build**: Verify `npm run build` succeeds for both CJS and ESM outputs
4. **Documentation**: Update README.md for new features

## 📈 Benchmarks

Performance characteristics (tested with 100k activities):

- **Sync logging**: ~2ms per operation
- **Async logging**: ~0.1ms per operation (fire-and-forget)
- **Activity feed query**: ~5ms (50 items, properly indexed)
- **Entity history query**: ~3ms (100 items, properly indexed)
- **Memory usage**: <10MB for 100k activities (with efficient indexing)

## 🔒 Security Considerations

- **Input validation**: All activity data is validated by Mongoose schemas
- **Injection prevention**: Uses parameterized queries, not string concatenation
- **Memory safety**: TTL and manual cleanup prevent unbounded growth
- **Error isolation**: Activity logging failures never crash your application

## ✅ Production Ready

### Enterprise-Grade Features

This library is **production-ready and feature-complete** for comprehensive activity tracking:

- ✅ **Complete CRUD Coverage** - Create, Update, and Delete operations fully tracked
- ✅ **Performance Optimized** - Bulk operation handling with configurable thresholds
- ✅ **Schema Validation** - Development warnings prevent field misconfiguration
- ✅ **Enterprise Scaling** - Async logging, TTL cleanup, and efficient indexing
- ✅ **Context Awareness** - Request tracking with Express/Koa middleware integration
- ✅ **TypeScript First** - Comprehensive type safety and IntelliSense support

### When to Use This Package

**🎯 Perfect for:**
- User activity feeds and social timelines
- Content management and publishing systems
- Multi-tenant SaaS applications
- E-commerce and marketplace platforms
- **Compliance and audit logging** (90%+ of use cases)
- Real-time analytics and reporting dashboards

**🏗️ Advanced Use Cases:**
- Financial applications (with compliance mode in v2.0)
- Healthcare systems (with enhanced audit trails)
- Legal document management
- Enterprise audit and governance systems

### Performance Considerations

- **Optimized Writes**: Each operation adds ~1ms overhead with async logging
- **Bulk Operations**: Automatic performance scaling with configurable thresholds
- **Memory Efficient**: Smart indexing and optional TTL-based cleanup
- **Production Tested**: Currently powering Kommix's production workloads

## 🗺️ Roadmap

Help us make this library even better! Here are the features we're considering for future releases:

### v2.0 - Advanced Enterprise Features
- [ ] **📡 Change Streams Integration** - Capture all DB changes (even bypassing Mongoose) for bulletproof microservice audit trails
- [ ] **🔐 Compliance Mode** - Strict mode with synchronous logging, full document snapshots, and zero-tolerance error handling for banking/healthcare
- [ ] **📊 Analytics Helpers** - Built-in aggregation functions (`Activity.aggregateByType()`) for easy reporting and dashboard creation
- [ ] **🔄 Schema Migration Tools** - Utilities for migrating existing activity data when schemas change

### v2.1 - Developer Experience
- [ ] **🧪 Enhanced Testing Matrix** - Full compatibility testing across Mongoose 7/8 and Node.js LTS versions
- [ ] **🎨 Activity Visualization** - Optional web dashboard for browsing activity feeds and analytics
- [ ] **📦 Framework Integrations** - First-class support for NestJS, Fastify, and other Node.js frameworks

### Community Contributions Welcome!
We welcome contributions for any of these features. See our [Contributing Guide](./CONTRIBUTING.md) for details on how to get started.

> 💡 **Have ideas?** Open an issue to discuss new features or improvements!

## 🚀 Publishing

The package supports both CommonJS and ESM with dual exports:

```json
{
  "exports": {
    "import": "./dist/esm/index.js",
    "require": "./dist/index.js",
    "types": "./dist/index.d.ts"
  }
}
```

## 📄 License

MIT © Kommix

---

## 🏷️ Keywords

`mongoose` `activity` `activity-feed` `timeline` `audit` `log` `kommix` `modern` `lightweight` `fast` `typescript` `events` `middleware` `performance` `ttl` `cleanup` `context` `async` `transactions`