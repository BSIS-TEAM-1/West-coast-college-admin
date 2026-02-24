# MongoDB Scalability Evaluation for WCC-Admin

## Answers to Questions
1. **MongoDB setup**: Local single node (XAMPP environment).
2. **Approx data size now (GB) + expected growth**: <1GB now; expected growth 10-50MB per month (based on college admin usage, occasional new students/enrollments).
3. **Peak users & peak concurrent requests**: Peak users ~50-100 (students, admins); peak concurrent requests ~5-10 (during enrollment periods).
4. **Top 3 collections + most frequent queries**:
   - Students: Frequent `find` by ID or number; `aggregate` for listings with filters.
   - Enrollments: Frequent `find` by student ID; `aggregate` for enrollment history.
   - Admins: Frequent `find` for auth checks.
5. **Indexes**: None yet.
6. **Write pattern**: Low; inserts/updates ~1-5 per minute (e.g., student creation, enrollment updates).
7. **File uploads**: No (static logo images in public folder, not GridFS).
8. **Backend stack + hosting**: Node.js/Express; hosted on Render (cloud platform).

## Main Scalability Risks (MongoDB + Backend)
- **MongoDB**: No indexes → slow queries on large collections; single node → no HA/replication; potential hot documents (e.g., frequent enrollment updates); data growth without partitioning.
- **Backend**: Cloud hosting on Render improves scalability over local, but still limited by no caching/connection pooling; potential for slow aggregates on enrollment history; partial rate limiting.

## Concrete Fixes
### Index Recommendations per Query Pattern
- Students: Compound index on `{studentNumber: 1, course: 1}` for lookups; `{createdAt: -1}` for sorting.
- Enrollments: Index on `{studentId: 1, status: 1}`; `{schoolYear: 1, semester: 1}` for filters.
- Admins: Index on `{username: 1}` for auth.
- Add indexes via `db.collection.createIndex()` in migrations.

### Pagination Strategy
- Use cursor-based pagination (MongoDB's `find().cursor()`) instead of `limit/skip` for large result sets (e.g., student listings). Example: `db.students.find().sort({_id: 1}).limit(10).cursor()`.

### Connection Pooling Settings
- In Mongoose: `mongoose.connect(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 })` to handle concurrent requests without exhausting connections.

### Schema Design Advice
- Embed small arrays (e.g., subjects in Enrollment); reference for large (e.g., StudentBlockAssignment). Avoid deep nesting to prevent doc growth issues.

### Read/Write Concerns
- Use read preference `secondaryPreferred` for replicas; set write concern `majority` for critical updates. Avoid large arrays in docs; cap enrollment history aggregates.

### Caching
- Cache frequent queries (e.g., student details) in Redis/Memory (if added); cache static assets with headers. Example: Use `express-rate-limit` for API endpoints.

### Rate Limiting + Request Validation
- Implement `express-rate-limit` (e.g., 100 req/min per IP); validate inputs with Joi/Mongoose schemas to prevent abuse.

## 3-Stage Scaling Roadmap
### Stage 1 (Small): Tune Queries + Indexes + Monitoring
- Add recommended indexes; enable MongoDB profiler (`db.setProfilingLevel(1)`); monitor slow queries (>100ms).
- Optimize aggregates (e.g., use `$match` early); add basic monitoring (e.g., PM2 for Node).

### Stage 2 (Medium): Replica Set + Read Prefs + Caching + Queue
- Set up MongoDB replica set (primary + 2 secondaries); use read prefs for reads.
- Add Redis for session/query caching; queue heavy writes (e.g., bulk enrollments) with Bull.js.

### Stage 3 (Large): Sharding + Partitioning + Archiving
- Shard on `{studentId: 1}` or `{schoolYear: 1}`; archive old enrollments to separate collection.
- Use Atlas for managed scaling; implement data partitioning.

## Checklist + Metrics to Watch
- [ ] Add indexes to top collections.
- [ ] Implement pagination and connection pooling.
- [ ] Set up monitoring (MongoDB logs, Node metrics).
- [x] Add rate limiting (partially implemented for asset fallbacks).
- [ ] Monitor: Slow queries (>100ms), CPU/RAM usage, ops/sec, active connections, replication lag (if replica).

## Recent Updates (February 2026)
- **Implemented Rate Limiting**: Added rate limiter for stale asset fallback (60 requests per minute) to prevent abuse on static assets.
- **Professor Dashboard Enhancements**: Added course and student data fetching, which may increase database load; monitor for performance impacts.
- **Current Scalability Rating**: Improved to 5/10. Cloud hosting on Render addresses local hosting bottleneck; no indexes or caching implemented yet, but rate limiting improves resilience against abuse.
