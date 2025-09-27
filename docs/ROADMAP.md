# Roadmap

Help us make this library even better! Here are the features we're considering for future releases.

**Status Legend:**
- `[x]` = Done
- `[~]` = In progress
- `[ ]` = Planned

## v1.x - Current Focus (Stable)
- [x] **🎯 Core CRUD Tracking** - Automatic create/update/delete activity logging
- [x] **⚡ Async Logging** - Fire-and-forget performance mode
- [x] **⏰ TTL Cleanup** - Automatic retention management with prune API
- [x] **🧪 90%+ Test Coverage** - Comprehensive test suite
- [x] **📚 Production Documentation** - Complete API docs, examples, benchmarks
- [ ] **🐛 Ongoing Maintenance** - Bug fixes and performance improvements

## v2.0 - Advanced Enterprise Features
- [ ] **📡 Change Streams Integration** - Capture all DB changes (even bypassing Mongoose) for bulletproof microservice audit trails
- [ ] **🔐 Compliance Mode** - Strict mode with synchronous logging, full document snapshots, and zero-tolerance error handling
  - *Targets standards like HIPAA, SOC2, GDPR — with immutable logs and guaranteed write consistency*
- [ ] **📊 Analytics Helpers** - Built-in aggregation functions (`Activity.aggregateByType()`) for easy reporting and dashboard creation
- [ ] **🔄 Schema Migration Tools** - Utilities for migrating existing activity data when schemas change

## v2.1 - Developer Experience
- [ ] **🧪 Enhanced Testing Matrix** - Full compatibility testing across Mongoose 7/8 and Node.js LTS versions
- [ ] **🎨 Activity Visualization** - Optional web dashboard for browsing activity feeds and analytics
  - *Will be a separate package (`mongoose-activity-dashboard`) to keep core dependency-light*
- [ ] **📦 Framework Integrations** - First-class support for NestJS, Fastify, and other Node.js frameworks
- [ ] **🌍 Community Plugins** - Showcase and support ecosystem extensions (e.g. adapters, exporters, custom visualizations)

## Community Contributions Welcome!
We welcome contributions for any of these features. See our [Contributing Guide](../CONTRIBUTING.md) for details on how to get started.

**Looking to build compliance features or visual dashboards?** Reach out — we'd love collaborators for v2.x!

> 💡 **Have ideas?** Open an issue to discuss new features or improvements!