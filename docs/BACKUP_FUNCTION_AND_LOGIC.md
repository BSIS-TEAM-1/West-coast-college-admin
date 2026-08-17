# Backup Function and Disaster Recovery Logic

## Overview

The WCC Admin backup system creates verified MongoDB restore points while preserving the existing System Health workflow and API routes. Backup creation now follows a write-verify-promote-rotate sequence: no existing restore point is removed until the replacement is complete and verified.

## Source Files

| Area | File |
| --- | --- |
| Backup engine | `admin/server/backup.js` |
| Storage adapter | `admin/server/services/backupStorage.js` |
| Metadata model | `admin/server/models/Backup.js` |
| API, scheduler, audit integration | `admin/server/index.js` |
| System Health UI | `admin/src/pages/SystemHealth.tsx` |
| Backup management panel | `admin/src/components/BackupDashboard.tsx` |
| Safety tests | `admin/server/backup.test.js` |

`backup.js` is the active engine. The older `backup-safe.js` file is not imported by the server.

## Safety Invariants

1. Existing backups are never deleted before a new backup passes verification.
2. Pending output uses unique temporary filenames.
3. JSON and gzip files are atomically promoted only after validation.
4. Manual and emergency backups are protected from automatic retention.
5. Retention considers only completed, verified, unprotected automatic backups.
6. Only one create, verify, restore, rename, or delete operation runs per server process.
7. Restore cannot begin until the selected backup passes preflight verification and a protected emergency backup succeeds.
8. History and statistics reconcile MongoDB metadata with configured storage.

## Backup Types

| Type | Trigger | Automatically protected | Automatic retention |
| --- | --- | --- | --- |
| `manual` | **BACKUP NOW** | Yes | Excluded |
| `scheduled` | Every six hours | No | Included |
| `initial` | Two seconds after database connection | No | Included |
| `emergency` | Before restore | Yes | Excluded |
| `legacy` | Imported during reconciliation | Yes | Excluded |

## Verified Creation Flow

```text
Acquire operation lock
        |
Create in-progress metadata
        |
Stream MongoDB collections into .pending-<uuid>.json
        |
Stream gzip into .pending-<uuid>.json.gz
        |
SHA-256 both files
        |
Decompress archive and compare its content hash
        |
Parse JSON and validate structure + collection counts
        |
Atomically rename temporary files to final names
        |
Mark metadata completed + verified
        |
Rotate old eligible automatic backups
        |
Release operation lock
```

If any step fails, pending files and any final files belonging only to that failed operation are removed. Existing backups remain untouched. The metadata record is marked failed with the error and duration.

## Export Format

The existing JSON format remains compatible:

```json
{
  "timestamp": "2026-08-01T10:30:15.123Z",
  "version": "1.0",
  "collections": {
    "admins": [],
    "students": []
  }
}
```

Collections are exported with a MongoDB cursor and written incrementally. This avoids holding the entire database in application memory during creation. Integrity verification and restore still parse one complete backup, so memory must be sized for the largest verified restore point.

## Integrity Verification

Every successful backup records:

- SHA-256 of the JSON file;
- SHA-256 of the gzip archive;
- verification status and time;
- per-collection counts;
- total document count;
- uncompressed and compressed sizes;
- operation duration.

Verification checks:

1. JSON and archive presence.
2. Stored checksums, when available.
3. Successful gzip decompression.
4. Equality between the decompressed archive and JSON hash.
5. Valid JSON root, timestamp, version, and collections object.
6. Every collection value is an array.
7. Current per-collection counts match metadata.

Corrupt or mismatched backups receive `verificationStatus: failed`. Missing files receive `verificationStatus: missing`.

## Retention

Set automatic retention with:

```env
BACKUP_RETENTION_COUNT=10
```

After a new backup is verified, the engine sorts eligible automatic backups newest first and removes only entries beyond the limit. It excludes manual, emergency, legacy, protected, running, failed, pending, missing, and unverified entries. Files are removed before metadata; if filesystem deletion is incomplete, metadata remains and records the rotation error.

## Protected Backups

Manual and emergency backups default to `isProtected: true`. Protection can also be changed through the API. A protected backup requires an explicit confirmed deletion request and is never removed by retention.

## Operation Lock

The engine exposes one in-process mutex shared by backup and restore operations. A conflicting request returns:

```json
{
  "success": false,
  "code": "BACKUP_BUSY",
  "error": "Backup system is busy with backup"
}
```

Manual API conflicts return HTTP 409. Scheduled jobs log the busy result and wait until their next interval. In multi-instance deployment, use a distributed lock before enabling backup jobs on more than one application instance.

## Restore Flow

```text
Acquire operation lock
        |
Find metadata and verify selected backup
        |
Create and verify protected emergency backup
        |
Create temporary collections (including empty collections)
        |
Validate temporary collection counts
        |
Rename current collections to operation-scoped swap names
        |
Promote temporary collections
        |
Validate final counts
        |
Drop operation-scoped swap collections
        |
Release lock
```

If the emergency backup fails, restore is aborted before data changes. If a later step fails, rollback removes newly promoted collections where needed and restores only swap collections belonging to that restore operation.

## Metadata Reconciliation

The `Backup` collection is the source used for history and statistics. Before those values are returned, reconciliation:

- marks completed metadata as missing when its JSON file is absent;
- discovers orphan JSON files;
- verifies orphan JSON/gzip pairs;
- imports valid orphan files as protected legacy backups;
- imports corrupt orphan files as failed records.

This prevents the history and System Health status from silently disagreeing with local storage.

## Storage Configuration

The engine accesses storage through `services/backupStorage.js`.

```env
BACKUP_STORAGE_PROVIDER=local
BACKUP_STORAGE_PATH=/durable/path/to/backups
```

Supported built-in providers:

- `local`
- `railway-volume` (filesystem adapter pointed at a mounted Railway Volume)

The adapter boundary is ready for S3/R2 implementations, but cloud SDKs and credentials are intentionally not embedded in the core engine. Selecting an unavailable provider fails fast instead of silently writing to local ephemeral storage.

## API Reference

All routes require authentication and the admin role. Mutating and download routes use the admin action rate limiter.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/admin/backup/create` | Create a verified manual backup |
| `GET` | `/api/admin/backup/history` | Reconcile and list metadata |
| `GET` | `/api/admin/backup/stats` | Monitoring summary |
| `POST` | `/api/admin/backup/verify` | Re-run integrity checks |
| `POST` | `/api/admin/backup/restore` | Preflight, emergency backup, and restore |
| `PATCH` | `/api/admin/backup/protection` | Protect or unprotect a backup |
| `PATCH` | `/api/admin/backup/rename` | Rename JSON/archive files and metadata |
| `DELETE` | `/api/admin/backup/delete` | Explicit confirmed deletion |
| `GET` | `/api/admin/backup/download/:fileName` | Authenticated gzip download |

Create and restore retain their original route names and response shape, with additional integrity fields.

## System Health and Backup Dashboard

System Health reports:

- latest verified backup;
- expected next automatic backup;
- total and failed backup counts;
- verification status;
- local storage usage;
- latest duration;
- success rate;
- active operation;
- last restore in the current server process.

The history panel provides search, filtering, pagination, responsive layout, dark-theme tokens, integrity/protection badges, and actions for verify, restore, download, rename, protect, and confirmed delete.

## Audit and Logging

Manual create, restore, verify, delete, and download operations produce audit records containing the authenticated user, role, timestamp, IP, user agent, action, result, resource ID, and relevant backup details. Engine errors include operation context and are sent to server logs. Scheduled and startup operations are logged by the server scheduler.

## Remaining Production Considerations

The refactor removes the immediate data-loss defects, but deployment owners must still address infrastructure-specific requirements:

1. Implement and test S3 or R2 adapters if cloud object storage is required.
2. Add a distributed lock for multiple server replicas.
3. Store `BACKUP_STORAGE_PATH` on durable storage; container-local disks are not disaster recovery.
4. Add KMS-backed archive encryption before backups leave a trusted encrypted volume. Encryption keys must never be stored in metadata or source code.
5. Replicate uploaded files separately; MongoDB backup does not include `admin/server/uploads/`.
6. Add external notifications using the institution's chosen email/SMS/incident service.
7. Run scheduled restore drills against an isolated database and document RPO/RTO results.
8. Consider a streaming JSON parser for verification and restore when backups approach the server memory limit.

## Validation

Run the dependency-free backend safety tests:

```powershell
node --test admin/server/backup.test.js
```

Validate server syntax:

```powershell
node --check admin/server/backup.js
node --check admin/server/index.js
```

Validate the Admin frontend:

```powershell
npm --prefix admin run build
```

## Enterprise Enhancement Configuration

```env
# Version compatibility
APP_VERSION=1.0.0
DB_SCHEMA_VERSION=1

# Optional AES-256-GCM encryption. Key must decode to exactly 32 bytes.
BACKUP_ENCRYPTION=true
BACKUP_ENCRYPTION_KEY=<base64-or-64-character-hex-key>

# Grandfather-father-son automatic retention
BACKUP_RETENTION_HOURLY=48
BACKUP_RETENTION_DAILY=30
BACKUP_RETENTION_WEEKLY=12
BACKUP_RETENTION_MONTHLY=12

# Restore verification and recovery objectives
BACKUP_RESTORE_TEST_INTERVAL_HOURS=168
BACKUP_MAX_AGE_HOURS=24
BACKUP_RPO_HOURS=6
BACKUP_RTO_MINUTES=60

# Optional notification webhook
BACKUP_NOTIFICATION_WEBHOOK_URL=https://example.invalid/backup-events
BACKUP_STORAGE_REDUNDANCY=single-copy
```

Encryption occurs after gzip compression. Encrypted backups are stored as `.json.gz.enc`; the plaintext JSON and gzip intermediates are removed before promotion. The encryption key is read only from runtime configuration and is never saved in backup metadata or returned through an API. The provider interface can be replaced by a future KMS-backed implementation.

## Version Compatibility and Restore Preview

Backup metadata records application, schema, engine, and format versions. The restore-preview endpoint returns backup details and compares them with the running system:

- application or schema differences generate warnings and require `confirmCompatibility: true` on restore;
- supported format differences can be reviewed by an administrator;
- unsupported backup formats are rejected;
- the dashboard requires review of the backup summary before restore confirmation.

## Backup Health, Analytics, and Readiness

`GET /api/admin/backup/health` returns backup age, verification rate, failures, average duration, active operation, next schedule, disk capacity, health classification, and disaster-recovery readiness.

Health classifications are `Excellent`, `Healthy`, `Warning`, and `Critical`. The score considers backup age, verification status, failure count, verification success rate, and storage thresholds at 70%, 85%, and 95%.

`GET /api/admin/backup/analytics?from=<date>&to=<date>` returns duration, size, success/failure, verification, restore frequency, and time-series growth data.

`POST /api/admin/backup/compare` compares two metadata records and returns per-collection and total document, size, duration, application-version, and schema-version differences.

## Isolated Scheduled Restore Verification

The server periodically selects the newest verified backup, decrypts and validates it, restores it into a uniquely named temporary MongoDB database, compares every collection count, records a `BackupVerificationReport`, and drops the temporary database in a `finally` block. It never points the test at the production database.

The default interval is seven days. Administrators can also start the same isolated workflow using:

```http
POST /api/admin/backup/restore-test
```

## Notification Providers

Backup notifications use a provider service instead of direct email/SMS calls. Console logging is always available; an optional generic webhook can forward events to email automation, Slack, Teams, SMS, or an incident platform. Events include completion, failure, restore completion/failure, verification failure, scheduled restore-test failure, and storage warning/full thresholds.
