/**
 * Global Configuration
 * Run: node examples/06-configuration.js
 */

const mongoose = require('mongoose');
const { activityConfig, activityPlugin, Activity } = require('@kommix/mongoose-activity');
const { connect, cleanup } = require('./setup');

const docSchema = new mongoose.Schema({
  title: String,
  content: String
});

docSchema.plugin(activityPlugin, {
  trackedFields: ['title', 'content'],
  collectionName: 'documents'
});

const Doc = mongoose.model('Doc', docSchema);

async function run() {
  await connect();

  console.log('Default config:', activityConfig.getConfig());

  // Test sync logging (default)
  console.time('Sync logging');
  for (let i = 0; i < 5; i++) {
    await Doc.create({ title: `Doc ${i}`, content: 'Content' });
  }
  console.timeEnd('Sync logging');

  // Configure async logging
  activityConfig.configure({
    asyncLogging: true,
    throwOnError: false,
    retentionDays: 30  // Auto-cleanup after 30 days
  });

  console.log('\nUpdated config:', activityConfig.getConfig());

  // Test async logging
  console.time('Async logging');
  for (let i = 5; i < 10; i++) {
    await Doc.create({ title: `Doc ${i}`, content: 'Content' });
  }
  console.timeEnd('Async logging');

  // Wait for async operations
  await new Promise(resolve => setTimeout(resolve, 100));

  // Manual pruning example
  const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
  await Activity.create({
    userId: new mongoose.Types.ObjectId(),
    entity: { type: 'test', id: new mongoose.Types.ObjectId() },
    type: 'old_activity',
    createdAt: oldDate
  });

  const pruned = await Activity.prune({ olderThan: '35d' });
  console.log(`\nPruned ${pruned.deletedCount || 0} old activities`);

  // Check total activities
  const count = await Activity.countDocuments();
  console.log(`Total activities: ${count}`);

  // Reset config
  activityConfig.configure({
    asyncLogging: false,
    throwOnError: false
  });

  await cleanup();
}

run().catch(console.error);