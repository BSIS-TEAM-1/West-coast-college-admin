# West Coast College Admin System - Feature Inventory

## Scan Date
- 2026-03-20

## Scope
- Frontend package at `admin/src`
- Backend API at `admin/server`
- Feature files and related route definitions
- Mobile folder scan at `west_coast_college_mobile_app/west_coast_flutter_app`

## Core Features
- Authentication and session entry
  - Public landing and policy pages: `LandingPage`, `AboutPage`, `TermsPolicyPage`, `CookiePolicyPage`, `CookieSystemPage`.
  - Login methods: username/password at `/api/admin/login`, Google auth at `/api/admin/google-login`, and login email verification challenge at `/api/admin/login/verify-email`.
  - Session restore and health checks in `App.tsx`.
  - Logout flow with token cleanup at `/api/admin/logout`.
  - Role-aware routing by `accountType`: admin -> `Dashboard`, registrar -> `RegistrarDashboard`, professor -> `ProfessorDashboard`.

- Admin role core workspace
  - Sidebar dashboard entry points: Dashboard, System Health, Manage Announcements, COR Generation, Add Account, System Audit Logs, Staff Registration Logs, Profile, Settings.
  - Admin dashboard home cards and metrics from `SystemHealth` and `api/admin/system-health`.
  - Dashboard activity list from registrations feed and announcement feed in `/api/admin/registration-logs` and `/api/admin/announcements`.
  - Add account management at `/api/admin/accounts`.
  - Staff registration log review and deletion via `AccountLogs`.
  - Audit logs viewer via `AuditLogs`.
  - System health operations including manual backup trigger at `/api/admin/backup/create`.
  - Security operations at `Security` including security scans, header scans, blocked IP CRUD, and audit view.

- Registrar role core workspace
  - Student management and lifecycle (`StudentManagement` component) over registered registrar routes for students, enrollments, and subject assignment.
  - Block management and section management using block routes.
  - Professor assignment and load management through `RegistrarCourseManagement` and `RegistrarCourseWorkspace`.
  - Reports workspace (`RegistrarReportsPanel`).
  - COR generation using `CorGeneration`.
  - Announcements, profile, settings, and announcement detail flow.

- Professor role core workspace
  - Assigned workload retrieval from `GET /api/professor/assigned-blocks`.
  - Course tree and detail views.
  - Student roster browsing.
  - Schedule management with list and timetable modes.
  - Announcements, profile, and settings.

- Shared operational features
  - Profile management with avatar updates and identity details (`Profile`, `PersonalDetails`).
  - Notification-level email and phone verification flows in `/api/admin/profile/*`.
  - Theme and accent customization stored via local settings.
  - React hooks based role-based UI composition and responsive navigation.

## Backend Core Features
- Auth and account APIs
  - `POST /api/admin/signup`
  - `POST /api/admin/login`
  - `POST /api/admin/google-login`
  - `POST /api/admin/login/verify-email`
  - `POST /api/admin/logout`
  - `GET /api/admin/profile`
  - `PATCH /api/admin/profile`
  - `POST /api/admin/profile/email/send-code`
  - `POST /api/admin/profile/email/verify`
  - `POST /api/admin/profile/email/change/request`
  - `POST /api/admin/profile/email/change/verify`
  - `POST /api/admin/profile/phone/send-code`
  - `POST /api/admin/profile/phone/verify`
  - `POST /api/admin/avatar`
  - `DELETE /api/admin/avatar`

- Admin management and user operations
  - `GET /api/admin/accounts`
  - `GET /api/admin/accounts/count`
  - `POST /api/admin/accounts`
  - `DELETE /api/admin/accounts/:id`

- Core content APIs
  - Public announcements: `GET /api/announcements`, `GET /api/announcements/:id`.
  - Admin announcements management: `GET /api/admin/announcements`, `POST /api/admin/announcements`, `PUT /api/admin/announcements/:id`, `DELETE /api/admin/announcements/:id`.

- Registrar student APIs mounted on `/api/registrar` and `/registrar`
  - `GET /api/registrar/students`
  - `POST /api/registrar/students`
  - `GET /api/registrar/students/next-number`
  - `GET /api/registrar/students/:id`
  - `GET /api/registrar/students/number/:studentNumber`
  - `GET /api/registrar/students/:id/cor`
  - `PUT /api/registrar/students/:id`
  - `DELETE /api/registrar/students/:id`
  - `POST /api/registrar/students/:id/enroll`
  - `GET /api/registrar/students/:id/current-enrollment`
  - `GET /api/registrar/students/:id/enrollments`
  - `GET /api/registrar/professors`
  - `GET /api/registrar/professor-course-loads`
  - `GET /api/registrar/sections/:sectionId/subject-assignments`
  - `POST /api/registrar/sections/:sectionId/subject-assignment`
  - `PUT /api/registrar/sections/:sectionId/subject-assignment`
  - `DELETE /api/registrar/sections/:sectionId/subject-assignment/:subjectId`
  - `GET /api/registrar/subjects`
  - `POST /api/registrar/subjects`
  - `PUT /api/registrar/subjects/:id`
  - `DELETE /api/registrar/subjects/:id`

- Block and section management
  - `GET /api/blocks/groups`
  - `POST /api/blocks/groups`
  - `GET /api/blocks/groups/:groupId/sections`
  - `POST /api/blocks/groups/:groupId/sections`
  - `DELETE /api/blocks/groups/:groupId`
  - `GET /api/blocks/sections/:sectionId/students`
  - `POST /api/blocks/assign-student`
  - `POST /api/blocks/overcapacity/decision`
  - `GET /api/blocks/suggested-sections`
  - `POST /api/blocks/rebalance`
  - `DELETE /api/blocks/sections/:sectionId/students/:studentId`
  - `PATCH /api/blocks/sections/:sectionId/adviser`
  - `GET /api/blocks/assignable-students`

- Document, storage, and download APIs
  - `GET /api/documents`
  - `GET /api/admin/documents`
  - `POST /api/admin/documents`
  - `PUT /api/admin/documents/:id`
  - `POST /api/admin/documents/:id/download`
  - `DELETE /api/admin/documents/:id`

- Security and audit infrastructure
  - `GET /api/admin/security-metrics`
  - `GET /api/admin/error-logs`
  - `GET /api/admin/audit-logs`
  - `GET /api/admin/audit-logs/stats`
  - `GET /api/admin/blocked-ips`
  - `GET /api/admin/blocked-ips/logs`
  - `POST /api/admin/blocked-ips`
  - `DELETE /api/admin/blocked-ips/:id`
  - `DELETE /api/admin/blocked-ips/by-ip/:ipAddress`
  - `POST /api/admin/security-scan`
  - `POST /api/admin/security-headers-scan`

- Monitoring, support, and operations
  - `GET /api/admin/system-health`
  - `GET /api/admin/test-account-types`
  - `GET /api/admin/registration-logs`
  - `GET /api/admin/debug-admins`
  - `GET /api/admin/test-atlas`
  - `POST /api/admin/sms/send-test`
  - `POST /api/admin/backup/create`
  - `GET /api/admin/backup/history`
  - `POST /api/admin/backup/restore`
  - `GET /api/admin/backup/stats`
  - `GET /api/admin/server-stats`
  - `GET /api/admin/bandwidth-stats`
  - `GET /api/health` for public health check

## Additional and Partial Features
- DocumentManagement page currently renders `Maintenance` placeholder in UI, while backend document endpoints are implemented.
- Professor Grades feature is a placeholder in `ProfessorDashboard.tsx` and does not yet include grade entry workflows.
- Calendar page is currently local and seeded with static sample events; there is no persistent calendar API integration.
- Security page includes a placeholder action "Security settings coming soon" that currently only shows an alert.
- `AccountLogs` export action exists in UI but logs export behavior is not implemented.
- `SignUp.tsx` and `RegistrarLogin.tsx` pages are present but not part of the active routing flow in current App navigation.
- `auditlogs-test.tsx` is present for development-style testing but not in main navigation.
- Mobile app folder exists but Flutter app remains a default template scaffold with no implemented college admin screens.

## Notes for maintenance
- The previous feature file had several encoding artifacts. This version is ASCII-clean and sorted by implementation status.
