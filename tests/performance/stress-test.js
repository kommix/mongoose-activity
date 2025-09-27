/**
 * Stress Testing Suite for Edge Cases
 * Run: node tests/performance/stress-test.js
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { activityPlugin, logActivity, activityConfig } = require('../../dist/index.js');

class StressTestRunner {
  constructor() {
    this.results = [];
    this.errors = [];
  }

  async stress(name, testFn, options = {}) {
    const {
      iterations = 1000,
      concurrency = 10,
      timeout = 30000
    } = options;

    console.log(`\n🔥 Stress Test: ${name}`);
    console.log(`   Iterations: ${iterations}, Concurrency: ${concurrency}`);

    const start = process.hrtime.bigint();
    const memBefore = process.memoryUsage();

    try {
      const batches = [];
      const batchSize = Math.ceil(iterations / concurrency);

      for (let i = 0; i < concurrency; i++) {
        const batchPromise = (async () => {
          const batchResults = [];
          const startIdx = i * batchSize;
          const endIdx = Math.min(startIdx + batchSize, iterations);

          for (let j = startIdx; j < endIdx; j++) {
            try {
              const result = await testFn(j);
              batchResults.push(result);
            } catch (error) {
              this.errors.push({ test: name, iteration: j, error: error.message });
            }
          }
          return batchResults;
        })();

        batches.push(batchPromise);
      }

      await Promise.all(batches);

      const end = process.hrtime.bigint();
      const memAfter = process.memoryUsage();
      const duration = Number(end - start) / 1000000;

      const result = {
        name,
        iterations,
        concurrency,
        duration,
        throughput: (iterations / duration) * 1000,
        memoryDelta: memAfter.heapUsed - memBefore.heapUsed,
        errors: this.errors.filter(e => e.test === name).length
      };

      this.results.push(result);
      console.log(`   ✅ Completed in ${duration.toFixed(2)}ms`);
      console.log(`   📊 Throughput: ${result.throughput.toFixed(0)} ops/sec`);
      console.log(`   🧠 Memory delta: ${(result.memoryDelta / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   ⚠️  Errors: ${result.errors}`);

    } catch (error) {
      console.log(`   ❌ Test failed: ${error.message}`);
      this.errors.push({ test: name, error: error.message });
    }
  }

  report() {
    console.log('\n' + '=' .repeat(80));
    console.log('🔥 STRESS TEST SUMMARY');
    console.log('=' .repeat(80));

    this.results.forEach(result => {
      console.log(`\n📈 ${result.name}:`);
      console.log(`   Iterations: ${result.iterations.toLocaleString()}`);
      console.log(`   Duration: ${result.duration.toFixed(2)}ms`);
      console.log(`   Throughput: ${result.throughput.toFixed(0)} ops/sec`);
      console.log(`   Memory: ${(result.memoryDelta / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Errors: ${result.errors}/${result.iterations} (${((result.errors/result.iterations)*100).toFixed(2)}%)`);
    });

    if (this.errors.length > 0) {
      console.log(`\n⚠️  Total Errors: ${this.errors.length}`);
      const errorSample = this.errors.slice(0, 5);
      errorSample.forEach(e => {
        console.log(`   - ${e.test}: ${e.error}`);
      });
      if (this.errors.length > 5) {
        console.log(`   ... and ${this.errors.length - 5} more`);
      }
    }

    console.log('\n' + '=' .repeat(80));
  }
}

async function runStressTests() {
  console.log('🔥 Starting Stress Tests...\n');

  let mongod;
  const stress = new StressTestRunner();

  try {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    // Setup schema
    const testSchema = new mongoose.Schema({
      name: String,
      value: Number,
      data: mongoose.Schema.Types.Mixed,
      createdAt: { type: Date, default: Date.now }
    });

    testSchema.plugin(activityPlugin, {
      trackedFields: ['name', 'value', 'data'],
      collectionName: 'stress_tests'
    });

    const TestModel = mongoose.model('StressTest', testSchema);

    // Test 1: High-frequency document creation
    await stress.stress('High-Frequency Document Creation', async (i) => {
      return await TestModel.create({
        name: `Test Document ${i}`,
        value: i,
        data: { timestamp: Date.now(), random: Math.random() }
      });
    }, { iterations: 5000, concurrency: 50 });

    // Test 2: Rapid manual activity logging
    activityConfig.configure({ asyncLogging: true });
    await stress.stress('Rapid Manual Activity Logging', async (i) => {
      return await logActivity({
        userId: new mongoose.Types.ObjectId(),
        entity: { type: 'stress', id: new mongoose.Types.ObjectId() },
        type: 'rapid_test',
        meta: {
          iteration: i,
          payload: 'x'.repeat(50),
          timestamp: Date.now()
        }
      });
    }, { iterations: 10000, concurrency: 100 });

    // Test 3: Heavy concurrent updates
    const documents = await TestModel.find().limit(100);
    await stress.stress('Heavy Concurrent Updates', async (i) => {
      const doc = documents[i % documents.length];
      doc.value = Math.random() * 1000;
      doc.data.updateCount = (doc.data.updateCount || 0) + 1;
      return await doc.save();
    }, { iterations: 2000, concurrency: 20 });

    // Test 4: Bulk deletion stress
    await stress.stress('Bulk Deletion Stress', async (i) => {
      const batchSize = 50;
      const skip = i * batchSize;
      return await TestModel.deleteMany({}).skip(skip).limit(batchSize);
    }, { iterations: 20, concurrency: 5 });

    // Test 5: Large payload activities
    await stress.stress('Large Payload Activities', async (i) => {
      return await logActivity({
        userId: new mongoose.Types.ObjectId(),
        entity: { type: 'large_payload', id: new mongoose.Types.ObjectId() },
        type: 'large_data_test',
        meta: {
          iteration: i,
          largeData: 'x'.repeat(1000), // 1KB payload
          timestamp: Date.now(),
          nested: {
            deep: {
              structure: {
                with: 'lots of data '.repeat(100)
              }
            }
          }
        }
      });
    }, { iterations: 1000, concurrency: 10 });

    // Test 6: Memory pressure test
    await stress.stress('Memory Pressure Test', async (i) => {
      const promises = [];
      for (let j = 0; j < 10; j++) {
        promises.push(logActivity({
          userId: new mongoose.Types.ObjectId(),
          entity: { type: 'memory_test', id: new mongoose.Types.ObjectId() },
          type: 'memory_pressure',
          meta: {
            batch: i,
            subItem: j,
            data: Buffer.alloc(100, 'x').toString()
          }
        }));
      }
      return await Promise.all(promises);
    }, { iterations: 500, concurrency: 25 });

    // Test 7: Error resilience test
    await stress.stress('Error Resilience Test', async (i) => {
      // Intentionally cause some errors
      if (i % 10 === 0) {
        // Invalid userId
        return await logActivity({
          userId: 'invalid-id',
          entity: { type: 'error_test', id: new mongoose.Types.ObjectId() },
          type: 'error_test'
        });
      } else {
        return await logActivity({
          userId: new mongoose.Types.ObjectId(),
          entity: { type: 'error_test', id: new mongoose.Types.ObjectId() },
          type: 'success_test'
        });
      }
    }, { iterations: 1000, concurrency: 20 });

    // Final statistics
    const Activity = mongoose.model('Activity');
    const activityCount = await Activity.countDocuments();
    const testDocCount = await TestModel.countDocuments();

    console.log(`\n📊 Final Statistics:`);
    console.log(`   Total Activities: ${activityCount.toLocaleString()}`);
    console.log(`   Test Documents: ${testDocCount.toLocaleString()}`);
    console.log(`   Memory Usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`);

    stress.report();

  } catch (error) {
    console.error('❌ Stress test suite failed:', error);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  }
}

runStressTests().catch(console.error);