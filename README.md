<img src="./assets/kommix-logo.jpg" alt="Kommix Logo" width="100%" />

# @kommix/mongoose-activity

**Production-grade activity logging for Mongoose** 📝 → CRUD, deletions, custom events, feeds.

[![npm version](https://img.shields.io/npm/v/@kommix/mongoose-activity)](https://www.npmjs.com/package/@kommix/mongoose-activity)
[![npm downloads](https://img.shields.io/npm/dm/@kommix/mongoose-activity)](https://www.npmjs.com/package/@kommix/mongoose-activity)
[![coverage](https://img.shields.io/badge/coverage-93.16%25-brightgreen)](https://github.com/kommix/mongoose-activity)
[![license](https://img.shields.io/github/license/kommix/mongoose-activity)](LICENSE)

> A **modern, production-ready** Mongoose plugin that takes care of activity logging so you don't have to.
> Create, update, delete — everything gets tracked automatically. No more DIY audit tables! ✨

## 🔍 Why Not Other Plugins?

**Most existing mongoose activity/audit plugins fall short for production use:**

### 📊 Feature Comparison

| Capability | Other Plugins | @kommix/mongoose-activity |
|------------|---------------|---------------------------|
| **Auto CRUD Hooks** | ❌ Often manual logging¹ | ✅ Full lifecycle hooks + custom events |
| **Deletion Tracking** | ❌ Rarely explicit; soft-delete only² | ✅ Hard deletes + field capture pre-delete |
| **Bulk Operations** | ❌ `deleteMany`/`updateMany` gaps³ | ✅ Bulk threshold & optimization |
| **Retention/TTL** | ❌ Generally missing | ✅ Auto-cleanup via `retentionDays` |
| **Performance** | ❌ Sync-only, no batching | ✅ Async logging, event system |
| **TypeScript** | ❌ Mixed JS/TS support | ✅ TypeScript-first |
| **Maintenance** | ❌ Many stale (2016-2020)⁴ | ✅ Active development |

### 🔍 Specific Gaps We Found:

- **`mongoose-activitylog`**: Manual builder pattern, no auto-hooks, last release May 2020¹
- **`mongoose-user-history-plugin`**: Missing bulk ops, TTL, performance tuning³
- **`mf-mongoose-audittrail`**: Audit fields only, no central Activity collection²
- **`mongoose-activitylogs`**: Basic append-style, last published August 2016⁴
- **`@hilarion/mongoose-activity-logger`**: Unmaintained since October 2019⁴

---
<sup>¹[mongoose-activitylog](https://github.com/chunkai1312/mongoose-activitylog) ²[mf-mongoose-audittrail](https://github.com/MEANFactory/mf-mongoose-audittrail) ³[mongoose-user-history-plugin](https://github.com/gmunozc/mongoose-user-history-plugin) ⁴Many plugins last updated between 2016–2020 (see npm/GitHub links)</sup>

## 🎯 What Makes This Different?

- 🔄 **Production-Ready Design** - Built for enterprise workloads with async logging, TTL cleanup, and smart indexing
- 🗑️ **Complete Deletion Coverage** - Only plugin with full `deleteOne`/`deleteMany`/`findOneAndDelete` tracking + field capture
- ⚡ **Performance Optimized** - Bulk operation thresholds, async logging, configurable batching
- 🚀 **Modern Stack** - TypeScript-first, zero dependencies, Node 18+ support
- 🔧 **Battle-Tested** - 91.93% test coverage, comprehensive [performance benchmarks](./docs/BENCHMARKS.md)

💡 *Built because we got tired of half-maintained plugins. Now you don't have to.*

## 📚 Documentation

- 📖 **[API Reference](./docs/API.md)** - Complete API documentation
- 🎯 **[Advanced Examples](./docs/EXAMPLES.md)** - Complex use cases and patterns
- 📊 **[Benchmarks & Performance](./docs/BENCHMARKS.md)** - Performance metrics and optimization tips
- ⚡ **[Performance Tests](./docs/PERFORMANCE.md)** - Load testing and performance analysis
- 🗺️ **[Roadmap](./docs/ROADMAP.md)** - Future features and improvements
- 💡 **[Sample Examples](./examples/)** - 7 runnable examples covering all features

## 🚀 Installation

```bash
npm install @kommix/mongoose-activity
```

## ⚡ Quick Start

### 💫 5-Second Demo

```typescript
// One-liner setup
userSchema.plugin(activityPlugin, { trackedFields: ['name', 'email'] });

await User.create({ name: "Jane" }); // → activity logged automatically!
```

*That's it! Activities now show up automatically. You focus on features, we handle the logs.*

**What you get:**
```json
{
  "type": "users_created",
  "entity": { "type": "users", "id": "652a..." },
  "changes": { "name": "Jane", "email": "jane@example.com" },
  "userId": "auto-detected",
  "timestamp": "2025-09-27T12:34:56Z"
}
```

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

// Basic usage (works with any framework)
app.use(activityContextMiddleware({
  extractUserId: (req) => req.user?.id,
  extractRequestId: (req) => req.headers?.['x-request-id']
}));

// Now all activities automatically include request context — magic! ✨
```

#### 🎯 Enhanced TypeScript Support

```typescript
import { Request, Response } from 'express';
import { Context } from 'koa';

// Express with full type safety and IntelliSense
app.use(activityContextMiddleware<Request, Response>({
  extractUserId: (req) => req.user?.id,  // Full autocomplete
  extractRequestId: (req) => req.headers['x-request-id'],
}));

// Koa with type safety
app.use(koaActivityContextMiddleware<Context>({
  extractUserId: (ctx) => ctx.state.user?.id,
  extractIp: (ctx) => ctx.ip,
}));

// Custom framework integration
interface MyCustomRequest {
  authenticatedUser: { userId: string };
  customHeaders: Record<string, string>;
}

app.use(activityContextMiddleware<MyCustomRequest>({
  extractUserId: (req) => req.authenticatedUser.userId,
  extractRequestId: (req) => req.customHeaders.requestId,
}));
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

// React to activities in real-time — hook into your business logic
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
- **TypeScript**: 4.0+ (full type support with enhanced middleware IntelliSense)
- **Frameworks**: Express, Koa, or any compatible middleware framework

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

We'd love your help to make this even better!
PRs, issues, and feature ideas are always welcome 🚀

Before submitting:
1. Run `npm run lint` and `npm run format`
2. Add tests for new features
3. Update documentation if needed

👐 *Looking to build something cool? Reach out — we're friendly and love crazy ideas!*

## 📄 License

MIT © Kommix

---

📦 [npm](https://www.npmjs.com/package/@kommix/mongoose-activity) · 💻 [GitHub](https://github.com/kommix/mongoose-activity) · 📖 [Full Documentation](./docs/)