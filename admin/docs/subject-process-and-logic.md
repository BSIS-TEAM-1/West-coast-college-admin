# Subject Management & Assignment — Process and Logic

## Overview

This document describes the full lifecycle of subjects in the WCC Admin system: from catalog management through block-section assignment, student enrollment, instructor assignment, and professor grade entry. The subject system is the academic backbone connecting registrar operations, student enrollment records, and professor teaching loads.

### Core Principle

> Subjects are master catalog entries scoped by program, year level, and semester. They are assigned to block sections per academic term, embedded into student enrollment records, and linked to professors via instructor fields — all tracked through a single `Enrollment.subjects[]` array as the authoritative academic record.

```
Subject Catalog (master list)
  │ code, title, units, program, year level, semester
  │ versioned, archivable, delete-protected
  ▼
Block Subject Assignment (per term, per section)
  │ links active subjects to a block section for a specific term
  ▼
Enrollment (per student, per term)
  │ subjects[] embedded array — code, title, units, schedule, room, instructor, grade, status
  ▼
Professor View (per instructor)
  │ assigned blocks/subjects → class roster → grade entry
```

---

## 1. Subject Catalog (Master List)

### Schema

**File:** `server/models/Subject.js`

```js
{
  code:        { type: String, required: true, uppercase: true },   // e.g. "ENG101"
  version:     { type: Number, default: 1, min: 1 },                // versioning support
  supersededById: { type: ObjectId, ref: 'Subject', default: null },// old version pointer
  title:       { type: String, required: true },
  units:       { type: Number, required: true, min: 0.5, max: 6 },
  course:      { type: Number, enum: [101, 102, 103, 201] },        // program code
  yearLevel:   { type: Number, min: 1, max: 5 },
  semester:    { type: String, enum: ['1st', '2nd', 'Summer'] },
  isActive:    { type: Boolean, default: true },
  createdBy:   { type: ObjectId, ref: 'Admin' },
  updatedBy:   { type: ObjectId, ref: 'Admin' }
}
```

### Program Code Mapping

| Code | Program |
|------|---------|
| 101  | BEED — Bachelor of Elementary Education |
| 102  | BSED — Bachelor of Secondary Education (English) |
| 103  | BSED — Bachelor of Secondary Education (Math) |
| 201  | BSBA — Bachelor of Science in Business Administration (HRM) |

### Indexes

- **Unique compound:** `{ code: 1, version: 1 }` — prevents duplicate codes within the same version
- **Query index:** `{ course: 1, yearLevel: 1, semester: 1, isActive: 1 }` — fast filtering by program/term
- **Listing index:** `{ isActive: 1, code: 1 }` — sorted catalog views
- **Supersession index:** `{ supersededById: 1 }` — look up old versions

### Versioning

The Subject model supports versioned revisions via static methods:

- **`findLatestVersion(code)`** — returns the highest-version active subject for a given code
- **`findAllVersions(code)`** — returns all versions sorted newest-first
- **`createNewVersion(subjectId, updateData, updatedBy)`** — creates a new version, marks the old one as `isActive: false` and sets `supersededById` to the new version's `_id`

When a subject is revised, the old version is **not deleted** — it is superseded. This preserves historical enrollment references.

### CRUD Operations

**File:** `server/controllers/subjectController.js`

| Operation | Endpoint | Method | Key Logic |
|-----------|----------|--------|-----------|
| List | `/api/registrar/subjects` | GET | Filter by `course`, `yearLevel`, `semester`, `isActive`, text search on `code`/`title`. Sorted by `isActive` desc, then `code` asc. |
| Create | `/api/registrar/subjects` | POST | Validates `code` + `title` + `units`. Normalizes code to uppercase. Rejects duplicate codes (409). Stores `createdBy` from auth. |
| Update | `/api/registrar/subjects/:id` | PUT | Fetches by ID. If code changes, checks for duplicates excluding self. Updates fields selectively. Stores `updatedBy`. |
| Delete | `/api/registrar/subjects/:id` | DELETE | **Referential integrity check:** rejects deletion if any `Enrollment.subjects.subjectId` references it (409). Suggests archiving instead. |

### Archive vs Delete

- **Archive** = set `isActive: false` via PUT. The subject remains in the database and in historical enrollment records, but is excluded from active lists and assignment dropdowns.
- **Delete** = permanent removal. Blocked if enrollment references exist. Only safe for subjects never used in any enrollment.

### Route Registration

**File:** `server/routes/registrarRoutes.js`

```
GET    /registrar/subjects          → cache 60s
POST   /registrar/subjects          → invalidate subject + course-load caches
PUT    /registrar/subjects/:id      → invalidate subject + course-load caches
DELETE /registrar/subjects/:id      → invalidate subject + course-load caches
```

All subject routes require `admin` or `registrar` role. Rate-limited to 100 requests/minute per IP.

### Frontend — Subject Management Page

**File:** `src/pages/registrar/SubjectManagementPage.tsx`

- Three-step wizard: Create/Edit → Review → Finish
- Catalog table with search, status filter (active/archived/all), program filter, year filter, semester filter
- Actions per subject: Edit, Archive/Restore, Delete
- Fetches from `/api/registrar/subjects` with debounced search (180ms)

---

## 2. Block Subject Assignment

### Purpose

Links subjects from the catalog to a specific block section for a specific academic term. This is the registrar's way of saying "this block section will offer these subjects this semester."

### Schema

**File:** `server/models/BlockSubjectAssignment.js`

```js
{
  blockSectionId: { type: ObjectId, ref: 'BlockSection', required: true },
  subjectId:      { type: ObjectId, ref: 'Subject', required: true },
  semester:       { type: String, enum: ['1st', '2nd', 'Summer'], required: true },
  academicYear:   { type: String, required: true, match: /^\d{4}-\d{4}$/ },
  assignedBy:     { type: ObjectId, ref: 'Admin' },
  assignedAt:     { type: Date, default: Date.now }
}
```

**Unique compound index:** `{ blockSectionId, subjectId, semester, academicYear }` — prevents duplicate assignments within the same term.

### Controller Logic

**File:** `server/controllers/blockSubjectAssignmentController.js`

| Operation | Method | Key Logic |
|-----------|--------|-----------|
| List assignments | `getAssignments` | Filter by `blockSectionId`, `subjectId`, `semester`, `academicYear`. Populates subject, section, and assigner details. |
| Assign subjects | `assignSubjects` | Accepts `blockSectionId`, `subjectIds[]`, `semester`, `academicYear`. Validates section exists. Validates all subject IDs are active. Uses `insertMany` with `ordered: false` — silently skips duplicate-key errors (idempotent for re-assignments). Returns full assignment list for the section/term. |
| Remove assignment | `deleteAssignment` | Deletes by ID. Returns 404 if not found. |

### Routes

```
GET    /registrar/block-subject-assignments          → cache 20s
POST   /registrar/block-subject-assignments          → invalidate assignment + course-load + section caches
DELETE /registrar/block-subject-assignments/:id      → invalidate assignment + course-load + section caches
```

### Frontend — Assign Subject Page

**File:** `src/pages/registrar/AssignSubjectPage.tsx`

Three-step wizard:

1. **Select Block** — choose academic year, semester, program, year level → filtered block groups → block section
2. **Choose Subjects** — shows available (unassigned) active subjects filtered by program/year/semester; checkbox selection; shows already-assigned subjects with remove option
3. **Finish** — confirmation screen

Subject fetching for the assignment page queries `/api/registrar/subjects?course={course}&yearLevel={yearLevel}&semester={semester}` and filters to `isActive !== false`.

---

## 3. Student Enrollment with Subjects

### Enrollment Subjects Array

**File:** `server/models/Enrollment.js`

Each enrollment embeds a `subjects[]` array — this is the **authoritative academic record** for that student in that term:

```js
subjects: [{
  subjectId:    { type: ObjectId, ref: 'Subject', required: true },
  code:         { type: String, required: true },       // denormalized from Subject
  title:        { type: String, required: true },       // denormalized from Subject
  units:        { type: Number, required: true, min: 0.5, max: 6 },
  schedule:     { type: String, default: 'TBA' },
  room:         { type: String, default: 'TBA' },
  instructor:   { type: String, default: 'TBA' },       // professor username/displayName
  grade:        { type: Number, min: 1.0, max: 5.0, default: null },
  status:       { type: String, enum: ['Enrolled', 'Dropped', 'Completed', 'Incomplete', 'Removed'], default: 'Enrolled' },
  remarks:      { type: String },
  dateEnrolled: { type: Date, default: Date.now },
  dateModified: { type: Date, default: Date.now }
}]
```

### Why Denormalized?

The enrollment `subjects[]` array **denormalizes** `code`, `title`, and `units` from the Subject catalog at enrollment time. This ensures:

- **Historical immutability** — if a subject is later renamed or revised, old enrollment records retain their original code/title/units
- **Query performance** — no joins needed to render a student's transcript or schedule
- **Referential integrity** — the `subjectId` reference is preserved for lookups, but the display data is self-contained

### Enrollment Creation Flow

**File:** `server/controllers/studentController.js` — `createEnrollmentRecord()`

```
1. Receive subjectIds[] from request
2. mapSubjectIdsToEnrollmentSubjects(subjectIds)
   │ - Validates each ID as ObjectId
   │ - Fetches matching Subject documents (code, title, units)
   │ - Returns array of enrollment subject objects with denormalized fields
   │ - Falls back to "SUBJ-N" placeholder if subject not found
   ▼
3. Calculate totalUnits from mapped subjects
4. Calculate fees: tuitionFee = units × 1000, miscFee = 5000
5. Resolve curriculumId (by student.curriculumVersion or active curriculum)
6. Create Enrollment with embedded subjects[], assessment, curriculumId
7. Save and return enrollment
```

### Instance Methods

- **`addSubject(subjectData)`** — pushes a new subject entry to the `subjects[]` array and saves
- **`updateSubjectGrade(subjectId, grade, updatedBy)`** — finds a subject entry by its subdocument `_id`, sets the grade, updates `dateModified` and `updatedBy`

### Virtual Fields

- **`totalUnits`** — sum of units for subjects where `status !== 'Dropped'`
- **`totalGradePoints`** — sum of `units × grade` for graded subjects

### Indexes on Enrollment Subjects

- `{ 'subjects.subjectId': 1 }` — look up enrollments by subject
- `{ 'subjects.subjectId': 1, schoolYear: 1, semester: 1, status: 1 }` — term-scoped subject queries
- `{ 'subjects.instructor': 1, schoolYear: 1, semester: 1, status: 1 }` — professor course load queries

---

## 4. Instructor Assignment to Section Subjects

### Purpose

Assigns a professor (instructor) to a specific subject within a block section. This updates the `instructor` field on all matching `Enrollment.subjects[]` entries for students assigned to that section.

### Controller Logic

**File:** `server/controllers/studentController.js`

| Method | Endpoint | Logic |
|--------|----------|-------|
| `getSectionSubjectAssignments` | `GET /registrar/sections/:sectionId/subject-assignments` | Aggregates all `Enrollment.subjects[]` entries for students in the section, grouped by subjectId. Returns summary with student count per subject. |
| `assignSubjectInstructorToSection` | `POST/PUT /registrar/sections/:sectionId/subject-assignment` | Finds all enrollments for students in the section matching the target subjectId. Updates `instructor` field on each matching `subjects[]` entry. Calls `enrollment.markModified('subjects')` to ensure Mongoose detects the array-element change. Returns count of matched subject entries. |
| `clearSubjectInstructorForSection` | `DELETE /registrar/sections/:sectionId/subject-assignment/:subjectId` | Sets instructor back to `'TBA'` on matching enrollment subject entries. |

### Important Detail

The instructor field stores a **string identifier** (professor username or displayName), not an ObjectId. This means professor account renames require a migration to update enrollment records. The system includes a bulk update path in `server/index.js` that rewrites `subjects.instructor` across all enrollments when a professor's identifier changes.

---

## 5. Professor Subject View

### Assigned Blocks/Subjects

**Endpoint:** `GET /api/professor/assigned-blocks`

Queries all `Enrollment` documents where any `subjects[].instructor` matches the authenticated professor's identifier(s). Aggregates results by course → block → subject, including enrolled student counts.

### Class Roster

**Endpoint:** `GET /api/professor/sections/:sectionId/subjects/:subjectId/students`

Returns the student roster for a specific subject in a specific section, filtered by the professor's instructor identifier. Each student row includes:

- Student number, name, year level
- Subject entry ID, code, title
- Grade, status (Enrolled/Dropped/Completed)
- Schedule, room

### Grade Entry

**Endpoint:** `PUT /api/professor/sections/:sectionId/subjects/:subjectId/students/:studentId/grade`

Updates the `grade` field on a specific `Enrollment.subjects[]` entry. Validates:
- Section, subject, and student IDs are valid ObjectIds
- The enrollment belongs to the student
- The subject entry's instructor matches the authenticated professor
- Grade is within `1.0`–`5.0`

Uses `enrollment.markModified('subjects')` to ensure Mongoose persists the subdocument change.

### Frontend

**File:** `src/pages/professor/ProfessorSubjectDetail.tsx`

Displays subject metadata (code, title, schedule, room), enrolled student count, and student roster with grades. Provides navigation to class roster and grades views.

---

## 6. Course Load Reporting

### Professor Course Loads

**Endpoint:** `GET /api/registrar/professor-course-loads`

Aggregates all enrollment subject entries across the system, grouped by instructor. For each professor, shows:

- Total courses, blocks, subjects
- Per-course breakdown with blocks and subject details
- Student counts per subject

Also identifies:
- **Unassigned subjects** — instructor is `'TBA'`
- **Orphaned subjects** — instructor name doesn't match any known professor account
- **Attention list** — subjects needing instructor assignment or resolution

---

## 7. Data Flow Summary

```
Registrar creates Subject (catalog)
  │
  ├── Registrar assigns Subject to BlockSection (BlockSubjectAssignment)
  │     │ per term: semester + academicYear
  │     │
  │     └── Registrar assigns Instructor to Section+Subject
  │           │ updates Enrollment.subjects[].instructor for all students in section
  │           │
  │           └── Professor sees assigned blocks/subjects
  │                 │ GET /api/professor/assigned-blocks
  │                 │
  │                 ├── Professor views class roster
  │                 │     GET /api/professor/sections/:sectionId/subjects/:subjectId/students
  │                 │
  │                 └── Professor enters grades
  │                       PUT /api/professor/sections/:sectionId/subjects/:subjectId/students/:studentId/grade
  │
  └── Registrar enrolls Student with subjects
        │ mapSubjectIdsToEnrollmentSubjects() denormalizes code/title/units
        │ creates Enrollment with embedded subjects[]
        │
        └── Student record shows enrolled subjects
              GET /api/students/:id/current-enrollment
              → subjects[] with schedule, room, instructor, grade, status
```

---

## 8. Caching Strategy

| Cache Key Prefix | TTL | Invalidated By |
|-----------------|-----|----------------|
| `/registrar/subjects` | 60s | Subject create/update/delete |
| `/registrar/block-subject-assignments` | 20s | Assignment create/delete |
| `/registrar/professor-course-loads` | 20s | Subject changes, assignment changes, instructor changes |
| `/registrar/sections/` | 20s | Subject changes, assignment changes, instructor changes |

Cache invalidation uses prefix-based matching — any successful mutation invalidates all cached responses starting with the configured prefix.

---

## 9. Key Files

| File | Role |
|------|------|
| `server/models/Subject.js` | Subject schema, versioning statics, indexes |
| `server/models/BlockSubjectAssignment.js` | Section-subject link schema with unique compound index |
| `server/models/Enrollment.js` | Embedded `subjects[]` array, instance methods, virtuals |
| `server/controllers/subjectController.js` | Subject CRUD with referential integrity check |
| `server/controllers/blockSubjectAssignmentController.js` | Assign/remove subjects on block sections |
| `server/controllers/studentController.js` | `mapSubjectIdsToEnrollmentSubjects()`, `createEnrollmentRecord()`, instructor assignment, section subject aggregation |
| `server/routes/registrarRoutes.js` | Route registration with caching and validation middleware |
| `server/index.js` | Professor subject/grade endpoints, professor course load aggregation |
| `src/pages/registrar/SubjectManagementPage.tsx` | Subject catalog management UI with wizard |
| `src/pages/registrar/AssignSubjectPage.tsx` | Block subject assignment wizard UI |
| `src/pages/professor/ProfessorSubjectDetail.tsx` | Professor's subject detail with roster and grades |
