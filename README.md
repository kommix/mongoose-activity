# @kommix/mongoose-activity

> A **modern, lightweight, and fast** Mongoose plugin for automatically logging user activity into a central Activity collection.

Build **activity feeds, timelines, and audit-like event logs** in your Mongoose applications with zero configuration.

## ✨ Features

- 🚀 **Modern & Fast** - Built with TypeScript, optimized performance with proper indexing
- 🪶 **Lightweight** - Minimal dependencies, plug-and-play architecture
- 🔧 **Easy Integration** - Simple plugin system that works with existing Mongoose schemas
- 📊 **Field Tracking** - Automatically track changes to specific fields
- 🎯 **Flexible Logging** - Manual activity logging with custom event types
- 📈 **Query Helpers** - Built-in functions for retrieving activity feeds and entity history
- 🏗️ **TypeScript First** - Full TypeScript support with comprehensive type definitions

## 🚀 Installation

```bash
npm install @kommix/mongoose-activity
```

## 📖 Quick Start

### 1. Install & Import

```bash
npm install @kommix/mongoose-activity
```

```typescript
// ESM
import { activityPlugin, Activity, logActivity } from '@kommix/mongoose-activity';

// CommonJS
const { activityPlugin, Activity, logActivity } = require('@kommix/mongoose-activity');
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
  lastLogin: Date
});

// 🔌 Add the plugin - specify which fields to track
userSchema.plugin(activityPlugin, {
  trackedFields: ['name', 'email', 'status'], // Only these fields trigger activities
  collectionName: 'users' // Entity type for activities
});

const User = mongoose.model('User', userSchema);

// ✨ Now every save/update automatically logs activities!
const user = new User({
  userId: new mongoose.Types.ObjectId(),
  name: 'John Doe',
  email: 'john@example.com',
  status: 'active'
});

await user.save();
// 📝 Automatically logs: { type: 'users_created', entity: { type: 'users', id: user._id }, ... }

user.name = 'Jane Doe';
user.status = 'inactive';
await user.save();
// 📝 Automatically logs: { type: 'document_updated', changes: { name: { from: 'John Doe', to: 'Jane Doe' }, ... } }
```

### 3. Manual Domain Event Logging

For **custom business events** that aren't tied to model changes:

```typescript
// 🎯 E-commerce example
await logActivity({
  userId: customerId,
  entity: { type: 'order', id: orderId },
  type: 'order_shipped',
  meta: {
    trackingNumber: 'ABC123',
    carrier: 'FedEx',
    estimatedDelivery: '2024-01-15',
    items: ['item1', 'item2']
  }
});

// 🎯 Social media example
await logActivity({
  userId: authorId,
  entity: { type: 'post', id: postId },
  type: 'post_liked',
  meta: {
    likedBy: otherUserId,
    totalLikes: 42
  }
});

// 🎯 SaaS product example
await logActivity({
  userId: userId,
  entity: { type: 'workspace', id: workspaceId },
  type: 'feature_used',
  meta: {
    feature: 'advanced_analytics',
    plan: 'pro',
    timestamp: new Date()
  }
});
```

### 4. Query Activity Feeds & History

```typescript
import { getActivityFeed, getEntityActivity } from '@kommix/mongoose-activity';

// 📊 Get user's personal activity feed
const feed = await getActivityFeed(userId, {
  limit: 20,
  entityType: 'order', // Optional: filter by entity type
  startDate: new Date('2024-01-01'), // Optional: date range
  endDate: new Date('2024-01-31')
});

// 📊 Get all activity for a specific entity (audit trail)
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

## 🔧 API Reference

### Plugin Options

```typescript
interface PluginOptions {
  trackedFields?: string[];    // Fields to automatically track changes
  activityType?: string;       // Custom activity type for updates (default: "document_updated")
  collectionName?: string;     // Entity type name (default: schema collection name)
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
  meta?: Record<string, any>; // Optional metadata/payload
  createdAt: Date;           // Timestamp
}
```

### Core Functions

#### `logActivity(params: ActivityLogParams)`
Manually log custom activities.

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

## 📊 Database Indexes

The plugin automatically creates optimized indexes for fast queries:

- `{ userId: 1, createdAt: -1 }` - User activity feeds
- `{ 'entity.id': 1, createdAt: -1 }` - Entity history
- `{ 'entity.type': 1, createdAt: -1 }` - Entity type queries
- `{ type: 1, createdAt: -1 }` - Activity type queries
- `{ 'entity.type': 1, 'entity.id': 1, createdAt: -1 }` - Combined entity queries

## 🏗️ Advanced Examples

### Custom Activity Types

```typescript
userSchema.plugin(activityPlugin, {
  trackedFields: ['profile.avatar', 'settings.theme'],
  activityType: 'user_profile_updated',
  collectionName: 'users'
});
```

### Complex Activity Logging

```typescript
// E-commerce example
await logActivity({
  userId: customerId,
  entity: { type: 'order', id: orderId },
  type: 'order_status_changed',
  meta: {
    previousStatus: 'pending',
    newStatus: 'shipped',
    trackingNumber: 'ABC123',
    carrier: 'FedEx',
    estimatedDelivery: '2024-01-15'
  }
});
```

### Building Activity Feeds

```typescript
// Get recent activities with rich metadata
const feed = await getActivityFeed(userId, { limit: 10 });

// Transform for UI display
const displayFeed = feed.map(activity => ({
  id: activity._id,
  message: formatActivityMessage(activity),
  timestamp: activity.createdAt,
  entityType: activity.entity.type,
  entityId: activity.entity.id,
  metadata: activity.meta
}));
```

## 🧪 Development & Testing

```bash
# Install dependencies
npm install

# Run tests
npm test

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

The package includes comprehensive Jest tests with MongoDB Memory Server for isolated testing.

## 🤝 Contributing

Contributions welcome! Please ensure:

1. **Code Quality**: Run `npm run lint` and `npm run format` before committing
2. **Tests**: Add tests for new features and ensure `npm test` passes
3. **Build**: Verify `npm run build` succeeds for both CJS and ESM outputs

## 🚀 Publishing

The package supports both CommonJS and ESM:

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

## 🏷️ Keywords

`mongoose` `activity` `activity-feed` `timeline` `audit` `log` `kommix` `modern` `lightweight` `fast`