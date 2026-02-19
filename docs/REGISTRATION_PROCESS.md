# Registration Process (Current Implementation)

This document describes how registration currently works in this project, based on the existing frontend and backend code.

## Scope

This covers three flows:

1. Staff account registration (Admin, Registrar, Professor accounts)
2. Student registration (create student record)
3. Student enrollment registration (assign subjects for a term)

## 1. Staff Account Registration

### Frontend entry point

- `admin/src/pages/AddAccount.tsx`

### Process

1. An authenticated user opens the Add Account page.
2. The UI loads current profile and account count, then auto-generates a `uid`.
3. Form validation runs on submit:
   - `username` is required
   - `password` must be at least 8 characters
   - `confirmPassword` must match
4. Frontend sends `POST /api/admin/accounts` with:
   - `username`
   - `displayName`
   - `accountType` (`admin`, `registrar`, or `professor`)
   - `password`
   - `uid`
5. Backend validates payload and auth token:
   - Route: `admin/server/index.js` (`POST /api/admin/accounts`)
   - Schema: `admin/server/securityMiddleware.js` (`schemas.admin.createAccount`)
6. Backend checks for duplicate `username` and duplicate `uid`.
7. Backend creates account with normalized username, `status: active`, and `createdBy`.
8. Backend writes an audit log entry (`CREATE`, `ADMIN`).
9. API returns `201` with account data (without password).

### Where this appears after creation

- Dashboard and Staff Registration Logs page call:
  - `GET /api/admin/registration-logs`

## 2. Student Registration (Create Student Record)

### Frontend entry point

- `admin/src/components/StudentManagement.tsx`
- API helper: `admin/src/lib/studentApi.js` (`createStudent`)

### Process

1. Registrar opens Student Management.
2. User fills student form and submits.
3. Frontend sends `POST /registrar/students` (server also supports `/api/registrar/students`).
4. Backend route in `admin/server/routes/registrarRoutes.js` calls `StudentController.createStudent`.
5. Controller normalizes and validates:
   - Optional `email` must be unique if provided
   - Invalid/empty optional fields are cleaned
   - `studentStatus` is normalized to allowed values (`Regular`, `Dropped`, `Returnee`, `Transferee`)
   - Default `corStatus` is `Pending`
   - If `corStatus` is `Verified`, `enrollmentStatus` is set to `Enrolled`
6. Student model validation applies:
   - Required fields include `firstName`, `lastName`, `course`, `yearLevel`, `semester`, `schoolYear`, `studentStatus`, `contactNumber`, and `address`
   - If `studentNumber` is missing, it is auto-generated in model pre-validation
7. Backend saves and returns `201` with student data and success message.

## 3. Enrollment Registration (Assign Subjects for Term)

### Frontend entry point

- Registrar dashboard Assign Subject flow:
  - `admin/src/pages/RegistrarDashboard.tsx` (`handleAssignSubjects`)

### Process

1. Registrar selects block group, section, school year, semester, and subjects.
2. Frontend iterates students in the selected section.
3. For each student, frontend sends:
   - `POST /registrar/students/:id/enroll`
   - Body: `schoolYear`, `semester`, `subjectIds[]`
4. Backend route in `admin/server/routes/registrarRoutes.js` calls `StudentController.enrollStudent`.
5. Backend validates:
   - `schoolYear`, `semester`, and `subjectIds` are present
   - student exists
   - no existing active enrollment for same term
6. Backend creates enrollment:
   - maps subjects from `subjectIds`
   - computes units and assessment
   - sets enrollment `status: Pending`
7. Backend returns `201` with enrollment record.

## 4. Registration Logs

### Endpoint

- `GET /api/admin/registration-logs`

### Behavior

1. Requires valid auth token.
2. Returns latest 50 admin account records with:
   - `username`
   - `accountType`
   - `displayName`
   - `createdAt`
3. Used by:
   - `admin/src/pages/Dashboard.tsx`
   - `admin/src/pages/StaffRegistrationLogs.tsx`

## 5. Legacy Endpoint (Optional)

- `POST /api/admin/signup` exists in `admin/server/index.js`.
- It creates an admin user with only `username` and `password`.
- Main current UI flow for staff registration is the Add Account flow, not this endpoint.

## 6. Quick Endpoint Summary

| Flow | Method | Endpoint |
|---|---|---|
| Staff account create | `POST` | `/api/admin/accounts` |
| Staff registration logs | `GET` | `/api/admin/registration-logs` |
| Student create | `POST` | `/registrar/students` or `/api/registrar/students` |
| Student enroll | `POST` | `/registrar/students/:id/enroll` or `/api/registrar/students/:id/enroll` |

