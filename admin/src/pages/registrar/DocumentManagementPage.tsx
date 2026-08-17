import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronRight,
  Download,
  Eye,
  FileText,
  Folder as FolderIcon,
  HardDrive,
  Home,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
  Pencil,
  Tag,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import {
  listDocuments,
  uploadDocument,
  updateDocument,
  deleteDocument,
  trackDownload,
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  type ArchiveDocument,
  type DocumentFolder,
  type DocumentCategory,
  type DocumentStatus,
  type DocumentDepartment,
} from '../../lib/documentApi'
import './DocumentManagementPage.css'

const CATEGORIES: DocumentCategory[] = ['POLICY', 'HANDBOOK', 'ACCREDITATION', 'FORM', 'GUIDELINE', 'PROCEDURE', 'REPORT', 'OTHER']
const STATUSES: DocumentStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED', 'SUPERSEDED']
const DEPARTMENTS: DocumentDepartment[] = ['REGISTRAR', 'FINANCE', 'ACADEMIC_AFFAIRS', 'STUDENT_AFFAIRS', 'ADMISSIONS', 'IT', 'HUMAN_RESOURCES', 'LIBRARY', 'GENERAL']

const CATEGORY_LABELS: Record<string, string> = {
  POLICY: 'Policy',
  HANDBOOK: 'Handbook',
  ACCREDITATION: 'Accreditation',
  FORM: 'Form',
  GUIDELINE: 'Guideline',
  PROCEDURE: 'Procedure',
  REPORT: 'Report',
  OTHER: 'Other',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
  SUPERSEDED: 'Superseded',
}

const DEPARTMENT_LABELS: Record<string, string> = {
  REGISTRAR: 'Registrar',
  FINANCE: 'Finance',
  ACADEMIC_AFFAIRS: 'Academic Affairs',
  STUDENT_AFFAIRS: 'Student Affairs',
  ADMISSIONS: 'Admissions',
  IT: 'IT',
  HUMAN_RESOURCES: 'Human Resources',
  LIBRARY: 'Library',
  GENERAL: 'General',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatDate(dateString?: string | null): string {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function DocumentManagementPage() {
  const [documents, setDocuments] = useState<ArchiveDocument[]>([])
  const [folders, setFolders] = useState<DocumentFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [showTrashed, setShowTrashed] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [editingDoc, setEditingDoc] = useState<ArchiveDocument | null>(null)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [editingFolder, setEditingFolder] = useState<DocumentFolder | null>(null)
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; isError?: boolean }>>([])
  const [previewDoc, setPreviewDoc] = useState<ArchiveDocument | null>(null)

  const addToast = useCallback((message: string, isError = false) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { id, message, isError }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [docRes, folderRes] = await Promise.all([
        listDocuments({
          search: search || undefined,
          category: categoryFilter || undefined,
          status: statusFilter || undefined,
          department: departmentFilter || undefined,
          trashed: showTrashed ? 'only' : 'exclude',
          folderId: selectedFolderId || undefined,
          includeUnfoldered: !selectedFolderId ? true : undefined,
          limit: 100,
        }),
        listFolders({ trashed: showTrashed ? 'include' : 'exclude' }),
      ])
      setDocuments(docRes.documents)
      setFolders(folderRes.folders)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [search, categoryFilter, statusFilter, departmentFilter, showTrashed, selectedFolderId])

  // When entering a folder, reset the selected doc so we don't carry stale state
  useEffect(() => {
    setSelectedDocId(null)
  }, [selectedFolderId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const rootFolders = useMemo(() => folders.filter(f => !f.parentFolder), [folders])

  const handleDelete = async (doc: ArchiveDocument) => {
    if (!confirm(`Move "${doc.title}" to trash?`)) return
    try {
      setBusy(true)
      await deleteDocument(doc._id)
      addToast(`"${doc.title}" moved to trash.`)
      await fetchData()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to delete document', true)
    } finally {
      setBusy(false)
    }
  }

  const handleDownload = async (doc: ArchiveDocument) => {
    try {
      setBusy(true)
      await trackDownload(doc._id)
      const token = await getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/documents/${doc._id}/asset?download=true`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = doc.originalFileName || doc.fileName
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Download failed', true)
    } finally {
      setBusy(false)
    }
  }

  const handlePreview = (doc: ArchiveDocument) => {
    setPreviewDoc(doc)
  }

  const handleDeleteFolder = async (folder: DocumentFolder) => {
    if (!confirm(`Delete folder "${folder.name}"? Documents inside will be unfiled.`)) return
    try {
      setBusy(true)
      await deleteFolder(folder._id, false)
      if (selectedFolderId === folder._id) setSelectedFolderId(null)
      addToast(`Folder "${folder.name}" deleted.`)
      await fetchData()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to delete folder', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="doc-mgmt-page">
      <header className="doc-mgmt-header">
        <div>
          <span className="doc-mgmt-eyebrow">Document Management</span>
          <h1>Academic Documents</h1>
          <p className="doc-mgmt-subtitle">Upload, organize, and manage institutional documents and policies.</p>
        </div>
        <div className="doc-mgmt-header-actions">
          <button className="doc-mgmt-btn doc-mgmt-btn--ghost" onClick={() => setShowFolderModal(true)}>
            <Plus size={16} /> New Folder
          </button>
          <button className="doc-mgmt-btn doc-mgmt-btn--primary" onClick={() => setShowUploadModal(true)}>
            <Upload size={16} /> Upload Document
          </button>
          <button className="doc-mgmt-btn doc-mgmt-btn--icon" onClick={fetchData} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'doc-mgmt-spin' : ''} />
          </button>
        </div>
      </header>

      {error && (
        <div className="doc-mgmt-error" role="alert" onClick={() => setError('')}>
          <AlertTriangle size={16} />
          <span>{error}</span>
          <X size={14} />
        </div>
      )}

      <div className="doc-mgmt-toolbar">
        <div className="doc-mgmt-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
          <option value="">All departments</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      <div className="doc-mgmt-layout">
        <aside className="doc-mgmt-sidebar">
          <div className="doc-mgmt-storage-nav">
            <span className="doc-mgmt-sidebar-label">Storage</span>
            <button
              className={`doc-mgmt-nav-item ${!selectedFolderId && !showTrashed ? 'doc-mgmt-nav-item--active' : ''}`}
              onClick={() => { setSelectedFolderId(null); setShowTrashed(false) }}
            >
              <HardDrive size={16} />
              <span>All Documents</span>
              <span className="doc-mgmt-folder-count">{documents.length}</span>
            </button>
            <button
              className={`doc-mgmt-nav-item ${showTrashed ? 'doc-mgmt-nav-item--active' : ''}`}
              onClick={() => { setSelectedFolderId(null); setShowTrashed(true) }}
            >
              <Trash2 size={16} />
              <span>Trash</span>
            </button>
          </div>

          <div className="doc-mgmt-sidebar-divider" />

          <div className="doc-mgmt-sidebar-section">
            <span className="doc-mgmt-sidebar-label">Category</span>
            <div className="doc-mgmt-select-bar">
              <span className="doc-mgmt-select-bar-value">
                {categoryFilter ? CATEGORY_LABELS[categoryFilter] : 'All Categories'}
              </span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by category"
              >
                <option value="">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
          </div>
        </aside>

        <main className="doc-mgmt-main">
          {/* Breadcrumb when inside a folder */}
          {selectedFolderId && (
            <div className="doc-mgmt-breadcrumb">
              <button onClick={() => setSelectedFolderId(null)}>
                <Home size={14} /> All Documents
              </button>
              <ChevronRight size={14} />
              <span>{folders.find(f => f._id === selectedFolderId)?.name || 'Folder'}</span>
            </div>
          )}

          {loading ? (
            <div className="doc-mgmt-loading">
              <RefreshCw size={24} className="doc-mgmt-spin" />
              <p>Loading...</p>
            </div>
          ) : selectedFolderId ? (
            /* Inside a folder — show files in a list */
            documents.length === 0 ? (
              <div className="doc-mgmt-empty">
                <FileText size={40} />
                <h3>No files in this folder</h3>
                <p>Upload a document to this folder.</p>
              </div>
            ) : (
              <div className="doc-mgmt-table-wrap">
                <table className="doc-mgmt-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Department</th>
                      <th>Status</th>
                      <th>Size</th>
                      <th>Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map(doc => (
                      <tr
                        key={doc._id}
                        className={`${doc.isTrashed ? 'doc-mgmt-row--trashed' : ''} ${selectedDocId === doc._id ? 'doc-mgmt-row--selected' : ''}`}
                        onClick={() => setSelectedDocId(selectedDocId === doc._id ? null : doc._id)}
                        onDoubleClick={() => handlePreview(doc)}
                      >
                        <td>
                          <div className="doc-mgmt-doc-title">
                            <FileText size={16} />
                            <div>
                              <strong title={doc.title}>{doc.title}</strong>
                              {doc.description && <small title={doc.description}>{doc.description}</small>}
                            </div>
                          </div>
                          {doc.tags.length > 0 && (
                            <div className="doc-mgmt-tags">
                              {doc.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="doc-mgmt-tag"><Tag size={10} /> {tag}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td><span className="doc-mgmt-badge">{CATEGORY_LABELS[doc.category] || doc.category}</span></td>
                        <td><span className="doc-mgmt-badge doc-mgmt-badge--dept">{DEPARTMENT_LABELS[doc.department] || doc.department}</span></td>
                        <td>
                          <span className={`doc-mgmt-badge doc-mgmt-badge--${doc.status.toLowerCase()}`}>
                            {STATUS_LABELS[doc.status] || doc.status}
                          </span>
                          {doc.isPublic && <span className="doc-mgmt-badge doc-mgmt-badge--public">Public</span>}
                        </td>
                        <td>{formatBytes(doc.fileSize)}</td>
                        <td>{formatDate(doc.updatedAt)}</td>
                        <td>
                          <ActionDropdown
                            busy={busy}
                            onPreview={() => handlePreview(doc)}
                            onDownload={() => handleDownload(doc)}
                            onEdit={() => { setEditingDoc(doc); setShowUploadModal(true) }}
                            onDelete={() => handleDelete(doc)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            /* Root view — show folder cards + unfiled files */
            <div className="doc-mgmt-container-view">
              {rootFolders.length > 0 && (
                <div className="doc-mgmt-folder-grid">
                  {rootFolders.map(folder => (
                    <FolderCard
                      key={folder._id}
                      folder={folder}
                      onOpen={() => setSelectedFolderId(folder._id)}
                      onEdit={(f) => { setEditingFolder(f); setShowFolderModal(true) }}
                      onDelete={handleDeleteFolder}
                    />
                  ))}
                </div>
              )}
              {documents.length > 0 && (
                <div className="doc-mgmt-unfiled-section">
                  <h3 className="doc-mgmt-section-title">
                    <FileText size={16} /> Unfiled Documents
                    <span className="doc-mgmt-folder-count">{documents.length}</span>
                  </h3>
                  <div className="doc-mgmt-table-wrap">
                    <table className="doc-mgmt-table">
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Category</th>
                          <th>Department</th>
                          <th>Status</th>
                          <th>Size</th>
                          <th>Updated</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map(doc => (
                          <tr
                            key={doc._id}
                            className={`${doc.isTrashed ? 'doc-mgmt-row--trashed' : ''} ${selectedDocId === doc._id ? 'doc-mgmt-row--selected' : ''}`}
                            onClick={() => setSelectedDocId(selectedDocId === doc._id ? null : doc._id)}
                            onDoubleClick={() => handlePreview(doc)}
                          >
                            <td>
                              <div className="doc-mgmt-doc-title">
                                <FileText size={16} />
                                <div>
                                  <strong title={doc.title}>{doc.title}</strong>
                                  {doc.description && <small title={doc.description}>{doc.description}</small>}
                                </div>
                              </div>
                              {doc.tags.length > 0 && (
                                <div className="doc-mgmt-tags">
                                  {doc.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="doc-mgmt-tag"><Tag size={10} /> {tag}</span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td><span className="doc-mgmt-badge">{CATEGORY_LABELS[doc.category] || doc.category}</span></td>
                            <td><span className="doc-mgmt-badge doc-mgmt-badge--dept">{DEPARTMENT_LABELS[doc.department] || doc.department}</span></td>
                            <td>
                              <span className={`doc-mgmt-badge doc-mgmt-badge--${doc.status.toLowerCase()}`}>
                                {STATUS_LABELS[doc.status] || doc.status}
                              </span>
                              {doc.isPublic && <span className="doc-mgmt-badge doc-mgmt-badge--public">Public</span>}
                            </td>
                            <td>{formatBytes(doc.fileSize)}</td>
                            <td>{formatDate(doc.updatedAt)}</td>
                            <td>
                              <ActionDropdown
                                busy={busy}
                                onPreview={() => handlePreview(doc)}
                                onDownload={() => handleDownload(doc)}
                                onEdit={() => { setEditingDoc(doc); setShowUploadModal(true) }}
                                onDelete={() => handleDelete(doc)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {rootFolders.length === 0 && documents.length === 0 && (
                <div className="doc-mgmt-empty">
                  <FileText size={40} />
                  <h3>{showTrashed ? 'Trash is empty' : 'No documents yet'}</h3>
                  <p>{showTrashed ? 'No trashed documents.' : 'Upload a document or create a folder to get started.'}</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {showUploadModal && (
        <UploadDocumentModal
          editingDoc={editingDoc}
          folders={folders}
          selectedFolderId={selectedFolderId}
          onClose={() => { setShowUploadModal(false); setEditingDoc(null) }}
          onSaved={async () => { setShowUploadModal(false); setEditingDoc(null); await fetchData() }}
        />
      )}

      {showFolderModal && (
        <FolderModal
          editingFolder={editingFolder}
          folders={folders}
          onClose={() => { setShowFolderModal(false); setEditingFolder(null) }}
          onSaved={async () => { setShowFolderModal(false); setEditingFolder(null); await fetchData() }}
        />
      )}

      {previewDoc && (
        <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} onDownload={handleDownload} />
      )}

      {toasts.length > 0 && createPortal(
        <div className="doc-mgmt-toast-stack" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`doc-mgmt-toast${t.isError ? ' doc-mgmt-toast--error' : ''}`}>
              {t.isError ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
              <span>{t.message}</span>
              <button type="button" className="doc-mgmt-toast__close" onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} aria-label="Close notification">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

function ActionDropdown({
  busy,
  onPreview,
  onDownload,
  onEdit,
  onDelete,
}: {
  busy: boolean
  onPreview: () => void
  onDownload: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const menuHeight = 160
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow < menuHeight ? rect.top - menuHeight - 4 : rect.bottom + 4
      const left = rect.right - 140
      setMenuPos({ top, left })
    }
    setOpen(!open)
  }

  const handle = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  return (
    <div className="doc-mgmt-action-dropdown" ref={ref}>
      <button
        className="doc-mgmt-action-trigger"
        onClick={toggle}
        title="Actions"
      >
        <MoreVertical size={16} />
      </button>
      {open && menuPos && (
        <div className="doc-mgmt-action-menu" role="menu" style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}>
          <button role="menuitem" onClick={() => handle(onPreview)}>
            <Eye size={15} /> Preview
          </button>
          <button role="menuitem" onClick={() => handle(onDownload)} disabled={busy}>
            <Download size={15} /> Download
          </button>
          <button role="menuitem" onClick={() => handle(onEdit)}>
            <Pencil size={15} /> Edit
          </button>
          <button role="menuitem" className="doc-mgmt-action-menu--delete" onClick={() => handle(onDelete)} disabled={busy}>
            <Trash2 size={15} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

function FolderCard({
  folder,
  onOpen,
  onEdit,
  onDelete,
}: {
  folder: DocumentFolder
  onOpen: () => void
  onEdit: (folder: DocumentFolder) => void
  onDelete: (folder: DocumentFolder) => void
}) {
  return (
    <div className="doc-mgmt-folder-card" onDoubleClick={onOpen}>
      <button className="doc-mgmt-folder-card-icon" onClick={onOpen} title="Open folder">
        <FolderIcon size={28} />
      </button>
      <button className="doc-mgmt-folder-card-name" onClick={onOpen} title="Open folder">
        <strong>{folder.name}</strong>
        {folder.description && <small>{folder.description}</small>}
      </button>
      {folder.category && folder.category !== 'OTHER' && (
        <span className="doc-mgmt-folder-card-category">{CATEGORY_LABELS[folder.category] || folder.category}</span>
      )}
      <div className="doc-mgmt-folder-card-meta">
        {folder.documentCount != null && folder.documentCount > 0 && (
          <span className="doc-mgmt-folder-count">{folder.documentCount} files</span>
        )}
      </div>
      <div className="doc-mgmt-folder-card-actions">
        <button title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(folder) }}><Pencil size={14} /></button>
        <button title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(folder) }}><Trash2 size={14} /></button>
      </div>
    </div>
  )
}

function UploadDocumentModal({
  editingDoc,
  folders,
  selectedFolderId,
  onClose,
  onSaved,
}: {
  editingDoc: ArchiveDocument | null
  folders: DocumentFolder[]
  selectedFolderId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!editingDoc
  const [title, setTitle] = useState(editingDoc?.title || '')
  const [description, setDescription] = useState(editingDoc?.description || '')
  const [category, setCategory] = useState<DocumentCategory>(editingDoc?.category || 'POLICY')
  const [subcategory, setSubcategory] = useState(editingDoc?.subcategory || '')
  const [department, setDepartment] = useState<DocumentDepartment>(editingDoc?.department || 'GENERAL')
  const [folderId, setFolderId] = useState(editingDoc?.folderId?._id || selectedFolderId || '')
  const [isPublic, setIsPublic] = useState(editingDoc?.isPublic ?? false)
  const [status, setStatus] = useState<DocumentStatus>(editingDoc?.status || 'ACTIVE')
  const [tags, setTags] = useState((editingDoc?.tags || []).join(', '))
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Upload mode: pick a file and upload immediately with defaults.
  // Metadata (category, department, tags, etc.) can be edited later.
  const uploadFile = async (selected: File) => {
    setError('')
    try {
      setUploading(true)
      await uploadDocument({
        title: selected.name.replace(/\.[^.]+$/, ''),
        category: 'OTHER',
        department: 'GENERAL',
        folderId: selectedFolderId || null,
        file: selected,
        isPublic: false,
        status: 'ACTIVE',
        tags: [],
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document')
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) uploadFile(selected)
  }

  const [dragging, setDragging] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!uploading) setDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    if (uploading) return
    const selected = e.dataTransfer.files?.[0]
    if (selected) uploadFile(selected)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError('Title is required'); return }

    try {
      setUploading(true)
      const tagArray = tags.split(',').map(t => t.trim()).filter(Boolean)

      await updateDocument(editingDoc!._id, {
        title: title.trim(),
        description: description.trim(),
        category,
        subcategory: subcategory.trim(),
        department,
        folderId: folderId || null,
        isPublic,
        status,
        tags: tagArray,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save document')
    } finally {
      setUploading(false)
    }
  }

  // Upload mode — just a file picker, auto-uploads on select.
  if (!isEdit) {
    return (
      <div className="doc-mgmt-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <section className="doc-mgmt-modal" role="dialog" aria-modal="true">
          <header className="doc-mgmt-modal-header">
            <h2>Upload Document</h2>
            <button onClick={onClose} aria-label="Close"><X size={18} /></button>
          </header>
          <div className="doc-mgmt-modal-body">
            {error && <div className="doc-mgmt-modal-error"><AlertTriangle size={16} /> {error}</div>}
            <div
              className={`doc-mgmt-file-drop${dragging ? ' doc-mgmt-file-drop--dragging' : ''}`}
              onClick={() => !uploading && fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input ref={fileInputRef} type="file" onChange={handleFileSelect} hidden />
              {uploading ? (
                <div className="doc-mgmt-file-placeholder">
                  <RefreshCw size={20} className="doc-mgmt-spin" />
                  <span>Uploading…</span>
                </div>
              ) : (
                <div className="doc-mgmt-file-placeholder">
                  <Upload size={20} />
                  <span>Click to select or drag &amp; drop a file</span>
                </div>
              )}
            </div>
            <p className="doc-mgmt-modal-hint">Title and other metadata can be edited after upload.</p>
            <div className="doc-mgmt-modal-footer">
              <button type="button" className="doc-mgmt-btn doc-mgmt-btn--ghost" onClick={onClose} disabled={uploading}>Cancel</button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  // Edit mode — full metadata form.
  return (
    <div className="doc-mgmt-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="doc-mgmt-modal" role="dialog" aria-modal="true">
        <header className="doc-mgmt-modal-header">
          <h2>Edit Document</h2>
          <button onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <form onSubmit={handleSubmit} className="doc-mgmt-modal-body">
          {error && <div className="doc-mgmt-modal-error"><AlertTriangle size={16} /> {error}</div>}

          <div className="doc-mgmt-field">
            <label>Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" required />
          </div>

          <div className="doc-mgmt-field">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" rows={2} />
          </div>

          <div className="doc-mgmt-field-row">
            <div className="doc-mgmt-field">
              <label>Category *</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div className="doc-mgmt-field">
              <label>Department</label>
              <select value={department} onChange={(e) => setDepartment(e.target.value as DocumentDepartment)}>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>)}
              </select>
            </div>
          </div>

          <div className="doc-mgmt-field">
            <label>Subcategory</label>
            <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="Optional" />
          </div>

          <div className="doc-mgmt-field-row">
            <div className="doc-mgmt-field">
              <label>Folder</label>
              <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                <option value="">No folder</option>
                {folders.filter(f => !f.isTrashed).map(f => (
                  <option key={f._id} value={f._id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="doc-mgmt-field">
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as DocumentStatus)}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </div>

          <div className="doc-mgmt-field-row">
            <div className="doc-mgmt-field">
              <label>Tags (comma-separated)</label>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="policy, 2024, draft" />
            </div>
            <div className="doc-mgmt-field doc-mgmt-field--checkbox">
              <label>
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                <span>Publicly accessible</span>
              </label>
            </div>
          </div>

          <div className="doc-mgmt-modal-footer">
            <button type="button" className="doc-mgmt-btn doc-mgmt-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="doc-mgmt-btn doc-mgmt-btn--primary" disabled={uploading}>
              {uploading ? <RefreshCw size={16} className="doc-mgmt-spin" /> : <Pencil size={16} />}
              Save Changes
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function FolderModal({
  editingFolder,
  folders,
  onClose,
  onSaved,
}: {
  editingFolder: DocumentFolder | null
  folders: DocumentFolder[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!editingFolder
  const [name, setName] = useState(editingFolder?.name || '')
  const [category, setCategory] = useState<DocumentCategory>(editingFolder?.category || 'OTHER')
  const [description, setDescription] = useState(editingFolder?.description || '')
  const [parentFolderId, setParentFolderId] = useState(editingFolder?.parentFolder?._id || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Folder name is required'); return }
    try {
      setSaving(true)
      if (isEdit && editingFolder) {
        await updateFolder(editingFolder._id, { name: name.trim(), category, description: description.trim() })
      } else {
        await createFolder({ name: name.trim(), category, description: description.trim(), parentFolderId: parentFolderId || null })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save folder')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="doc-mgmt-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="doc-mgmt-modal doc-mgmt-modal--sm" role="dialog" aria-modal="true">
        <header className="doc-mgmt-modal-header">
          <h2>{isEdit ? 'Edit Folder' : 'New Folder'}</h2>
          <button onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <form onSubmit={handleSubmit} className="doc-mgmt-modal-body">
          {error && <div className="doc-mgmt-modal-error"><AlertTriangle size={16} /> {error}</div>}
          <div className="doc-mgmt-field">
            <label>Folder Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Policies, Forms, Handbooks" required />
          </div>
          <div className="doc-mgmt-field">
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div className="doc-mgmt-field">
            <label>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          {!isEdit && (
            <div className="doc-mgmt-field">
              <label>Parent Folder</label>
              <select value={parentFolderId} onChange={(e) => setParentFolderId(e.target.value)}>
                <option value="">Root level</option>
                {folders.filter(f => !f.isTrashed).map(f => (
                  <option key={f._id} value={f._id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="doc-mgmt-modal-footer">
            <button type="button" className="doc-mgmt-btn doc-mgmt-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="doc-mgmt-btn doc-mgmt-btn--primary" disabled={saving}>
              {saving ? <RefreshCw size={16} className="doc-mgmt-spin" /> : <Plus size={16} />}
              {isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function PreviewModal({
  doc,
  onClose,
  onDownload,
}: {
  doc: ArchiveDocument
  onClose: () => void
  onDownload: (doc: ArchiveDocument) => void
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fileName = doc.originalFileName || doc.fileName || doc.title
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
  const isPdf = ext === 'pdf'
  const isPreviewable = isImage || isPdf

  useEffect(() => {
    let revoked = false
    let createdUrl: string | null = null
    setLoading(true)
    setError('')
    setBlobUrl(null)

    getStoredToken()
      .then(token =>
        fetch(`${API_URL}/api/admin/documents/${doc._id}/asset`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`)
        return res.blob()
      })
      .then(blob => {
        if (revoked) return
        createdUrl = URL.createObjectURL(blob)
        setBlobUrl(createdUrl)
        setLoading(false)
      })
      .catch(err => {
        if (revoked) return
        setError(err instanceof Error ? err.message : 'Failed to load preview')
        setLoading(false)
      })

    return () => {
      revoked = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [doc._id])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="doc-mgmt-modal-overlay doc-mgmt-preview-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="doc-mgmt-preview-modal" role="dialog" aria-modal="true">
        <header className="doc-mgmt-preview-header">
          <div className="doc-mgmt-preview-title">
            <FileText size={18} />
            <div>
              <strong title={doc.title}>{doc.title}</strong>
              <small>{fileName} • {formatBytes(doc.fileSize)}</small>
            </div>
          </div>
          <div className="doc-mgmt-preview-actions">
            <button className="doc-mgmt-btn doc-mgmt-btn--ghost" onClick={() => onDownload(doc)} title="Download">
              <Download size={16} /> Download
            </button>
            <button onClick={onClose} aria-label="Close" className="doc-mgmt-preview-close"><X size={20} /></button>
          </div>
        </header>
        <div className="doc-mgmt-preview-body">
          {loading && (
            <div className="doc-mgmt-preview-loading">
              <RefreshCw size={28} className="doc-mgmt-spin" />
              <p>Loading preview…</p>
            </div>
          )}
          {error && (
            <div className="doc-mgmt-preview-error">
              <AlertTriangle size={28} />
              <p>{error}</p>
              <button className="doc-mgmt-btn doc-mgmt-btn--ghost" onClick={() => onDownload(doc)}>
                <Download size={16} /> Download instead
              </button>
            </div>
          )}
          {!loading && !error && blobUrl && isImage && (
            <img src={blobUrl} alt={doc.title} className="doc-mgmt-preview-image" />
          )}
          {!loading && !error && blobUrl && isPdf && (
            <iframe src={blobUrl} title={doc.title} className="doc-mgmt-preview-iframe" />
          )}
          {!loading && !error && blobUrl && !isPreviewable && (
            <div className="doc-mgmt-preview-unsupported">
              <FileText size={40} />
              <h3>Preview not available</h3>
              <p>This file type (.{ext}) can't be previewed in the browser.</p>
              <button className="doc-mgmt-btn doc-mgmt-btn--primary" onClick={() => onDownload(doc)}>
                <Download size={16} /> Download File
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
