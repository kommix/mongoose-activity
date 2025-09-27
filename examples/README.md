# Mongoose Activity Examples

Simple, runnable examples demonstrating every feature of the mongoose-activity plugin.

## Prerequisites

1. MongoDB running locally on port 27017
2. Node.js installed
3. Install the package: `npm install @kommix/mongoose-activity`

## Running Examples

Each example is self-contained and can be run directly:

```bash
# Basic tracking
node examples/01-basic.js

# Manual logging
node examples/02-manual-logging.js

# Query activities
node examples/03-query-activities.js

# And so on...
```

## Examples Overview

### 🟢 Starter Level

**01-basic.js**
- Automatic field tracking
- Create, update, delete operations
- View logged activities

**02-manual-logging.js**
- Log custom business events
- Add metadata to activities
- Build audit trails

**03-query-activities.js**
- Query user activity feeds
- Filter by entity type
- Get entity history

### 🟡 Intermediate

**04-deletion-tracking.js**
- Track deletions with field preservation
- Bulk deletion handling
- Configure thresholds

**05-events.js**
- Listen to activity events
- Cancel activities before logging
- React to activities in real-time

### 🔴 Advanced

**06-configuration.js**
- Global configuration
- Async vs sync logging
- TTL and pruning
- Performance optimization

**07-middleware.js**
- Express integration
- Automatic context capture
- Request ID tracking

## Common Patterns

### Track specific fields only
```javascript
schema.plugin(activityPlugin, {
  trackedFields: ['name', 'status', 'price']
});
```

### Log custom events
```javascript
await logActivity({
  userId: userId,
  entity: { type: 'order', id: orderId },
  type: 'payment_received',
  meta: { amount: 99.99 }
});
```

### Query activities
```javascript
// User's activities
const feed = await getActivityFeed(userId);

// Entity history
const history = await getEntityActivity('order', orderId);
```

### React to events
```javascript
activityEvents.on('activity:logged', (activity) => {
  if (activity.type === 'order_shipped') {
    sendNotification(activity.userId);
  }
});
```

## MongoDB Connection

All examples expect MongoDB running at:
```
mongodb://localhost:27017/activity-examples
```

Start MongoDB:
```bash
# macOS
brew services start mongodb-community

# Linux/WSL
sudo systemctl start mongod

# Or manually
mongod
```

## Cleanup

Each example automatically cleans up after itself, dropping the test database.