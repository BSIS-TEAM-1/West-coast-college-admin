# Registrar Enrollment Flow — Proper Procedure & File Map

Official lifecycle: `APPLICANT → REGISTERED → ENROLLMENT_PENDING → BLOCK_ASSIGNED → ENROLLED`

Core rule (enforced in code, see `server/services/enrollmentGuard.js`):
a student is officially `ENROLLED` **only** when a valid block assignment
exists for the same school year, semester, course/program, and year level.
No UI action and no API call can mark a student `Enrolled` without one —
the backend rejects it with HTTP 409.

## 1. Proper registrar flow (step by step)

| Step | Registrar action (UI) | What happens in the backend | Resulting state |
|------|----------------------|-----------------------------|-----------------|
| 1 | Applicant Queue → approve applicant (`src/pages/ApplicantQueue.tsx` → `PUT /api/applicants/:id/status`) | `controllers/applicantController.js:updateApplicantStatus` creates/updates the Student **as `Pending`** and creates the Enrollment record **as `Pending`**, all in one transaction | `REGISTERED` / `ENROLLMENT_PENDING` |
| 2 | Student Management → select student(s) → Bulk enroll (`src/components/StudentManagement.tsx` → `POST /api/registrar/students/:id/enroll`) | `controllers/studentController.js:enrollStudent` → `createEnrollmentRecord` creates the Enrollment as `Pending`; lifecycle is set to `Pending` (never `Enrolled`) | `ENROLLMENT_PENDING` |
| 3 | Student Management / Assign Block → Assign Selected (`src/components/BlockAssignmentModal.tsx` → `POST /api/blocks/assign-student`) | `controllers/blockController.js:assignStudent` (one transaction): checks section open → finds active enrollment → server-side eligibility (`services/blockEligibilityService.js`) → capacity guard → creates `StudentBlockAssignment` → `enrollmentGuard.finalizeEnrollment()` verifies requirements → flips Enrollment to `Enrolled` + student to `Enrolled`. Any failure rolls back **everything** | `BLOCK_ASSIGNED` → `ENROLLED` |
| 4 | Generate COR (`GET /api/registrar/students/:id/cor`) | `studentController.js:generateCorPdf` renders from Enrollment + assignment | Proof of completed enrollment |
| 5 | Unassign if needed (`DELETE /api/blocks/sections/:sectionId/students/:studentId`) | `blockController.js:unassignStudentFromSection` drops the enrollment rows, clears the section, reverts lifecycle to `Pending` | Back to `ENROLLMENT_PENDING` |

What NOT to do: never set lifecycle to `Enrolled` by hand. The registry
lifecycle dropdown disables the `Enrolled` option (labelled "requires block")
for students without a block, and the API answers 409 with the missing
requirements if it is attempted anyway.

## 2. Allowed lifecycle transitions

- `Pending` → `Enrolled`: only via block-assignment finalization (Step 3).
- Any state → `Pending`: unassign, academic change that clears the block,
  or the consistency remediation below.
- Academic change (course/yearLevel/studentStatus edit via
  `PUT /api/registrar/students/:id`) clears block membership AND demotes a
  leftover `Enrolled` back to `Pending` automatically.
- `Graduated` / `Inactive` / `Dropped` behave as before.

## 3. File connectiveness map

Frontend (`admin/src`):

- `components/StudentManagement.tsx` — registry table, lifecycle dropdown
  (locked for `Enrolled` without block), `EnrollmentModal` (creates
  `Pending` enrollments), student details drawer.
- `components/BlockAssignmentModal.tsx` — eligibility preview + calls
  `POST /api/blocks/assign-student` per student; success means officially enrolled.
- `lib/studentApi.js` — `enrollStudent`, `updateStudent` (surfaces backend
  409 `details[]`), block-assignment fetch helpers.
- `lib/blockAssignmentShared.ts` — shared academic-context helpers.
- `components/AddStudent/` — creation wizard (new records are always `Pending`).
- `pages/ApplicantQueue.tsx` — applicant approval entry point.

API layer (`admin/server`):

- `index.js` — mounts `routes/registrarRoutes.js` at `/registrar` and
  `/api/registrar`; block endpoints at `/api/blocks/*` → `blockController`.
- `routes/registrarRoutes.js:48-60` — student CRUD, `POST /students/:id/enroll`,
  enrollment history, COR (`:55`).
- `index.js:7899` — `POST /api/blocks/assign-student` → `assignStudent`;
  `:8097` — unassign → `unassignStudentFromSection`.

Controllers:

- `controllers/studentController.js` — `enrollStudent` (creates `Pending`
  enrollment), `updateStudent` (guards direct `Enrolled` + demotes stale
  `Enrolled`), `createStudentRecord` (rejects `Enrolled` at creation),
  `deriveLifecycleStatus` (never invents `Enrolled`), `getStudentsRecord`
  (derives displayed section from assignments).
- `controllers/blockController.js` — `assignStudent` (eligibility + assignment
  + finalization in one transaction), `unassignStudentFromSection`
  (reverts to `Pending`), overcapacity helpers (add blocks only, never set lifecycle).
- `controllers/applicantController.js:updateApplicantStatus` — approval yields
  `Pending` student + `Pending` enrollment in one transaction.

Services (business rules):

- `services/enrollmentGuard.js` — **single source of truth**:
  `findValidBlockAssignment` (matching rule), `assertEnrolledRequirements`
  (checks 1–9, throws 409), `finalizeEnrollment` (atomic flip).
- `services/enrollmentService.js` — `createOrReactivateEnrollment`
  (idempotent record creation; `status` option, default preserves callers).
- `services/blockEligibilityService.js` — `findActiveEnrollment`,
  `evaluateStudentEligibility` (program/year/curriculum/capacity/period checks).
- `services/academicYearRolloverService.js` — promotion creates enrollment +
  assignment + `Enrolled` together per student inside the batch transaction.
- `lib/programMapping.js` — canonical course-code normalization used by guard,
  eligibility, and migrations.

Models (`server/models`):

- `Student.js` — `lifecycleStatus` enum, `section`, `schoolYear`, `semester`.
- `Enrollment.js` — authoritative per-term record (`status`, `isCurrent`).
- `StudentBlockAssignment.js` — `studentId` + `sectionId` + `semester`/`year`/
  `schoolYear` + `enrollmentId`, status `ASSIGNED`.
- `BlockGroup.js` / `BlockSection.js` — block context (course, yearLevel,
  semester, schoolYear) and capacity.
- `AuditLog.js` — trail for updates, reversions, approvals.

Read paths (display only, never write `Enrolled`):

- Professor loads (`studentController.js:467`) read `Enrollment.status`.
- Student dashboards / mobile app read `lifecycleStatus`.
- `deriveLifecycleStatus` falls back to `Pending`, never `Enrolled`.

## 4. Consistency checks & remediation

- Diagnose (read-only):
  `node diagnostics/checkEnrollmentConsistency.js` — check 8 lists
  `Enrolled` students with no valid block assignment.
- Remediate (dry-run default; `--apply` writes, with per-student AuditLog):
  `node migrations/revertEnrolledWithoutBlock.js` — reverts offenders to
  `Pending`; never fabricates assignments. Re-run the diagnostic after
  applying; then assign blocks normally to re-finalize.
- Regressions: `npx jest enrollmentGuard.test.js enrollmentService.test.js
  blockEligibilityService.test.js` (103 tests).

---

# PART B — Whole registrar system: what each part is for and how it connects

Read the enrollment flow in Part A first. This part explains every other
registrar domain, why it exists, and which files implement it.

## 5. Curriculum — the academic blueprint

**Purpose.** The curriculum is the school's approved study plan per program:
which subjects a student must take, in which year level and semester, with how
many units. Everything downstream (block offerings, eligibility, enrollment
subjects, assessments) derives from it. Without a curriculum, the system cannot
know what "1st Year, 1st Semester of BEED" means.

**How it functions.**

- `models/Curriculum.js` — one record per program + version
  (`programCode` 101/102/103/201, `version` e.g. `"2026"`, `status`
  `Draft → Active → Legacy/Archived`). Exactly one `Active` version per program
  (unique index `one_active_curriculum_per_program`).
- `models/CurriculumSubject.js` — placements: which `Subject` sits in which
  `yearLevel` + `semester` of that curriculum, with an **immutable snapshot**
  (`courseNo`, `descriptiveTitle`, `units`, periods, prerequisites) taken at
  placement time. Editing the global Subject later never rewrites history;
  registrars edit the placement explicitly (`PUT /curriculums/:id/subjects/:id`).
- Lifecycle endpoints (`routes/registrarRoutes.js:69-83` →
  `controllers/curriculumController.js`, `curriculumSubjectController.js`):
  create → add/bulk-add subjects → `PATCH /:id/status` to activate →
  `POST /:id/duplicate` to start next year's version without retyping.
- Consumers: `services/enrollmentService.js:resolveCurriculum` attaches the
  right `curriculumId` to every Enrollment (explicit → student's version →
  Active fallback, else enrollment creation fails loudly); `createEnrollmentRecord`
  auto-populates term subjects from `CurriculumSubject` when the registrar
  picks none; `blockEligibilityService` validates student-vs-block curriculum
  match; rollover carries the curriculum forward.

**Registrar actions.** Curriculum Management page: create program versions,
place subjects per year/semester, activate exactly one version per program,
duplicate for the next school year.

## 6. The four subject layers (do not confuse them)

| Layer | Model | Purpose | Written by |
|---|---|---|---|
| 1. Catalog | `Subject.js` | Reusable master definition (code, title, units, type). Global, program-agnostic | `SubjectController` (`routes:86-89`) |
| 2. Placement | `CurriculumSubject.js` | Subject approved into a curriculum at a year/semester, with immutable snapshot | `CurriculumSubjectController` (`routes:78-83`) |
| 3. Offering | `BlockSubjectAssignment.js` | Subject actually offered to one block section this term (section × subject × semester × year). Unique index prevents duplicates | `BlockSubjectAssignmentController` (`routes:64-66`), or auto-assign from curriculum (`services/blockSubjectAutoAssignService.js`) |
| 4. Load | `Enrollment.subjects[]` | The individual student's subject load for the term (schedule/room/instructor start as TBA, grades accrue per subject) | `enrollStudent` / `createEnrollmentRecord` |

Flow of data: Catalog → Placement (approve) → Offering (schedule per block,
manually or via auto-assign) → Load (student enrolls). Instructor assignment
to a section's subject (`POST /sections/:sectionId/subject-assignment`,
`studentController.assignSubjectInstructorToSection`) is what builds professor
course loads (`GET /professor-course-loads`).

## 7. Blocks — cohorts that make ENROLLED meaningful

- `BlockGroup.js` — the cohort: program (`courseId`/`courseCode`), `yearLevel`,
  `semester`, `schoolYear`, link to `curriculumId`, classification. This is the
  "same academic context" the enrollment guard compares against.
- `BlockSection.js` — physical sections inside the group (`sectionCode`,
  `capacity`/`currentPopulation`, `status OPEN`, adviser).
- `StudentBlockAssignment.js` — the student↔section link (`ASSIGNED`, with
  `enrollmentId` tying it to the term's Enrollment). **This record's existence
  is what promotes a student to officially ENROLLED** (guard finalization).
- Endpoints (`index.js:7873+`): eligible/bulk-eligibility previews (read-only),
  `POST /api/blocks/assign-student` (assign + finalize, one transaction),
  overcapacity decisions (override/waitlist/transfer — add or move blocks only,
  never set lifecycle), unassign (reverts lifecycle to `Pending`).
- Registrar UI: Block Management page (groups/sections/capacity) +
  `BlockAssignmentModal.tsx` (eligibility → assign → students become enrolled).

## 8. Supporting registrar domains

- **Academic periods** (`models/AcademicPeriod.js`) — exactly one `Active`
  school year + term at a time. Blocks/enrollments for an `Archived` period are
  rejected for new assignments; rollover opens the next period and locks old
  enrollments (`lockedAt`, immutable history).
- **Applicants** (`controllers/applicantController.js`, `pages/ApplicantQueue.tsx`)
  — admission pipeline (`Applied → Approved for Enrollment → Enrolled` as an
  *applicant* status). Approval mints the Student + `Pending` Enrollment in one
  transaction; it does NOT grant official enrollment — block assignment does.
- **COR** (`GET /students/:id/cor` → `buildCorViewModel` + `services/corPdfService.js`)
  — the printed Certificate of Registration, rendered from the finalized
  Enrollment + block assignment. Verifying a COR (`corStatus=Verified`) only
  auto-promotes lifecycle when the guard passes; otherwise 409.
- **Documents** (`controllers/documentController.js`, Document Management page)
  — per-enrollment requirement tracking (submitted/verified) shown in the
  student drawer; independent of lifecycle but part of the registrar checklist.
- **Grades** (professors submit per subject → `GradeSubmissionReviewPage` for
  registrar approval → report cards/transcripts via `gradeReportController`).
  Grading consumes the enrollment subject load; it never changes lifecycle.
- **Year-end rollover** (`services/academicYearRolloverService.js`,
  School Year Rollover page) — promote/retain/graduate decisions executed as one
  batch transaction: locks old enrollments, creates new `Enrolled` enrollments,
  assigns new cohort blocks (`ensureBlockForCohort`), advances students.
  Abort on any failure — no partial promotion.
- **Archives & audit** (`services/AcademicArchiveService.js`, Academic Archive
  page, `models/AuditLog.js`) — immutable snapshots plus the action trail
  (creates, updates, approvals, remediation reversions) that explains *why* any
  record changed state.

## 9. End-to-end data chain (one picture)

```text
AcademicPeriod (Active: 2024-2025 · 1st)
  └─ Curriculum (BEED v2026, Active)
       └─ CurriculumSubject placements (Year 1 · 1st: ENG101, MATH101, …)
            └─ BlockGroup (BEED · Y1 · 1st · 2024-2025, curriculumId)
                 ├─ BlockSection (BEED-1A, capacity)
                 │    └─ BlockSubjectAssignment (offerings, manual/auto)
                 │    └─ instructor assignment → professor loads → grade sheets
                 └─ StudentBlockAssignment (student ∈ section)
                      └─ Enrollment (status Enrolled, isCurrent) + Student.lifecycleStatus Enrolled
                           ├─ COR pdf (proof)      ├─ Documents (checklist)
                           └─ Grades per subject → report card / transcript
```

Every arrow is created by exactly one writer listed above; the guard
(`services/enrollmentGuard.js`) is the gate between "has records" and
"officially ENROLLED".
