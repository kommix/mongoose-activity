/**
 * Shared setup for all examples
 * Run any example with: node examples/01-basic.js
 */

const mongoose = require('mongoose');

async function connect() {
  try {
    await mongoose.connect('mongodb://localhost:27017/activity-examples');
    console.log('✅ Connected to MongoDB\n');
  } catch (error) {
    console.error('❌ MongoDB connection failed. Make sure MongoDB is running.');
    console.error('   Run: mongod or brew services start mongodb-community');
    process.exit(1);
  }
}

async function cleanup() {
  await mongoose.connection.db.dropDatabase();
  await mongoose.connection.close();
  console.log('\n✅ Cleaned up and disconnected');
}

module.exports = { connect, cleanup };