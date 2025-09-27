/**
 * Performance and Load Testing Suite
 * Run: node tests/performance/load-test.js
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  activityPlugin,
  logActivity,
  activityConfig,
  Activity,
} = require('../../dist/index.js');

class PerformanceMonitor {
  constructor() {
    this.measurements = [];
    this.memoryBaseline = process.memoryUsage();
  }

  async measure(name, fn, iterations = 1) {
    // Force garbage collection if available
    if (global.gc) global.gc();

    const memBefore = process.memoryUsage();
    const start = process.hrtime.bigint();

    const result = await fn();

    const end = process.hrtime.bigint();
    const memAfter = process.memoryUsage();

    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    const memoryDelta = {
      rss: memAfter.rss - memBefore.rss,
      heapUsed: memAfter.heapUsed - memBefore.heapUsed,
      heapTotal: memAfter.heapTotal - memBefore.heapTotal,
    };

    const measurement = {
      name,
      duration,
      throughput: iterations > 1 ? (iterations / duration) * 1000 : null,
      memoryDelta,
      iterations,
      avgDuration: duration / iterations,
    };

    this.measurements.push(measurement);
    return result;
  }

  getMemoryUsage() {
    const current = process.memoryUsage();
    return {
      current,
      delta: {
        rss: current.rss - this.memoryBaseline.rss,
        heapUsed: current.heapUsed - this.memoryBaseline.heapUsed,
        heapTotal: current.heapTotal - this.memoryBaseline.heapTotal,
      },
    };
  }

  report() {
    console.log('\n📊 PERFORMANCE TEST RESULTS');
    console.log('='.repeat(80));

    this.measurements.forEach((m) => {
      console.log(`\n🔬 ${m.name}`);
      console.log(`   Duration: ${m.duration.toFixed(2)}ms`);
      if (m.iterations > 1) {
        console.log(`   Iterations: ${m.iterations}`);
        console.log(`   Avg per operation: ${m.avgDuration.toFixed(3)}ms`);
        console.log(`   Throughput: ${m.throughput?.toFixed(0)} ops/sec`);
      }
      console.log(
        `   Memory delta: RSS ${(m.memoryDelta.rss / 1024 / 1024).toFixed(2)}MB, Heap ${(m.memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB`
      );
    });

    const memUsage = this.getMemoryUsage();
    console.log(`\n💾 Total Memory Usage:`);
    console.log(
      `   Current RSS: ${(memUsage.current.rss / 1024 / 1024).toFixed(2)}MB`
    );
    console.log(
      `   Current Heap: ${(memUsage.current.heapUsed / 1024 / 1024).toFixed(2)}MB`
    );
    console.log(
      `   Total RSS Delta: ${(memUsage.delta.rss / 1024 / 1024).toFixed(2)}MB`
    );
    console.log('='.repeat(80));
  }
}

// Test schemas
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  status: String,
  metadata: mongoose.Schema.Types.Mixed,
});

const productSchema = new mongoose.Schema({
  sku: String,
  name: String,
  price: Number,
  category: String,
});

async function runPerformanceTests() {
  console.log('🚀 Starting Performance Tests...\n');

  let mongod;
  const monitor = new PerformanceMonitor();

  try {
    // Setup in-memory MongoDB
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    console.log('✅ Connected to in-memory MongoDB');

    // Test 1: Schema Plugin Performance
    await monitor.measure(
      'Schema Plugin Setup (1000 schemas)',
      async () => {
        for (let i = 0; i < 1000; i++) {
          const schema = new mongoose.Schema({ name: String });
          schema.plugin(activityPlugin, {
            trackedFields: ['name'],
            collectionName: `test${i}`,
          });
        }
      },
      1000
    );

    // Setup test schemas
    userSchema.plugin(activityPlugin, {
      trackedFields: ['name', 'email', 'status'],
      collectionName: 'users',
    });

    productSchema.plugin(activityPlugin, {
      trackedFields: ['name', 'price'],
      collectionName: 'products',
      trackDeletions: true,
      deletionFields: ['sku', 'name', 'price'],
    });

    const User = mongoose.model('User', userSchema);
    const Product = mongoose.model('Product', productSchema);

    // Test 2: Sync Logging Performance
    console.log('\n⏱️  Testing Synchronous Logging...');
    activityConfig.configure({ asyncLogging: false });

    await monitor.measure(
      'Sync: Create 100 users',
      async () => {
        const users = [];
        for (let i = 0; i < 100; i++) {
          const user = await User.create({
            name: `User ${i}`,
            email: `user${i}@test.com`,
            status: 'active',
          });
          users.push(user);
        }
        return users;
      },
      100
    );

    // Test 3: Async Logging Performance
    console.log('\n⚡ Testing Asynchronous Logging...');
    activityConfig.configure({ asyncLogging: true });

    await monitor.measure(
      'Async: Create 100 users',
      async () => {
        const users = [];
        for (let i = 100; i < 200; i++) {
          const user = await User.create({
            name: `User ${i}`,
            email: `user${i}@test.com`,
            status: 'active',
          });
          users.push(user);
        }
        // Wait for async operations
        await new Promise((resolve) => setTimeout(resolve, 100));
        return users;
      },
      100
    );

    // Test 4: Bulk Operations
    console.log('\n📦 Testing Bulk Operations...');
    const products = [];
    for (let i = 0; i < 500; i++) {
      products.push({
        sku: `SKU-${i}`,
        name: `Product ${i}`,
        price: Math.random() * 100,
        category: i % 2 === 0 ? 'electronics' : 'books',
      });
    }

    await monitor.measure(
      'Bulk: Insert 500 products',
      async () => {
        return await Product.insertMany(products);
      },
      500
    );

    await monitor.measure(
      'Bulk: Update 500 products',
      async () => {
        return await Product.updateMany({}, { $inc: { price: 1 } });
      },
      500
    );

    await monitor.measure(
      'Bulk: Delete 250 products (electronics)',
      async () => {
        return await Product.deleteMany({ category: 'electronics' });
      },
      250
    );

    // Test 5: Manual Logging Performance
    console.log('\n📝 Testing Manual Logging...');
    const userId = new mongoose.Types.ObjectId();
    const entityId = new mongoose.Types.ObjectId();

    await monitor.measure(
      'Manual: Log 1000 activities',
      async () => {
        const promises = [];
        for (let i = 0; i < 1000; i++) {
          const promise = logActivity({
            userId: userId,
            entity: { type: 'test', id: entityId },
            type: 'test_action',
            meta: { iteration: i, timestamp: Date.now() },
          });
          promises.push(promise);
        }
        await Promise.all(promises);
      },
      1000
    );

    // Test 6: Concurrent Operations
    console.log('\n🔀 Testing Concurrent Operations...');
    await monitor.measure(
      'Concurrent: 10 parallel user batches (50 each)',
      async () => {
        const batches = [];
        for (let batch = 0; batch < 10; batch++) {
          const batchPromise = (async () => {
            const batchUsers = [];
            for (let i = 0; i < 50; i++) {
              const user = await User.create({
                name: `ConcurrentUser ${batch}-${i}`,
                email: `concurrent${batch}-${i}@test.com`,
                status: 'active',
              });
              batchUsers.push(user);
            }
            return batchUsers;
          })();
          batches.push(batchPromise);
        }
        return await Promise.all(batches);
      },
      500
    );

    // Test 7: Heavy Update Operations
    console.log('\n🔄 Testing Heavy Updates...');
    const users = await User.find().limit(100);

    await monitor.measure(
      'Heavy: Update 100 users (multiple fields)',
      async () => {
        for (const user of users) {
          user.name = `Updated ${user.name}`;
          user.status = user.status === 'active' ? 'inactive' : 'active';
          user.metadata = {
            lastUpdate: Date.now(),
            updateCount: (user.metadata?.updateCount || 0) + 1,
          };
          await user.save();
        }
      },
      100
    );

    // Test 8: Query Performance
    console.log('\n🔍 Testing Query Performance...');
    await monitor.measure(
      'Query: Get activity feed (1000 activities)',
      async () => {
        return await Activity.find().sort({ createdAt: -1 }).limit(1000);
      }
    );

    await monitor.measure('Query: Complex aggregation', async () => {
      return await Activity.aggregate([
        { $match: { type: { $regex: 'users_' } } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            avgCreatedAt: { $avg: '$createdAt' },
          },
        },
        { $sort: { count: -1 } },
      ]);
    });

    // Test 9: Memory Stress Test
    console.log('\n🧠 Testing Memory Under Load...');
    await monitor.measure(
      'Memory: Create 2000 activities rapidly',
      async () => {
        const promises = [];
        for (let i = 0; i < 2000; i++) {
          promises.push(
            logActivity({
              userId: new mongoose.Types.ObjectId(),
              entity: { type: 'stress', id: new mongoose.Types.ObjectId() },
              type: 'stress_test',
              meta: {
                data: 'x'.repeat(100), // 100 chars
                index: i,
                timestamp: Date.now(),
              },
            })
          );
        }
        await Promise.all(promises);
      },
      2000
    );

    // Generate final report
    console.log('\n📈 Collecting final statistics...');
    const activityCount = await Activity.countDocuments();
    const userCount = await User.countDocuments();
    const productCount = await Product.countDocuments();

    console.log(`\n📋 Test Summary:`);
    console.log(`   Total Activities Logged: ${activityCount}`);
    console.log(`   Total Users Created: ${userCount}`);
    console.log(`   Total Products Created: ${productCount}`);

    monitor.report();
  } catch (error) {
    console.error('❌ Performance test failed:', error);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    if (mongod) {
      await mongod.stop();
    }
    console.log('\n🏁 Performance tests completed');
  }
}

// Run with garbage collection if available
if (process.argv.includes('--expose-gc')) {
  console.log('🗑️  Garbage collection enabled');
} else {
  console.log('💡 Run with --expose-gc for more accurate memory measurements');
}

runPerformanceTests().catch(console.error);
