/**
 * Query Activity Feeds
 * Run: node examples/03-query-activities.js
 */

const mongoose = require('mongoose');
const { activityPlugin, getActivityFeed, getEntityActivity, logActivity } = require('@kommix/mongoose-activity');
const { connect, cleanup } = require('./setup');

const postSchema = new mongoose.Schema({
  title: String,
  content: String
});

postSchema.plugin(activityPlugin, {
  trackedFields: ['title', 'content'],
  collectionName: 'posts'
});

const Post = mongoose.model('Post', postSchema);

async function run() {
  await connect();

  const userId = new mongoose.Types.ObjectId();

  // Create some posts
  const post1 = await Post.create({ title: 'First Post', content: 'Hello' });
  const post2 = await Post.create({ title: 'Second Post', content: 'World' });

  // Log some manual activities
  await logActivity({
    userId: userId,
    entity: { type: 'posts', id: post1._id },
    type: 'post_liked'
  });

  await logActivity({
    userId: userId,
    entity: { type: 'posts', id: post2._id },
    type: 'post_shared'
  });

  // Query user's activity feed
  const userFeed = await getActivityFeed(userId);
  console.log(`User has ${userFeed.length} activities`);

  // Query specific entity history
  const postHistory = await getEntityActivity('posts', post1._id);
  console.log(`\nPost 1 history (${postHistory.length} events):`);
  postHistory.forEach(a => console.log(`- ${a.type}`));

  // Query with filters
  const recentActivities = await getActivityFeed(userId, {
    limit: 5,
    entityType: 'posts'
  });
  console.log(`\nRecent post activities: ${recentActivities.length}`);

  await cleanup();
}

run().catch(console.error);