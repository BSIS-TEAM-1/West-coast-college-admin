# Block Eligibility System — Architectural Hardening Pass

## Overview

This document describes the architectural hardening pass applied to the existing Block Eligibility & Student Assignment system. The system was not rebuilt — the existing foundation (centralized eligibility service, Enrollment-based program/year context, explicit `enrollmentId`, backend revalidation, atomic capacity handling) was preserved while eliminating remaining inconsistencies.

### Core Principle

> A student's eligibility for a block is determined by the student's Enrollment for that specific school year and semester, not by mutable student-level academic fields.

```
Student
  │ permanent identity, classification, student status
  ▼
Enrollment
  │ school year, semester, program, year level, curriculum
  ▼
Block Eligibility Service (single authority)
  │ program, year level, curriculum, classification,
  │ school year, semester, enrollment status,
  │ existing assignment, capacity
  ▼
BlockGroup → BlockSection → StudentBlockAssignment
```

---

## 1. Curriculum Now Belongs to Enrollment

### Problem

The previous implementation evaluated curriculum using `Student.curriculumVersion` — a mutable student-level field. This violated historical immutability: if a student changed curriculum, old locked Enrollment records would be reinterpreted under the new curriculum.

### Fix

Added `curriculumId` to the Enrollment schema:

```js
// server/models/Enrollment.js
curriculumId: {
  type: Schema.Types.ObjectId,
  ref: 'Curriculum',
  default: null,
  index: true
}
```

### Eligibility Curriculum Check (Updated)

```
Enrollment.curriculumId
      ↓
Compare with BlockGroup.curriculumId (direct ObjectId comparison)
      ↓
If match → curriculum = true
If mismatch → curriculum = false, reason: "Curriculum mismatch. This block uses [program] [version]."
```

**Fallback:** When `Enrollment.curriculumId` is null (legacy records not yet migrated), the service falls back to `Student.curriculumVersion` matched against `Curriculum.version`. This fallback is for backward compatibility only and never overrides an Enrollment curriculum.

### Historical Immutability

| Scenario | Before | After |
|----------|--------|-------|
| Student changes `curriculumVersion` from `2023` to `2026` | Old enrollment reinterpreted under 2026 | Old enrollment retains its `curriculumId` (2023) |
| Locked enrollment with `curriculumId = 2023` | Eligibility used Student's version | Eligibility uses Enrollment's `curriculumId` |
| Student with no `curriculumVersion` | Fails curriculum check | Falls back to Enrollment `curriculumId` if available |

---

## 2. Single & Bulk Eligibility — One Authority

### Problem

Single-student assignment used the centralized `blockEligibilityService`, but the bulk flow used client-side filtering — two separate rule systems that could disagree.

### Fix

**One function, two entry points:**

| Path | Function | Authority |
|------|----------|-----------|
| Single student | `getEligibleBlocks(studentId)` | `evaluateStudentEligibility()` |
| Bulk students | `getBulkEligibility(studentIds, sectionId)` | `evaluateStudentEligibility()` |

Both call the same `evaluateStudentEligibility()` function with the same 9 checks. Results are guaranteed identical for the same inputs.

### New API Endpoint

```
POST /api/blocks/eligible/bulk
Auth: authMiddleware + requireBlockManagementRole

Request:
{
  "studentIds": ["student1", "student2", "student3"],
  "sectionId": "section123"
}

Response:
{
  "success": true,
  "data": {
    "section": { "_id", "sectionCode", "capacity", "currentPopulation", "status" },
    "blockGroup": { "_id", "name", "curriculumId", "studentClassification" },
    "eligible": [
      { "studentId", "studentName", "studentNumber", "eligible": true }
    ],
    "ineligible": [
      { "studentId", "studentName", "studentNumber", "eligible": false, "reasons": [...], "checks": {...} }
    ],
    "summary": {
      "total": 50,
      "eligibleCount": 42,
      "ineligibleCount": 8,
      "slotsAvailable": 5
    }
  }
}
```

### Bulk Eligibility Implementation

`getBulkEligibility()` in `server/services/blockEligibilityService.js`:

1. Loads `BlockSection` + `BlockGroup` + `Curriculum` + `AcademicPeriod` (single queries)
2. Loads all students in one query
3. Loads all active enrollments in one query (batch, not per-student)
4. Loads all existing assignments in one query
5. Evaluates each student through `evaluateStudentEligibility()` — same function as single
6. Returns separated eligible/ineligible arrays with reasons + summary

---

## 3. Bulk Assignment UI — Backend-Validated

### Before (Client-Side Filtering)

```
Select Students → Client filters by course/year/semester → Assign all → Hope for the best
```

### After (Backend-Validated)

```
Select Students
      ↓
Select Block (display filtering only — not authoritative)
      ↓
POST /api/blocks/eligible/bulk (backend eligibility check)
      ↓
┌─────────────────────────────┐
│ Eligible: 42                │
│ Cannot assign: 8            │
│ Slots available: 5          │
└─────────────────────────────┘
      ↓
Review (per-student eligible/ineligible with reasons)
      ↓
Confirm
      ↓
Backend revalidates each assignment (POST /api/blocks/assign-student)
      ↓
Assignment (atomic capacity protection per student)
```

### UI Features

- **Eligible/ineligible summary** — counts + slots available
- **Ineligible student cards** — student name, number, and human-readable reasons (e.g. "⚠ Curriculum mismatch", "⚠ Block is full", "⚠ Student is Irregular, block accepts Regular only")
- **Capacity warning** — when eligible count exceeds available slots, warns that only N students will be assigned
- **Per-student status badges** — "Eligible" or "Cannot assign" next to each student in the review list
- **Partial assignment** — only assigns up to available capacity; remaining students are reported
- **Ineligible students reported** — all ineligible students and their reasons are included in the final summary

### What Was Removed

- `StudentService.updateStudent()` call — the new workflow never writes to `Student.section`
- Client-side eligibility determination — frontend filtering is for display only
- `getStoredToken` / `schoolYearStart` unused imports — cleaned up

---

## 4. BlockGroup Editing Safety

### Problem

Changing `curriculumId` or `studentClassification` on a BlockGroup with existing assignments in an archived school year would silently alter the historical meaning of those assignments.

### Fix

`PATCH /api/blocks/groups/:groupId` now checks:

1. Is the field actually changing? (compare current vs new value)
2. Are there existing `StudentBlockAssignment` records for sections in this group?
3. Is the BlockGroup's school year different from the active AcademicPeriod's school year (archived)?

If all three are true → **409 Conflict** with explanation:

```
"Cannot change curriculum for a block group in an archived school year
with existing assignments. This would alter the historical meaning of those assignments."
```

For **active** school years with assignments, changes are allowed (eligibility is re-checked on new assignments).

---

## 5. API Contract — Enrollment Context

`GET /api/blocks/eligible` now returns `enrollment.curriculumId`:

```json
{
  "student": {
    "id": "...",
    "name": "...",
    "classification": "Regular",
    "studentStatus": "Regular"
  },
  "enrollment": {
    "id": "...",
    "schoolYear": "2026-2027",
    "semester": "1st",
    "course": "BEED",
    "yearLevel": 2,
    "curriculumId": "507f1f77bcf86cd799439015",
    "status": "Enrolled"
  },
  "eligible": [...],
  "ineligible": [...],
  "recommended": {...}
}
```

The frontend does not reconstruct academic context from Student fields.

---

## 6. Migration Script

**File:** `server/migrations/backfill-enrollment-curriculum.js`

### Safety Features

- **Dry-run by default** — use `--apply` to write changes
- **Does not modify locked enrollments** — use `--include-locked` to include them
- **Does not guess** — if no matching Curriculum is found, leaves `curriculumId` as null
- **Detailed report** — prints matched/unmatched counts and unmatched reasons

### Matching Algorithm

1. Find all enrollments where `curriculumId` is null
2. For each, load the student's `curriculumVersion` and `course` (programCode)
3. Try to match `(programCode, version)` to a `Curriculum` document
4. Fallback: if only one curriculum matches the version, use it
5. If no match → leave as null (do not invent)

### Usage

```bash
# Dry run (see what would change)
node server/migrations/backfill-enrollment-curriculum.js

# Apply changes
node server/migrations/backfill-enrollment-curriculum.js --apply

# Include locked enrollments
node server/migrations/backfill-enrollment-curriculum.js --apply --include-locked
```

---

## 7. Regression Tests

**File:** `server/blockEligibilityService.test.js`

**39 tests, all passing.**

### Test Matrix

| Category | Tests |
|----------|-------|
| Program match/mismatch | ✓ match eligible, ✗ mismatch ineligible |
| Year level match/mismatch | ✓ match eligible, ✗ mismatch ineligible |
| Curriculum (Enrollment) | ✓ match, ✗ mismatch, ✓ no restriction (null) |
| Curriculum (legacy fallback) | ✓ Student.curriculumVersion match, ✗ mismatch |
| Historical immutability | ✓ Enrollment curriculum used even when Student changes, ✗ locked + wrong curriculum |
| Classification | ✓ match, ✗ mismatch, ✓ All = no restriction |
| Capacity | ✓ available, ✗ full |
| Existing assignment | ✓ none, ✗ conflict |
| School year | ✓ correct, ✗ wrong |
| Semester | ✓ correct, ✗ wrong |
| Enrollment status | ✓ active, ✗ locked, ✗ no enrollment |
| Student status | ✓ active, ✗ dropped |
| Enrollment authority | ✓ yearLevel overrides Student, ✓ course overrides Student |
| Human-readable reasons | ✓ curriculum mismatch, ✓ classification mismatch |
| Single vs bulk consistency | ✓ identical results, ✓ curriculum mismatch same in both paths |
| Utility functions | ✓ normalizeCourseCode (4 tests), ✓ formatSchoolYearFromStartYear (2 tests) |

---

## 8. Architectural Rules Enforced

| Rule | How |
|------|-----|
| Enrollment is the academic source of truth | `curriculumId`, `course`, `yearLevel`, `schoolYear`, `semester` all from Enrollment |
| Student.curriculumVersion is legacy/fallback | Only used when `Enrollment.curriculumId` is null |
| Locked enrollments are immutable | `lockedAt` check fails enrollmentStatus; `curriculumId` is set at creation and never changes |
| One eligibility authority | `evaluateStudentEligibility()` used by both single and bulk paths |
| Frontend never determines eligibility | Bulk UI calls backend API; backend revalidates on assignment |
| Student.section is never written | `StudentService.updateStudent` call removed from bulk flow |
| Atomic capacity protection | `findOneAndUpdate({ currentPopulation: { $lt: capacity } }, { $inc: { currentPopulation: 1 } })` preserved |
| Historical assignments remain readable | No rewrite of existing records; `schoolYear` + `enrollmentId` on new records only |
| BlockGroup editing safety | Cannot change eligibility fields on archived school years with assignments |
| Capacity in bulk | Only assigns up to available slots; excess students reported |

---

## 9. Files Modified/Created

### Created

| File | Purpose |
|------|---------|
| `server/migrations/backfill-enrollment-curriculum.js` | Safe migration script for Enrollment.curriculumId |
| `server/blockEligibilityService.test.js` | 39 regression tests |

### Modified

| File | Changes |
|------|---------|
| `server/models/Enrollment.js` | Added `curriculumId` field (ObjectId ref Curriculum, indexed) |
| `server/services/blockEligibilityService.js` | Curriculum check from Enrollment.curriculumId (fallback to Student), added `getBulkEligibility()`, enrollment summary includes `curriculumId` |
| `server/controllers/blockController.js` | Added `getBulkEligibility` controller, BlockGroup editing safety for archived school years |
| `server/index.js` | Added `POST /api/blocks/eligible/bulk` route |
| `src/lib/blockEligibilityApi.ts` | Added `BulkEligibilityResult` types + `fetchBulkEligibility()`, `EligibilityEnrollment` includes `curriculumId` |
| `src/components/BlockAssignmentModal.tsx` | Bulk flow uses backend eligibility API, shows eligible/ineligible breakdown, removed Student.section writes, cleaned unused imports |

### Not Modified (Preserved)

| File | Reason |
|------|--------|
| `server/models/Student.js` | `classification` and `studentStatus` already correct, `curriculumVersion` kept as legacy fallback |
| `server/models/BlockGroup.js` | `curriculumId` and `studentClassification` already present |
| `server/models/StudentBlockAssignment.js` | `schoolYear` and `enrollmentId` already present |
| `server/models/BlockSection.js` | No changes needed |
| `server/models/Curriculum.js` | No changes needed |
| Academic Year Rollover logic | Remains intact |

---

## 10. Verification

- **Backend syntax**: All 5 modified/created JS files pass `node -c`
- **TypeScript**: Zero errors across the entire project (`npx tsc --noEmit`)
- **Tests**: 39/39 passed (`npx jest server/blockEligibilityService.test.js --verbose`)

---

## 11. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Enrollment has an authoritative curriculum reference | ✅ `curriculumId` field added |
| 2 | Eligibility uses Enrollment curriculum | ✅ ObjectId comparison, Student is fallback |
| 3 | Student curriculum is legacy/fallback only | ✅ Only used when `Enrollment.curriculumId` is null |
| 4 | Locked historical Enrollment curriculum cannot change | ✅ `lockedAt` check + immutable `curriculumId` |
| 5 | Existing curriculum data safely migrated where determinable | ✅ Migration script (dry-run by default) |
| 6 | Single-student eligibility uses centralized service | ✅ `getEligibleBlocks()` → `evaluateStudentEligibility()` |
| 7 | Bulk eligibility uses same centralized service | ✅ `getBulkEligibility()` → `evaluateStudentEligibility()` |
| 8 | Bulk frontend filtering is not authoritative | ✅ Display only; backend revalidates |
| 9 | Bulk assignment is backend validated | ✅ Each `POST /api/blocks/assign-student` revalidates |
| 10 | Single and bulk eligibility produce identical results | ✅ Tested (same function, same inputs) |
| 11 | `enrollmentId` remains part of new assignments | ✅ Preserved |
| 12 | `schoolYear` remains part of new assignments | ✅ Preserved |
| 13 | `Student.section` is never modified | ✅ `StudentService.updateStudent` call removed |
| 14 | Capacity remains race-condition safe | ✅ Atomic `findOneAndUpdate` preserved |
| 15 | Historical assignments remain readable | ✅ No rewrite of existing records |
| 16 | Curriculum mismatch produces human-readable reasons | ✅ Tested |
| 17 | Classification mismatch produces human-readable reasons | ✅ Tested |
| 18 | Existing rollover behavior remains intact | ✅ Not modified |
| 19 | Existing APIs remain backward compatible | ✅ New fields are optional with defaults |
| 20 | TypeScript passes with zero errors | ✅ Verified |
| 21 | Backend syntax/tests pass | ✅ 39/39 tests, all `node -c` pass |
| 22 | No unrelated files unnecessarily rewritten | ✅ Minimal changes only |
