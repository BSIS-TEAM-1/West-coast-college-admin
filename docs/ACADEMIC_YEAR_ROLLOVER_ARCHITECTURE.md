# Academic Year Rollover Architecture

This document defines the system architecture for Academic Year Rollover using an Immutable Historical Records pattern. It is intended for engineering, QA, registrar operations, and capstone documentation. It describes both the target design and how it maps to the current codebase.

## Core Design Pattern: Immutable Data

Historical academic records must never be updated, overwritten, or deleted. Instead of modifying existing records, the system creates new records while preserving previous ones as read-only historical snapshots.

Think of the database as a **timeline**, not a single state.

```
Student
      │
      ├──────────────┐
      │              │
Enrollment      Enrollment
2024-2025       2025-2026
(Read Only)     (Read Only)
                     │
                     ▼
              Enrollment
              2026-2027
              (Active)
```

The student moves forward. History never changes.

## Data Mutation Rule

The system follows one simple rule:

> **Never Update History. Always Create New Records.**

| Forbidden | Correct |
| --- | --- |
| Year 1 → `UPDATE` → Year 2 | Year 1 → Keep Record → Create New Year 2 Record |

Historical records are immutable. Only the newest enrollment is active.

## Database Philosophy

The system should behave like Git. Git never overwrites commits — it creates new commits while preserving history. Apply the same principle to enrollments:

```
Enrollment v1 → Enrollment v2 → Enrollment v3 → Enrollment v4
```

Each enrollment is a permanent historical record representing one academic year.

## Current State vs. Target State

| Concern | Current State | Target State |
| --- | --- | --- |
| Enrollment versioning | `Enrollment` model has `schoolYear`, `semester`, and `isCurrent` flag; one record per student per term (`admin/server/models/Enrollment.js`) | Same structure, plus records become locked (read-only) once status is `Completed`, `Retained`, or `Graduated` |
| Enrollment mutability | Enrollments remain mutable at all times (grades, payments, subjects can be edited on any record) | Completed enrollments reject all writes at the model layer (pre-save/pre-update guard) |
| Block versioning | `BlockGroup` is already scoped per `semester` + `year` with unique index `name+semester+year` (`admin/server/models/BlockGroup.js`) | Blocks are never renamed/recycled across school years; new blocks are created per school year; old blocks archived |
| Global school year | `SystemSetting` key stores the current school year/semester (`admin/server/models/SystemSetting.js`) | Rollover updates this setting as its final committed step |
| Student lifecycle | `Student.lifecycleStatus` enum: Pending / Enrolled / Not Enrolled / Dropped / Inactive / Graduated | Unchanged; lifecycle is per-student, enrollment status is per-year |
| Rollover engine | Does not exist | Transactional rollover service (see algorithm below) |
| Archive snapshots | `Document`/`DocumentFolder` used for general documents | Dedicated append-only snapshot entries generated automatically during rollover |
| Audit trail | `AuditLog` and `BlockActionLog` exist for security/block events | Every promotion, retention, graduation, and rollover action logged with before/after references |

## School Year Rollover Algorithm

When the Registrar creates a new school year, the entire operation runs inside a single database transaction:

```
Start Transaction
      ↓
Archive Current School Year
      ↓
Generate New School Year
      ↓
Duplicate Academic Structure (blocks, sections)
      ↓
Evaluate Students (grades, approvals)
      ↓
Create New Enrollment Records
      ↓
Generate Archive Snapshots
      ↓
Commit Transaction
```

**If any step fails → Rollback Everything.** No partial rollover may ever occur.

Implementation notes:

- Use a MongoDB session with `withTransaction` (requires replica set / Atlas).
- The rollover service should be idempotent: re-running a failed rollover must not duplicate records.
- The `SystemSetting` current school year is only updated inside the same transaction, as the last write.

## Student Promotion Algorithm

For every active enrollment:

```
IF  Grades Complete
AND Passed
AND Registrar Approved
THEN
    Current Enrollment
          ↓
    Status = Completed
          ↓
    Lock Record
          ↓
    Create New Enrollment
          ↓
    Year Level + 1
          ↓
    Assign New Block
          ↓
    Status = Enrolled
```

The previous enrollment must never be modified again after completion.

## Failed Student (Retention) Algorithm

```
Current Enrollment
      ↓
Status = Retained
      ↓
Create New Enrollment
      ↓
Same Year Level
      ↓
Assign New Block
      ↓
Status = Enrolled
```

**Note:** Even retained students receive a NEW enrollment. The old record is closed and locked, never edited.

## Graduation Algorithm

```
IF  Year Level = Final
AND Curriculum Complete
THEN
    Current Enrollment
          ↓
    Status = Graduated
          ↓
    Student.lifecycleStatus = Graduated
          ↓
    DO NOT CREATE NEW ENROLLMENT
```

Graduation terminates the enrollment chain.

## Block Versioning Technique

Treat blocks as versioned objects. **Never recycle a block.**

| Wrong | Correct |
| --- | --- |
| `BSIS-1A` → Rename → `BSIS-2A` | 2024-2025 `BSIS-1A` (Archived) → Create 2025-2026 `BSIS-1A` (New Freshmen) → Create 2025-2026 `BSIS-2A` (Promoted Students) |

Blocks belong to a **school year**, not to students. The existing `BlockGroup` unique index (`name + semester + year`) already enforces per-year scoping; rollover must create new `BlockGroup`/`BlockSection` documents for the new year rather than mutating old ones.

## Document Archive Technique

Treat the Document Archive as an **append-only event log** of academic snapshots. Never use it as file storage.

Every rollover automatically generates archive entries:

```
School Year Closed
      ↓
Enrollment Snapshot
      ↓
Promotion Report
      ↓
Graduation Report
      ↓
Retention Report
      ↓
Block Snapshot
      ↓
Audit Log
      ↓
Store in Archive (read-only)
```

### Important Constraint

The Document Archive is **NOT** the Student Documents module.

| Wrong (do not put in Document Archive) | Correct (Document Archive contents) |
| --- | --- |
| Birth Certificate | Academic Reports |
| Medical Record | Enrollment Snapshots |
| Good Moral Certificate | Promotion Reports |
| Student ID | Graduation Reports |
| Transcript PDF | Block Snapshots |
| | Audit Reports |

Personal files belong inside **Student Profile → Documents**, not the Document Archive.

## Snapshot Technique

Instead of referencing live data forever, generate immutable snapshots.

Example:

```
Promotion Report
Generated: May 30, 2026
Contains: 421 Students
      ↓
Never Changes
```

Even if students later change blocks, the report still represents the exact state of the system on the day it was generated. Snapshots store denormalized copies of the data (not live references), so they remain accurate forever.

## UI Separation Principles

Never show archived data together with active data. Each module has a single responsibility:

| Module | Shows |
| --- | --- |
| Students (Student Management) | Current enrollment only — active records |
| Student Profile → Academic Timeline | Per-year history: 2024-2025, 2025-2026, 2026-2027 ... |
| Document Archive | Reports, snapshots, logs, generated PDFs |
| Student Profile → Documents | Personal student files |

## Final Implementation Principles

1. **Immutable Historical Data** — Once an enrollment, block, or archived report is completed, it becomes read-only and is never overwritten.
2. **Append-Only Workflow** — Every promotion, retention, or graduation creates new records instead of modifying historical ones.
3. **Versioned Academic Structure** — School years and blocks are versioned by academic year. Blocks are recreated for each new school year rather than renamed or reused.
4. **Transactional Rollover** — The entire academic year rollover runs inside a single database transaction. If any step fails, all changes are rolled back.
5. **Snapshot-Based Archiving** — The Document Archive stores immutable snapshots and reports generated during rollover, not personal student files.
6. **Separation of Concerns** — Student Profiles, Enrollments, Blocks, School Years, and Document Archive are independent modules with clearly defined responsibilities.
7. **Complete Auditability** — Every promotion, retention, graduation, and rollover action is logged with timestamps, the initiating user, affected records, and before/after references for full traceability.

## Suggested Implementation Roadmap

| Phase | Scope |
| --- | --- |
| 1 | Add immutability guards to `Enrollment` (reject writes when status is terminal: Completed / Retained / Graduated) |
| 2 | Add `Retained` and `Graduated` to the `Enrollment.status` enum; add `lockedAt` / `lockedBy` fields |
| 3 | Build the transactional rollover service (`server/services/academicYearRolloverService.js`) implementing the algorithm above |
| 4 | Add snapshot generation (enrollment/promotion/graduation/retention/block snapshots) written to the Document Archive |
| 5 | Registrar UI: "Close School Year" wizard with evaluation review, dry-run preview, and confirmation |
| 6 | Student Profile: Academic Timeline tab showing per-year enrollment history (read-only) |
| 7 | Audit logging for all rollover actions with before/after references |

## System Invariants

These are non-negotiable rules enforced by the system. They must always be true.

### Enrollment

- A student may have many enrollments.
- A student may have only ONE active enrollment.
- Historical enrollments are immutable.
- Completed enrollments cannot be edited.
- Retained enrollments cannot be edited.
- Graduated enrollments cannot be edited.

### School Year

- Only one School Year may be Active.
- Archived School Years are read-only.
- Archived School Years cannot accept new enrollments.

### Block

- Blocks belong to exactly one School Year.
- Blocks cannot be moved between School Years.
- Archived Blocks cannot receive new students.

### Document Archive

- Document Archive is append-only.
- Archived reports cannot be edited.
- Archived reports cannot be deleted through the UI.
- Student personal files must never appear inside Document Archive.

### Student

- Student profile is permanent.
- Promotion creates a new Enrollment.
- Graduation ends the enrollment chain.

## Forbidden Operations

The following operations are prohibited.

| Forbidden | Reason |
| --- | --- |
| ❌ UPDATE enrollment.yearLevel | Year level is immutable per enrollment record |
| ❌ UPDATE enrollment.blockId | Block assignment is immutable per enrollment record |
| ❌ UPDATE enrollment.schoolYear | School year is immutable per enrollment record |
| ❌ Rename archived blocks | Blocks are versioned per school year |
| ❌ Reuse archived blocks | New blocks must be created for each school year |
| ❌ Delete historical enrollments | Historical records are permanent |
| ❌ Delete archived reports | Archive is append-only |
| ❌ Store Birth Certificate inside Document Archive | Personal files belong in Student Profile → Documents |
| ❌ Store Good Moral inside Document Archive | Personal files belong in Student Profile → Documents |
| ❌ Store Medical Records inside Document Archive | Personal files belong in Student Profile → Documents |

**Always create new records instead.**

## Required Operations

### Promotion

```
Current Enrollment
      ↓
Lock
      ↓
Create New Enrollment
      ↓
Assign New Block
      ↓
Set Active
```

### Retention

```
Current Enrollment
      ↓
Lock
      ↓
Create New Enrollment
      ↓
Same Year Level
      ↓
Assign Block
```

### Graduation

```
Current Enrollment
      ↓
Lock
      ↓
Graduate Student
      ↓
Stop Enrollment Chain
```

## Database Constraints

### Students

- `currentEnrollmentId` must reference an Active Enrollment.

### Enrollments

- **Unique**: `(studentId, schoolYearId)` — A student cannot enroll twice in one School Year.

### Blocks

- **Unique**: `(courseId, yearLevel, section, schoolYearId)` — No duplicate blocks within the same school year.

### Document Archive

- Archive entries are immutable.

### Audit Logs

- Never deleted.
- Never edited.

## Enrollment State Machine

```
Pending
   ↓
Enrolled
   ↓
Completed → LOCKED

OR

Enrolled
   ↓
Retained → LOCKED

OR

Enrolled
   ↓
Graduated → LOCKED

OR

Enrolled
   ↓
Dropped → LOCKED
```

**Once locked: No Edit · No Delete · Read Only**

## Event-Driven Architecture

Instead of directly generating snapshots, the system emits events that listeners handle independently:

```
SchoolYearClosed
      ↓
EVENT: AcademicYearClosed
      ↓
Listener → Generate Promotion Report
Listener → Generate Graduation Report
Listener → Generate Enrollment Snapshot
Listener → Generate Audit Report
Listener → Store in Document Archive
```

This makes the system extensible — new listeners can be added without modifying the rollover service.

## Failure Recovery

If rollover fails:

- ✅ Rollback Transaction
- ✅ No School Year becomes Active
- ✅ No Student is Promoted
- ✅ No Block is Created
- ✅ No Snapshot is Generated
- ✅ No Archive is Written
- ✅ Return detailed error

**System remains unchanged.** The MongoDB `withTransaction` session ensures atomicity — either all writes commit or none do.

## Acceptance Criteria

The implementation is complete when:

- ✓ Historical enrollments cannot be edited.
- ✓ Promotion creates a new enrollment.
- ✓ Retention creates a new enrollment.
- ✓ Graduation creates no new enrollment.
- ✓ Blocks are recreated every School Year.
- ✓ Archived blocks cannot receive students.
- ✓ Document Archive contains only generated reports.
- ✓ Student Documents contains personal files.
- ✓ Only one Active School Year exists.
- ✓ Rollback restores the database after any failure.
- ✓ Audit Logs are generated for every rollover action.
- ✓ Academic Timeline displays every enrollment chronologically.
- ✓ Historical reports never change after generation.

## Business Rules

These rules define the registrar's operational constraints. Developers must not guess edge cases — follow these rules explicitly.

### BR-001 Active Enrollment

A student may only have ONE active enrollment.

Attempting to create a second active enrollment must fail.

---

### BR-002 Promotion Eligibility

A student can only be promoted when:

- All required grades are submitted.
- No INC subjects remain.
- No pending disciplinary hold.
- Registrar has approved promotion.

---

### BR-003 Retention

If promotion requirements are not met:

- Create a NEW enrollment.
- Same Year Level.
- Previous enrollment becomes **Retained (Locked)**.

---

### BR-004 Graduation

Students reaching the final curriculum year AND completing all requirements shall **Graduate** without creating another enrollment.

---

### BR-005 School Year

Exactly ONE School Year is Active.

Creating a new Active School Year automatically archives the previous one.

---

### BR-006 Block Assignment

Students can only be assigned to Blocks belonging to their Enrollment's School Year.

Cross-year assignments are prohibited.

---

### BR-007 Enrollment Editing

Only Active Enrollments may be edited.

Completed, Retained, Graduated, and Dropped enrollments are read-only.

---

### BR-008 Document Archive

Document Archive accepts **ONLY** system-generated reports.

User-uploaded files are rejected.

---

### BR-009 Student Documents

Birth Certificate, Good Moral, Medical Certificate, Transcript, and Student ID must only exist inside **Student Profile**.

---

### BR-010 Rollback

If any rollover step fails, the entire transaction must rollback.

No partial data may remain.

## API Contracts

The following endpoints define the academic year rollover API. Existing routes are marked with their current path; planned routes are marked `(planned)`.

### Rollover

| Method | Endpoint | Status | Description |
| --- | --- | --- | --- |
| POST | `/api/rollover/preview` | ✅ Existing | Dry-run evaluation of the closing school year (read-only) |
| POST | `/api/rollover/execute` | ✅ Existing | Transactional school year rollover |
| POST | `/api/academic-year/approve` | `(planned)` | Registrar approves promotion/retention/graduation decisions before execution |
| POST | `/api/academic-year/cancel` | `(planned)` | Cancel a pending rollover batch before commit |

#### POST `/api/rollover/preview`

**Request:**
```json
{
  "fromSchoolYear": "2025-2026",
  "toSchoolYear": "2026-2027",
  "semester": "1st"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "fromSchoolYear": "2025-2026",
    "toSchoolYear": "2026-2027",
    "semester": "1st",
    "students": [
      {
        "studentId": "...",
        "studentNumber": "2025-101-001",
        "name": "Juan Dela Cruz",
        "course": 101,
        "yearLevel": 1,
        "currentEnrollmentStatus": "Enrolled",
        "recommendedAction": "promote",
        "subjectsCount": 8,
        "hasIncGrades": false
      }
    ],
    "summary": { "promote": 400, "retain": 15, "graduate": 6, "skip": 0 }
  }
}
```

#### POST `/api/rollover/execute`

**Request:**
```json
{
  "fromSchoolYear": "2025-2026",
  "toSchoolYear": "2026-2027",
  "semester": "1st",
  "decisions": [
    { "studentId": "...", "action": "promote" },
    { "studentId": "...", "action": "retain" },
    { "studentId": "...", "action": "graduate" }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "rolloverBatchId": "rollover-2026-2027-1st-...",
    "promoted": [...],
    "retained": [...],
    "graduated": [...],
    "skipped": [...],
    "failures": [],
    "snapshotId": "..."
  }
}
```

**Response (500 on failure):**
```json
{
  "error": "Failed to execute rollover. All changes were rolled back.",
  "failures": [...]
}
```

### Snapshots & Reports

| Method | Endpoint | Status | Description |
| --- | --- | --- | --- |
| GET | `/api/rollover/snapshots` | ✅ Existing | List immutable archive snapshots (filterable by schoolYear, type) |
| GET | `/api/rollover/snapshots/:id` | ✅ Existing | Fetch a single snapshot with its full payload |

#### GET `/api/rollover/snapshots`

**Query Parameters:** `schoolYear`, `type`, `limit`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "type": "enrollment-snapshot",
      "schoolYear": "2025-2026",
      "generatedAt": "2026-05-30T...",
      "recordCount": 421
    }
  ]
}
```

#### GET `/api/rollover/snapshots/:id`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "type": "enrollment-snapshot",
    "schoolYear": "2025-2026",
    "payload": { ... },
    "generatedAt": "2026-05-30T...",
    "generatedBy": "..."
  }
}
```

### Student Timeline

| Method | Endpoint | Status | Description |
| --- | --- | --- | --- |
| GET | `/api/registrar/students/:id/enrollments` | ✅ Existing | Full enrollment history for a student (chronological) |
| GET | `/api/students/:id/timeline` | `(planned)` | Unified academic timeline combining enrollments, lifecycle events, and audit logs |

#### GET `/api/registrar/students/:id/enrollments`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "schoolYear": "2025-2026",
      "semester": "1st",
      "yearLevel": 1,
      "status": "Completed",
      "isCurrent": false,
      "lockedAt": "2026-05-30T...",
      "subjects": [...],
      "assessment": { ... },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### Document Archive

| Method | Endpoint | Status | Description |
| --- | --- | --- | --- |
| GET | `/api/document-archive` | `(planned)` | List archived reports and snapshots (filterable by type, schoolYear) |
| GET | `/api/document-archive/:id` | `(planned)` | Fetch a single archived report with its full payload |

### Authentication & Authorization

All rollover endpoints require:
- `Authorization: Bearer <token>` header
- Authenticated user with `admin` or `registrar` role
- Middleware: `authMiddleware` + `requireBlockManagementRole`

## Sequence Diagram

```
Registrar                    System                     Database
    │
    ▼
Close School Year
    │
    ▼
Validate Grades
    │
    ▼
Preview Promotion ──────► POST /api/rollover/preview
    │                         │
    │                         ▼
    │                    Evaluate students
    │                    (grades, INC, holds)
    │                         │
    │                    ◄───── Return preview
    │
    ▼
Review & Adjust Decisions
    │
    ▼
Approve
    │
    ▼
Execute Rollover ──────► POST /api/rollover/execute
    │                         │
    │                         ▼
    │                    Start Transaction
    │                         │
    │                    ├── Archive School Year
    │                    ├── Lock Old Enrollments
    │                    │     (set lockedAt, status = terminal)
    │                    ├── Create New Blocks
    │                    │     (BlockGroup + BlockSection per course/year)
    │                    ├── Create New Enrollments
    │                    │     (isCurrent = true, previousEnrollmentId = old._id)
    │                    ├── Assign Students to New Blocks
    │                    ├── Generate Reports & Snapshots
    │                    │     (ArchiveSnapshot, append-only)
    │                    ├── Write Audit Logs
    │                    ├── Update Current School Year
    │                    │     (SystemSetting, last write in transaction)
    │                    └── Commit Transaction
    │                         │
    │                    ◄───── Return result
    │                         │
    ▼                         ▼
Success                   Transaction Committed
    │
    ▼
View Results & Snapshots
```

**If any step fails → Rollback Everything.** No partial data may remain.

## Related Documents

- `docs/APPLICANT_ENROLLMENT_PROCESS.md` — applicant onboarding flow
- `docs/STUDENT_CREATION_TO_BLOCK_ASSIGNMENT_PROCESS.md` — student creation and block assignment
- `docs/REGISTRAR_API.md` — registrar API reference
