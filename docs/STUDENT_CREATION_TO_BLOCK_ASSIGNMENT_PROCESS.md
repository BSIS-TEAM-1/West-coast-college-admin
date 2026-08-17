# Student Creation to Block Assignment Process

This document describes the registrar workflow from creating a student record to assigning the student to a block section. It is intended for engineering, QA, registrar operations, onboarding, and capstone documentation.

## Scope

This process covers:

1. Creating a student record
2. Validating required student information
3. Preparing block group and section data
4. Assigning an individual student to a block
5. Assigning multiple students to a block
6. Updating student records after block assignment

This document does not cover subject enrollment, COR generation, grading, or applicant onboarding.

## Primary Roles

| Role | Responsibility |
| --- | --- |
| Registrar | Creates student records, reviews student details, and assigns students to blocks. |
| Admin | Maintains system access and may assist with records depending on permissions. |
| System | Validates input, saves records, updates block assignments, and prevents invalid writes. |

## Main Screens and Components

| Area | File / Endpoint | Purpose |
| --- | --- | --- |
| Student Management | `admin/src/components/StudentManagement.tsx` | Main registrar workspace for student records and block assignment. |
| Registrar Sidebar | Block Management > Assign Block | Opens a focused student list for selecting students before block assignment. |
| Add/Edit Student Wizard | `admin/src/components/AddStudent/StudentWizard.tsx` | Step-based student creation and editing flow. |
| Student API Client | `admin/src/lib/studentApi.js` | Frontend helper for student create/update requests. |
| Registrar Student Routes | `admin/server/routes/registrarRoutes.js` | Backend routes for student create/update operations. |
| Student Controller | `admin/server/controllers/studentController.js` | Backend student validation, normalization, creation, and update logic. |
| Block APIs | `/api/blocks/*` | Backend endpoints for block groups, sections, assignment, and unassignment. |
| Block Controller | `admin/server/controllers/blockController.js` | Backend block group, section, assignment, and capacity handling logic. |

## High-Level Flow

| Step | Actor | Action | Result |
| --- | --- | --- | --- |
| 1 | Registrar | Opens Student Management | Student records and filters are available. |
| 2 | Registrar | Clicks Add Student | Student wizard opens. |
| 3 | Registrar | Completes identity, personal, contact, and academic details | Form data is prepared for validation. |
| 4 | System | Validates required fields and formats | Invalid records are blocked before save. |
| 5 | System | Creates student record | Student receives a saved profile and student number. |
| 6 | Registrar | Selects one or more compatible students | Block assignment workflow becomes available. |
| 7 | System | Opens guided block assignment wizard | Registrar reviews students before selecting a target block. |
| 8 | System | Loads compatible block groups and sections | Registrar can choose a valid target block. |
| 9 | Registrar | Reviews and confirms block assignment | Student is assigned to the selected block section. |
| 10 | System | Updates student section and block metadata | Student Management reflects the assigned block. |

## Detailed Process

### 1. Open Student Management

The registrar opens the Student Management page from the registrar dashboard.

The page provides:

| Feature | Purpose |
| --- | --- |
| Search | Find students by name, student number, email, phone, course, or block. |
| Filters | Narrow records by course, year level, block, lifecycle status, COR status, and sort order. |
| Student table | Review student identity, course, year and block, lifecycle, COR, and contact details. |
| Bulk actions | Apply enrollment or block assignment actions to selected students. |
| Add Student | Start the student creation wizard. |

### 2. Create Student Record

The registrar clicks **Add Student**.

The system opens the Add Student Wizard.

| Wizard Step | Information Captured |
| --- | --- |
| Basic Information | Student number, first name, middle name, last name, suffix |
| Personal Details | Birth date, gender, address, and related personal information |
| Contact Information | Contact number, email, guardian, and emergency details |
| Academic Details | Course, year level, semester, school year, student status, and lifecycle status |
| Review & Submit | Final review before saving |

### 3. Validate Student Information

Before saving, the system validates required fields.

Typical required fields include:

| Field | Requirement |
| --- | --- |
| First name | Required |
| Last name | Required |
| Course | Required |
| Year level | Required |
| Semester | Required |
| School year | Required |
| Student status | Required |
| Contact number | Required |
| Address | Required |

If validation fails, the registrar stays in the wizard and the missing or invalid fields are shown.

### 4. Save Student Record

When the registrar submits a valid record:

| Layer | Action |
| --- | --- |
| Frontend | Calls `StudentService.createStudent(token, payload)` |
| API Route | Receives `POST /registrar/students` or supported API equivalent |
| Backend | Validates, normalizes, and saves the student record |
| Database | Stores the student profile |
| UI | Refreshes Student Management and shows the new student |

If no student number is supplied, the backend/model flow can auto-generate one according to the current student number rules.

### 5. Prepare for Block Assignment

After the student is created, the registrar can assign the student to a block from Student Management.

A student should have these academic fields before assignment:

| Field | Why It Matters |
| --- | --- |
| Course | Used to match compatible block groups. |
| Year level | Used to match compatible block groups and sections. |
| Semester | Used for target academic term. |
| School year | Used to resolve the target block year. |
| Lifecycle status | Helps determine whether the student is actively managed. |

Block compatibility is based on structured block group fields first:

| Field | Usage |
| --- | --- |
| `courseId` | Matches the student's normalized course. |
| `courseCode` | Human-readable course code fallback. |
| `yearLevel` | Matches the student's year level. |
| `semester` | Matches the selected academic term. |
| `schoolYear` | Matches the selected school year. |
| `section` | Stores the section letter/code independently from the display name. |

The block `name` is a display label only. Legacy block groups that do not yet have structured fields can still fall back to parsing `name` until migration is complete.

### 6. Select Student for Block Assignment

The registrar can assign a block in two ways:

| Method | Use Case |
| --- | --- |
| Single student assignment | Open Block Management > Assign Block, select one student, then click Assign Selected. |
| Bulk block assignment | Open Block Management > Assign Block, select multiple compatible students, then click Assign Selected. |
| Sidebar shortcut | Use Block Management > Assign Block as the primary block assignment entry point. |

Bulk assignment requires the selected students to share the same course and year level. If selected students are not compatible, the UI blocks the bulk operation and shows an error message.

### 7. Guided Block Assignment Wizard

The block assignment flow uses a guided wizard so the registrar does not need to understand the full assignment logic at once.

| Wizard Step | Purpose | Registrar Action |
| --- | --- | --- |
| Students | Review the selected student or batch | Confirm the selected records are correct. |
| Block | Choose the target block group and section | Select a compatible block group and section. |
| Review | Confirm assignment details before saving | Submit the assignment. |

The wizard does not change the assignment rules. It only presents the existing process in a clearer sequence.

### 8. Load Compatible Block Groups

When block assignment starts, the frontend loads block data.

| API | Purpose |
| --- | --- |
| `GET /api/blocks/groups` | Loads available block groups. |
| `GET /api/blocks/groups/:groupId/sections` | Loads sections under a selected group. |

The UI filters compatible groups based on the selected student or student batch academic context.

### 9. Choose Target Block Section

The registrar chooses:

| Selection | Meaning |
| --- | --- |
| Block group | Course/year/term grouping such as a program-year block set. |
| Section | Specific class section inside the block group. |

The target block section becomes the destination for the student assignment.

### 10. Confirm Block Assignment

When the registrar confirms assignment:

| Layer | Action |
| --- | --- |
| Frontend | Sends assignment request to block API. |
| API Route | Receives `POST /api/blocks/assign-student`. |
| Backend | Validates permissions, student, block group, section, and capacity rules. |
| Database | Saves or updates the student block assignment. |
| UI | Refreshes student data and block display. |

If the student already has a block assignment, the workflow may remove the current section assignment before applying the new one.

### 11. Update Student Block Display

After a successful assignment, Student Management displays the block under the **Year & Block** column.

| State | Display |
| --- | --- |
| Assigned | Shows the formatted block name as plain text. |
| Not assigned | Shows `No Block Assigned` as plain text. |

## Block Assignment API Touchpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/blocks/groups` | `GET` | List block groups. |
| `/api/blocks/groups/:groupId/sections` | `GET` | List sections inside a block group. |
| `/api/blocks/assign-student` | `POST` | Assign a student to a block section. |
| `/api/blocks/sections/:sectionId/students/:studentId` | `DELETE` | Remove a student from a section when changing assignments. |

## Validation and Guardrails

| Guardrail | Reason |
| --- | --- |
| Required student fields must be complete before save | Prevents incomplete student records. |
| Email uniqueness is checked when provided | Prevents duplicate contact identity. |
| Bulk assignment requires compatible course and year level | Prevents mixed academic contexts in one block operation. |
| Block group and section must exist | Prevents orphaned assignments. |
| Block compatibility uses structured fields before legacy name parsing | Prevents display labels from controlling business logic. |
| Assignment APIs require authentication and block-management permissions | Prevents unauthorized block changes. |
| Existing block assignment may be cleared when academic data changes | Prevents stale block references after course/year updates. |

## Migration Process

Existing block groups created before structured fields were added should be backfilled.

| Step | Command / Action | Expected Result |
| --- | --- | --- |
| 1 | Set `MONGODB_URI`, `MONGO_URI`, or `DATABASE_URL` | Migration can connect to the target database. |
| 2 | Run `node admin/server/migrations/backfillBlockGroupStructuredFields.js` | Existing block groups receive `courseId`, `courseCode`, `yearLevel`, `schoolYear`, and `section` when derivable. |
| 3 | Review skipped records printed by the script | Ambiguous legacy names are identified for manual cleanup. |
| 4 | Open Block Management > Assign Block | Compatible blocks appear based on structured fields. |
| 5 | Assign a test student to a compatible block | Assignment succeeds and the student row updates. |

Do not delete or rename existing block groups as part of this migration without a separate data-review step.

## Success Criteria

A student is properly created and block-assigned when:

| Check | Expected Result |
| --- | --- |
| Student record exists | Student appears in Student Management. |
| Required fields are saved | Identity, contact, and academic fields are complete. |
| Student number is present | Supplied or generated student number is visible. |
| Block group and section are valid | Assignment references an existing section. |
| Student table is updated | Year & Block column shows the assigned block. |
| No duplicate incompatible assignment remains | Old block assignment is removed or replaced when applicable. |

## Failure Scenarios

| Scenario | Expected Behavior |
| --- | --- |
| Missing required student fields | Wizard blocks submission and shows validation errors. |
| Duplicate or invalid email | Backend rejects the save request. |
| No compatible block groups found | Block assignment workflow shows an empty state. |
| Mixed course/year selection for bulk assignment | UI blocks the bulk assignment attempt. |
| Assignment API fails | UI shows an error and keeps current student data unchanged. |
| Student already belongs to another block | Existing assignment is removed or replaced according to workflow rules. |

## QA Checklist

| Test Case | Expected Result |
| --- | --- |
| Create student with complete valid data | Student is saved and appears in the table. |
| Create student with missing first or last name | Wizard shows required-field errors. |
| Create student with missing academic details | Wizard blocks submission. |
| Assign one student to a compatible block | Year & Block column updates to the selected block. |
| Assign multiple compatible students to one block | All selected students update to the selected block. |
| Try bulk assignment with mixed course/year students | UI shows compatibility error. |
| Change a student from one block to another | Old assignment is cleared and new block is shown. |
| Refresh Student Management after assignment | Block assignment remains visible. |

## Operational Notes

| Topic | Note |
| --- | --- |
| Permissions | Block assignment requires authenticated registrar/admin access with block-management permission. |
| Data consistency | Academic field changes can affect block assignment and should be reviewed before saving edits. |
| Capacity | If section capacity rules are enabled, assignment may require additional handling for full sections. |
| Auditability | Production deployments should retain enough logs/audit events to trace who created or reassigned a student. |

## Related Documents

| Document | Purpose |
| --- | --- |
| `docs/REGISTRATION_PROCESS.md` | Broader registration process overview. |
| `docs/APPLICANT_ENROLLMENT_PROCESS.md` | Applicant-to-enrollment process guide. |
| `docs/REGISTRAR_API.md` | Registrar API reference. |
| `SYSTEM_OPTIMIZATION_REPORT.md` | Production hardening and readiness report. |
