# Applicant Enrollment Process

This document describes the recommended enrollment process for applicants and students by entry type and year level. It is written as an operational guide for admissions and registrar workflows.

## Scope

This covers these applicant flows:

1. Freshman / new first-year applicant
2. Continuing first-year student
3. Continuing second-year student
4. Continuing third-year student
5. Continuing fourth-year student
6. Transferee applicant
7. Returnee applicant

## Common Enrollment Stages

All applicant types follow the same high-level stages, but the required documents and academic evaluation differ by applicant type.

| Stage | Office / Role | Output |
|---|---|---|
| 1. Online application | Applicant | Applicant starts onboarding |
| 2. Contact information | Applicant | Name, email, and phone number captured |
| 3. Personal details | Applicant | Identity, address, parent/guardian, and emergency details captured |
| 4. Academic details | Applicant | Previous school and grade details captured |
| 5. Course selection | Applicant | Desired course selected from available course data |
| 6. Application submission | Applicant | Application sent to registrar queue |
| 7. Document review | Admissions / Registrar | Requirements marked complete or incomplete |
| 8. Academic evaluation | Registrar / Program Chair | Year level, course, and subject eligibility confirmed |
| 9. Student record creation or update | Registrar | Student profile ready for enrollment |
| 10. Subject assignment | Registrar | Subjects assigned for term |
| 11. Enrollment validation | Registrar | Subject load and enrollment details reviewed |
| 12. Enrollment confirmation | Registrar | Enrollment status set to enrolled |
| 13. COR release | Registrar | Certificate of Registration issued |

## Applicant Statuses

Use these statuses to track the applicant from initial submission to enrollment.

| Status | Meaning |
|---|---|
| `Pending` | Application has been submitted but not yet reviewed |
| `Draft` | Applicant started onboarding but has not submitted yet |
| `Submitted` | Applicant completed onboarding and sent the application to registrar |
| `Incomplete Requirements` | Required documents are missing or invalid |
| `For Evaluation` | Requirements are complete and academic evaluation is needed |
| `Approved for Enrollment` | Applicant is eligible for subject assignment |
| `Enrolled` | Enrollment is confirmed and COR can be released |
| `Rejected` | Applicant is not eligible or did not meet requirements |
| `Cancelled` | Applicant withdrew or enrollment was cancelled |

## Required Information

Every applicant or student should have these details recorded before enrollment.

| Field | Notes |
|---|---|
| Full name | First name, middle name, last name, suffix if applicable |
| Birth date | Used for identity verification |
| Contact number | Required for updates |
| Email address | Optional but recommended |
| Address | Required for student profile |
| Course / program | Desired or approved program |
| Year level | First year, second year, third year, fourth year |
| Semester | First semester, second semester, or summer |
| School year | Example: `2026-2027` |
| Student type | New, old, transferee, returnee |

## Online Applicant Onboarding

Applicants can apply online before the registrar processes the enrollment. The online form should save progress as a draft until the applicant submits the completed application.

### Step 1: Contact Information

This step identifies the applicant and gives admissions or registrar a way to contact them.

| Field | Notes |
|---|---|
| First name | Required |
| Middle name | Optional |
| Last name | Required |
| Suffix | Optional |
| Email address | Required and should be valid |
| Phone number | Required |

### Step 2: Personal Details

This step captures identity, address, family, and emergency contact information.

| Field | Notes |
|---|---|
| Birth date | Required |
| Birth place | Optional but recommended |
| Gender | Optional or based on school policy |
| Civil status | Optional or based on school policy |
| Nationality | Optional |
| Religion | Optional |
| Current address | Required |
| Permanent address | Optional if same as current address |
| Father's name | Required if available |
| Mother's name | Required if available |
| Guardian name | Required if applicant is under guardian care |
| Guardian relationship | Required when guardian name is provided |
| Parent / guardian contact number | Required |
| Emergency contact name | Required |
| Emergency contact relationship | Required |
| Emergency contact number | Required |
| Emergency contact address | Optional |

### Step 3: Academic Details

This step records the applicant's previous schools and academic performance.

| Field | Notes |
|---|---|
| Elementary school name | Required |
| Elementary school address | Optional |
| Elementary year graduated | Required |
| Elementary general average / GPA | Required if available |
| Elementary grades | Can be encoded as summary grades or uploaded record |
| High school / senior high school name | Required |
| High school / senior high school address | Optional |
| Strand or track | Required for senior high school applicants if applicable |
| High school year graduated | Required |
| High school general average / GPA | Required if available |
| High school grades | Can be encoded as summary grades or uploaded report card |

### Step 4: Course Selection

The applicant chooses the course they want to enroll in. The course list should come from the system course data so applicants can only choose active and valid courses.

Current course values used by the registrar/student module:

| Course ID | Code | Course Name |
|---|---|---|
| `101` | `BEED` | Bachelor of Elementary Education |
| `102` | `BSEd-English` | Bachelor of Secondary Education - Major in English |
| `103` | `BSEd-Math` | Bachelor of Secondary Education - Major in Mathematics |
| `201` | `BSBA-HRM` | Bachelor of Science in Business Administration - Major in HRM |

Implementation notes:

- The applicant-facing dropdown should display only active courses.
- The selected course should store the course ID, not only the display label.
- Registrar should still be able to confirm or change the course after evaluation.
- Course, year level, and semester should be used later to filter available subjects.

### Step 5: Submit to Registrar

After the applicant completes the onboarding form:

1. System validates required fields.
2. System saves the applicant record.
3. Applicant status changes from `Draft` to `Submitted`.
4. Application appears in the registrar queue.
5. Registrar reviews the applicant details, academic details, selected course, and submitted requirements.
6. Registrar marks the application as `Incomplete Requirements`, `For Evaluation`, `Approved for Enrollment`, `Rejected`, or `Cancelled`.

## 1. Freshman / New First-Year Applicant

Freshman applicants are new students entering college for the first time.

### Typical Requirements

| Requirement | Notes |
|---|---|
| Senior high school report card | Original or certified true copy |
| Certificate of Good Moral Character | From previous school |
| PSA birth certificate | Photocopy or original for verification |
| Valid ID | Student, school, government, or other accepted ID |
| 2x2 photo | For student profile and records |
| Entrance exam / interview result | If required by the school |

### Process

1. Applicant completes the online onboarding form.
2. Applicant enters name, email, phone number, personal details, parent or guardian details, and academic details.
3. Applicant selects desired course from the active course list.
4. Applicant submits the application to registrar.
5. System creates an applicant record with student type `New` and status `Submitted`.
6. Applicant submits freshman requirements.
7. Admissions or registrar checks documents for completeness.
8. If incomplete, applicant status becomes `Incomplete Requirements`.
9. If complete, applicant status becomes `For Evaluation`.
10. Registrar confirms course, first-year level, semester, and school year.
11. Registrar creates the student record.
12. Registrar assigns first-year subjects based on the course curriculum.
13. Registrar validates the subject load and enrollment details.
14. Registrar marks enrollment as `Enrolled`.
15. Registrar releases the Certificate of Registration.

## 2. Continuing First-Year Student

Continuing first-year students already have a student record and are enrolling for the next term within first year.

### Typical Requirements

| Requirement | Notes |
|---|---|
| Existing student number | Used to find the student record |
| Previous COR | Confirms last enrollment |
| Clearance | Required if the school uses clearance before enrollment |
| Grade record | Used to check passed, failed, or incomplete subjects |

### Process

1. Student requests enrollment for the next term.
2. Registrar searches the existing student record.
3. Registrar checks previous enrollment, grades, and clearance.
4. Registrar confirms the student remains first year.
5. Registrar identifies regular subjects and any repeated subjects.
6. Registrar assigns eligible subjects for the semester.
7. Registrar validates the subject load and enrollment details.
8. Registrar confirms enrollment and releases the COR.

## 3. Continuing Second-Year Student

Second-year enrollment requires checking completed first-year subjects and prerequisites.

### Typical Requirements
|-----------------------------------------------|
| Requirement |               Notes             |
|-------------|---------------------------------|
| Existing student number | Required            |
| Previous COR | Confirms previous term         |
| Clearance | Required if applicable            |
| Grade record | Used for prerequisite checking |

### Process

1. Student requests enrollment for second year.
2. Registrar reviews the student record and previous enrollment history.
3. Registrar checks if first-year subjects and prerequisites are completed.
4. If deficiencies exist, registrar includes repeated or back subjects as allowed.
5. Registrar confirms year level as second year.
6. Registrar assigns second-year subjects based on curriculum and eligibility.
7. Registrar validates the subject load and enrollment details.
8. Registrar confirms enrollment and releases the COR.

## 4. Continuing Third-Year Student

Third-year enrollment usually requires stricter prerequisite and deficiency review.

### Typical Requirements

| Requirement | Notes |
|---|---|
| Existing student number | Required |
| Previous COR | Confirms previous term |
| Clearance | Required if applicable |
| Grade record | Required for prerequisite and deficiency checking |

### Process

1. Student requests enrollment for third year.
2. Registrar checks student status, course, and previous records.
3. Registrar reviews completed first-year and second-year subjects.
4. Registrar identifies failed, incomplete, or missing prerequisite subjects.
5. Program chair or registrar approves any irregular subject load if needed.
6. Registrar confirms year level as third year.
7. Registrar assigns eligible third-year subjects and approved back subjects.
8. Registrar validates the subject load and enrollment details.
9. Registrar confirms enrollment and releases the COR.

## 5. Continuing Fourth-Year Student

Fourth-year enrollment should include graduation-readiness checks when applicable.

### Typical Requirements

| Requirement | Notes |
|---|---|
| Existing student number | Required |
| Previous COR | Confirms previous term |
| Clearance | Required if applicable |
| Grade record | Required |
| Graduation evaluation | Recommended for final-year students |

### Process

1. Student requests enrollment for fourth year.
2. Registrar reviews student record, grades, and previous enrollments.
3. Registrar checks remaining curriculum requirements.
4. Registrar verifies prerequisites for thesis, OJT, practicum, or capstone subjects if applicable.
5. Program chair or registrar approves irregular loads if required.
6. Registrar confirms year level as fourth year.
7. Registrar assigns eligible fourth-year subjects and remaining back subjects.
8. Registrar validates the subject load and enrollment details.
9. Registrar confirms enrollment and releases the COR.
10. Registrar flags student for graduation evaluation if this is the final term.

## 6. Transferee Applicant

Transferees are applicants from another school who want to continue studies at West Coast College.

### Typical Requirements

| Requirement | Notes |
|---|---|
| Transcript of Records or evaluation copy | Used for subject crediting |
| Honorable dismissal / transfer credential | Required for transfer |
| Certificate of Good Moral Character | From previous school |
| PSA birth certificate | For identity verification |
| Valid ID | Required |
| Course descriptions | Needed when evaluating credited subjects |

### Process

1. Applicant submits transferee application.
2. Admissions creates applicant record with student type `Transferee`.
3. Applicant submits transfer requirements.
4. Admissions checks documents for completeness.
5. Registrar evaluates previous subjects and grades.
6. Program chair reviews subject crediting if needed.
7. Registrar determines accepted course, year level, and irregular subjects.
8. Applicant status becomes `Approved for Enrollment` if eligible.
9. Registrar creates the student record.
10. Registrar assigns subjects based on credited subjects and remaining curriculum.
11. Registrar validates the subject load and enrollment details.
12. Registrar confirms enrollment and releases the COR.

## 7. Returnee Applicant

Returnees are former students who stopped enrollment and want to continue.

### Typical Requirements

| Requirement | Notes |
|---|---|
| Previous student number | Used to recover the student record |
| Previous COR | Helps identify last enrolled term |
| Clearance | Required if applicable |
| Grade record | Required for curriculum evaluation |
| Re-admission form | If required by the school |

### Process

1. Returnee requests re-admission.
2. Registrar searches previous student record.
3. Registrar checks account status, clearance, and academic history.
4. Registrar determines if the student follows the old curriculum or must shift to the current curriculum.
5. Program chair reviews curriculum differences if needed.
6. Registrar confirms course, year level, and eligible subjects.
7. Registrar updates student status to `Returnee`.
8. Registrar assigns subjects for the term.
9. Registrar validates the subject load and enrollment details.
10. Registrar confirms enrollment and releases the COR.

## Decision Rules

| Situation | Recommended Action |
|---|---|
| Missing required documents | Mark as `Incomplete Requirements` and notify applicant |
| Online onboarding incomplete | Keep status as `Draft` until required fields are complete |
| Applicant submits onboarding | Mark status as `Submitted` and send to registrar queue |
| Invalid or inactive course selected | Require applicant or registrar to choose an active course |
| Failed prerequisite subject | Do not allow dependent subject unless approved by program chair |
| Irregular student load | Require registrar or program chair approval |
| Transferee subject crediting unclear | Request course descriptions or additional records |
| Returnee curriculum changed | Require curriculum evaluation before subject assignment |
| COR not verified | Do not mark final enrollment as complete |

## Suggested System Flow

1. Applicant starts online onboarding.
2. Applicant enters contact information.
3. Applicant enters personal and parent/guardian details.
4. Applicant enters elementary and high school academic details.
5. Applicant selects course from active course data.
6. Applicant submits application.
7. System sends application to registrar queue.
8. Registrar creates or retrieves applicant/student record.
9. Registrar selects or confirms student type:
   - `New`
   - `Old`
   - `Transferee`
   - `Returnee`
10. Registrar confirms course, year level, semester, and school year.
11. Registrar reviews submitted requirements.
12. Registrar marks requirements as complete or incomplete.
13. Registrar performs academic evaluation.
14. Registrar assigns block section or subject list.
15. Registrar validates subject load and enrollment details.
16. Registrar confirms enrollment.
17. Registrar generates and releases COR.

## Notes for Implementation

- Freshman applicants normally create a new student record.
- Online applications should remain applicant records until the registrar approves them for enrollment.
- Continuing students should reuse the existing student record.
- Transferees may start as applicants, then become students after evaluation.
- Returnees should not create duplicate student records if their old record exists.
- Year level should be based on curriculum evaluation, not only on the applicant's requested year level.
- Applicant-selected course should be treated as requested course until registrar confirms it.
- Enrollment should stay pending until registrar validation and COR verification are complete.
