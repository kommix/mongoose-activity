/**
 * Express Middleware Integration
 * Run: npm install express && node examples/07-middleware.js
 */

const mongoose = require('mongoose');
const { activityPlugin, activityContextMiddleware, logActivity, Activity } = require('@kommix/mongoose-activity');
const { connect, cleanup } = require('./setup');

async function run() {
  await connect();

  try {
    const express = require('express');
    const app = express();
    app.use(express.json());

    // Mock auth middleware
    app.use((req, res, next) => {
      req.user = { id: new mongoose.Types.ObjectId() };
      req.headers['x-request-id'] = `req-${Date.now()}`;
      next();
    });

    // Add activity context middleware
    app.use(activityContextMiddleware({
      extractUserId: (req) => req.user?.id,
      extractRequestId: (req) => req.headers['x-request-id']
    }));

    // API route
    app.post('/api/action', async (req, res) => {
      // Context is automatically included
      await logActivity({
        entity: { type: 'api', id: new mongoose.Types.ObjectId() },
        type: 'api_action',
        meta: { endpoint: req.path }
      });
      res.json({ success: true });
    });

    const server = app.listen(3000);
    console.log('Server running on port 3000');

    // Test API
    const response = await fetch('http://localhost:3000/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('API response:', await response.json());

    // Check activity
    const activity = await Activity.findOne({ type: 'api_action' });
    console.log('\nLogged activity with context:');
    console.log('- User ID:', activity.userId);
    console.log('- Request ID:', activity.meta?.requestId);

    server.close();
  } catch (error) {
    console.log('Note: Install express to run this example');
    console.log('npm install express');
  }

  await cleanup();
}

run().catch(console.error);