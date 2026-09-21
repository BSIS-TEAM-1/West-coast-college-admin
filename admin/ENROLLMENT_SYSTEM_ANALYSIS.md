# WCC Admin System - Enrollment System Analysis

## 1. Enrollment Flow

The enrollment flow involves multiple components and database operations:

### Step-by-Step Enrollment Process:

**1. Student Account/Record Creation**
- **Frontend**: `StudentManagement.tsx` → Add Student form
- **Backend**: `POST /api/registrar/students` → `studentController.createStudent()`
- **Database**: `Student` collection
- **Fields Set**: firstName, lastName, course, yearLevel, semester, schoolYear, studentStatus, enrollmentStatus, corStatus, etc.

**2. Course and Year Level Assignment**
- **Source**: Stored directly in `Student` record
- **Fields**: `course` (numeric: 101, 102, 103, 201), `yearLevel` (1-4)
- **Set During**: Student creation/update via StudentManagement interface

**3. Semester and School Year Assignment**
- **Source**: Stored in both `Student` record and `Enrollment` record
- **Student Fields**: `semester` (e.g., "1st", "2nd"), `schoolYear` (e.g., "2026-2027")
- **Enrollment Fields**: `semester`, `schoolYear`
- **Set During**: Student creation AND enrollment creation

**4. Section/Block Assignment**
- **Frontend**: `StudentManagement.tsx` → Block Assignment Modal
- **Backend**: `POST /api/registrar/block-subject-assignments` → `blockSubjectAssignmentController.assignSubjects()`
- **Database**: `StudentBlockAssignment` collection
- **Fields**: `studentId`, `sectionId`, `semester`, `year`, `status`

**5. Subject/Course Assignment**
- **Frontend**: Block Assignment Modal
- **Backend**: Same as block assignment
- **Database**: `Enrollment` collection → `subjects` array
- **Fields**: Each subject has `code`, `title`, `units`, `instructor`, `grade`, `status`, `subjectId`

**6. Schedule Assignment**
- **Source**: `Student` record has `schedule` field
- **Database**: `Student.schedule` (array of schedule objects)
- **Set During**: Student creation/update

**7. Enrollment Confirmation/Status**
- **Database**: `Enrollment` collection
- **Fields**: `status` (e.g., "Enrolled", "Not Enrolled", "Dropped"), `isCurrent` (boolean)
- **Set During**: Enrollment creation via enrollment modal

## 2. Source of Truth

### Critical Enrollment Values and Their Sources:

| Value | Primary Source | Secondary Sources | Duplicates |
|-------|---------------|-------------------|------------|
| Student's Course | `Student.course` | `Enrollment.course` | Yes - duplicated |
| Year Level | `Student.yearLevel` | `Enrollment.yearLevel` | Yes - duplicated |
| Semester | `Student.semester` | `Enrollment.semester`, `StudentBlockAssignment.semester` | Yes - tripled |
| School Year | `Student.schoolYear` | `Enrollment.schoolYear`, `StudentBlockAssignment.year` | Yes - tripled |
| Section | `StudentBlockAssignment.sectionId` | None | No - single source |
| Block | `BlockSection._id` (referenced by StudentBlockAssignment) | None | No - single source |
| Subjects | `Enrollment.subjects` array | None | No - single source |
| Enrollment Status | `Enrollment.status` | `Student.enrollmentStatus` | Yes - duplicated |
| Student-Block Assignment | `StudentBlockAssignment` collection | None | No - single source |
| Subject Enrollment | `Enrollment.subjects` array | None | No - single source |

### Key Conflicts:
- **Semester**: Stored in Student, Enrollment, AND StudentBlockAssignment - can become inconsistent
- **School Year**: Stored in Student, Enrollment, AND StudentBlockAssignment - can become inconsistent
- **Course**: Stored in both Student and Enrollment - can become inconsistent
- **Year Level**: Stored in both Student and Enrollment - can become inconsistent
- **Enrollment Status**: Stored in both Student and Enrollment - can become inconsistent

## 3. Database Relationships

### Database Collections/Models Involved:

**Student**
- **Purpose**: Core student record
- **Important Fields**: `_id`, `studentNumber`, `firstName`, `lastName`, `course`, `yearLevel`, `semester`, `schoolYear`, `enrollmentStatus`, `corStatus`, `studentStatus`, `schedule`, `isActive`
- **References**: None
- **Referenced By**: Enrollment, StudentBlockAssignment
- **Relationships**: Optional

**Enrollment**
- **Purpose**: Academic enrollment records per semester
- **Important Fields**: `_id`, `studentId`, `schoolYear`, `semester`, `yearLevel`, `course`, `subjects` (array), `status`, `isCurrent`, `gradeSubmission`
- **References**: `studentId` → Student._id
- **Referenced By**: None
- **Relationships**: Required studentId reference

**StudentBlockAssignment**
- **Purpose**: Maps students to specific sections/blocks
- **Important Fields**: `_id`, `studentId`, `sectionId`, `semester`, `year`, `status`
- **References**: `studentId` → Student._id, `sectionId` → BlockSection._id
- **Referenced By**: None
- **Relationships**: Required studentId and sectionId references

**BlockSection**
- **Purpose**: Defines available sections/blocks
- **Important Fields**: `_id`, `blockGroupId`, `sectionCode`, `currentPopulation`, `capacity`
- **References**: `blockGroupId` → BlockGroup._id
- **Referenced By**: StudentBlockAssignment
- **Relationships**: Required blockGroupId reference

**BlockGroup**
- **Purpose**: Groups sections by course, year, semester
- **Important Fields**: `_id`, `name`, `semester`, `year`
- **References**: None
- **Referenced By**: BlockSection
- **Relationships**: None

**Subject**
- **Purpose**: Subject catalog
- **Important Fields**: `_id`, `code`, `title`, `units`, `isActive`
- **References**: None
- **Referenced By**: Enrollment.subjects (via subjectId)
- **Relationships**: Optional (can exist without enrollment)

### Relationship Diagram:
```
Student
  ↓ (studentId)
Enrollment
  ↓ (studentId)
StudentBlockAssignment
  ↓ (sectionId)
BlockSection
  ↓ (blockGroupId)
BlockGroup

Enrollment.subjects
  ↓ (subjectId)
Subject
```

## 4. Current Enrollment Logic

### How System Determines Enrollment Status:

**Student Enrollment Determination:**
- **Primary Method**: Check `Enrollment` collection for student with matching `studentId`
- **Status Check**: `Enrollment.status` field ("Enrolled", "Not Enrolled", "Dropped", "Cancelled")
- **Current Check**: `Enrollment.isCurrent` boolean field
- **Fallback**: If no Enrollment record, check `Student.enrollmentStatus` field

**Current Semester Determination:**
- **Primary Source**: `Enrollment.semester` (e.g., "1st", "2nd")
- **Fallback**: `Student.semester`
- **Query Logic**: Uses exact string matching in filters

**Current School Year Determination:**
- **Primary Source**: `Enrollment.schoolYear` (e.g., "2026-2027")
- **Fallback**: `Student.schoolYear`
- **Query Logic**: Uses exact string matching in filters

**Block/Section Determination:**
- **Primary Source**: `StudentBlockAssignment` collection
- **Query Logic**: Find by `studentId` + `semester` + `year` (numeric year)
- **Status Check**: Must have `status = "ASSIGNED"`

**Subject Assignment:**
- **Source**: `Enrollment.subjects` array
- **Each Subject Contains**: `code`, `title`, `units`, `instructor`, `grade`, `status`, `subjectId`
- **Assignment Method**: Subjects added to Enrollment record during enrollment process

**Professor Student Retrieval:**
- **Primary Method**: Through StudentBlockAssignment → Enrollment lookup
- **Alternative**: Direct Enrollment queries by subject instructor
- **Query Logic**: Filter Enrollment records where `subjects.instructor` matches professor

**Schedule Connection:**
- **Source**: `Student.schedule` field
- **Relationship**: NOT connected to Enrollment or StudentBlockAssignment
- **Independence**: Schedule exists independently of block/section assignment

## 5. Conflicting Logic

### Major Conflict Sources:

**1. Semester Inconsistency**
- **Sources**: `Student.semester`, `Enrollment.semester`, `StudentBlockAssignment.semester`
- **Conflict**: Student could have "1st" in Student record but "2nd" in Enrollment record
- **Impact**: Block assignment might use wrong semester for filtering
- **Used By**: StudentManagement uses Student.semester, Enrollment modal uses Enrollment.semester, Block assignment uses StudentBlockAssignment.semester

**2. School Year Inconsistency**
- **Sources**: `Student.schoolYear`, `Enrollment.schoolYear`, `StudentBlockAssignment.year`
- **Conflict**: Student could have "2026-2027" in Student but StudentBlockAssignment uses numeric 2026
- **Impact**: Block assignment queries might fail to match students
- **Used By**: StudentManagement uses Student.schoolYear, Enrollment uses Enrollment.schoolYear, Block assignment uses StudentBlockAssignment.year (numeric)

**3. Course Inconsistency**
- **Sources**: `Student.course`, `Enrollment.course`
- **Conflict**: Student could change course in Student record without updating Enrollment
- **Impact**: Reports and transcripts might show wrong course
- **Used By**: StudentManagement displays Student.course, Grade reports use Enrollment.course

**4. Year Level Inconsistency**
- **Sources**: `Student.yearLevel`, `Enrollment.yearLevel`
- **Conflict**: Student could advance year level in Student without updating Enrollment
- **Impact**: Block assignments might be based on wrong year level
- **Used By**: StudentManagement uses Student.yearLevel, Enrollment modal uses Enrollment.yearLevel

**5. Enrollment Status Inconsistency**
- **Sources**: `Student.enrollmentStatus`, `Enrollment.status`
- **Conflict**: Student could have "Enrolled" in Student but "Not Enrolled" in Enrollment
- **Impact**: Different parts of app show different enrollment status
- **Used By**: Student list uses Student.enrollmentStatus, Enrollment logic uses Enrollment.status

**6. Section Assignment Missing**
- **Conflict**: Student can be enrolled without StudentBlockAssignment record
- **Impact**: Student appears as enrolled but has no block/section
- **Used By**: Some features check Enrollment only, others require StudentBlockAssignment

**7. Subject vs Schedule Disconnect**
- **Conflict**: Subjects in Enrollment.subjects don't necessarily match Student.schedule
- **Impact**: Schedule might show different classes than enrollment
- **Used By**: Student app might use schedule, reports use enrollment subjects

**8. Professor Assignment Mismatch**
- **Conflict**: Professor assigned to subject in Enrollment.subjects.instructor but StudentBlockAssignment doesn't reference professor
- **Impact**: Professor might see no students despite subject assignment
- **Used By**: Grade submission uses Enrollment.subjects.instructor, Block assignment uses BlockSection

## 6. Registrar Flow

### Registrar Enrollment Process:

**1. Create/Add Student**
- **Frontend**: `StudentManagement.tsx` → "Add Student" button → StudentWizard
- **Backend**: `POST /api/registrar/students` → `studentController.createStudent()`
- **Database**: Insert into `Student` collection
- **Fields Set**: All student personal info, course, yearLevel, semester, schoolYear, enrollmentStatus, etc.

**2. Enroll Student**
- **Frontend**: `StudentManagement.tsx` → Select students → "Enroll" button → EnrollmentModal
- **Backend**: Multiple calls to update Enrollment records
- **Database**: Update/Insert `Enrollment` collection
- **Process**: Creates Enrollment record with studentId, semester, schoolYear, subjects array

**3. Assign Course/Year Level**
- **Frontend**: StudentWizard during student creation
- **Backend**: Same as student creation
- **Database**: Update `Student.course` and `Student.yearLevel`

**4. Assign Semester/School Year**
- **Frontend**: StudentWizard AND EnrollmentModal
- **Backend**: Student creation AND enrollment creation
- **Database**: Update `Student.semester`, `Student.schoolYear` AND `Enrollment.semester`, `Enrollment.schoolYear`

**5. Assign Block/Section**
- **Frontend**: `StudentManagement.tsx` → Select students → "Block Assignment" button → BlockAssignmentModal
- **Backend**: `POST /api/registrar/block-subject-assignments` → `blockSubjectAssignmentController.assignSubjects()`
- **Database**: Insert/Update `StudentBlockAssignment` collection
- **Fields**: studentId, sectionId, semester, year (numeric), status

**6. Assign Subjects**
- **Frontend**: BlockAssignmentModal includes subject selection
- **Backend**: Same as block assignment
- **Database**: Update `Enrollment.subjects` array in Enrollment collection

**7. Verify Enrollment**
- **Frontend**: Various views in StudentManagement
- **Backend**: Queries to Enrollment and StudentBlockAssignment collections
- **Logic**: Check Enrollment.status and StudentBlockAssignment.status

**8. Change Enrollment Information**
- **Frontend**: Student edit form, EnrollmentModal for changes
- **Backend**: PATCH/POST operations to update Student and Enrollment records
- **Database**: Update relevant fields in Student and/or Enrollment collections

## 7. Professor Flow

### Professor Student Retrieval:

**Primary Path:**
1. **Professor** → Login with professor account
2. **Assigned Subject** → Check `Enrollment.subjects.instructor` field
3. **Block/Section** → Not directly used by professors
4. **StudentBlockAssignment** → Not directly used by professors
5. **Students** → Query Enrollment where `subjects.instructor` matches professor ID/name

**Alternative Path (Course Loads):**
1. **Professor** → Request course loads
2. **Backend**: `GET /api/registrar/professor-course-loads`
3. **Logic**: Complex query joining StudentBlockAssignment, Enrollment, BlockSection, BlockGroup
4. **Students**: Determined by StudentBlockAssignment matching professor's assigned sections

**Why Professor Might See Zero Students:**
- **No Enrollment records**: Students enrolled but no Enrollment records created
- **Instructor mismatch**: Professor name/ID doesn't match `subjects.instructor` in Enrollment
- **Block assignment missing**: Students not in StudentBlockAssignment for current semester/year
- **Semester/year mismatch**: StudentBlockAssignment semester/year doesn't match current academic period
- **Status filter**: StudentBlockAssignment.status not "ASSIGNED" or Enrollment.status is "Dropped"

## 8. Student Flow

### Student-Facing Application Determination:

**Current Enrollment:**
- **Primary**: Check `Enrollment` collection for student's studentId
- **Status**: Use `Enrollment.status` and `Enrollment.isCurrent`
- **Fallback**: Check `Student.enrollmentStatus` if no Enrollment record

**Current Section/Block:**
- **Primary**: Query `StudentBlockAssignment` by studentId + current semester/year
- **Section**: Get `sectionId` and lookup BlockSection
- **Fallback**: None - if no StudentBlockAssignment, no section assigned

**Current Subjects:**
- **Primary**: `Enrollment.subjects` array from current Enrollment record
- **Alternative**: `Student.schedule` (not connected to enrollment)
- **Logic**: Filter subjects by status (exclude "Dropped", "Removed")

**Current Schedule:**
- **Primary**: `Student.schedule` field in Student record
- **Independence**: NOT connected to Enrollment or StudentBlockAssignment
- **Content**: Array of schedule objects with day, time, room info

**Registration/Enrollment Status:**
- **Primary**: `Enrollment.status` ("Enrolled", "Not Enrolled", "Dropped", etc.)
- **Secondary**: `Student.enrollmentStatus` (may differ)
- **COR Status**: `Student.corStatus` ("Pending", "Verified")

## 9. Semester and School Year Logic

### Semester and School Year Usage:

**Field Names and Formats:**

| Field | Format | Example | Storage Location |
|-------|--------|---------|------------------|
| `semester` | String | "1st", "2nd" | Student, Enrollment, StudentBlockAssignment |
| `schoolYear` | String | "2026-2027" | Student, Enrollment |
| `year` | Number | 2026 | StudentBlockAssignment |
| `yearLevel` | Number | 1, 2, 3, 4 | Student, Enrollment |

**API Usage:**

**Enrollment Creation:**
- **API**: `POST /api/registrar/students` (student creation)
- **Fields**: `semester` (string), `schoolYear` (string)
- **Format**: Exact string matching

**Block Assignment:**
- **API**: `POST /api/registrar/block-subject-assignments`
- **Fields**: `semester` (string), `year` (number)
- **Format**: String semester, numeric year (CONFLICT)

**Professor Course Loads:**
- **API**: `GET /api/registrar/professor-course-loads`
- **Query Params**: `semester` (string), `year` (number)
- **Format**: String semester, numeric year (CONFLICT)

**Grade Reports:**
- **API**: `GET /api/registrar/students/:id/report-card`
- **Query Params**: `schoolYear` (string), `semester` (string)
- **Format**: Both as strings

**Format Inconsistencies:**
- **Year**: Stored as string "2026-2027" in Student/Enrollment, but as number 2026 in StudentBlockAssignment
- **Comparison**: Some APIs use exact string match, others use numeric comparison
- **Conversion**: No consistent conversion logic between formats

## 10. Section vs Block

### System Treatment Analysis:

**Section vs Block vs Class Block:**
- **Section**: Referenced by `sectionId` in StudentBlockAssignment, defined in BlockSection collection
- **Block**: Referenced via `blockGroupId` in BlockSection, defined in BlockGroup collection
- **Class Block**: Used interchangeably with section in some UI text
- **StudentBlockAssignment**: Maps students to sections (not blocks directly)
- **Section ID**: The `_id` of a BlockSection document

**Intended Relationship:**
```
BlockGroup (defines academic grouping: course, year, semester)
  ↓ contains
BlockSection (defines specific section within group)
  ↓ assigned to
StudentBlockAssignment (maps student to section)
  ↓ references
Student
```

**Current Implementation:**
- **BlockGroup**: Groups sections by course, year level, semester
- **BlockSection**: Individual sections with capacity, linked to BlockGroup
- **StudentBlockAssignment**: Direct student-to-section mapping
- **No direct student-to-block relationship**: Always goes through section

**Section ID Handling:**
- **Required**: StudentBlockAssignment.sectionId is required
- **Can be null/empty**: Some students may have Enrollment but no StudentBlockAssignment
- **Independence**: Section assignment is independent of Enrollment creation

## 11. Enrollment State

### Enrollment-Related Statuses:

**Student Lifecycle Statuses:**
- **Values**: "Pending", "Enrolled", "Not Enrolled", "Dropped", "Inactive", "Graduated"
- **Location**: `Student.lifecycleStatus` (derived field)
- **Logic**: Computed from studentStatus, enrollmentStatus, corStatus, isActive
- **Used By**: StudentManagement display, filtering

**Student Status:**
- **Values**: "Regular", "Irregular", "Transferee", "New", "Old"
- **Location**: `Student.studentStatus`
- **Used By**: Display, filtering

**Enrollment Status:**
- **Values**: "Enrolled", "Not Enrolled", "Dropped", "Cancelled"
- **Location**: `Student.enrollmentStatus` AND `Enrollment.status`
- **Conflict**: Can differ between Student and Enrollment records
- **Used By**: Different parts of application use different source

**COR Status:**
- **Values**: "Pending", "Verified"
- **Location**: `Student.corStatus`
- **Used By**: COR generation, enrollment verification

**StudentBlockAssignment Status:**
- **Values**: "ASSIGNED", "UNASSIGNED"
- **Location**: `StudentBlockAssignment.status`
- **Used By**: Block assignment filtering, professor course loads

**Subject Status:**
- **Values**: "Enrolled", "Dropped", "Removed", "Passed", "Failed"
- **Location**: `Enrollment.subjects[].status`
- **Used By**: Grade calculation, GPA computation, report generation

**Grade Submission Status:**
- **Values**: "Draft", "Submitted", "Approved"
- **Location**: `Enrollment.gradeSubmission.status`
- **Used By**: Grade workflow, report generation

## 12. APIs

### Enrollment-Related APIs:

**Student Management APIs:**
- **POST /api/registrar/students** - Create student
- **GET /api/registrar/students** - List students
- **GET /api/registrar/students/:id** - Get student details
- **PATCH /api/registrar/students/:id** - Update student
- **DELETE /api/registrar/students/:id** - Delete student

**Block Assignment APIs:**
- **POST /api/registrar/block-subject-assignments** - Assign students to blocks/sections
- **DELETE /api/registrar/block-subject-assignments/:id** - Remove block assignment
- **GET /api/registrar/block-subject-assignments** - List block assignments

**Professor APIs:**
- **GET /api/registrar/professor-course-loads** - Get professor's class loads
- **GET /api/registrar/professors** - List professor accounts

**Grade APIs:**
- **GET /api/registrar/students/:id/report-card** - Generate report card
- **GET /api/registrar/students/:id/transcript** - Generate transcript
- **GET /api/registrar/sections/:sectionId/subjects/:subjectId/grade-sheet** - Generate grade sheet

**Enrollment APIs:**
- **GET /api/registrar/students/next-number** - Get next student number
- **POST /api/registrar/students/:id/cor** - Generate COR

## 13. Frontend Pages

### Enrollment-Related Frontend Components:

**StudentManagement.tsx**
- **Path**: `admin/src/components/StudentManagement.tsx`
- **Purpose**: Main student management interface
- **APIs Called**: All student CRUD, block assignment, COR generation
- **Enrollment Data Read**: Student records, enrollment status, block assignments
- **Enrollment Data Written**: Student updates, block assignments
- **Important State**: `students`, `selectedStudentIds`, `enrollmentStudents`, `blockAssignmentStudents`

**StudentWizard.tsx**
- **Path**: `admin/src/components/AddStudent/StudentWizard.tsx`
- **Purpose**: Multi-step student creation wizard
- **APIs Called**: Student creation
- **Enrollment Data Read**: None
- **Enrollment Data Written**: New student record with course, yearLevel, semester, schoolYear
- **Important State**: Wizard form data, current step

**EnrollmentModal.tsx**
- **Path**: `admin/src/components/EnrollmentModal.tsx`
- **Purpose**: Student enrollment interface
- **APIs Called**: Enrollment creation/update
- **Enrollment Data Read**: Student records, available subjects
- **Enrollment Data Written**: Enrollment records with subjects
- **Important State**: Selected students, enrollment data

**BlockAssignmentModal.tsx**
- **Path**: `admin/src/components/BlockAssignmentModal.tsx`
- **Purpose**: Block/section assignment interface
- **APIs Called**: Block assignment API
- **Enrollment Data Read**: Available blocks/sections, student records
- **Enrollment Data Written**: StudentBlockAssignment records
- **Important State**: Selected students, selected block/section

## 14. Actual Enrollment Architecture

### CURRENT ENROLLMENT MODEL:

```
Student Record
├── Core student data (personal info, contact)
├── Academic data
│   ├── course (e.g., 101, 102, 201)
│   ├── yearLevel (1-4)
│   ├── semester ("1st", "2nd")
│   ├── schoolYear ("2026-2027")
│   ├── enrollmentStatus ("Enrolled", "Not Enrolled")
│   ├── corStatus ("Pending", "Verified")
│   └── schedule (array of schedule objects)
└── lifecycleStatus (computed field)

Enrollment Record
├── studentId → Student._id
├── semester ("1st", "2nd")
├── schoolYear ("2026-2027")
├── yearLevel (1-4)
├── course (e.g., 101, 102, 201)
├── status ("Enrolled", "Not Enrolled", "Dropped")
├── isCurrent (boolean)
├── subjects[]
│   ├── code
│   ├── title
│   ├── units
│   ├── instructor
│   ├── grade
│   ├── status
│   └── subjectId → Subject._id
└── gradeSubmission
    └── status ("Draft", "Submitted")

StudentBlockAssignment
├── studentId → Student._id
├── sectionId → BlockSection._id
├── semester ("1st", "2nd")
├── year (2026 - numeric, different format)
└── status ("ASSIGNED", "UNASSIGNED")

BlockSection
├── blockGroupId → BlockGroup._id
├── sectionCode
├── currentPopulation
└── capacity

BlockGroup
├── name (e.g., "101-1-BEED")
├── semester ("1st", "2nd")
└── year (2026 - numeric)

Subject
├── code
├── title
├── units
└── isActive
```

## 15. Root of Confusion

### Why the Enrollment System is Difficult to Reason About:

**1. Multiple Sources of Truth**
- **Semester**: Stored in 3 places (Student, Enrollment, StudentBlockAssignment) with different update logic
- **School Year**: Stored in 3 places with different formats (string vs numeric)
- **Course/Year Level**: Duplicated between Student and Enrollment records
- **Enrollment Status**: Duplicated between Student and Enrollment

**2. Missing Relationships**
- **No foreign key constraints**: Relationships are maintained by application logic, not database
- **Optional StudentBlockAssignment**: Students can be enrolled without block assignment
- **No professor-section relationship**: Professor assignment exists only in Enrollment.subjects.instructor

**3. Optional IDs**
- **sectionId can be null**: StudentBlockAssignment exists but sectionId might be empty
- **subjectId can be null**: Subjects in Enrollment might not reference Subject collection
- **instructor can be string**: Professor assignment uses name string, not ID reference

**4. Mismatched Semester/School Year Logic**
- **Format inconsistency**: Student/Enrollment use string "2026-2027", StudentBlockAssignment uses numeric 2026
- **Comparison logic**: Some APIs use exact string match, others use numeric comparison
- **No conversion function**: Inconsistent handling between string and numeric years

**5. Different APIs Using Different Enrollment Logic**
- **Student list**: Uses Student.enrollmentStatus
- **Enrollment modal**: Uses Enrollment.status
- **Block assignment**: Uses StudentBlockAssignment.status
- **Professor course loads**: Complex query using StudentBlockAssignment + Enrollment
- **Grade reports**: Uses Enrollment.subjects

**6. Circular or Indirect Relationships**
- **Professor → Students**: Requires going through Enrollment.subjects.instructor OR StudentBlockAssignment
- **Schedule → Subjects**: No direct relationship, schedule is independent of enrollment
- **Block → Subjects**: No direct relationship, subjects assigned via Enrollment

**7. Code Assumptions**
- **Assumes semester consistency**: Code assumes all 3 semester fields match
- **Assumes year format conversion**: Code assumes numeric year can be converted to school year
- **Assumes instructor string matching**: Uses string comparison for professor names
- **Assumes enrollment = block assignment**: Some features assume enrollment implies block assignment

**8. Data Synchronization Issues**
- **No update cascade**: Updating Student.course doesn't update Enrollment.course
- **No validation**: Can create Enrollment with different semester than Student
- **No cleanup**: Deleting StudentBlockAssignment doesn't update Enrollment
- **No consistency checks**: Can have conflicting data across collections

### Core Problem:
The enrollment system lacks a single source of truth and relies on multiple loosely coupled collections that can become inconsistent. The system duplicates critical enrollment information across different collections with different update patterns, making it difficult to determine the "true" enrollment state of a student at any given time.
