/**
 * Basic Activity Tracking
 * Run: node examples/01-basic.js
 */

const mongoose = require('mongoose');
const { activityPlugin, Activity } = require('@kommix/mongoose-activity');
const { connect, cleanup } = require('./setup');

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String
});

userSchema.plugin(activityPlugin, {
  trackedFields: ['name', 'email', 'role'],
  collectionName: 'users'
});

const User = mongoose.model('User', userSchema);

async function run() {
  await connect();

  // Create
  const user = await User.create({
    name: 'John Doe',
    email: 'john@example.com',
    role: 'user'
  });
  console.log('Created user:', user.name);

  // Update
  user.role = 'admin';
  await user.save();
  console.log('Updated role to:', user.role);

  // Delete
  await User.deleteOne({ _id: user._id });
  console.log('Deleted user');

  // Check activities
  const activities = await Activity.find({});
  console.log(`\nLogged ${activities.length} activities:`);
  activities.forEach(a => console.log(`- ${a.type}`));

  await cleanup();
}

run().catch(console.error);