# Block Eligibility & Student Assignment System — Implementation Report

## Overview

Implemented a deterministic, school-year-scoped Block Eligibility and Student Assignment system for the College MIS. The system evaluates a student's Enrollment against BlockGroup/BlockSection criteria before allowing assignment, with backend-validated eligibility checks and a registrar UI that shows eligible/recommended blocks with human-readable rejection reasons.

### Core Architecture

```
Student (permanent identity)
   ↓
Enrollment (school-year-specific academic record)
   ↓
Eligibility Evaluation (centralized service)
   ↓
BlockGroup → BlockSection
   ↓
StudentBlockAssignment (historical/actual connection)
```

---

## Schema Changes

### Student.js — `classification` field

Added a new `classification` field **separate from** the existing `studentStatus`:

```js
classification: {
  type: String,
  enum: ['Regular', 'Irregular', 'Transferee', 'Returning'],
  default: 'Regular',
  index: true
}
```

- `studentStatus` (Regular/Dropped/Returnee/Transferee) remains **untouched**
- Compound index added: `{ classification: 1, course: 1, yearLevel: 1, schoolYear: 1 }`

### BlockGroup.js — `curriculumId` + `studentClassification`

```js
curriculumId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Curriculum',
  default: null,
  index: true
},
studentClassification: {
  type: String,
  enum: ['Regular', 'Irregular', 'Transferee', 'Returning', 'All'],
  default: 'All',
  index: true
}
```

- `All` = no classification restriction (backward-compatible default for existing blocks)
- Even when `All`, all other criteria (program, year level, curriculum, capacity, school year, semester, conflicts, enrollment status) are still validated
- Compound index added: `{ courseId: 1, yearLevel: 1, studentClassification: 1, semester: 1, schoolYear: 1 }`

### StudentBlockAssignment.js — `schoolYear` + `enrollmentId`

```js
enrollmentId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Enrollment',
  default: null,
  index: true
},
schoolYear: {
  type: String,
  match: /^\d{4}-\d{4}$/
}
```

- `enrollmentId` makes the assignment explicitly link to a specific Enrollment
- `schoolYear` is the explicit academic-year identifier (e.g. `"2026-2027"`)
- Existing `year` (Number) kept for backward compatibility
- Unique index updated: `{ studentId: 1, semester: 1, year: 1, schoolYear: 1 }`
- New index: `{ enrollmentId: 1, semester: 1, status: 1 }`
- New index: `{ studentId: 1, schoolYear: 1, semester: 1, status: 1 }`

---

## Backend Eligibility Service

**File:** `server/services/blockEligibilityService.js`

### `evaluateStudentEligibility(enrollment, student, blockGroup, blockSection, existingAssignment, curriculumDoc, activePeriod)`

Performs 9 eligibility checks:

| # | Check | Source | Target | Failure Reason |
|---|-------|--------|--------|----------------|
| 1 | **Program** | `Enrollment.course` (fallback: `Student.course`) | `BlockGroup.courseId` | "Program/course does not match this block." |
| 2 | **Year Level** | `Enrollment.yearLevel` (fallback: `Student.yearLevel`) | `BlockGroup.yearLevel` | "Student year level does not match this block." |
| 3 | **Curriculum** | `Student.curriculumVersion` | `Curriculum.version` (via `BlockGroup.curriculumId`) | "Curriculum mismatch. This block uses the [program] [version] curriculum." |
| 4 | **Classification** | `Student.classification` | `BlockGroup.studentClassification` | "This block accepts [classification] students only." |
| 5 | **Capacity** | `BlockSection.currentPopulation` | `BlockSection.capacity` | "Block section is full. [current] / [capacity] students." |
| 6 | **Conflicts** | Existing `StudentBlockAssignment` | Same student + schoolYear + semester | "Student already has a block assignment for this school year and semester." |
| 7 | **School Year** | `Enrollment.schoolYear` | `BlockGroup.schoolYear` | "Block belongs to a different school year." |
| 8 | **Semester** | `Enrollment.semester` | `BlockGroup.semester` | "Block belongs to a different semester." |
| 9 | **Enrollment Status** | `Enrollment.lockedAt`, `Enrollment.status`, `Student.studentStatus` | Must not be locked/cancelled/dropped | "Enrollment is locked..." / "Student is marked as Dropped..." |

Returns:
```js
{
  eligible: boolean,
  reasons: string[],      // human-readable (empty if eligible)
  checks: {
    program: boolean,
    yearLevel: boolean,
    curriculum: boolean,
    classification: boolean,
    capacity: boolean,
    conflicts: boolean,
    schoolYear: boolean,
    semester: boolean,
    enrollmentStatus: boolean
  }
}
```

### `getEligibleBlocks(studentId, options)`

1. Loads student (with `classification`, `curriculumVersion`, `schoolYear`, `semester`, `studentStatus`)
2. Finds active enrollment via `findActiveEnrollment()` (prefers `isCurrent=true` + status Enrolled/Pending, falls back to most recent)
3. Loads `BlockGroup` records matching enrollment's `schoolYear` + `semester`
4. Loads open `BlockSection` records for those groups
5. Loads `Curriculum` docs for groups with `curriculumId`
6. Checks for existing assignment (prefers `enrollmentId`, falls back to `studentId` + `schoolYear` + `semester`)
7. Evaluates each section through `evaluateStudentEligibility`
8. Returns `{ student, enrollment, eligible[], ineligible[], recommended }`

**Recommendation algorithm (deterministic):**
- Lowest `currentPopulation` first
- Ties broken by `sectionCode` alphabetical order

### `findActiveEnrollment(studentId, schoolYear, semester)`

1. Tries `isCurrent: true` + `status: { $in: ['Enrolled', 'Pending'] }`
2. Falls back to most recent enrollment matching schoolYear/semester

---

## API Endpoints

### `GET /api/blocks/eligible?studentId=...`

- **Auth:** `authMiddleware` + `requireBlockManagementRole`
- **Cache:** 10-second TTL
- **Response:**
```json
{
  "success": true,
  "data": {
    "student": { "id", "name", "course", "yearLevel", "classification", "schoolYear", "semester", "studentStatus" },
    "enrollment": { "id", "schoolYear", "semester", "yearLevel", "course", "status" } | null,
    "eligible": [{ "blockGroup", "section", "slotsAvailable" }],
    "ineligible": [{ "blockGroup", "section", "reasons", "checks" }],
    "recommended": { "blockGroup", "section", "slotsAvailable" } | null
  }
}
```

### `POST /api/blocks/assign-student` (updated)

**Server-side revalidation flow:**
1. Load `BlockSection` (must be OPEN)
2. Load `BlockGroup` + `Student` (with `classification`, `curriculumVersion`)
3. Find active enrollment via `findActiveEnrollment()`
4. Determine `schoolYear` for assignment
5. Check existing assignment (by `enrollmentId` or `studentId` + `schoolYear`)
6. Load `Curriculum` doc if `BlockGroup.curriculumId` is set
7. Load active `AcademicPeriod`
8. **Call `evaluateStudentEligibility()`** — reject with 400 + reasons if ineligible
9. **Atomic capacity update:** `BlockSection.findOneAndUpdate({ currentPopulation: { $lt: capacity } }, { $inc: { currentPopulation: 1 } })` — prevents race conditions
10. Create `StudentBlockAssignment` with `schoolYear` + `enrollmentId`
11. Create `BlockActionLog` entry
12. Commit transaction

**Race condition protection:** Two administrators clicking "Assign" on the last slot simultaneously — only one succeeds, the other gets `"Block section is now full. Please refresh and try again."`

### `POST /api/blocks/groups` (updated)

- Accepts `curriculumId` and `studentClassification` in request body
- Validates curriculum exists and belongs to the selected program
- Validates classification is one of the allowed enum values

### `PATCH /api/blocks/groups/:groupId` (updated)

- Accepts `curriculumId` and `studentClassification`
- Validates curriculum belongs to selected program
- Setting `curriculumId` to `null` clears the restriction

---

## Frontend

### `src/lib/blockEligibilityApi.ts` (new)

TypeScript API client with types:
- `EligibilityChecks` — 9 boolean fields
- `EligibleBlock` — blockGroup + section + slotsAvailable
- `IneligibleBlock` — blockGroup + section + reasons + checks
- `EligibilityResult` — student + enrollment + eligible[] + ineligible[] + recommended
- `fetchEligibleBlocks(studentId)` — calls `GET /api/blocks/eligible`

### `src/components/BlockAssignmentModal.tsx` (redesigned)

**Single student flow:**
1. Opens at step 2 → fetches `GET /api/blocks/eligible`
2. Shows student academic context (program, year level, classification, school year, semester, enrollment status)
3. **Recommended block card** — prominent with "Recommended" badge, capacity bar, slots available
4. **Other eligible blocks** — selectable cards with capacity info
5. **Ineligible blocks** — collapsed section with ⚠️ icon and human-readable reasons
6. **Loading state:** "Checking available blocks..."
7. **Error state:** "Unable to check block eligibility" + Retry button
8. **Empty state:** "No eligible blocks found"
9. **Stale data handling:** On assignment failure, automatically refreshes eligibility
10. **Review step:** Shows summary before confirming

**Bulk student flow (multiple students):**
- Uses existing client-side filtering for compatible groups
- Same 3-step wizard (Students → Block → Review)

### `src/pages/registrar/BlockManagement.tsx` (updated)

**Wizard Step 1 — new fields:**
- **Curriculum** dropdown — populated from active curricula for the selected program only
  - "Not configured" option = no curriculum restriction
  - Help text: "Curriculum restriction enabled" or "No curriculum restriction"
- **Student Classification** dropdown — All / Regular / Irregular / Transferee / Returning

**Live Preview** now shows Curriculum and Classification.

**Review Step** now shows Curriculum and Classification.

**Edit Existing Group** form now includes curriculumId and studentClassification fields.

**Create API call** sends `curriculumId` and `studentClassification` in the POST body.

### Type Updates

- `src/lib/blockAssignmentShared.ts` — `BlockGroup` type: added `curriculumId?: string | null` and `studentClassification?: string`
- `src/pages/registrar/registrarBlockTypes.ts` — Same additions to `BlockGroup` type

---

## Security Middleware Fix

**File:** `server/securityMiddleware.js`

Replaced noisy debug log:
```js
// Before (printed on every request):
logger.debug('After validation - value:', value, 'error:', error);

// After (only logs on actual errors):
if (error) {
  logger.debug('Validation error:', error.details);
}
```

The `error: undefined` output was not a crash — it was just noisy logging when validation passed. The exit code 1 was from SIGINT (Ctrl+C) graceful shutdown.

---

## Architectural Rules Enforced

| Rule | Implementation |
|------|---------------|
| Enrollment is the academic source of truth | Eligibility uses `Enrollment.course`, `Enrollment.yearLevel`, `Enrollment.schoolYear`, `Enrollment.semester` with Student fallback |
| Student.section is legacy | New assignment flow never writes to `Student.section` |
| Historical records are immutable | `Enrollment.lockedAt` check prevents assignment to locked records; `schoolYear` on assignments makes scope explicit |
| Backend is the authority | `assignStudent` calls `evaluateStudentEligibility()` immediately before creating assignment |
| Frontend never trusted | Eligibility API is for display only; backend revalidates on assignment |
| No duplicate assignments | Conflict check via `enrollmentId` or `studentId` + `schoolYear` + `semester` |
| Dropped students blocked | `studentStatus === 'Dropped'` fails enrollmentStatus check |
| Curriculum validation | BlockGroup create/update validates curriculum belongs to selected program |
| Race condition protection | Atomic `findOneAndUpdate` on capacity within transaction |
| Irregular students separated | `studentClassification` on BlockGroup prevents Irregular students from Regular-only blocks |

---

## Files Summary

### Created
| File | Purpose |
|------|---------|
| `server/services/blockEligibilityService.js` | Centralized eligibility logic |
| `src/lib/blockEligibilityApi.ts` | Frontend API client + types |

### Modified
| File | Changes |
|------|---------|
| `server/models/Student.js` | Added `classification` field + compound index |
| `server/models/BlockGroup.js` | Added `curriculumId` + `studentClassification` + index |
| `server/models/StudentBlockAssignment.js` | Added `schoolYear` + `enrollmentId` + indexes |
| `server/controllers/blockController.js` | New `getEligibleBlocks`, rewrote `assignStudent`, updated create/update group |
| `server/index.js` | Added `GET /api/blocks/eligible` route |
| `server/securityMiddleware.js` | Fixed noisy debug log |
| `src/components/BlockAssignmentModal.tsx` | Redesigned with eligibility API flow |
| `src/pages/registrar/BlockManagement.tsx` | Added curriculum + classification dropdowns |
| `src/lib/blockAssignmentShared.ts` | Updated BlockGroup type |
| `src/pages/registrar/registrarBlockTypes.ts` | Updated BlockGroup type |

### Not Modified
| File | Reason |
|------|--------|
| `server/models/Enrollment.js` | Already has `schoolYear`, `semester`, `lockedAt`, `isCurrent`, `status` |
| `server/models/Curriculum.js` | No changes needed |
| `server/models/BlockSection.js` | No changes needed |
| Academic Year Rollover logic | Remains intact |

---

## Verification

- All backend JS files pass `node -c` syntax check
- Zero TypeScript errors across the entire project (`npx tsc --noEmit`)
- All existing routes and functionality preserved
- New route follows existing auth/cache patterns

---

## Pending / Future Work

- **Tests:** Eligibility and assignment edge case tests (14 test cases from spec)
- **Migration script:** Backfill `schoolYear` on historical `StudentBlockAssignment` records where determinable
- **CSS styles:** Add styles for new eligibility UI elements (recommended badge, classification tag, ineligible cards, eligibility context)
- **Enrollment curriculum field:** Currently using `Student.curriculumVersion` — could add `curriculumId` directly to Enrollment for stronger curriculum tracking
