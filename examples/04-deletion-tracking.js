/**
 * Deletion Tracking
 * Run: node examples/04-deletion-tracking.js
 */

const mongoose = require('mongoose');
const { activityPlugin, Activity } = require('@kommix/mongoose-activity');
const { connect, cleanup } = require('./setup');

const productSchema = new mongoose.Schema({
  sku: String,
  name: String,
  price: Number,
  stock: Number
});

productSchema.plugin(activityPlugin, {
  collectionName: 'products',
  trackDeletions: true,
  deletionFields: ['sku', 'name', 'price'], // Fields to preserve
  bulkDeleteThreshold: 3
});

const Product = mongoose.model('Product', productSchema);

async function run() {
  await connect();

  // Create products
  const products = await Product.create([
    { sku: 'LAPTOP-1', name: 'Gaming Laptop', price: 1299, stock: 10 },
    { sku: 'MOUSE-1', name: 'Gaming Mouse', price: 79, stock: 50 },
    { sku: 'KEYBOARD-1', name: 'Mechanical Keyboard', price: 149, stock: 30 },
    { sku: 'MONITOR-1', name: '4K Monitor', price: 599, stock: 15 }
  ]);

  console.log(`Created ${products.length} products`);

  // Single deletion
  await Product.deleteOne({ sku: 'LAPTOP-1' });
  console.log('Deleted single product');

  // Bulk deletion
  await Product.deleteMany({ price: { $lt: 200 } });
  console.log('Deleted products under $200');

  // Check deletion activities
  const deletions = await Activity.find({ type: /deleted$/ });

  console.log(`\n${deletions.length} deletion activities:`);
  deletions.forEach(a => {
    if (a.meta?.deletedFields) {
      console.log(`- Deleted: ${a.meta.deletedFields.name} ($${a.meta.deletedFields.price})`);
    }
    if (a.meta?.deletedCount) {
      console.log(`- Bulk deleted: ${a.meta.deletedCount} items`);
    }
  });

  await cleanup();
}

run().catch(console.error);