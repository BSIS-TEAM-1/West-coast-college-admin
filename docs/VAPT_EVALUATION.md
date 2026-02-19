# VAPT Evaluation Report

Date: 2026-02-18  
Project: `WCC-Admin`  
Type: Static code review + dependency audit (`npm audit`)  
Assessor: Codex

## Scope
- `admin/server/index.js`
- `admin/server/securityMiddleware.js`
- `admin/server/models/Admin.js`
- `admin/server/models/AuthToken.js`
- `admin/server/backup.js`
- `admin/src/lib/authApi.ts`
- `admin/src/pages/PersonalDetails.tsx`

## Method
- Manual source inspection for authn/authz, input validation, secrets handling, and high-risk operations.
- Package vulnerability scan:
  - `npm audit --prefix admin/server --json`
  - `npm audit --prefix admin --json`

## Executive Summary
The application has multiple high-impact backend security gaps. The most serious are unauthenticated account creation, missing RBAC on privileged endpoints, and unsafe backup restore handling. These can enable privilege escalation, administrative misuse, and destructive data operations.

## Findings

### 1) Public admin account creation endpoint
Severity: **Critical**  
Risk: Unauthorized users can create accounts through a public signup path.  
Evidence:
- `admin/server/index.js:403` (`POST /api/admin/signup` has no auth middleware)
- `admin/server/models/Admin.js:27` (default `accountType: 'admin'`)

### 2) Missing role-based authorization on privileged endpoints
Severity: **Critical**  
Risk: Authenticated non-admin roles can access admin-grade operations because only token authentication is enforced.  
Evidence:
- `admin/server/index.js:895` (`POST /api/admin/accounts`)
- `admin/server/index.js:967` (`DELETE /api/admin/accounts/:id`)
- `admin/server/index.js:2409` (`POST /api/admin/backup/restore`)

Related logic flaw:
- Self-delete check compares `ObjectId` to string and may not work reliably:
  - `admin/server/index.js:985`
- Delete restriction logic only checks admin-vs-admin case:
  - `admin/server/index.js:990`

### 3) Unsafe backup restore filename handling + destructive restore flow
Severity: **Critical**  
Risk: User-provided filename is not normalized/allowlisted before file access; restore procedure deletes collection data before re-insert.  
Evidence:
- `admin/server/index.js:2415` (`backupFileName` from request body)
- `admin/server/backup.js:437` (`path.join` with request-supplied file name)
- `admin/server/backup.js:450` (`deleteMany({})` on collections during restore)

### 4) Joi validation contract mismatch (validation mostly not applied)
Severity: **High**  
Risk: Route schemas use `{ body/query/params }` while middleware expects `{ bodySchema/querySchema/paramsSchema }`, reducing validation to key-sanitization only.  
Evidence:
- Middleware expects schema keys:
  - `admin/server/securityMiddleware.js:54`
  - `admin/server/securityMiddleware.js:64`
  - `admin/server/securityMiddleware.js:74`
- Routes pass different keys:
  - `admin/server/index.js:433`
  - `admin/server/securityMiddleware.js:141`

### 5) Sensitive data logging (tokens/password-related data)
Severity: **High**  
Risk: Logs may leak credentials/session artifacts.  
Evidence:
- `admin/server/index.js:902` (logs create-account request body)
- `admin/server/index.js:669` (logs login response containing `token`)
- `admin/server/index.js:906` (logs password length metadata)

### 6) IP-based lockout can be spoofed/bypassed
Severity: **Medium**  
Risk: Login lockout state is keyed by resolved client IP and can be influenced via forwarded headers; potential bypass or memory growth via spoofed IPs.  
Evidence:
- In-memory state map:
  - `admin/server/index.js:88`
- IP extraction from headers:
  - `admin/server/index.js:382`
- Login lockout usage:
  - `admin/server/index.js:448`

### 7) Blocked-IP status endpoint is public
Severity: **Medium**  
Risk: Exposes internal security status and reason text to unauthenticated users.  
Evidence:
- `admin/server/index.js:2980` (`GET /api/admin/blocked-ips/:ipAddress` has no auth middleware)

### 8) Disabled/suspended account status not enforced in auth middleware
Severity: **Medium**  
Risk: If a token remains active, account status (`inactive`/`suspended`) is not checked during request auth.  
Evidence:
- Auth checks token validity and admin existence only:
  - `admin/server/index.js:140`
  - `admin/server/index.js:151`
- Status field exists in model:
  - `admin/server/models/Admin.js:45`

### 9) Frontend token storage + inconsistency
Severity: **Medium**  
Risk: Tokens in `localStorage` are exposed to XSS impact; one page uses a different key (`token` vs `auth_token`) causing auth handling inconsistency.  
Evidence:
- Token storage key:
  - `admin/src/lib/authApi.ts:4`
- Local storage usage:
  - `admin/src/lib/authApi.ts:24`
- Inconsistent key usage:
  - `admin/src/pages/PersonalDetails.tsx:73`

## Dependency Audit Snapshot

### Backend (`admin/server`)
- Result: **1 low** vulnerability.
- Package: `qs`
- Advisory: GHSA-w7fw-mjwx-w883 (arrayLimit bypass / potential DoS)

### Frontend (`admin`)
- Result: **10 moderate** vulnerabilities, primarily in lint/dev toolchain dependencies (`eslint`/`typescript-eslint` chain).

## Recommended Remediation Order
1. Lock down `/api/admin/signup` (remove, restrict, or convert to invite/bootstrap-only).
2. Add RBAC middleware and enforce admin-only access on privileged routes.
3. Harden backup restore input:
   - Use `path.basename`
   - Restrict to files inside backup directory
   - Allowlist extension and existing file set
4. Fix validation middleware contract so Joi schemas are actually enforced.
5. Remove sensitive logs and rotate any exposed credentials/tokens.
6. Enforce account status checks in `authMiddleware`.
7. Protect blocked-IP lookup endpoint with auth + role check.
8. Address package advisories and pin patched versions.

## Notes
- This report is based on static review and dependency audit output only.
- No active exploitation, fuzzing, or live penetration tests were performed in this pass.
