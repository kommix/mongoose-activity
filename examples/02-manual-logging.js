/**
 * Manual Activity Logging
 * Run: node examples/02-manual-logging.js
 */

const mongoose = require('mongoose');
const { logActivity, Activity } = require('@kommix/mongoose-activity');
const { connect, cleanup } = require('./setup');

async function run() {
  await connect();

  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();

  // Log custom business events
  await logActivity({
    userId: userId,
    entity: { type: 'order', id: orderId },
    type: 'order_placed',
    meta: {
      total: 99.99,
      items: 3
    }
  });

  await logActivity({
    userId: userId,
    entity: { type: 'order', id: orderId },
    type: 'payment_received',
    meta: {
      method: 'card',
      amount: 99.99
    }
  });

  await logActivity({
    userId: userId,
    entity: { type: 'order', id: orderId },
    type: 'order_shipped',
    meta: {
      tracking: 'ABC123',
      carrier: 'FedEx'
    }
  });

  // View activities
  const activities = await Activity.find({});

  console.log('Order timeline:');
  activities.forEach(a => {
    console.log(`- ${a.type}: ${JSON.stringify(a.meta)}`);
  });

  await cleanup();
}

run().catch(console.error);