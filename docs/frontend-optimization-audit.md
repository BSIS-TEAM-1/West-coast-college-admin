# Frontend Size and Optimization Audit

Date: 2026-04-04
Scope: `admin/src` and the production frontend build from `admin`

## Short Answer

Yes, the website build is bigger than it should be.

Two different size problems are happening:

1. The deployment artifact is very large because `dist` contains three MP4 files totaling about `182.49 MB`.
2. The initial frontend bundle is also larger than it needs to be because the app eagerly imports large dashboard/page modules and their CSS into one main bundle.

Source code size by itself is not the real problem. The real issue is production payload and how much code/assets are shipped together.

## Measured Build Output

Build command used:

```bash
npm --prefix admin run build
```

Observed Vite output:

- `dist/assets/index-73R4Y7R7.js`: `843.25 kB` before gzip, `214.24 kB` gzip
- `dist/assets/index-N49B-xIA.css`: `517.29 kB` before gzip, `76.86 kB` gzip
- Vite warned that some chunks are larger than `500 kB`

Observed `dist` totals:

- Total `dist` size: `186.80 MB`
- JavaScript total: `0.80 MB`
- CSS total: `0.49 MB`
- Video total: `182.49 MB`
- Image total: `3.02 MB`

Largest files in `dist`:

- `admin/public/2024introvid.mp4`: `100.41 MB`
- `admin/public/2024SHSintrovid.mp4`: `73.52 MB`
- `admin/public/landingpagevideo.mp4`: `8.56 MB`

Important note:

- Your landing page videos use `preload="metadata"`, so browsers may not immediately download the full video on first paint.
- Even so, these files still make the deployment artifact massive, slow down uploads/releases, and create very large bandwidth spikes once users play them.

## Main Causes

### 1. Landing page videos dominate the build size

The landing page hardcodes three large MP4 files in [`admin/src/pages/LandingPage.tsx`](../admin/src/pages/LandingPage.tsx) at lines around `27-43`.

The build also reported:

- `ffmpeg not found. Skipping compression.`

That means your intended optimization pipeline did not run, so raw videos were copied into `dist`.

### 2. The app eagerly imports almost every major page

[`admin/src/App.tsx`](../admin/src/App.tsx) eagerly imports:

- `LandingPage`
- `AboutPage`
- `Dashboard`
- `RegistrarDashboard`
- `ProfessorDashboard`
- `DocumentViewerRoute`

These imports appear at lines `15-25`.

Because of this, the landing page/login experience is bundled together with heavy admin, registrar, and professor code instead of loading those sections only when needed.

### 3. Very large page modules are bundled together

Largest TypeScript/TSX files found:

- `ProfessorDashboard.tsx`: `211.6 KB`
- `RegistrarDashboard.tsx`: `118.7 KB`
- `DocumentManagement.tsx`: `109.4 KB`
- `StudentManagement.tsx`: `101.7 KB`
- `Security.tsx`: `70.6 KB`

These are large enough that they should not all be part of the same first-load bundle.

### 4. CSS is also unusually large

Largest CSS files found:

- `ProfessorDashboard.css`: `86.7 KB`
- `RegistrarDashboard.css`: `84.1 KB`
- `LandingPage.css`: `44.9 KB`
- `DocumentManagement.css`: `39.9 KB`
- `Security.css`: `36.6 KB`

Because the app eagerly imports most major screens, these styles are effectively merged into one large built stylesheet.

## Likely Unnecessary or Dead Code

These items look unused or outdated based on reference scans in `admin/src`. They should be confirmed quickly, then removed if no longer needed.

### Likely unused files

- [`admin/src/pages/RegistrarLogin.tsx`](../admin/src/pages/RegistrarLogin.tsx)
  - No references found.
- [`admin/src/pages/SignUp.tsx`](../admin/src/pages/SignUp.tsx)
  - No component references found. Only `signUp` API types/functions exist in `authApi.ts`.
- [`admin/src/components/EventCalendar.tsx`](../admin/src/components/EventCalendar.tsx)
  - No references found.
- [`admin/src/components/EventCalendar.css`](../admin/src/components/EventCalendar.css)
  - Only referenced by the unused `EventCalendar.tsx`.
- [`admin/src/assets/react.svg`](../admin/src/assets/react.svg)
  - No references found. Looks like leftover Vite starter asset.

### Legacy code kept in large production files

- [`admin/src/pages/RegistrarDashboard.tsx`](../admin/src/pages/RegistrarDashboard.tsx)
  - `function LegacyCourseManagement` at line `450`
  - `void LegacyCourseManagement` at line `878`
  - This strongly suggests old code was kept in the file but is no longer rendered.

- [`admin/src/pages/ProfessorDashboard.tsx`](../admin/src/pages/ProfessorDashboard.tsx)
  - `function CourseManagementLegacy` at line `815`
  - `void CourseManagementLegacy` at line `1537`
  - Same pattern: legacy code retained inside a very large production module.

### Test/demo naming shipped into production

- [`admin/src/pages/AuditLogs.tsx`](../admin/src/pages/AuditLogs.tsx) line `1`
  - Re-exports `./auditlogs-test`
- [`admin/src/pages/auditlogs-test.tsx`](../admin/src/pages/auditlogs-test.tsx)
  - This file is not dead; it is actually routed into the admin dashboard.
  - The issue is that a file with `test` naming is part of production code, which usually means unfinished naming, leftover prototype code, or both.

### Placeholder/mock production logic

- [`admin/src/pages/CalendarPage.tsx`](../admin/src/pages/CalendarPage.tsx) line `30`
  - Uses hardcoded `seedEvents`
  - This is not dead code, but it is placeholder logic inside the shipped UI.

- [`admin/src/pages/StatisticsCard.tsx`](../admin/src/pages/StatisticsCard.tsx) line `51`
  - Generates fake historical graph data with `generateHistoricalData(...)`
  - This is used by `SystemHealth.tsx`, but it looks like demo/mock behavior rather than production metrics.

## Likely Unused Frontend Dependencies

Based on import scans across `admin/src`, these dependencies in [`admin/package.json`](../admin/package.json) appear unused by the frontend code:

- `@types/animejs` at line `17`
- `animejs` at line `18`
- `pdfkit` at line `20`
- `react-google-recaptcha` at line `23`
- `react-router-dom` at line `24`
- `@types/react-google-recaptcha` at line `31`

Notes:

- `pdfkit` is used in `admin/server`, but the separate frontend copy in `admin/package.json` appears unnecessary.
- `react-router-dom` is not being used because routing is handled manually through component state and `window.history`.
- `react-google-recaptcha` is not being used because the login page uses your custom helper in `recaptcha.ts` instead.

## Optimization Suggestions

### Priority 1: Fix the video payload

- Compress `2024introvid.mp4` and `2024SHSintrovid.mp4` aggressively before shipping.
- Make sure `ffmpeg` is available in the build/deploy environment so your existing video optimization step actually runs.
- Consider storing these videos outside the main frontend build artifact.
- If they must stay, provide smaller variants like `480p` or `720p` and serve those by default.
- Keep posters for the landing section and only load/play the full video after explicit user interaction.

Expected impact:

- This alone can remove more than `170 MB` from the deployment artifact.

### Priority 2: Add real code splitting

- Use `React.lazy()` and `Suspense` for major screens imported in [`admin/src/App.tsx`](../admin/src/App.tsx).
- Split by role:
  - landing/login/public pages
  - admin dashboard
  - registrar dashboard
  - professor dashboard
- Inside each dashboard, lazy-load heavy secondary pages such as:
  - `DocumentManagement`
  - `Security`
  - `SystemHealth`
  - `Announcements`
  - large registrar/professor workspaces

Expected impact:

- Landing and login users will stop downloading registrar/professor/admin code on first load.
- CSS will also shrink on first load because only the active chunk's CSS needs to be loaded.

### Priority 3: Remove confirmed dead code

- Delete unused files after a quick functional check:
  - `RegistrarLogin.tsx`
  - `SignUp.tsx`
  - `EventCalendar.tsx`
  - `EventCalendar.css`
  - `react.svg`
- Remove legacy functions from:
  - `RegistrarDashboard.tsx`
  - `ProfessorDashboard.tsx`
- Rename or clean up `auditlogs-test.tsx` if it is now real production code.

Expected impact:

- Smaller source tree
- Easier maintenance
- Lower chance of keeping stale CSS and old logic in the bundle

### Priority 4: Remove unused dependencies

- Remove unused packages from `admin/package.json`.
- Rebuild after removal and verify bundle size again.

Expected impact:

- Smaller install footprint
- Faster dependency install
- Lower chance of hidden transitive bloat

### Priority 5: Break up oversized files

- Split `ProfessorDashboard.tsx` into smaller feature modules.
- Split `RegistrarDashboard.tsx` into smaller feature modules.
- Move feature-local helpers/types closer to the subcomponents that use them.

Expected impact:

- Easier code review and maintenance
- Better chunking opportunities
- Lower risk of keeping legacy code around

### Priority 6: Reduce CSS bloat

- Audit the biggest CSS files first:
  - `ProfessorDashboard.css`
  - `RegistrarDashboard.css`
  - `LandingPage.css`
  - `DocumentManagement.css`
  - `Security.css`
- Remove selectors tied to deleted legacy components.
- Prefer feature-level chunk loading over one giant always-loaded stylesheet.
- Consider CSS Modules or a stricter per-feature style boundary if these files keep growing.

## Recommended Cleanup Order

1. Fix video compression/external hosting.
2. Add lazy loading in `App.tsx`.
3. Remove dead files and legacy blocks.
4. Remove unused dependencies.
5. Split large dashboard files.
6. Rebuild and compare bundle sizes again.

## Recent Security & Performance Improvements

### April 6, 2026 - Production-Safe Backup System

**Files Modified:**
- `admin/server/backup.js` - Complete rewrite of restore method for production safety

**Critical Security Improvements:**
- Replaced destructive restore flow with production-safe multi-step process
- Added pre-restore automatic backup creation
- Implemented temporary collection restore with validation
- Added atomic swap strategy with rollback capability
- Enhanced validation at multiple stages (backup, temp, final)
- Comprehensive error handling and rollback mechanisms
- Detailed operational logging for audit trails

**Production Safety Features:**
- Non-destructive restore - original data preserved until success guaranteed
- Temporary collections used for validation before touching live data
- Atomic swap operations prevent partial restore states
- Automatic rollback on any failure point
- Multi-stage validation (backup file, temp collections, final state)
- Pre-restore safety backup creation

**Risk Reduction:**
- Eliminated data loss risk during restore operations
- Database never left in inconsistent state
- Full audit trail for all restore operations
- Recovery path always available

### April 6, 2026 - Server-side Security Enhancements

**Files Modified:**
- `admin/server/index.js`
- `admin/src/lib/documentArchiveApi.ts`
- `admin/src/pages/DocumentViewerRoute.tsx`

**Security Improvements Validated:**
- Unauthorized access to block-management and admin/security routes is reduced immediately
- Document files no longer bypass auth through public `/uploads` URLs
- Access control is now clearer and explicit at the route level
- System health monitoring no longer mutates audit data during reads
- Document preview/download functionality preserved but now through protected paths

**Next Priority File to Fix:**
- `admin/server/securityMiddleware.js` - Contains authentication and authorization logic that needs review for role-based access control and potential security gaps

## Bottom Line

Your frontend is not huge because of JavaScript alone.

It is huge mainly because:

- raw landing videos are being shipped in frontend build
- public pages eagerly import large private dashboard code
- some legacy and unused files are still present

If you only do two things first, do these:

1. stop shipping raw large MP4 files in `dist`
2. lazy-load the dashboard areas instead of importing them all in `App.tsx`
