<img src="./assets/kommix-logo.jpg" alt="Kommix Logo" width="100%" />

# @kommix/mongoose-activity

[![npm version](https://img.shields.io/npm/v/@kommix/mongoose-activity)](https://www.npmjs.com/package/@kommix/mongoose-activity)
[![GitHub release](https://img.shields.io/github/v/release/kommix/mongoose-activity)](https://github.com/kommix/mongoose-activity/releases)
[![build](https://img.shields.io/github/actions/workflow/status/kommix/mongoose-activity/ci.yml)](https://github.com/kommix/mongoose-activity/actions)
[![coverage](https://img.shields.io/badge/coverage-91.93%25-brightgreen)](https://github.com/kommix/mongoose-activity)
[![license](https://img.shields.io/github/license/kommix/mongoose-activity)](LICENSE)
[![npm downloads](https://img.shields.io/npm/dm/@kommix/mongoose-activity)](https://www.npmjs.com/package/@kommix/mongoose-activity)

> A **modern, production-ready** Mongoose plugin for automatically logging user activity into a central Activity collection with complete CRUD tracking, deletion support, and enterprise-grade features.

## 🎯 Why This Library?

- ✅ **Complete Deletion Tracking** (rare in mongoose plugins) - Track `deleteOne`, `deleteMany`, and `findOneAndDelete` operations
- ✅ **Full CRUD Lifecycle Coverage** - Comprehensive tracking of Create, Read, Update, Delete operations
- ✅ **Enterprise-Grade Performance** - Async logging, TTL cleanup, and smart indexing for production workloads
- 🚀 **TypeScript First** - Full type safety and IntelliSense support
- 📦 **Zero Dependencies** - Only Mongoose peer dependency

## 📚 Documentation

- 📖 **[API Reference](./docs/API.md)** - Complete API documentation
- 🎯 **[Advanced Examples](./docs/EXAMPLES.md)** - Complex use cases and patterns
- 📊 **[Benchmarks & Performance](./docs/BENCHMARKS.md)** - Performance metrics and optimization tips
- 🗺️ **[Roadmap](./docs/ROADMAP.md)** - Future features and improvements
- 💡 **[Sample Examples](./examples/)** - 7 runnable examples covering all features

## 🚀 Installation

```bash
npm install @kommix/mongoose-activity
```

## ⚡ Quick Start

### 1. Plugin Setup - Auto-Track Document Changes

```typescript
import mongoose from 'mongoose';
import { activityPlugin } from '@kommix/mongoose-activity';

// Your existing schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  status: String
});

// Add the plugin - specify which fields to track
userSchema.plugin(activityPlugin, {
  trackedFields: ['name', 'email', 'status'], // Fields to track
  collectionName: 'users' // Entity type for activities
});

const User = mongoose.model('User', userSchema);

// Now every save/update/delete automatically logs activities!
const user = await User.create({
  name: 'John Doe',
  email: 'john@example.com'
});
// ✅ Automatically logs: { type: 'users_created', entity: { type: 'users', id: user._id }, ... }

user.name = 'Jane Doe';
await user.save();
// ✅ Automatically logs: { type: 'document_updated', changes: { name: { from: 'John Doe', to: 'Jane Doe' } }, ... }

await User.deleteOne({ _id: user._id });
// ✅ Automatically logs: { type: 'users_deleted', meta: { deletedFields: { name: 'Jane Doe', email: 'john@example.com' } }, ... }
```

### 2. Manual Logging - Custom Business Events

```typescript
import { logActivity } from '@kommix/mongoose-activity';

// Log custom business events
await logActivity({
  userId: customerId,
  entity: { type: 'order', id: orderId },
  type: 'order_shipped',
  meta: {
    trackingNumber: 'ABC123',
    carrier: 'FedEx',
    estimatedDelivery: '2024-01-15'
  }
});
```

### 3. Query Activity Feeds

```typescript
import { getActivityFeed, getEntityActivity } from '@kommix/mongoose-activity';

// Get user's activity feed
const feed = await getActivityFeed(userId, {
  limit: 20,
  entityType: 'order' // Optional filters
});

// Get complete history for a specific entity
const orderHistory = await getEntityActivity('order', orderId);
```

### 4. Express/Koa Middleware - Auto-Capture Context

```typescript
import { activityContextMiddleware } from '@kommix/mongoose-activity';

// Express
app.use(activityContextMiddleware({
  extractUserId: (req) => req.user?.id,
  extractRequestId: (req) => req.headers['x-request-id']
}));

// Now all activities automatically include request context!
```

## ✨ Key Features

### 🗑️ Deletion Tracking
```typescript
userSchema.plugin(activityPlugin, {
  trackDeletions: true,          // Enable deletion tracking
  deletionFields: ['name', 'email'], // Fields to capture before deletion
  bulkDeleteThreshold: 100       // Auto-optimize for bulk operations
});
```

### 🔄 Event System
```typescript
import { activityEvents } from '@kommix/mongoose-activity';

// React to activities in real-time
activityEvents.on('activity:logged', (activity) => {
  if (activity.type === 'order_shipped') {
    notificationService.send(activity.userId, 'Your order has shipped!');
  }
});
```

### ⚙️ Global Configuration
```typescript
import { activityConfig } from '@kommix/mongoose-activity';

activityConfig.configure({
  asyncLogging: true,     // Fire-and-forget for performance
  retentionDays: 90,      // Auto-cleanup with TTL
  throwOnError: false     // Silent error handling
});
```

## 🧩 Compatibility

- **Node.js**: 18+ (matches engines field in package.json)
- **MongoDB**: 4.0+ (for TTL and indexes)
- **Mongoose**: 6.0+ or 7.0+ or 8.0+
- **TypeScript**: 4.0+ (full type support)

## 🧪 Development

```bash
# Install dependencies
npm install

# Run tests (91.93% coverage)
npm test

# Build (CJS + ESM)
npm run build

# Development mode
npm run dev
```

## 🤝 Contributing

Contributions welcome! Please ensure:
1. Run `npm run lint` and `npm run format`
2. Add tests for new features
3. Update documentation

## 📄 License

MIT © Kommix

---

📦 [npm](https://www.npmjs.com/package/@kommix/mongoose-activity) · 💻 [GitHub](https://github.com/kommix/mongoose-activity) · 📖 [Full Documentation](./docs/)