# Document Management Process and Flow

This document explains how the admin Document Management module works from the user interface through the API, database records, stored files, and audit logging.

## Purpose

The Document Management page provides a cloud-drive style archive for school records, forms, policies, reports, handbooks, accreditation files, and other administrative documents. It supports folder organization, file upload, metadata editing, viewing, downloading, filtering, sorting, and Archive Bin deletion.

## Primary Users

- **Admin**: Can access the archive, manage folders, upload and update documents, download files, and delete archive items.
- **Registrar**: Can access the same document archive workflows through the admin/registrar protected routes.
- **Public users**: Can only access public active documents through the public document endpoint.

All admin archive routes require authentication and either admin or registrar authorization.

## Main Files

- Frontend page: `admin/src/pages/DocumentManagement.tsx`
- Frontend API wrapper: `admin/src/lib/documentArchiveApi.ts`
- Document model: `admin/server/models/Document.js`
- Folder model: `admin/server/models/DocumentFolder.js`
- Backend routes and archive helpers: `admin/server/index.js`
- Stored uploaded files: `admin/server/uploads/documents`

## High-Level Flow

1. User opens **Documents** from the admin dashboard sidebar.
2. `DocumentManagement` initializes archive state, workspace mode, filters, folder list, document list, pagination, and dialog state.
3. The page loads folders and documents through the document archive API wrapper.
4. The backend validates the request, checks authentication and role access, queries MongoDB, and returns folders/documents.
5. The frontend combines folders and documents into one archive browser.
6. User actions such as create folder, upload file, edit metadata, delete, open, download, drag/drop move, search, and filter call the appropriate API wrapper functions.
7. The server persists metadata in MongoDB, stores uploaded binaries on disk, and writes audit logs for major actions.
8. The UI refreshes affected folder/document queries and displays success or error feedback.

## Frontend Workspace Flow

The `DocumentManagement` component behaves like a drive workspace with these major views:

- **Home**: Shows welcome content, quick access folders, recent files, and storage summary.
- **My Archive**: Shows folders/documents in the current archive scope.
- **Recent**: Shows recently updated files.
- **Department Shared**: Shows root folders with `DEPARTMENT` segment type.
- **Archive Bin**: Shows trashed folders/documents and uses list view by default.

Navigation state is controlled by:

- `workspaceView`: `home`, `archive`, `recent`, `shared`, or `trash`
- `archiveMode`: `recent` or `all`
- `currentFolderId`: selected folder, or `null` for root/current workspace
- `segmentFilter`: folder grouping filter such as `DOCUMENT_TYPE`, `DEPARTMENT`, `DATE`, `CUSTOM`, or `ALL`
- `viewMode`: `grid` or `list`
- `searchInput` and `debouncedSearchTerm`
- `categoryFilter`, `statusFilter`, and `sortOption`

## Data Loading Flow

### Folder Loading

1. Folder state changes or refresh nonce changes.
2. Frontend calls `listDocumentFolders()`.
3. Query includes `trashed=only` in Archive Bin, otherwise trashed folders are excluded.
4. Server applies the trashed filter, optional parent/search filters, populates actor and parent folder references, and sorts folders by parent/name.
5. Server adds direct folder/document counts through `withFolderCounts()`.
6. Frontend stores the folder array and builds `folderMap`.

### Document Loading

1. Workspace, folder, search, filters, pagination, sort, or refresh nonce changes.
2. Frontend builds `ListDocumentsParams`.
3. Frontend calls `listArchiveDocuments()`.
4. Server applies filters for folder, trash state, category, status, visibility, search, pagination, and sorting.
5. Server populates folder and actor references.
6. Frontend stores documents and total page data.
7. Frontend derives visible folders/documents and combines them into `ArchiveEntry[]`.

## Folder Process

### Create Folder

1. User opens the create menu and selects **New Folder**.
2. Frontend opens the folder dialog with defaults based on current folder or segment filter.
3. User enters name, segment type, segment value, and description.
4. Frontend calls `createDocumentFolder()`.
5. Server validates input, checks parent folder existence, enforces unique folder name within the parent, saves `DocumentFolder`, and logs `CREATE / DOCUMENT`.
6. Frontend closes the dialog, refreshes archive data, and shows success feedback.

### Edit or Move Folder

1. User chooses edit from the folder menu.
2. Frontend preloads folder metadata into the dialog.
3. Frontend calls `updateDocumentFolder()`.
4. Server verifies the folder is not trashed, checks parent folder changes, prevents moving a folder into itself or descendants, enforces unique names, updates metadata, and logs `UPDATE / DOCUMENT`.
5. Frontend refreshes archive data.

### Delete Folder

1. User opens the delete dialog.
2. If the folder contains child folders or documents and is not already trashed, server requires forced/cascading deletion.
3. Normal delete marks the folder branch and nested documents as `isTrashed=true`, sets `trashedAt`, `trashedBy`, and `updatedBy`, then logs medium-severity delete.
4. If the folder is already in Archive Bin, delete permanently removes the folder branch and stored document files, then logs high-severity delete.

## Document Process

### Upload Document

1. User selects **Upload File**.
2. Frontend blocks upload inside Archive Bin.
3. User selects a file and enters title, category, subcategory, status, tags, and description.
4. Frontend checks the selected file against any folder document-type restriction.
5. Frontend converts the file to a data URL with `fileToDataUrl()`.
6. Frontend calls `uploadArchiveDocument()`.
7. Server validates payload, verifies selected folder exists, checks folder type restrictions, validates file content, saves the binary under `uploads/documents`, creates a `Document` record, and logs `UPLOAD / DOCUMENT`.
8. If metadata save fails after file persistence, server attempts to clean up the stored upload.
9. Frontend closes the dialog, refreshes archive data, and shows success feedback.

### Edit Document Metadata

1. User opens document edit.
2. Frontend loads current title, category, subcategory, status, tags, and description.
3. Frontend calls `updateArchiveDocument()`.
4. Server verifies the document exists and is not trashed.
5. If `folderId` changes, server validates the destination folder and file type restrictions.
6. Server updates metadata and logs `UPDATE / DOCUMENT`.
7. Frontend closes the editor, refreshes data, and shows feedback.

### Open/View Document

1. User opens a document from grid/list.
2. Frontend calls `openArchiveDocumentViewerRoute()`.
3. Browser history is updated to `/document-viewer/:id`.
4. Viewer can use the document snapshot or fetch document details and asset URL.
5. Protected file access goes through `/api/admin/documents/:id/asset`.

### Download Document

1. Frontend calls `trackArchiveDocumentDownload()`.
2. Server verifies document exists, is not trashed, and the current role can access it.
3. Server increments `downloadCount`, sets `lastDownloadedBy`, sets `lastDownloadedAt`, and logs `DOWNLOAD / DOCUMENT`.
4. Server returns an asset URL with `download=true`.
5. Browser downloads the protected asset.

### Delete Document

1. User confirms delete.
2. If the document is active, server marks it as trashed and logs medium-severity delete.
3. If the document is already in Archive Bin, server deletes the stored file and removes the MongoDB document, then logs high-severity delete.
4. Frontend refreshes data and shows whether the item was moved to bin or permanently deleted.

## Drag and Drop Move Flow

1. User drags a folder or document card/list item.
2. Frontend tracks the dragged entry and potential folder drop target.
3. Frontend prevents invalid folder moves, including dropping a folder into itself or descendants.
4. Dropping a document on a folder calls `updateArchiveDocument()` with the destination `folderId`.
5. Dropping a folder on a folder calls `updateDocumentFolder()` with the destination `parentFolderId`.
6. Frontend refreshes archive data and shows move feedback.

## Search, Filter, and Sort Flow

- Search input is debounced before querying.
- Document search is sent to the backend as `search`.
- Backend uses MongoDB text search on document title and description.
- Folder search is matched against name and segment value.
- Category, status, visibility, folder, trash, page, limit, sort field, and sort order are sent as query parameters.
- If search is active, document sorting prioritizes text score, then the selected sort field.

## Archive Bin Flow

- Normal views use `trashed=exclude`.
- Archive Bin uses `trashed=only`.
- Root Archive Bin view can pass `trashRootOnly=true` so documents inside trashed folders are not duplicated at the bin root.
- Deleting active items moves them to Archive Bin.
- Deleting trashed items permanently removes records and, for documents, deletes stored files.
- Backend cleanup also purges expired trash items after the configured retention period.

## Storage and File Handling

Uploaded file data is sent as a data URL. The server:

1. Decodes and validates uploaded file data.
2. Verifies MIME type and size.
3. Generates a safe stored file name.
4. Writes the file under `admin/server/uploads/documents`.
5. Saves a relative `filePath` such as `documents/<storedFileName>`.
6. Resolves asset requests only inside the configured uploads root to prevent path traversal.

## Data Model Summary

### Document

Important fields:

- `title`, `description`
- `category`, `subcategory`
- `folderId`
- `fileName`, `originalFileName`, `mimeType`, `fileSize`, `filePath`
- `version`
- `isPublic`, `allowedRoles`
- `tags`
- `effectiveDate`, `expiryDate`
- `status`: `DRAFT`, `ACTIVE`, `ARCHIVED`, `SUPERSEDED`
- `downloadCount`, `lastDownloadedBy`, `lastDownloadedAt`
- `createdBy`, `updatedBy`
- `isTrashed`, `trashedAt`, `trashedBy`

### DocumentFolder

Important fields:

- `name`
- `segmentType`: `DOCUMENT_TYPE`, `DEPARTMENT`, `DATE`, `CUSTOM`
- `segmentValue`
- `description`
- `parentFolder`
- `createdBy`, `updatedBy`
- `isTrashed`, `trashedAt`, `trashedBy`

## API Summary

### Folder APIs

- `GET /api/admin/document-folders`
- `POST /api/admin/document-folders`
- `PUT /api/admin/document-folders/:id`
- `DELETE /api/admin/document-folders/:id`

### Admin Document APIs

- `GET /api/admin/documents`
- `GET /api/admin/documents/:id`
- `GET /api/admin/documents/:id/asset`
- `POST /api/admin/documents`
- `PUT /api/admin/documents/:id`
- `POST /api/admin/documents/:id/download`
- `DELETE /api/admin/documents/:id`

### Public Document API

- `GET /api/documents`

Public documents must be active, public, and not trashed.

## Audit Logging

The server writes audit logs for major archive actions:

- Folder create: `CREATE / DOCUMENT`
- Folder update: `UPDATE / DOCUMENT`
- Folder move to bin or permanent delete: `DELETE / DOCUMENT`
- Document upload: `UPLOAD / DOCUMENT`
- Document update: `UPDATE / DOCUMENT`
- Document download: `DOWNLOAD / DOCUMENT`
- Document move to bin or permanent delete: `DELETE / DOCUMENT`

Audit logs include resource id, resource name, actor id, actor role, old/new values where applicable, status, and severity.

## Error Handling

Frontend archive requests use:

- Auth headers from the stored token.
- Timeout handling for GET requests.
- Retry behavior for retryable GET/HEAD failures.
- Friendly error messages for unauthorized, forbidden, missing, rate-limited, and server-unavailable responses.

Backend safeguards include:

- Database readiness checks.
- Auth and role checks.
- Joi input validation.
- Folder existence checks.
- Unique folder name checks.
- Folder move cycle prevention.
- Folder document-type restriction checks.
- File MIME/size validation.
- Upload cleanup when document creation fails.
- Protected asset path resolution.

## Expected Administrator Workflow

1. Open **Documents**.
2. Choose a workspace: Home, My Archive, Recent, Department Shared, or Archive Bin.
3. Search, filter, sort, or open a folder.
4. Create folders for document grouping as needed.
5. Upload documents into the current folder or root.
6. Use grid/list actions to open, edit, move, download, or delete items.
7. Review Archive Bin for deleted items and permanently remove items when appropriate.
8. Use System Audit Logs to review document-related actions.

