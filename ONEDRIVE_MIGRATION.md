# Remove WCC-Admin from OneDrive Sync

> **Status:** TODO — tackle later
> **Reason:** OneDrive locks files during sync, which conflicts with Flutter/Gradle's aggressive file operations during builds. This caused `AccessDeniedException` on `mergeDebugAssets` and build failures.

---

## Why this matters

The project currently lives at:
```
C:\Users\loren\OneDrive\Documents\xampp\WCC-Admin
```

OneDrive continuously syncs this folder in the background. Flutter's `build/` and `.dart_tool/` directories are recreated/deleted on every build — thousands of files. OneDrive's sync engine locks files while uploading them, which blocks Gradle from deleting or overwriting them, causing:

```
java.io.IOException: Unable to delete directory
'...\build\app\intermediates\assets\debug\mergeDebugAssets'
AccessDeniedException
```

---

## Recommended approach: Move project out of OneDrive

### Step 1 — Pause OneDrive sync
1. Click the **OneDrive cloud icon** in the system tray.
2. Gear icon → **"Pause syncing"** → **8 hours**.
3. This prevents OneDrive from fighting the move.

### Step 2 — Move the folder

```powershell
# Create target directory
New-Item -ItemType Directory -Path "C:\dev" -Force

# Move the project (same-drive move = fast, no copy)
Move-Item "C:\Users\loren\OneDrive\Documents\xampp\WCC-Admin" "C:\dev\WCC-Admin"
```

> **Verify:** `Test-Path "C:\dev\WCC-Admin\admin\server\index.js"` should return `True`.

### Step 3 — Delete the leftover OneDrive cloud copy

OneDrive will detect the files were "deleted" from the synced folder and may try to **re-download** them from the cloud. To stop that:

1. Open **OneDrive online** → https://onedrive.live.com
2. Navigate to **Documents → xampp**.
3. Delete the `WCC-Admin` folder.
4. Empty the **Recycle Bin** on OneDrive online.

Otherwise OneDrive will keep re-creating the folder locally.

### Step 4 — Update tooling to the new path

| Tool | What to update |
|------|----------------|
| **VS Code / Windsurf** | Reopen folder from `C:\dev\WCC-Admin` |
| **XAMPP** | Update `httpd.conf` / vhost docroot if it points to the old path |
| **Shortcuts** | Any desktop/taskbar shortcuts referencing the old path |
| **Git remotes** | No change needed (stored in `.git/config`, moves with the folder) |
| **Flutter SDK path** | No change (Flutter is at `C:\flutter`, unaffected) |
| **Devin CLI** | Reopen the project from the new path |
| **Environment files** | Check `.env` files for any hardcoded absolute paths |

### Step 5 — Resume OneDrive sync
1. OneDrive tray icon → gear → **"Resume syncing"**.
2. `C:\dev\WCC-Admin` is outside any synced folder, so OneDrive will leave it alone.

### Step 6 — Verify a clean build
```powershell
cd C:\dev\WCC-Admin\west_coast_college_mobile_app\west_coast_flutter_app
flutter clean
flutter pub get
flutter run -v
```

---

## Alternative: Keep files in place, exclude from sync

Use this only if you can't move the folder (e.g. other tools depend on the current path).

1. OneDrive tray icon → gear → **Settings**.
2. **"Sync and backup"** tab → **"Advanced settings"**.
3. Under **"Choose folders"**, uncheck `Documents\xampp` (or just `Documents`).
4. Click OK.

**Downside:** OneDrive may still occasionally touch the folder, and you'll see a cloud-with-slash icon on it. Less reliable than moving.

---

## Quick recovery command (if build fails before migration)

```powershell
Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force
flutter clean
flutter pub get
flutter run
```

---

## Post-migration checklist

- [ ] OneDrive sync paused before move
- [ ] Project moved to `C:\dev\WCC-Admin`
- [ ] Old folder deleted from OneDrive online (incl. recycle bin)
- [ ] VS Code / Windsurf reopened from new path
- [ ] XAMPP docroot updated (if applicable)
- [ ] Shortcuts updated
- [ ] `.env` files checked for hardcoded paths
- [ ] OneDrive sync resumed
- [ ] `flutter clean && flutter run` succeeds with no lock errors
- [ ] Node server starts from new path
- [ ] Git push/pull works from new path
