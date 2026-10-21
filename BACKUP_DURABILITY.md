# Backup Durability

## The problem

Backup **metadata** lives in the shared MongoDB Atlas database, but backup
**archives** were written to the local filesystem of whichever server created
them:

| Where | Path |
| --- | --- |
| Render container (current) | `/app/server/backups` |
| Render container (older deploys) | `/opt/render/project/src/admin/server/backups` |
| Developer PCs | `…\admin\server\backups` |

Render's container filesystem is **ephemeral**. Every restart, redeploy, or
instance replacement erased `/app/server/backups`, while the database kept the
`completed` record. The result, observed on 2026-10-20:

- 356 backup records, **186 of them `missing`**
- 183 were the every-6-hours scheduled backups
- The dashboard row `10/20/2026, 4:07:16 AM · 28.7 MB · missing · 37.8 s`
  is `backup-2026-10-19T20-07-16-883Z.json.gz.enc`, written by the production
  scheduler into a container directory that no longer exists.

A second, separate bug made this look worse: `reconcileMetadata()` checked only
its **own** disk, and the database is shared. So starting the local server
stamped every production archive as `missing`, and vice versa.

## What changed

1. **Storage path is explicit.** Archives are written to
   `BACKUP_STORAGE_PATH`. On Render this must be a mounted persistent disk.
   Startup now logs the resolved path and warns when it is inside the
   application directory.

2. **Records know which server owns them.** New backups store `instanceId`
   (hostname, or `BACKUP_INSTANCE_ID`). Reconciliation, retention, deletion and
   verification now only act on records this server owns, matched by
   `instanceId`, or for legacy records by the recorded `filePath`.

3. **"Missing" means missing.** A record owned by another server is reported as
   `remote` / *Stored Elsewhere* instead of being marked `missing`. A developer
   machine can no longer overwrite the production record's stored state.

4. **Retention is automatic and bounded.** Enabled by default, applied after
   every successful backup, and scoped to this server's own records.
   Defaults: **7 daily + 4 weekly**, about 12 archives (~360 MB).

5. **Abandoned staging files are reclaimed.** `.pending-*` files left by a
   crashed container are removed after 6 hours.

## Deploying

### 1. Rescue anything still on the live container first

Attaching a disk restarts the service, which erases
`/app/server/backups`. If the current container has been running for a while,
its recent archives may still be there.

- Open the production admin → Backups.
- For each recent completed backup, use **Actions → Download**.
- Save them somewhere safe.

Anything already erased by an earlier restart is unrecoverable.

### 2. Add the disk in Render

Render Dashboard → the admin service → **Disks** → **Add Disk**

- Name: `wcc-backups`
- Mount Path: `/var/backups`
- Size: start at `1 GB` (≈33 archives); increase if you widen retention.

### 3. Add the environment variables

```env
BACKUP_STORAGE_PATH=/var/backups

BACKUP_AUTO_RETENTION=true
BACKUP_RETENTION_HOURLY=0
BACKUP_RETENTION_DAILY=7
BACKUP_RETENTION_WEEKLY=4
BACKUP_RETENTION_MONTHLY=0

# Paths this service used before the disk existed, so its older records are
# still recognised as its own and can age out normally.
BACKUP_LEGACY_STORAGE_PATHS=/app/server/backups,/opt/render/project/src/admin/server/backups
```

`render.yaml.example` already contains this configuration.

### 4. Verify

Startup log should show:

```
[backup] instance=… provider=local path=/var/backups
[backup] retention hourly=0 daily=7 weekly=4 monthly=0 auto=true
```

Then:

1. Create a backup manually.
2. Confirm the file exists at `/var/backups`.
3. Restart the service.
4. Confirm the backup is still listed as **verified**, not missing.

## Sizing

Each archive is ~30 MB compressed. 7 daily + 4 weekly ≈ 12 archives ≈ 360 MB,
which leaves room on a 1 GB disk for staging files during a backup.

Change the retention window with the `BACKUP_RETENTION_*` variables. Set
`BACKUP_AUTO_RETENTION=false` only if you intend to manage archives by hand.

## Local development

Nothing is required. A developer machine keeps writing to
`admin/server/backups`. Because each record now carries `instanceId`, the local
dashboard shows production archives as *Elsewhere* rather than *Missing*, and
local retention never touches production's history.
