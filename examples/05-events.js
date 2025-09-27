/**
 * Event System
 * Run: node examples/05-events.js
 */

const mongoose = require('mongoose');
const { activityPlugin, activityEvents, logActivity, Activity } = require('@kommix/mongoose-activity');
const { connect, cleanup } = require('./setup');

const taskSchema = new mongoose.Schema({
  title: String,
  status: String,
  priority: String
});

taskSchema.plugin(activityPlugin, {
  trackedFields: ['status', 'priority'],
  collectionName: 'tasks'
});

const Task = mongoose.model('Task', taskSchema);

async function run() {
  await connect();

  // Setup event listeners
  activityEvents.on('activity:before-log', (activity) => {
    console.log(`🔍 Before: ${activity.type}`);
    // Return false to cancel logging
    if (activity.type === 'blocked_activity') {
      console.log('   ❌ Blocked!');
      return false;
    }
    return true;
  });

  activityEvents.on('activity:logged', (activity) => {
    console.log(`✅ Logged: ${activity.type}`);

    // React to specific activities
    if (activity.type === 'high_priority_task') {
      console.log('   🚨 Alert: High priority task created!');
    }
  });

  activityEvents.on('activity:error', (error, activity) => {
    console.log(`❌ Error: ${error.message}`);
  });

  // Create task
  const task = await Task.create({
    title: 'Fix bug',
    status: 'todo',
    priority: 'high'
  });

  // Log custom activity
  await logActivity({
    userId: new mongoose.Types.ObjectId(),
    entity: { type: 'tasks', id: task._id },
    type: 'high_priority_task'
  });

  // Try blocked activity
  await logActivity({
    userId: new mongoose.Types.ObjectId(),
    entity: { type: 'tasks', id: task._id },
    type: 'blocked_activity'
  });

  // Check what was logged
  const activities = await Activity.find({});
  console.log(`\nTotal activities logged: ${activities.length}`);

  // Cleanup
  activityEvents.removeAllListeners();
  await cleanup();
}

run().catch(console.error);