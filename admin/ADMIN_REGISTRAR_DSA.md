# Admin and Registrar Data Structures and Algorithms

This document summarizes the core data structures and algorithms used by your Admin and Registrar modules.

Scope used for this document:
- `admin/server/index.js`
- `admin/server/routes/registrarRoutes.js`
- `admin/server/controllers/studentController.js`
- `admin/server/controllers/blockController.js`
- `admin/server/controllers/subjectController.js`
- `admin/server/models/*.js`
- `admin/server/securityMiddleware.js`

## 1. System-Level Data Model

### 1.1 Admin module (core collections)

1. `Admin`
- Purpose: authentication identity and role (`admin`, `registrar`, `professor`).
- Key fields: `username`, `password` (bcrypt hash), `accountType`, `uid`, `status`.
- Indexing: unique username.

2. `AuthToken`
- Purpose: server-side token session store.
- Key fields: `token`, `adminId`, `accountType`, `expiresAt`, `ipAddress`, `isActive`.
- Data structure behavior:
  - TTL index on `expiresAt` for automatic expiry cleanup.
  - Token revocation by update (`isActive = false`).

3. `Announcement`
- Purpose: notice board items with media.
- Key fields: `title`, `message`, `type`, `targetAudience`, `isActive`, `isPinned`, `expiresAt`, `media[]`.
- Data structure behavior:
  - `media` is an array of embedded objects (`image`/`video` metadata).
  - `pre('find')` excludes expired announcements.

4. `Document`
- Purpose: document management repository.
- Key fields: `category`, `status`, `allowedRoles[]`, `tags[]`, `downloadCount`, `createdBy`.
- Data structure behavior:
  - text index on `title` + `description` for search.
  - role-based access list via `allowedRoles[]`.

5. `AuditLog`
- Purpose: immutable security and activity trace.
- Key fields: `action`, `resourceType`, `performedBy`, `status`, `severity`, `createdAt`.
- Data structure behavior:
  - append-only log entries.
  - indexed for filtering by actor/action/resource/severity/time.

### 1.2 Registrar module (core collections)

1. `Student`
- Purpose: student master record.
- Key fields: `studentNumber`, `course`, `yearLevel`, `semester`, `schoolYear`, `studentStatus`, `corStatus`.
- Data structure behavior:
  - pre-validate hook generates `studentNumber` if missing.
  - denormalized fields for fast filtering (`course`, `yearLevel`, `status`).

2. `Subject`
- Purpose: curriculum subject catalog.
- Key fields: `code`, `title`, `units`, `course`, `yearLevel`, `semester`, `isActive`.
- Indexing:
  - unique `code`
  - compound `(course, yearLevel, semester, isActive)`.

3. `Enrollment`
- Purpose: per-term enrollment snapshot.
- Key fields: `studentId`, `schoolYear`, `semester`, `subjects[]`, `assessment`, `status`, `isCurrent`.
- Data structure behavior:
  - embedded `subjects[]` array for per-subject schedule/instructor/grade state.
  - pre-save computes totals/balance/payment status.
  - ensures only one current enrollment per student.

4. `BlockGroup`
- Purpose: logical block per term/year (with capacity policies).
- Key fields: `name`, `semester`, `year`, `policies`.
- Indexing:
  - unique `(name, semester, year)`.

5. `BlockSection`
- Purpose: sections under a block group.
- Key fields: `blockGroupId`, `sectionCode`, `capacity`, `currentPopulation`, `status`.
- Indexing:
  - unique `(blockGroupId, sectionCode)`.

6. `StudentBlockAssignment`
- Purpose: student-to-section assignment by term.
- Key fields: `studentId`, `sectionId`, `semester`, `year`, `status`.
- Indexing:
  - unique `(studentId, semester, year)` to prevent duplicate term assignment.

7. `SectionWaitlist`
- Purpose: overflow queue for sections.
- Key fields: `studentId`, `sectionId`, `priority`, `addedAt`.
- Data structure behavior:
  - priority ordering via indexed `(sectionId, priority)`.

8. `BlockActionLog`
- Purpose: audit trail for block operations.
- Key fields: `actionType`, `sectionId`, `studentId`, `registrarId`, `timestamp`, `details`.

## 2. In-Memory Data Structures

### 2.1 Admin-side in-memory structures

1. `Map` lockout stores in `index.js`
- `loginAttemptStateByIp`
- `loginAttemptStateByUsername`
- `loginAttemptStateByDevice`

Each map value:
```text
{
  failedAttempts: number,
  lockoutStep: number,
  lockoutCount: number,
  lockoutUntil: epochMs,
  lastAttemptAt: epochMs
}
```

2. Constant arrays
- `LOGIN_LOCKOUT_STEPS_MS = [1m, 5m, 10m]` for escalating lockout duration.

### 2.2 Registrar-side in-memory structures

1. `Set` and `Map` in block/student controllers
- `Set` for deduplicating IDs.
- `Map` for fast lookup:
  - assignment by student ID
  - grouped count maps after aggregation.

2. Arrays used with `filter/map/sort/reduce`
- filtering assignable students
- sorting sections by available capacity
- reducing totals for units and fee computations
- transforming enrollment subjects.

## 3. Core Algorithms

### 3.1 Admin algorithms

### A. Login with multi-factor lockout and session control
File: `admin/server/index.js`

High-level steps:
1. Validate/sanitize input.
2. Check if client IP is blocked.
3. Evaluate lockout state across factors: IP, username, device.
4. If locked, return `429`.
5. Verify account + password.
6. On failed login:
   - increment failed counter per factor
   - trigger lockout after threshold
   - escalate lockout duration by step array.
7. On success:
   - clear lockout states for all factors
   - create `AuthToken`
   - revoke active sessions from other IPs
   - write audit logs.

Pseudo:
```text
for factor in [ip, username, device]:
  state = map[factor]
  if state.failedAttempts + 1 >= MAX:
    lockoutUntil = now + LOCKOUT_STEPS[state.lockoutStep]
    state.failedAttempts = 0
    state.lockoutStep = min(step + 1, maxStep)
  else:
    state.failedAttempts += 1
```

### B. Announcement retrieval with pagination/filter
File: `admin/server/index.js`

High-level steps:
1. Build filter from query params (`type`, `targetAudience`, `status`).
2. Query with sort `createdAt DESC`.
3. Apply `limit` + `skip` pagination.
4. Return total pages using `countDocuments`.

### C. Account creation with uniqueness enforcement
File: `admin/server/index.js`

High-level steps:
1. Validate request schema.
2. Check duplicate `username`.
3. Check duplicate `uid`.
4. Create new `Admin`.
5. Persist and write audit log.

### 3.2 Registrar algorithms

### A. Student creation and normalization
File: `admin/server/controllers/studentController.js`

High-level steps:
1. Guard duplicate email.
2. Normalize optional fields and enum defaults.
3. Enforce allowed student statuses.
4. Save student.
5. `Student` pre-validate hook auto-generates `studentNumber` if missing.

### B. Enrollment creation
Files:
- `admin/server/controllers/studentController.js`
- `admin/server/models/Enrollment.js`

High-level steps:
1. Check required inputs (`schoolYear`, `semester`, `subjectIds`).
2. Prevent duplicate active enrollment for same student/term.
3. Map `subjectIds` to embedded subject entries.
4. Compute tuition + misc + total.
5. Save enrollment.
6. Pre-save hook recalculates balance and payment status.

### C. Block group and section canonicalization
File: `admin/server/controllers/blockController.js`

High-level steps:
1. Parse course + slot from name (`101-1-A` style).
2. Normalize canonical block code.
3. Detect semantic duplicates in same term/year.
4. Create block group or section only if unique.

### D. Section assignment with over-capacity control (transactional)
File: `admin/server/controllers/blockController.js`

High-level steps:
1. Start DB transaction.
2. Ensure student has no existing assignment for term.
3. Validate section exists and is open.
4. Validate student course/year compatibility with block group.
5. If projected population exceeds capacity:
   - return suggested sections and allowed conflict actions.
6. Else:
   - insert assignment
   - increment section population
   - log action
   - commit.

### E. Suggested section ranking
File: `admin/server/controllers/blockController.js`

High-level steps:
1. Load other open sections in same group.
2. Filter sections with free slots.
3. Compute `availableSlots = capacity - currentPopulation`.
4. Sort descending by available slots.

### F. Rebalancing by equal population
File: `admin/server/controllers/blockController.js`

Current implemented strategy:
1. Compute total students across sections.
2. Distribute with:
   - `base = floor(total / sectionCount)`
   - first `remainder` sections get `base + 1`.
3. Return preview payload (no physical reassignment yet).

### G. Unassign student from section (transactional consistency)
File: `admin/server/controllers/blockController.js`

High-level steps:
1. Start transaction.
2. Find active assignment for section/student/term.
3. Delete assignment.
4. Update student status (`Not Enrolled`, `Pending` COR).
5. Drop active enrollment states for matching term.
6. Recompute and update section `currentPopulation`.
7. Write block action log and commit.

### H. Instructor assignment to subject entries
File: `admin/server/controllers/studentController.js`

High-level steps:
1. Collect students assigned to a section.
2. Load their current enrollments.
3. For each enrollment, scan embedded `subjects[]`.
4. If subject ID matches target:
   - update `instructor`, `schedule`, `room`.
5. Save only changed enrollments.

## 4. Complexity Summary (Big-O)

Let:
- `n` = number of matching DB records
- `s` = number of sections in a block group
- `e` = number of enrollments scanned
- `u` = subjects per enrollment

| Operation | Complexity | Notes |
|---|---:|---|
| Login lockout map read/write | O(1) | Map operations on 3 factors |
| Account uniqueness checks | O(1) average | index-assisted lookup |
| Announcement page query | O(n) scan bound, index-optimized | plus skip/limit |
| Create student | O(1) average | one insert + validations |
| Enroll student | O(u) | subject mapping and fee reduce |
| Assign student to section | O(1) + DB calls | transactional operations |
| Suggested sections ranking | O(s log s) | sort by available slots |
| Rebalance equal population | O(s) | simple distribution |
| Assign instructor to section subjects | O(e * u) | nested loop |
| Unassign student from section | O(1) + DB calls | transactional with counts |

## 5. Current DSA Characteristics

1. Strong points
- Good use of indexes for frequent query paths.
- Transactional updates for critical block assignment flows.
- Clear separation of collections by bounded context.
- Security-oriented input sanitization and schema validation.

2. Tradeoffs
- Some operations rely on regex searching and array scans, which can grow expensive with very large datasets.
- Embedded `subjects[]` in `Enrollment` simplifies reads but increases update loop cost for bulk edits.
- Rebalancing currently returns preview only (algorithm exists, reassignment not yet applied).

## 6. Recommended Next Step (optional)

If you want, I can generate a second version of this file with:
1. UML/ER diagram blocks.
2. Flowchart per endpoint (`login`, `assign-student`, `unassign-student`).
3. Formal pseudocode section ready for thesis/capstone chapter format.
