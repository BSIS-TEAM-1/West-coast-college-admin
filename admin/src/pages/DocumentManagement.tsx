import React, { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import {
  Bell,
  CircleHelp,
  ChevronRight,
  Clock3,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Home,
  LayoutGrid,
  List,
  LoaderCircle,
  MoreVertical,
  PencilLine,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserCircle2,
  X,
} from 'lucide-react'
import './DocumentManagement.css'
import {
  ArchiveApiError,
  createDocumentFolder,
  deleteArchiveDocument,
  deleteDocumentFolder,
  fileToDataUrl,
  getArchiveDocumentAssetUrl,
  listArchiveDocuments,
  listDocumentFolders,
  openArchiveDocumentViewerRoute,
  updateArchiveDocument,
  updateDocumentFolder,
  uploadArchiveDocument,
  type ArchiveTrashedFilter,
  type ArchiveDocument,
  type ArchiveFolder,
  type DocumentCategory,
  type DocumentFolderSegmentType,
  type DocumentStatus,
  type ListDocumentsParams,
} from '../lib/documentArchiveApi'

type ArchiveMode = 'all' | 'recent'
type ArchiveWorkspaceView = 'home' | 'archive' | 'recent' | 'shared' | 'trash'
type ArchiveViewMode = 'list' | 'grid'
type SortOption =
  | 'updatedAt-desc'
  | 'updatedAt-asc'
  | 'title-asc'
  | 'title-desc'
  | 'fileSize-desc'
  | 'fileSize-asc'
  | 'category-asc'
  | 'category-desc'
type FolderDialogMode = 'create' | 'edit'
type FeedbackTone = 'success' | 'error'

type FolderFormState = {
  name: string
  segmentType: DocumentFolderSegmentType
  segmentValue: string
  description: string
}

type UploadFormState = {
  title: string
  description: string
  category: DocumentCategory
  subcategory: string
  status: DocumentStatus
  tags: string
}

type DeleteTarget =
  | { kind: 'folder'; folder: ArchiveFolder }
  | { kind: 'document'; document: ArchiveDocument }
  | null

type FeedbackState = {
  tone: FeedbackTone
  message: string
}

type ArchiveEntry =
  | { key: string; kind: 'folder'; folder: ArchiveFolder }
  | { key: string; kind: 'document'; document: ArchiveDocument }

type BreadcrumbItem = {
  key: string
  label: string
  onSelect?: () => void
}

type EntryDestination = {
  label: string
  targetFolderId: string | null
  workspaceView: ArchiveWorkspaceView
}

const PAGE_SIZE = 40
const ARCHIVE_BIN_RETENTION_DAYS = 30
const RESTRICTED_ROLES = ['admin', 'registrar']
const DEFAULT_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024
const PREMIUM_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024 * 1024
const ARCHIVE_DRAG_MIME = 'application/x-wcc-archive-entry'
const DRAG_CLICK_SUPPRESSION_MS = 220

const DOCUMENT_CATEGORY_OPTIONS: Array<{ value: DocumentCategory; label: string }> = [
  { value: 'POLICY', label: 'Policy' },
  { value: 'HANDBOOK', label: 'Handbook' },
  { value: 'ACCREDITATION', label: 'Accreditation' },
  { value: 'FORM', label: 'Form' },
  { value: 'GUIDELINE', label: 'Guideline' },
  { value: 'PROCEDURE', label: 'Procedure' },
  { value: 'REPORT', label: 'Report' },
  { value: 'OTHER', label: 'Other' },
]

const DOCUMENT_STATUS_OPTIONS: Array<{ value: DocumentStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'SUPERSEDED', label: 'Superseded' },
]

const DOCUMENT_FILE_TYPE_OPTIONS = ['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'PPT', 'PPTX', 'TXT', 'CSV', 'PNG', 'JPG', 'JPEG', 'ZIP']

const FOLDER_SEGMENT_OPTIONS: Array<{ value: DocumentFolderSegmentType; label: string }> = [
  { value: 'DOCUMENT_TYPE', label: 'Document Type' },
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'DATE', label: 'Date' },
  { value: 'CUSTOM', label: 'Custom Folder' },
]

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'updatedAt-desc', label: 'Modified: Newest first' },
  { value: 'updatedAt-asc', label: 'Modified: Oldest first' },
  { value: 'title-asc', label: 'Name: A to Z' },
  { value: 'title-desc', label: 'Name: Z to A' },
  { value: 'fileSize-desc', label: 'Size: Largest first' },
  { value: 'fileSize-asc', label: 'Size: Smallest first' },
  { value: 'category-asc', label: 'Category: A to Z' },
  { value: 'category-desc', label: 'Category: Z to A' },
]

const EMPTY_FOLDER_FORM: FolderFormState = {
  name: '',
  segmentType: 'CUSTOM',
  segmentValue: '',
  description: '',
}

const EMPTY_UPLOAD_FORM: UploadFormState = {
  title: '',
  description: '',
  category: 'OTHER',
  subcategory: '',
  status: 'ACTIVE',
  tags: '',
}

const folderRequestCache = new Map<string, Promise<{ folders: ArchiveFolder[]; total: number }>>()
const documentRequestCache = new Map<string, Promise<{
  documents: ArchiveDocument[]
  totalPages: number
  currentPage: number
  total: number
}>>()

function dedupedListDocumentFolders(
  options: { search?: string; trashed?: ArchiveTrashedFilter } = {},
  cacheToken = 0
): Promise<{ folders: ArchiveFolder[]; total: number }> {
  const requestKey = JSON.stringify({ options, cacheToken })
  const existingRequest = folderRequestCache.get(requestKey)
  if (existingRequest) {
    return existingRequest
  }

  const request = listDocumentFolders(options).finally(() => {
    folderRequestCache.delete(requestKey)
  })

  folderRequestCache.set(requestKey, request)
  return request
}

function dedupedListArchiveDocuments(
  params: ListDocumentsParams,
  cacheToken = 0
): Promise<{
  documents: ArchiveDocument[]
  totalPages: number
  currentPage: number
  total: number
}> {
  const requestKey = JSON.stringify({ params, cacheToken })
  const existingRequest = documentRequestCache.get(requestKey)
  if (existingRequest) {
    return existingRequest
  }

  const request = listArchiveDocuments(params).finally(() => {
    documentRequestCache.delete(requestKey)
  })

  documentRequestCache.set(requestKey, request)
  return request
}

function getSortConfig(sortOption: SortOption): {
  sortBy: NonNullable<ListDocumentsParams['sortBy']>
  sortOrder: NonNullable<ListDocumentsParams['sortOrder']>
} {
  const [sortBy, sortOrder] = sortOption.split('-') as [
    NonNullable<ListDocumentsParams['sortBy']>,
    NonNullable<ListDocumentsParams['sortOrder']>,
  ]

  return { sortBy, sortOrder }
}

function getFolderParentId(folder: ArchiveFolder): string | null {
  return folder.parentFolder?._id ?? null
}

function getFolderMap(folders: ArchiveFolder[]): Map<string, ArchiveFolder> {
  return new Map(folders.map((folder) => [folder._id, folder]))
}

function getSegmentLabel(segmentType: DocumentFolderSegmentType): string {
  return FOLDER_SEGMENT_OPTIONS.find((option) => option.value === segmentType)?.label ?? 'Custom Folder'
}

function getCategoryLabel(category: DocumentCategory): string {
  return DOCUMENT_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? 'Other'
}

function getActorName(actor?: { displayName?: string; username?: string }): string {
  return actor?.displayName || actor?.username || 'System'
}

function getProfileAvatarSrc(avatar?: string, avatarMimeType?: string): string | null {
  const normalizedAvatar = String(avatar || '').trim()
  if (!normalizedAvatar) {
    return null
  }

  return normalizedAvatar.startsWith('data:')
    ? normalizedAvatar
    : `data:${String(avatarMimeType || 'image/jpeg').trim() || 'image/jpeg'};base64,${normalizedAvatar}`
}

function formatFileSize(fileSize: number): string {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = fileSize
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function formatAbsoluteDate(value?: string): string {
  if (!value) {
    return 'No date'
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return 'No date'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsedDate)
}

function formatRelativeTime(value?: string): string {
  if (!value) {
    return 'Unknown'
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Unknown'
  }

  const diff = parsedDate.getTime() - Date.now()
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const minutes = Math.round(diff / (1000 * 60))

  if (Math.abs(minutes) < 60) {
    return rtf.format(minutes, 'minute')
  }

  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) {
    return rtf.format(hours, 'hour')
  }

  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) {
    return rtf.format(days, 'day')
  }

  const months = Math.round(days / 30)
  if (Math.abs(months) < 12) {
    return rtf.format(months, 'month')
  }

  return rtf.format(Math.round(months / 12), 'year')
}

function normalizeFileTypeLabel(rawValue: string): string {
  const cleanedValue = rawValue.replace(/^\./, '').trim()
  if (!cleanedValue) {
    return 'File'
  }

  const normalizedValue = cleanedValue.toUpperCase()
  return normalizedValue === 'JPG' ? 'JPEG' : normalizedValue
}

function getDocumentFileType(document: Pick<ArchiveDocument, 'originalFileName' | 'fileName' | 'mimeType'>): string {
  const nameCandidates = [document.originalFileName, document.fileName]

  for (const fileName of nameCandidates) {
    const extension = String(fileName || '').split('.').pop()
    if (extension && extension !== fileName) {
      return normalizeFileTypeLabel(extension)
    }
  }

  if (document.mimeType.startsWith('image/')) return 'Image'
  if (document.mimeType.includes('pdf')) return 'PDF'
  if (document.mimeType.includes('spreadsheet') || document.mimeType.includes('excel') || document.mimeType.includes('csv')) return 'Spreadsheet'
  if (document.mimeType.includes('word') || document.mimeType.includes('document')) return 'Document'
  return 'File'
}

type DocumentTypeRestriction = {
  label: string
  allowedTypes: string[]
  accept: string
}

const DOCUMENT_TYPE_RESTRICTIONS: Array<{
  matchValues: string[]
  restriction: DocumentTypeRestriction
}> = [
  {
    matchValues: ['PDF'],
    restriction: {
      label: 'PDF',
      allowedTypes: ['PDF'],
      accept: '.pdf,application/pdf',
    },
  },
  {
    matchValues: ['DOC', 'DOCX', 'DOCS', 'WORD', 'DOCUMENT'],
    restriction: {
      label: 'DOC or DOCX',
      allowedTypes: ['DOC', 'DOCX'],
      accept: '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
  },
  {
    matchValues: ['XLS', 'XLSX', 'SPREADSHEET'],
    restriction: {
      label: 'XLS, XLSX, or CSV',
      allowedTypes: ['XLS', 'XLSX', 'CSV'],
      accept: '.xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv',
    },
  },
  {
    matchValues: ['PPT', 'PPTX', 'PRESENTATION'],
    restriction: {
      label: 'PPT or PPTX',
      allowedTypes: ['PPT', 'PPTX'],
      accept: '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
  },
  {
    matchValues: ['PNG'],
    restriction: {
      label: 'PNG',
      allowedTypes: ['PNG'],
      accept: '.png,image/png',
    },
  },
  {
    matchValues: ['JPG', 'JPEG'],
    restriction: {
      label: 'JPG or JPEG',
      allowedTypes: ['JPG', 'JPEG'],
      accept: '.jpg,.jpeg,image/jpeg',
    },
  },
  {
    matchValues: ['IMAGE'],
    restriction: {
      label: 'image',
      allowedTypes: ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG'],
      accept: 'image/*,.png,.jpg,.jpeg,.gif,.webp,.svg',
    },
  },
  {
    matchValues: ['TXT', 'TEXT'],
    restriction: {
      label: 'TXT',
      allowedTypes: ['TXT'],
      accept: '.txt,text/plain',
    },
  },
  {
    matchValues: ['CSV'],
    restriction: {
      label: 'CSV',
      allowedTypes: ['CSV'],
      accept: '.csv,text/csv',
    },
  },
  {
    matchValues: ['ZIP', 'ARCHIVE'],
    restriction: {
      label: 'ZIP',
      allowedTypes: ['ZIP'],
      accept: '.zip,application/zip,application/x-zip-compressed',
    },
  },
]

function getSelectedFileType(file: Pick<File, 'name' | 'type'>): string {
  return getDocumentFileType({
    originalFileName: file.name,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
  })
}

function resolveDocumentTypeRestriction(segmentValue?: string | null): DocumentTypeRestriction | null {
  const normalizedSegmentValue = normalizeFileTypeLabel(String(segmentValue || ''))
  if (!normalizedSegmentValue || normalizedSegmentValue === 'File') {
    return null
  }

  const restrictionEntry = DOCUMENT_TYPE_RESTRICTIONS.find((entry) => entry.matchValues.includes(normalizedSegmentValue))
  return restrictionEntry?.restriction ?? null
}

function getFolderDocumentTypeRestriction(folderId: string | null, folderMap: Map<string, ArchiveFolder>): DocumentTypeRestriction | null {
  if (!folderId) {
    return null
  }

  const folderPath = getFolderPath(folderId, folderMap)
  for (const folder of folderPath) {
    if (folder.segmentType !== 'DOCUMENT_TYPE') {
      continue
    }

    const restriction = resolveDocumentTypeRestriction(folder.segmentValue || folder.name)
    if (restriction) {
      return restriction
    }
  }

  return null
}

function doesFileMatchDocumentTypeRestriction(file: Pick<File, 'name' | 'type'>, restriction: DocumentTypeRestriction | null): boolean {
  if (!restriction) {
    return true
  }

  return restriction.allowedTypes.includes(getSelectedFileType(file))
}

function stripFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  return lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName
}

function parseTags(rawValue: string): string[] {
  return rawValue.split(',').map((segment) => segment.trim()).filter(Boolean)
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof ArchiveApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallbackMessage
}

function getFolderPath(folderId: string, folderMap: Map<string, ArchiveFolder>): ArchiveFolder[] {
  const path: ArchiveFolder[] = []
  let cursorId: string | null = folderId

  while (cursorId) {
    const folder = folderMap.get(cursorId)
    if (!folder) break
    path.unshift(folder)
    cursorId = getFolderParentId(folder)
  }

  return path
}

function isFolderInBranch(folderId: string | null, branchFolderId: string, folderMap: Map<string, ArchiveFolder>): boolean {
  let cursorId = folderId

  while (cursorId) {
    if (cursorId === branchFolderId) return true
    const cursorFolder = folderMap.get(cursorId)
    cursorId = cursorFolder ? getFolderParentId(cursorFolder) : null
  }

  return false
}

function getRootFolder(folder: ArchiveFolder, folderMap: Map<string, ArchiveFolder>): ArchiveFolder {
  let currentFolder = folder
  let parentId = getFolderParentId(currentFolder)

  while (parentId) {
    const parentFolder = folderMap.get(parentId)
    if (!parentFolder) break
    currentFolder = parentFolder
    parentId = getFolderParentId(parentFolder)
  }

  return currentFolder
}

function doesFolderMatchSearch(folder: ArchiveFolder, searchTerm: string): boolean {
  if (!searchTerm) return true

  const normalizedSearch = searchTerm.toLowerCase()
  return [folder.name, folder.description, folder.segmentValue, getSegmentLabel(folder.segmentType)]
    .some((value) => String(value || '').toLowerCase().includes(normalizedSearch))
}

function sortFolders(
  folders: ArchiveFolder[],
  sortBy: NonNullable<ListDocumentsParams['sortBy']>,
  sortOrder: NonNullable<ListDocumentsParams['sortOrder']>
): ArchiveFolder[] {
  const direction = sortOrder === 'asc' ? 1 : -1

  return [...folders].sort((leftFolder, rightFolder) => {
    let comparison = 0

    if (sortBy === 'updatedAt') {
      comparison = new Date(leftFolder.updatedAt).getTime() - new Date(rightFolder.updatedAt).getTime()
    } else if (sortBy === 'createdAt') {
      comparison = new Date(leftFolder.createdAt).getTime() - new Date(rightFolder.createdAt).getTime()
    } else {
      comparison = leftFolder.name.localeCompare(rightFolder.name)
    }

    if (comparison === 0) {
      comparison = leftFolder.name.localeCompare(rightFolder.name)
    }

    return comparison * direction
  })
}

function deriveFolderName(segmentType: DocumentFolderSegmentType, segmentValue: string): string {
  const cleanedValue = segmentValue.trim()
  if (!cleanedValue) return ''

  if (segmentType === 'DATE') {
    const parsedDate = new Date(cleanedValue)
    if (!Number.isNaN(parsedDate.getTime())) {
      return new Intl.DateTimeFormat(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(parsedDate)
    }
  }

  return cleanedValue
}

function getFolderTypeCopy(folder: ArchiveFolder): string {
  return folder.segmentType === 'CUSTOM' ? 'Folder' : `${getSegmentLabel(folder.segmentType)} Folder`
}

function getFileIcon(fileType: string, kind: 'folder' | 'document') {
  if (kind === 'folder') return Folder
  if (['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG', 'Image'].includes(fileType)) return FileImage
  if (['XLS', 'XLSX', 'CSV', 'Spreadsheet'].includes(fileType)) return FileSpreadsheet
  if (['ZIP', 'RAR', '7Z'].includes(fileType)) return FileArchive
  return FileText
}

function getDocumentPreviewKind(document: Pick<ArchiveDocument, 'mimeType' | 'originalFileName' | 'fileName'>): 'image' | 'pdf' | 'generic' {
  const fileType = getDocumentFileType(document)
  if (document.mimeType.startsWith('image/') || ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG', 'Image'].includes(fileType)) {
    return 'image'
  }

  if (document.mimeType.includes('pdf') || fileType === 'PDF') {
    return 'pdf'
  }

  return 'generic'
}

function getGridBadgeTone(fileType: string, kind: 'folder' | 'document'): string {
  if (kind === 'folder') return 'folder'
  if (fileType === 'PDF') return 'pdf'
  if (['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG', 'Image'].includes(fileType)) return 'image'
  if (['XLS', 'XLSX', 'CSV', 'Spreadsheet'].includes(fileType)) return 'sheet'
  if (['ZIP', 'RAR', '7Z'].includes(fileType)) return 'archive'
  return 'document'
}

function getActorLabel(entry: ArchiveEntry): string {
  const actor = entry.kind === 'folder'
    ? entry.folder.createdBy?.displayName || entry.folder.createdBy?.username || entry.folder.updatedBy?.displayName || entry.folder.updatedBy?.username
    : entry.document.createdBy?.displayName || entry.document.createdBy?.username || entry.document.updatedBy?.displayName || entry.document.updatedBy?.username

  return actor || 'Archive'
}

function getEntryActor(entry: ArchiveEntry) {
  return entry.kind === 'folder'
    ? entry.folder.createdBy || entry.folder.updatedBy
    : entry.document.createdBy || entry.document.updatedBy
}

function getItemCountLabel(count: number): string {
  return `${count} item${count === 1 ? '' : 's'}`
}

function getEntryDestination(entry: ArchiveEntry, folderMap: Map<string, ArchiveFolder>): EntryDestination {
  const isTrashedEntry = entry.kind === 'folder'
    ? Boolean(entry.folder.isTrashed)
    : Boolean(entry.document.isTrashed)
  const workspaceView: ArchiveWorkspaceView = isTrashedEntry ? 'trash' : 'archive'
  const rootLabel = isTrashedEntry ? 'Archive Bin' : 'Archive root'

  if (entry.kind === 'folder') {
    const folderPath = getFolderPath(entry.folder._id, folderMap)
    return {
      label: [rootLabel, ...folderPath.map((folder) => folder.name)].join(' / '),
      targetFolderId: entry.folder._id,
      workspaceView,
    }
  }

  const targetFolderId = entry.document.folderId?._id ?? null
  if (!targetFolderId) {
    return {
      label: rootLabel,
      targetFolderId: null,
      workspaceView,
    }
  }

  const folderPath = getFolderPath(targetFolderId, folderMap)
  return {
    label: [rootLabel, ...folderPath.map((folder) => folder.name)].join(' / '),
    targetFolderId,
    workspaceView,
  }
}

function getSegmentInputLabel(segmentType: DocumentFolderSegmentType): string {
  if (segmentType === 'DOCUMENT_TYPE') return 'Document type'
  if (segmentType === 'DEPARTMENT') return 'Department'
  if (segmentType === 'DATE') return 'Date'
  return 'Segment label'
}

type PdfGridPreviewProps = {
  document: ArchiveDocument
  title: string
}

type DocumentManagementProps = {
  onNavigate?: (view: 'profile' | 'settings') => void
}

function PdfGridPreview({ document, title }: PdfGridPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewFailed, setPreviewFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''
    const controller = new AbortController()

    setPreviewUrl('')
    setPreviewFailed(false)

    void fetch(getArchiveDocumentAssetUrl(document), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Unable to load PDF preview.')
        }

        return response.blob()
      })
      .then((fileBlob) => {
        objectUrl = URL.createObjectURL(fileBlob)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }

        setPreviewUrl(`${objectUrl}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH`)
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) {
          setPreviewFailed(true)
        }
      })

    return () => {
      cancelled = true
      controller.abort()
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [document.filePath, document.updatedAt])

  if (previewUrl) {
    return (
      <div className="document-archive__grid-preview is-pdf-preview">
        <iframe
          src={previewUrl}
          title={`${title} preview`}
          className="document-archive__grid-preview-frame is-pdf"
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div className="document-archive__grid-preview is-generic is-pdf-preview">
      <div className={`document-archive__grid-preview-page is-pdf-static${previewFailed ? ' is-pdf-fallback' : ' is-loading'}`}>
        <span className="document-archive__grid-preview-icon is-pdf">
          {previewFailed ? <FileText size={28} /> : <LoaderCircle className="spin" size={22} />}
        </span>
        <strong title={title}>{previewFailed ? title : 'Loading PDF preview'}</strong>
        <span>{previewFailed ? `${formatFileSize(document.fileSize)} PDF document` : 'Preparing the first page...'}</span>
        <div className="document-archive__grid-preview-lines" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}

export default function DocumentManagement({ onNavigate }: DocumentManagementProps) {
  const [folders, setFolders] = useState<ArchiveFolder[]>([])
  const [documents, setDocuments] = useState<ArchiveDocument[]>([])
  const [foldersLoading, setFoldersLoading] = useState(true)
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [foldersError, setFoldersError] = useState('')
  const [documentsError, setDocumentsError] = useState('')
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [workspaceView, setWorkspaceView] = useState<ArchiveWorkspaceView>('home')
  const [archiveMode, setArchiveMode] = useState<ArchiveMode>('recent')
  const [segmentFilter, setSegmentFilter] = useState<DocumentFolderSegmentType | 'ALL'>('ALL')
  const [viewMode, setViewMode] = useState<ArchiveViewMode>('grid')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all')
  const [sortOption, setSortOption] = useState<SortOption>('updatedAt-desc')
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [foldersRefreshNonce, setFoldersRefreshNonce] = useState(0)
  const [documentsRefreshNonce, setDocumentsRefreshNonce] = useState(0)
  const [recentFolderIds, setRecentFolderIds] = useState<string[]>([])
  const [folderDialogMode, setFolderDialogMode] = useState<FolderDialogMode>('create')
  const [folderDialogTarget, setFolderDialogTarget] = useState<ArchiveFolder | null>(null)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderForm, setFolderForm] = useState<FolderFormState>(EMPTY_FOLDER_FORM)
  const [savingFolder, setSavingFolder] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploadForm, setUploadForm] = useState<UploadFormState>(EMPTY_UPLOAD_FORM)
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [documentEditorTarget, setDocumentEditorTarget] = useState<ArchiveDocument | null>(null)
  const [documentForm, setDocumentForm] = useState<UploadFormState>(EMPTY_UPLOAD_FORM)
  const [savingDocument, setSavingDocument] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [createMenuSource, setCreateMenuSource] = useState<'sidebar' | 'toolbar' | null>(null)
  const [openGridMenuKey, setOpenGridMenuKey] = useState<string | null>(null)
  const [storagePlan, setStoragePlan] = useState<'default' | 'premium'>('default')
  const [storageUsageBytes, setStorageUsageBytes] = useState(0)
  const [forceFolderDelete, setForceFolderDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [draggedEntry, setDraggedEntry] = useState<ArchiveEntry | null>(null)
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null)
  const [movingEntryKey, setMovingEntryKey] = useState<string | null>(null)
  const lastFolderQueryKeyRef = useRef('')
  const lastDocumentQueryKeyRef = useRef('')
  const draggedEntryRef = useRef<ArchiveEntry | null>(null)
  const suppressClickUntilRef = useRef(0)
  const folderMap = getFolderMap(folders)
  const currentFolder = currentFolderId ? folderMap.get(currentFolderId) ?? null : null
  const isTrashView = workspaceView === 'trash'
  const currentUploadRestriction = getFolderDocumentTypeRestriction(currentFolderId, folderMap)
  const { sortBy, sortOrder } = getSortConfig(sortOption)

  useEffect(() => {
    const debounceTimer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchInput.trim())
    }, 250)
    return () => window.clearTimeout(debounceTimer)
  }, [searchInput])

  useEffect(() => {
    if (!feedback) return undefined
    const feedbackTimer = window.setTimeout(() => {
      setFeedback(null)
    }, 4500)
    return () => window.clearTimeout(feedbackTimer)
  }, [feedback])

  useEffect(() => {
    if (!createMenuSource) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.document-archive__create-menu-shell')) {
        return
      }

      setCreateMenuSource(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [createMenuSource])

  useEffect(() => {
    if (!openGridMenuKey) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.document-archive__menu-shell')) {
        return
      }

      setOpenGridMenuKey(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [openGridMenuKey])

  useEffect(() => {
    if (!selectedUploadFile) {
      return
    }

    if (!doesFileMatchDocumentTypeRestriction(selectedUploadFile, currentUploadRestriction)) {
      setSelectedUploadFile(null)
    }
  }, [currentUploadRestriction, selectedUploadFile])

  useEffect(() => {
    setCurrentPage(1)
  }, [archiveMode, currentFolderId, debouncedSearchTerm, categoryFilter, statusFilter, sortOption])

  useEffect(() => {
    if (archiveMode === 'recent' && !currentFolderId && !documentsLoading && !documentsError) {
      const nextUsage = documents.reduce((totalValue, document) => totalValue + (document.fileSize || 0), 0)
      setStorageUsageBytes(nextUsage)
    }
  }, [archiveMode, currentFolderId, documents, documentsError, documentsLoading])

  useEffect(() => {
    if (archiveMode === 'recent') {
      setSegmentFilter('ALL')
    }
  }, [archiveMode])

  useEffect(() => {
    if (segmentFilter !== 'ALL') {
      setArchiveMode('all')
      setCurrentFolderId(null)
    }
  }, [segmentFilter])

  useEffect(() => {
    let cancelled = false
    const folderQuery = {
      trashed: isTrashView ? 'only' as ArchiveTrashedFilter : 'exclude' as ArchiveTrashedFilter,
    }
    const folderQueryKey = JSON.stringify({ folderQuery, foldersRefreshNonce })
    if (lastFolderQueryKeyRef.current === folderQueryKey) return

    lastFolderQueryKeyRef.current = folderQueryKey

    setFoldersLoading(true)
    setFoldersError('')

    void dedupedListDocumentFolders(folderQuery, foldersRefreshNonce)
      .then((response) => {
        if (!cancelled) {
          setFolders(response.folders)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setFoldersError(getErrorMessage(error, 'Failed to load archive folders.'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFoldersLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [foldersRefreshNonce, isTrashView])

  useEffect(() => {
    const query: ListDocumentsParams = {
      category: categoryFilter,
      status: statusFilter,
      sortBy,
      sortOrder,
      page: currentPage,
      limit: PAGE_SIZE,
      trashed: isTrashView ? 'only' : 'exclude',
    }

    if (debouncedSearchTerm) {
      query.search = debouncedSearchTerm
    }

    if (currentFolderId) {
      query.folderId = currentFolderId
    } else if (isTrashView) {
      query.trashRootOnly = true
    } else if (!debouncedSearchTerm && archiveMode === 'all' && segmentFilter === 'ALL') {
      query.includeUnfoldered = true
    }

    const requestKey = JSON.stringify({ ...query, archiveMode, documentsRefreshNonce })
    if (lastDocumentQueryKeyRef.current === requestKey) return

    lastDocumentQueryKeyRef.current = requestKey
    let cancelled = false

    setDocumentsLoading(true)
    setDocumentsError('')

    void dedupedListArchiveDocuments(query, documentsRefreshNonce)
      .then((response) => {
        if (cancelled) return
        if (response.totalPages > 0 && response.currentPage > response.totalPages) {
          setCurrentPage(response.totalPages)
          return
        }

        setDocuments(response.documents)
        setTotalPages(Math.max(1, response.totalPages || 1))
      })
      .catch((error) => {
        if (!cancelled) {
          setDocumentsError(getErrorMessage(error, 'Failed to load archived documents.'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDocumentsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    archiveMode,
    categoryFilter,
    currentFolderId,
    currentPage,
    debouncedSearchTerm,
    documentsRefreshNonce,
    isTrashView,
    segmentFilter,
    sortBy,
    sortOrder,
    statusFilter,
  ])

  useEffect(() => {
    if (currentFolderId && !folderMap.has(currentFolderId)) {
      setCurrentFolderId(null)
    }
  }, [currentFolderId, folderMap])

  useEffect(() => {
    if (isTrashView) {
      return
    }

    setRecentFolderIds((currentValue) => {
      const nextValue = currentValue.filter((folderId) => folderMap.has(folderId))
      return nextValue.length === currentValue.length ? currentValue : nextValue
    })
  }, [folderMap, isTrashView])

  const visibleFolders = sortFolders(
    folders.filter((folder) => {
      const parentId = getFolderParentId(folder)

      if (currentFolderId) {
        return parentId === currentFolderId && doesFolderMatchSearch(folder, debouncedSearchTerm)
      }

      if (isTrashView) {
        if (parentId !== null && folderMap.has(parentId)) {
          return false
        }
      } else if (parentId !== null) {
        return false
      }

      if (segmentFilter !== 'ALL' && folder.segmentType !== segmentFilter) {
        return false
      }

      return doesFolderMatchSearch(folder, debouncedSearchTerm)
    }),
    sortBy,
    sortOrder
  )

  const visibleDocuments = archiveMode === 'recent'
    ? documents
    : documents.filter((document) => {
        if (isTrashView) {
          if (currentFolderId) {
            return document.folderId?._id === currentFolderId
          }

          return true
        }

        if (!currentFolderId && segmentFilter !== 'ALL') {
          if (!document.folderId) return false
          const parentFolder = folderMap.get(document.folderId._id) ?? null
          return parentFolder ? getRootFolder(parentFolder, folderMap).segmentType === segmentFilter : false
        }

        return true
      })

  const combinedEntries: ArchiveEntry[] = [
    ...visibleFolders.map((folder): ArchiveEntry => ({ key: `folder:${folder._id}`, kind: 'folder', folder })),
    ...visibleDocuments.map((document): ArchiveEntry => ({ key: `document:${document._id}`, kind: 'document', document })),
  ]

  const totalVisibleItems = visibleFolders.length + visibleDocuments.length
  const hasArchiveLoadError = Boolean(foldersError || documentsError)
  const activeFilterCount = [categoryFilter !== 'all', statusFilter !== 'all'].filter(Boolean).length
  const currentFolderPath = currentFolder ? getFolderPath(currentFolder._id, folderMap) : []
  const rootFolders = sortFolders(
    folders.filter((folder) => getFolderParentId(folder) === null),
    'updatedAt',
    'desc'
  )
  const recentFolders = (() => {
    const recentFolderLookup = new Set<string>()
    const sessionRecentFolders = recentFolderIds
      .map((folderId) => folderMap.get(folderId) ?? null)
      .filter((folder): folder is ArchiveFolder => {
        if (!folder) return false
        if (segmentFilter !== 'ALL' && folder.segmentType !== segmentFilter) {
          return false
        }
        recentFolderLookup.add(folder._id)
        return true
      })

    const updatedFolders = [...folders]
      .filter((folder) => {
        if (segmentFilter !== 'ALL' && folder.segmentType !== segmentFilter) {
          return false
        }
        return !recentFolderLookup.has(folder._id)
      })
      .sort((leftFolder, rightFolder) => {
        const updatedAtDifference = new Date(rightFolder.updatedAt).getTime() - new Date(leftFolder.updatedAt).getTime()
        if (updatedAtDifference !== 0) {
          return updatedAtDifference
        }

        return leftFolder.name.localeCompare(rightFolder.name)
      })

    return [...sessionRecentFolders, ...updatedFolders].slice(0, 7)
  })()
  const recentDocuments = [...documents]
    .sort((leftDocument, rightDocument) => {
      const updatedDifference = new Date(rightDocument.updatedAt).getTime() - new Date(leftDocument.updatedAt).getTime()
      if (updatedDifference !== 0) {
        return updatedDifference
      }

      return leftDocument.title.localeCompare(rightDocument.title)
    })
  const quickAccessFolderEntries: ArchiveEntry[] = (recentFolders.length > 0 ? recentFolders : rootFolders.slice(0, 6))
    .slice(0, 6)
    .map((folder) => ({ key: `folder:${folder._id}`, kind: 'folder', folder }))
  const recentFileEntries: ArchiveEntry[] = recentDocuments
    .slice(0, 8)
    .map((document) => ({ key: `document:${document._id}`, kind: 'document', document }))
  const departmentSharedEntries: ArchiveEntry[] = rootFolders
    .filter((folder) => folder.segmentType === 'DEPARTMENT')
    .slice(0, 6)
    .map((folder) => ({ key: `folder:${folder._id}`, kind: 'folder', folder }))
  const currentStorageLimitBytes = storagePlan === 'premium' ? PREMIUM_STORAGE_LIMIT_BYTES : DEFAULT_STORAGE_LIMIT_BYTES
  const storageUsagePercent = currentStorageLimitBytes > 0
    ? Math.min(100, (storageUsageBytes / currentStorageLimitBytes) * 100)
    : 0
  const isSearchActive = debouncedSearchTerm.length > 0
  const workspaceTitle = currentFolder
    ? currentFolder.name
    : isSearchActive
      ? `Search results for "${debouncedSearchTerm}"`
    : workspaceView === 'home'
      ? 'Welcome to Document Archive'
      : workspaceView === 'recent'
        ? 'Recent'
        : workspaceView === 'shared'
          ? 'Department Shared'
          : workspaceView === 'trash'
            ? 'Archive Bin'
            : 'My Archive'
  const workspaceSubtitle = currentFolder
    ? `${getItemCountLabel(hasArchiveLoadError ? 0 : totalVisibleItems)} in this folder`
    : isSearchActive
      ? `${getItemCountLabel(hasArchiveLoadError ? 0 : totalVisibleItems)} matching folders and files`
    : workspaceView === 'home'
      ? 'A simpler cloud-style workspace for school records, forms, and shared folders.'
      : workspaceView === 'recent'
        ? `${recentDocuments.length} recently updated file${recentDocuments.length === 1 ? '' : 's'}`
        : workspaceView === 'shared'
          ? `${departmentSharedEntries.length} department folder${departmentSharedEntries.length === 1 ? '' : 's'} ready to open`
          : workspaceView === 'trash'
            ? hasArchiveLoadError
              ? 'Archive Bin could not be loaded.'
              : `${getItemCountLabel(totalVisibleItems)} currently in Archive Bin. Items are removed after ${ARCHIVE_BIN_RETENTION_DAYS} days.`
            : `${getItemCountLabel(hasArchiveLoadError ? 0 : totalVisibleItems)} visible in the current archive view`
  const browserLabel = currentFolder
    ? 'Current folder'
    : isSearchActive
      ? 'Search results'
    : workspaceView === 'trash'
      ? 'Archive bin'
    : workspaceView === 'shared'
      ? 'Department shared'
      : workspaceView === 'recent'
        ? 'Recent archive'
        : 'My archive'
  const shouldRenderBrowser = Boolean(currentFolder || workspaceView === 'archive' || workspaceView === 'shared' || workspaceView === 'trash' || isSearchActive)
  const storageUsageLabel = `${formatFileSize(storageUsageBytes)} of ${storagePlan === 'premium' ? '1 TB' : '10 GB'} used`
  const breadcrumbItems: BreadcrumbItem[] = [
    {
      key: workspaceView,
      label: workspaceView === 'home'
        ? 'Home'
        : workspaceView === 'recent'
          ? 'Recent'
          : workspaceView === 'shared'
            ? 'Department Shared'
            : workspaceView === 'trash'
              ? 'Archive Bin'
              : 'My Archive',
      onSelect: () => {
        setWorkspaceView(workspaceView)
        setCurrentFolderId(null)
        setSelectedEntryKey(null)
      },
    },
  ]

  if (archiveMode === 'all' && segmentFilter !== 'ALL') {
    breadcrumbItems.push({
      key: `segment:${segmentFilter}`,
      label: getSegmentLabel(segmentFilter),
      onSelect: () => {
        setCurrentFolderId(null)
        setSelectedEntryKey(null)
      },
    })
  }

  currentFolderPath.forEach((folder, index) => {
    const isCurrent = index === currentFolderPath.length - 1
    breadcrumbItems.push({
      key: folder._id,
      label: folder.name,
      onSelect: isCurrent ? undefined : () => {
        handleOpenFolder(folder._id)
      },
    })
  })

  function refreshArchiveData() {
    setFoldersRefreshNonce((currentValue) => currentValue + 1)
    setDocumentsRefreshNonce((currentValue) => currentValue + 1)
  }

  function handleSelectWorkspace(nextView: ArchiveWorkspaceView) {
    setWorkspaceView(nextView)
    setCurrentFolderId(null)
    setSelectedEntryKey(null)
    setOpenGridMenuKey(null)
    setCreateMenuSource(null)

    if (nextView === 'home') {
      setArchiveMode('recent')
      setSegmentFilter('ALL')
      setViewMode('grid')
      return
    }

    if (nextView === 'recent') {
      setArchiveMode('recent')
      setSegmentFilter('ALL')
      setViewMode('grid')
      return
    }

    if (nextView === 'shared') {
      setArchiveMode('all')
      setSegmentFilter('DEPARTMENT')
      setViewMode('grid')
      return
    }

    if (nextView === 'trash') {
      setArchiveMode('all')
      setSegmentFilter('ALL')
      setViewMode('list')
      return
    }

    setArchiveMode('all')
    setSegmentFilter('ALL')
    setViewMode('list')
  }

  function handleOpenFolder(folderId: string) {
    const nextFolder = folderMap.get(folderId) ?? null
    setWorkspaceView(nextFolder?.isTrashed ? 'trash' : 'archive')
    setArchiveMode('all')
    setCurrentFolderId(folderId)
    setSelectedEntryKey(null)
    setOpenGridMenuKey(null)
    setRecentFolderIds((currentValue) => [folderId, ...currentValue.filter((existingId) => existingId !== folderId)].slice(0, 7))
  }

  function handleToggleCreateMenu(source: 'sidebar' | 'toolbar') {
    setCreateMenuSource((currentValue) => currentValue === source ? null : source)
  }

  function handleCreateNewFolder() {
    setCreateMenuSource(null)
    openFolderDialog('create')
  }

  function handleCreateUploadFile() {
    setCreateMenuSource(null)
    openUploadDialog()
  }

  function handleOpenDocument(document: ArchiveDocument) {
    setOpenGridMenuKey(null)
    openArchiveDocumentViewerRoute(document)
  }

  function handleOpenEntryDestination(entry: ArchiveEntry) {
    const destination = getEntryDestination(entry, folderMap)
    setSelectedEntryKey(null)
    setOpenGridMenuKey(null)
    setCreateMenuSource(null)

    if (destination.targetFolderId) {
      handleOpenFolder(destination.targetFolderId)
      return
    }

    setWorkspaceView(destination.workspaceView)
    setArchiveMode('all')
    setCurrentFolderId(null)
  }

  function handleRowOpen(entry: ArchiveEntry) {
    if (entry.kind === 'folder') {
      handleOpenFolder(entry.folder._id)
      return
    }

    handleOpenDocument(entry.document)
  }

  function handleEntryClick(entry: ArchiveEntry) {
    if (Date.now() < suppressClickUntilRef.current) {
      return
    }

    setSelectedEntryKey(entry.key)
    setOpenGridMenuKey(null)
    handleRowOpen(entry)
  }

  function openFolderDialog(mode: FolderDialogMode, folder?: ArchiveFolder) {
    if (mode === 'edit' && folder) {
      setFolderDialogMode('edit')
      setFolderDialogTarget(folder)
      setFolderForm({
        name: folder.name,
        segmentType: folder.segmentType,
        segmentValue: folder.segmentValue || '',
        description: folder.description || '',
      })
      setFolderDialogOpen(true)
      return
    }

    const defaultSegmentType = currentFolder?.segmentType || (segmentFilter !== 'ALL' ? segmentFilter : 'CUSTOM')

    setFolderDialogMode('create')
    setFolderDialogTarget(null)
    setFolderForm({
      ...EMPTY_FOLDER_FORM,
      segmentType: defaultSegmentType,
    })
    setFolderDialogOpen(true)
  }

  function closeFolderDialog() {
    setFolderDialogOpen(false)
    setFolderDialogTarget(null)
    setFolderForm(EMPTY_FOLDER_FORM)
  }

  async function handleFolderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const resolvedName = folderForm.name.trim() || deriveFolderName(folderForm.segmentType, folderForm.segmentValue)
    if (!resolvedName) {
      setFeedback({ tone: 'error', message: 'Folder name is required.' })
      return
    }

    const payload = {
      name: resolvedName,
      segmentType: folderForm.segmentType,
      segmentValue: folderForm.segmentValue.trim() || undefined,
      description: folderForm.description.trim() || undefined,
    }

    setSavingFolder(true)

    try {
      if (folderDialogMode === 'edit' && folderDialogTarget) {
        await updateDocumentFolder(folderDialogTarget._id, payload)
        setFeedback({ tone: 'success', message: `Folder "${resolvedName}" updated.` })
      } else {
        await createDocumentFolder({
          ...payload,
          parentFolderId: currentFolderId,
        })
        setFeedback({ tone: 'success', message: `Folder "${resolvedName}" created.` })
      }

      closeFolderDialog()
      refreshArchiveData()
    } catch (error) {
      setFeedback({ tone: 'error', message: getErrorMessage(error, 'Failed to save the folder.') })
    } finally {
      setSavingFolder(false)
    }
  }

  function openUploadDialog() {
    if (isTrashView) {
      setFeedback({ tone: 'error', message: 'Upload is not available inside Archive Bin.' })
      return
    }

    setUploadForm(EMPTY_UPLOAD_FORM)
    setSelectedUploadFile(null)
    setUploadDialogOpen(true)
  }

  function closeUploadDialog() {
    setUploadDialogOpen(false)
    setSelectedUploadFile(null)
    setUploadForm(EMPTY_UPLOAD_FORM)
  }

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedUploadFile) {
      setFeedback({ tone: 'error', message: 'Choose a file to upload.' })
      return
    }

    if (!doesFileMatchDocumentTypeRestriction(selectedUploadFile, currentUploadRestriction)) {
      setFeedback({
        tone: 'error',
        message: `Only ${currentUploadRestriction?.label || 'matching'} files can be uploaded in this folder.`,
      })
      return
    }

    if (!uploadForm.title.trim()) {
      setFeedback({ tone: 'error', message: 'Document name is required.' })
      return
    }

    setUploading(true)

    try {
      const fileData = await fileToDataUrl(selectedUploadFile)

      await uploadArchiveDocument({
        title: uploadForm.title.trim(),
        description: uploadForm.description.trim() || undefined,
        category: uploadForm.category,
        subcategory: uploadForm.subcategory.trim() || undefined,
        folderId: currentFolderId || undefined,
        fileName: selectedUploadFile.name,
        originalFileName: selectedUploadFile.name,
        mimeType: selectedUploadFile.type || 'application/octet-stream',
        fileSize: selectedUploadFile.size,
        fileData,
        version: '1.0',
        isPublic: false,
        allowedRoles: RESTRICTED_ROLES,
        tags: parseTags(uploadForm.tags),
        status: uploadForm.status,
      })

      closeUploadDialog()
      refreshArchiveData()
      setFeedback({ tone: 'success', message: `Uploaded "${uploadForm.title.trim()}".` })
    } catch (error) {
      setFeedback({ tone: 'error', message: getErrorMessage(error, 'Failed to upload the document.') })
    } finally {
      setUploading(false)
    }
  }

  function openDocumentEditor(document: ArchiveDocument) {
    setDocumentEditorTarget(document)
    setDocumentForm({
      title: document.title,
      description: document.description || '',
      category: document.category,
      subcategory: document.subcategory || '',
      status: document.status,
      tags: document.tags.join(', '),
    })
  }

  function closeDocumentEditor() {
    setDocumentEditorTarget(null)
    setDocumentForm(EMPTY_UPLOAD_FORM)
  }

  async function handleDocumentEditorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!documentEditorTarget) {
      return
    }

    if (!documentForm.title.trim()) {
      setFeedback({ tone: 'error', message: 'Document name is required.' })
      return
    }

    setSavingDocument(true)

    try {
      await updateArchiveDocument(documentEditorTarget._id, {
        title: documentForm.title.trim(),
        description: documentForm.description.trim() || undefined,
        category: documentForm.category,
        subcategory: documentForm.subcategory.trim() || undefined,
        isPublic: false,
        allowedRoles: RESTRICTED_ROLES,
        tags: parseTags(documentForm.tags),
        status: documentForm.status,
      })

      closeDocumentEditor()
      refreshArchiveData()
      setFeedback({ tone: 'success', message: 'Document updated.' })
    } catch (error) {
      setFeedback({ tone: 'error', message: getErrorMessage(error, 'Failed to update the document.') })
    } finally {
      setSavingDocument(false)
    }
  }

  function openDeleteDialog(target: DeleteTarget) {
    setDeleteTarget(target)
    if (target?.kind === 'folder') {
      const hasNestedItems = target.folder.directChildFolderCount > 0 || target.folder.directDocumentCount > 0
      setForceFolderDelete(hasNestedItems)
    } else {
      setForceFolderDelete(false)
    }
  }

  function closeDeleteDialog() {
    setDeleteTarget(null)
    setForceFolderDelete(false)
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) {
      return
    }

    setDeleting(true)

    try {
      if (deleteTarget.kind === 'folder') {
        const response = await deleteDocumentFolder(deleteTarget.folder._id, deleteTarget.folder.isTrashed ? true : forceFolderDelete)

        if (isFolderInBranch(currentFolderId, deleteTarget.folder._id, folderMap)) {
          setCurrentFolderId(getFolderParentId(deleteTarget.folder))
        }

        setFeedback({
          tone: 'success',
          message: response.permanentlyDeleted
            ? `Folder "${deleteTarget.folder.name}" permanently deleted from Archive Bin.`
            : `Folder "${deleteTarget.folder.name}" moved to Archive Bin.`,
        })
      } else {
        const response = await deleteArchiveDocument(deleteTarget.document._id)
        setFeedback({
          tone: 'success',
          message: response.permanentlyDeleted
            ? `Document "${deleteTarget.document.title}" permanently deleted from Archive Bin.`
            : `Document "${deleteTarget.document.title}" moved to Archive Bin.`,
        })
      }

      closeDeleteDialog()
      refreshArchiveData()
      setSelectedEntryKey(null)
    } catch (error) {
      if (
        deleteTarget.kind === 'folder'
        && error instanceof ArchiveApiError
        && error.status === 409
        && !forceFolderDelete
      ) {
        setForceFolderDelete(true)
      }

      setFeedback({ tone: 'error', message: getErrorMessage(error, 'Failed to delete the selected item.') })
    } finally {
      setDeleting(false)
    }
  }

  function isEntryTrashed(entry: ArchiveEntry): boolean {
    return entry.kind === 'folder' ? Boolean(entry.folder.isTrashed) : Boolean(entry.document.isTrashed)
  }

  function isEntryDraggable(entry: ArchiveEntry): boolean {
    return !isTrashView && !isEntryTrashed(entry) && movingEntryKey === null
  }

  function canDropEntryOnFolder(entry: ArchiveEntry, targetFolderId: string): boolean {
    const targetFolder = folderMap.get(targetFolderId)
    if (!targetFolder || targetFolder.isTrashed) {
      return false
    }

    if (entry.kind === 'folder') {
      if (entry.folder._id === targetFolderId) {
        return false
      }

      if (getFolderParentId(entry.folder) === targetFolderId) {
        return false
      }

      if (isFolderInBranch(targetFolderId, entry.folder._id, folderMap)) {
        return false
      }

      return true
    }

    return (entry.document.folderId?._id ?? null) !== targetFolderId
  }

  function getArchiveEntryByKey(entryKey: string): ArchiveEntry | null {
    if (entryKey.startsWith('folder:')) {
      const folderId = entryKey.slice('folder:'.length)
      const folder = folderMap.get(folderId)
      return folder ? { key: entryKey, kind: 'folder', folder } : null
    }

    if (entryKey.startsWith('document:')) {
      const documentId = entryKey.slice('document:'.length)
      const document = documents.find((candidate) => candidate._id === documentId) ?? null
      return document ? { key: entryKey, kind: 'document', document } : null
    }

    return null
  }

  function resolveDraggedEntry(event?: DragEvent<HTMLElement>): ArchiveEntry | null {
    if (draggedEntryRef.current) {
      return draggedEntryRef.current
    }

    if (draggedEntry) {
      return draggedEntry
    }

    if (!event) {
      return null
    }

    const customPayload = event.dataTransfer.getData(ARCHIVE_DRAG_MIME)
    if (customPayload) {
      try {
        const parsedPayload = JSON.parse(customPayload) as { key?: string }
        if (parsedPayload?.key) {
          return getArchiveEntryByKey(parsedPayload.key)
        }
      } catch {
        return null
      }
    }

    const fallbackKey = event.dataTransfer.getData('text/plain')
    return fallbackKey ? getArchiveEntryByKey(fallbackKey) : null
  }

  function suppressClickAfterDrag() {
    suppressClickUntilRef.current = Date.now() + DRAG_CLICK_SUPPRESSION_MS
  }

  async function moveEntryToFolder(entry: ArchiveEntry, targetFolderId: string) {
    setMovingEntryKey(entry.key)
    setDraggedEntry(null)
    draggedEntryRef.current = null
    setDropTargetFolderId(null)

    try {
      if (entry.kind === 'folder') {
        await updateDocumentFolder(entry.folder._id, {
          parentFolderId: targetFolderId,
        })
        setFeedback({ tone: 'success', message: `Moved folder "${entry.folder.name}".` })
      } else {
        await updateArchiveDocument(entry.document._id, {
          folderId: targetFolderId,
        })
        setFeedback({ tone: 'success', message: `Moved file "${entry.document.title}".` })
      }

      refreshArchiveData()
      setSelectedEntryKey(null)
    } catch (error) {
      setFeedback({ tone: 'error', message: getErrorMessage(error, 'Failed to move the selected item.') })
    } finally {
      setMovingEntryKey(null)
    }
  }

  function handleEntryDragStart(event: DragEvent<HTMLElement>, entry: ArchiveEntry) {
    if (!isEntryDraggable(entry)) {
      event.preventDefault()
      return
    }

    draggedEntryRef.current = entry
    setDraggedEntry(entry)
    setDropTargetFolderId(null)
    setOpenGridMenuKey(null)
    setCreateMenuSource(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', entry.key)
    event.dataTransfer.setData(ARCHIVE_DRAG_MIME, JSON.stringify({ key: entry.key }))
  }

  function handleEntryDragEnd() {
    suppressClickAfterDrag()
    draggedEntryRef.current = null
    setDraggedEntry(null)
    setDropTargetFolderId(null)
  }

  function handleFolderDragOver(event: DragEvent<HTMLElement>, targetFolderId: string) {
    const activeDraggedEntry = resolveDraggedEntry(event)
    if (!activeDraggedEntry || !canDropEntryOnFolder(activeDraggedEntry, targetFolderId)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dropTargetFolderId !== targetFolderId) {
      setDropTargetFolderId(targetFolderId)
    }
  }

  function handleFolderDragLeave(targetFolderId: string) {
    if (dropTargetFolderId === targetFolderId) {
      setDropTargetFolderId(null)
    }
  }

  async function handleFolderDrop(event: DragEvent<HTMLElement>, targetFolderId: string) {
    event.preventDefault()
    event.stopPropagation()

    suppressClickAfterDrag()

    const activeDraggedEntry = resolveDraggedEntry(event)
    if (!activeDraggedEntry || !canDropEntryOnFolder(activeDraggedEntry, targetFolderId)) {
      draggedEntryRef.current = null
      setDraggedEntry(null)
      setDropTargetFolderId(null)
      return
    }

    await moveEntryToFolder(activeDraggedEntry, targetFolderId)
  }

  function handleUploadFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null

    if (!file) {
      setSelectedUploadFile(null)
      return
    }

    if (!doesFileMatchDocumentTypeRestriction(file, currentUploadRestriction)) {
      event.target.value = ''
      setSelectedUploadFile(null)
      setFeedback({
        tone: 'error',
        message: `This folder only accepts ${currentUploadRestriction?.label || 'matching'} files.`,
      })
      return
    }

    setSelectedUploadFile(file)

    setUploadForm((currentValue) => ({
      ...currentValue,
      title: currentValue.title.trim() ? currentValue.title : stripFileExtension(file.name),
    }))
  }

  function renderFolderSegmentInput() {
    if (folderForm.segmentType === 'DOCUMENT_TYPE') {
      return (
        <label>
          <span>{getSegmentInputLabel(folderForm.segmentType)}</span>
          <select
            value={folderForm.segmentValue}
            onChange={(event) => {
              const nextValue = event.target.value
              setFolderForm((currentValue) => ({
                ...currentValue,
                segmentValue: nextValue,
                name: currentValue.name || deriveFolderName(currentValue.segmentType, nextValue),
              }))
            }}
          >
            <option value="">Select a file type</option>
            {DOCUMENT_FILE_TYPE_OPTIONS.map((fileType) => (
              <option key={fileType} value={fileType}>
                {fileType}
              </option>
            ))}
          </select>
        </label>
      )
    }

    if (folderForm.segmentType === 'DATE') {
      return (
        <label>
          <span>{getSegmentInputLabel(folderForm.segmentType)}</span>
          <input
            type="date"
            value={folderForm.segmentValue}
            onChange={(event) => setFolderForm((currentValue) => ({ ...currentValue, segmentValue: event.target.value }))}
          />
        </label>
      )
    }

    return (
      <label>
        <span>{getSegmentInputLabel(folderForm.segmentType)}</span>
        <input
          type="text"
          placeholder={folderForm.segmentType === 'DEPARTMENT' ? 'Example: Registrar' : 'Optional segment value'}
          value={folderForm.segmentValue}
          onChange={(event) => setFolderForm((currentValue) => ({ ...currentValue, segmentValue: event.target.value }))}
        />
      </label>
    )
  }

  function renderActionButtons(entry: ArchiveEntry, variant: 'inline' | 'menu' = 'inline') {
    const isTrashedEntry = entry.kind === 'folder' ? Boolean(entry.folder.isTrashed) : Boolean(entry.document.isTrashed)
    const handleEdit = () => {
      setOpenGridMenuKey(null)
      if (entry.kind === 'folder') {
        openFolderDialog('edit', entry.folder)
        return
      }

      openDocumentEditor(entry.document)
    }

    const handleDelete = () => {
      setOpenGridMenuKey(null)
      openDeleteDialog(entry.kind === 'folder'
        ? { kind: 'folder', folder: entry.folder }
        : { kind: 'document', document: entry.document })
    }

    if (variant === 'menu') {
      const isOpen = openGridMenuKey === entry.key

      return (
        <div
          className="document-archive__menu-shell"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={`document-archive__icon-button document-archive__icon-button--menu${isOpen ? ' is-active' : ''}`}
            aria-label="Open item actions"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            onClick={() => setOpenGridMenuKey((currentValue) => currentValue === entry.key ? null : entry.key)}
          >
            <MoreVertical size={16} />
          </button>
          {isOpen ? (
            <div className="document-archive__menu" role="menu">
              {!isTrashedEntry ? (
                <button type="button" className="document-archive__menu-item" role="menuitem" onClick={handleEdit}>
                  <PencilLine size={15} />
                  <span>{entry.kind === 'folder' ? 'Edit folder' : 'Edit file'}</span>
                </button>
              ) : null}
              <button type="button" className="document-archive__menu-item is-danger" role="menuitem" onClick={handleDelete}>
                <Trash2 size={15} />
                <span>{isTrashedEntry
                  ? (entry.kind === 'folder' ? 'Delete permanently' : 'Delete permanently')
                  : (entry.kind === 'folder' ? 'Delete folder' : 'Delete file')}</span>
              </button>
            </div>
          ) : null}
        </div>
      )
    }

    return (
      <div
        className="document-archive__actions"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {!isTrashedEntry ? (
          <button
            type="button"
            className="document-archive__icon-button"
            aria-label={entry.kind === 'folder' ? 'Edit folder' : 'Edit file'}
            title={entry.kind === 'folder' ? 'Edit folder' : 'Edit file'}
            onClick={handleEdit}
          >
            <PencilLine size={16} />
          </button>
        ) : null}
        <button
          type="button"
          className="document-archive__icon-button is-danger"
          aria-label={isTrashedEntry ? 'Delete permanently' : (entry.kind === 'folder' ? 'Delete folder' : 'Delete file')}
          title={isTrashedEntry ? 'Delete permanently' : (entry.kind === 'folder' ? 'Delete folder' : 'Delete file')}
          onClick={handleDelete}
        >
          <Trash2 size={16} />
        </button>
      </div>
    )
  }

  function renderGridPreview(entry: ArchiveEntry, itemType: string, Icon: React.ComponentType<{ size?: number }>) {
    if (entry.kind === 'folder') {
      return (
        <div className="document-archive__grid-preview is-folder">
          <div className="document-archive__grid-preview-folder">
            <FolderOpen size={30} />
          </div>
          <strong>{getFolderTypeCopy(entry.folder)}</strong>
          <span>{entry.folder.directDocumentCount} file{entry.folder.directDocumentCount === 1 ? '' : 's'} in this folder</span>
        </div>
      )
    }

    const assetUrl = getArchiveDocumentAssetUrl(entry.document)
    const previewKind = getDocumentPreviewKind(entry.document)

    if (previewKind === 'image') {
      return (
        <div className="document-archive__grid-preview">
          <img
            src={assetUrl}
            alt=""
            className="document-archive__grid-preview-image"
            loading="lazy"
            draggable={false}
          />
        </div>
      )
    }

    if (previewKind === 'pdf') {
      return <PdfGridPreview document={entry.document} title={entry.document.title} />
    }

    return (
      <div className="document-archive__grid-preview is-generic">
        <div className="document-archive__grid-preview-page">
          <span className="document-archive__grid-preview-icon">
            <Icon size={28} />
          </span>
          <strong>{itemType}</strong>
          <span>{getCategoryLabel(entry.document.category)} - {formatFileSize(entry.document.fileSize)}</span>
        </div>
      </div>
    )
  }

  function renderCreateMenu(source: 'sidebar' | 'toolbar') {
    if (isTrashView) {
      return null
    }

    const isOpen = createMenuSource === source

    return (
      <div className="document-archive__create-menu-shell">
        <button
          type="button"
          className={`document-archive__button document-archive__button--primary${source === 'sidebar' ? ' document-archive__button--new' : ''}`}
          onClick={() => handleToggleCreateMenu(source)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <FolderPlus size={16} />
          {source === 'sidebar' ? 'New' : 'New'}
        </button>
        {isOpen ? (
          <div className="document-archive__create-menu" role="menu">
            <button type="button" className="document-archive__menu-item" role="menuitem" onClick={handleCreateNewFolder}>
              <FolderPlus size={15} />
              <span>New Folder</span>
            </button>
            <button type="button" className="document-archive__menu-item" role="menuitem" onClick={handleCreateUploadFile}>
              <Upload size={15} />
              <span>Upload File</span>
            </button>
            <button type="button" className="document-archive__menu-item is-disabled" role="menuitem" disabled>
              <Upload size={15} />
              <span>Upload Folder</span>
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  function renderGridEntryCard(entry: ArchiveEntry) {
    const isFolder = entry.kind === 'folder'
    const folderId = isFolder ? entry.folder._id : null
    const key = entry.key
    const isSelected = selectedEntryKey === key
    const isDraggable = isEntryDraggable(entry)
    const activeDraggedEntry = draggedEntry || draggedEntryRef.current
    const canAcceptDrop = folderId !== null && activeDraggedEntry ? canDropEntryOnFolder(activeDraggedEntry, folderId) : false
    const isDropTarget = folderId !== null && canAcceptDrop && dropTargetFolderId === folderId
    const itemType = isFolder ? 'Folder' : getDocumentFileType(entry.document)
    const Icon = getFileIcon(itemType, entry.kind)
    const name = isFolder ? entry.folder.name : entry.document.title
    const actor = getEntryActor(entry)
    const actorLabel = getActorLabel(entry)
    const actorAvatarSrc = getProfileAvatarSrc(actor?.avatar, actor?.avatarMimeType)
    const badgeTone = getGridBadgeTone(itemType, entry.kind)
    const destination = getEntryDestination(entry, folderMap)

    return (
      <div
        key={key}
        className={`document-archive__grid-card${isSelected ? ' is-selected' : ''}${isDraggable ? ' is-draggable' : ''}${movingEntryKey === key ? ' is-moving' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
        onClick={() => handleEntryClick(entry)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            handleRowOpen(entry)
          }
        }}
        draggable={isDraggable}
        onDragStart={(event) => handleEntryDragStart(event, entry)}
        onDragEnd={handleEntryDragEnd}
        onDragOver={folderId ? (event) => handleFolderDragOver(event, folderId) : undefined}
        onDragLeave={folderId ? () => handleFolderDragLeave(folderId) : undefined}
        onDrop={folderId ? (event) => { void handleFolderDrop(event, folderId) } : undefined}
        role="button"
        tabIndex={0}
      >
        <div className="document-archive__grid-card-topline">
          <span className={`document-archive__grid-badge is-${badgeTone}`}>{itemType}</span>
          {renderActionButtons(entry, 'menu')}
        </div>
        <div className="document-archive__grid-card-head">
          <strong title={name}>{name}</strong>
          <button
            type="button"
            className="document-archive__destination-link"
            title={destination.label}
            onClick={(event) => {
              event.stopPropagation()
              handleOpenEntryDestination(entry)
            }}
          >
            {destination.label}
          </button>
        </div>
        {renderGridPreview(entry, itemType, Icon)}
        <div className="document-archive__grid-card-footer">
          <span className={`document-archive__grid-avatar${isFolder ? ' is-folder' : ''}`}>
            {actorAvatarSrc ? (
              <img src={actorAvatarSrc} alt="" />
            ) : (
              actorLabel.charAt(0).toUpperCase()
            )}
          </span>
          <span className="document-archive__grid-card-copy">
            <strong title={actorLabel}>{actorLabel}</strong>
          </span>
        </div>
      </div>
    )
  }

  function renderSectionGrid(
    title: string,
    subtitle: string,
    entries: ArchiveEntry[],
    emptyTitle: string,
    emptyMessage: string
  ) {
    return (
      <section className="document-archive__section-block">
        <div className="document-archive__section-head">
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <span className="document-archive__section-count">{getItemCountLabel(entries.length)}</span>
        </div>
        {entries.length > 0 ? (
          <div className="document-archive__grid document-archive__grid--section">
            {entries.map((entry) => renderGridEntryCard(entry))}
          </div>
        ) : (
          <div className="document-archive__section-empty">
            <strong>{emptyTitle}</strong>
            <p>{emptyMessage}</p>
          </div>
        )}
      </section>
    )
  }

  function renderListHead() {
    return (
      <div className="document-archive__table-head">
        <div>Name</div>
        <div>Inserted by</div>
        <div>Modified</div>
        <div>Size</div>
        <div>Type</div>
        <div className="document-archive__table-actions-head" aria-hidden="true" />
      </div>
    )
  }

  function renderListEntryRow(entry: ArchiveEntry) {
    const isFolder = entry.kind === 'folder'
    const folderId = isFolder ? entry.folder._id : null
    const key = entry.key
    const isSelected = selectedEntryKey === key
    const isDraggable = isEntryDraggable(entry)
    const activeDraggedEntry = draggedEntry || draggedEntryRef.current
    const canAcceptDrop = folderId !== null && activeDraggedEntry ? canDropEntryOnFolder(activeDraggedEntry, folderId) : false
    const isDropTarget = folderId !== null && canAcceptDrop && dropTargetFolderId === folderId
    const itemType = isFolder ? 'Folder' : getDocumentFileType(entry.document)
    const Icon = getFileIcon(itemType, entry.kind)
    const name = isFolder ? entry.folder.name : entry.document.title
    const modifiedAt = isFolder ? entry.folder.updatedAt : entry.document.updatedAt
    const modifiedAbsoluteLabel = formatAbsoluteDate(modifiedAt)
    const modifiedRelativeLabel = formatRelativeTime(modifiedAt)
    const size = isFolder ? `${entry.folder.directDocumentCount} file${entry.folder.directDocumentCount === 1 ? '' : 's'}` : formatFileSize(entry.document.fileSize)
    const sizeSecondary = isFolder ? `${entry.folder.directChildFolderCount} folder${entry.folder.directChildFolderCount === 1 ? '' : 's'}` : entry.document.originalFileName
    const owner = isFolder
      ? getActorName(entry.folder.createdBy || entry.folder.updatedBy)
      : getActorName(entry.document.createdBy || entry.document.updatedBy)
    const typeMeta = isFolder ? getSegmentLabel(entry.folder.segmentType) : (entry.document.mimeType || 'File')
    const destination = getEntryDestination(entry, folderMap)

    return (
      <div
        key={key}
        className={`document-archive__table-row${isSelected ? ' is-selected' : ''}${isDraggable ? ' is-draggable' : ''}${movingEntryKey === key ? ' is-moving' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
        onClick={() => handleEntryClick(entry)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            handleRowOpen(entry)
          }
        }}
        draggable={isDraggable}
        onDragStart={(event) => handleEntryDragStart(event, entry)}
        onDragEnd={handleEntryDragEnd}
        onDragOver={folderId ? (event) => handleFolderDragOver(event, folderId) : undefined}
        onDragLeave={folderId ? () => handleFolderDragLeave(folderId) : undefined}
        onDrop={folderId ? (event) => { void handleFolderDrop(event, folderId) } : undefined}
        role="button"
        tabIndex={0}
      >
        <div className="document-archive__table-cell document-archive__table-cell--name" data-label="Name">
          <span className={`document-archive__item-icon${isFolder ? ' is-folder' : ''}`}>
            <Icon size={18} />
          </span>
          <div className="document-archive__item-copy">
            <strong title={name}>{name}</strong>
            <button
              type="button"
              className="document-archive__destination-link"
              title={destination.label}
              onClick={(event) => {
                event.stopPropagation()
                handleOpenEntryDestination(entry)
              }}
            >
              {destination.label}
            </button>
          </div>
        </div>
        <div className="document-archive__table-cell" data-label="Inserted by">
          <strong title={owner}>{owner}</strong>
        </div>
        <div className="document-archive__table-cell" data-label="Modified">
          <strong title={modifiedAbsoluteLabel}>{modifiedAbsoluteLabel}</strong>
          <span title={modifiedRelativeLabel}>{modifiedRelativeLabel}</span>
        </div>
        <div className="document-archive__table-cell" data-label="Size">
          <strong title={size}>{size}</strong>
          <span title={sizeSecondary}>{sizeSecondary}</span>
        </div>
        <div className="document-archive__table-cell" data-label="Type">
          <strong title={itemType}>{itemType}</strong>
          <span title={typeMeta}>{typeMeta}</span>
        </div>
        <div className="document-archive__table-cell document-archive__table-cell--actions">
          {renderActionButtons(entry)}
        </div>
      </div>
    )
  }

  function renderSectionList(
    title: string,
    subtitle: string,
    entries: ArchiveEntry[],
    emptyTitle: string,
    emptyMessage: string
  ) {
    return (
      <section className="document-archive__section-block">
        <div className="document-archive__section-head">
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <span className="document-archive__section-count">{getItemCountLabel(entries.length)}</span>
        </div>
        {entries.length > 0 ? (
          <div className="document-archive__section-list">
            {renderListHead()}
            <div className="document-archive__table-body">
              {entries.map((entry) => renderListEntryRow(entry))}
            </div>
          </div>
        ) : (
          <div className="document-archive__section-empty">
            <strong>{emptyTitle}</strong>
            <p>{emptyMessage}</p>
          </div>
        )}
      </section>
    )
  }

  function renderHomeSections() {
    const renderSection = viewMode === 'list' ? renderSectionList : renderSectionGrid

    return (
      <div className="document-archive__section-stack">
        {renderSection(
          'Quick access',
          'Jump back into the folders staff use most often.',
          quickAccessFolderEntries,
          'No quick access folders yet.',
          'Open folders from My Archive and they will appear here for faster access.'
        )}
        {renderSection(
          'Recent files',
          'Latest uploaded or updated documents across the archive.',
          recentFileEntries,
          'No recent files yet.',
          'Upload a document to start building a searchable school archive.'
        )}
        {renderSection(
          'Department shared',
          'Shared department spaces for registrar and admin document workflows.',
          departmentSharedEntries,
          'No department shared folders yet.',
          'Create a department-segmented folder to surface it in shared access.'
        )}
      </div>
    )
  }

  function renderRecentSections() {
    const renderSection = viewMode === 'list' ? renderSectionList : renderSectionGrid

    return (
      <div className="document-archive__section-stack">
        {renderSection(
          'Recent folders',
          'Folders you opened recently or folders updated most recently.',
          recentFolders.map((folder): ArchiveEntry => ({ key: `folder:${folder._id}`, kind: 'folder', folder })),
          'No recent folders yet.',
          'Open a folder from My Archive to keep it close at hand.'
        )}
        {renderSection(
          'Recent files',
          'Fresh activity across the archive, ordered by latest updates.',
          recentFileEntries,
          'No recent files yet.',
          'Recent document activity will appear here automatically.'
        )}
      </div>
    )
  }

  function renderListRows() {
    if ((foldersLoading || documentsLoading) && combinedEntries.length === 0) {
      return (
        <div className="document-archive__empty">
          <LoaderCircle className="spin" size={18} />
          <span>Loading archive items...</span>
        </div>
      )
    }

    if (foldersError || documentsError) {
      const archiveErrorMessage = foldersError || documentsError
      const resolvedErrorMessage = isTrashView && archiveErrorMessage === 'Invalid query parameters.'
        ? 'Archive Bin needs the updated backend. Restart the admin server, then refresh this page.'
        : archiveErrorMessage

      return (
        <div className="document-archive__empty is-error">
          <div>
            <strong>Archive content could not be loaded.</strong>
            <p>{resolvedErrorMessage}</p>
          </div>
          <button type="button" className="document-archive__button document-archive__button--ghost" onClick={refreshArchiveData}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      )
    }

    if (combinedEntries.length === 0) {
      return (
        <div className="document-archive__empty">
          <div>
            <strong>{isTrashView ? 'Archive Bin is empty.' : 'No archive items in this view.'}</strong>
            <p>
              {isTrashView
                ? `Deleted folders and files stay here for ${ARCHIVE_BIN_RETENTION_DAYS} days before permanent removal.`
                : debouncedSearchTerm || activeFilterCount > 0
                ? 'Try clearing the search or active filters.'
                : currentFolder
                  ? 'This folder does not contain any files or subfolders yet.'
                  : 'Create a folder or upload a file to start building the archive.'}
            </p>
          </div>
          {isTrashView ? null : (debouncedSearchTerm || activeFilterCount > 0) ? (
            <button
              type="button"
              className="document-archive__button document-archive__button--ghost"
              onClick={() => {
                setSearchInput('')
                setCategoryFilter('all')
                setStatusFilter('all')
              }}
            >
              Clear view
            </button>
          ) : (
            <button type="button" className="document-archive__button document-archive__button--primary" onClick={openUploadDialog}>
              <Upload size={16} />
              Upload file
            </button>
          )}
        </div>
      )
    }

    return (
      <>
        {renderListHead()}
        <div className="document-archive__table-body">
          {combinedEntries.map((entry) => renderListEntryRow(entry))}
          {(foldersLoading || documentsLoading) ? (
            <div className="document-archive__table-loading" aria-live="polite">
              <LoaderCircle className="spin" size={16} />
              <span>Loading remaining archive items...</span>
            </div>
          ) : null}
        </div>
      </>
    )
  }

  function renderGridCards() {
    if (foldersLoading || documentsLoading || foldersError || documentsError || combinedEntries.length === 0) {
      return renderListRows()
    }

    return (
      <div className="document-archive__grid">
        {combinedEntries.map((entry) => {
          const isFolder = entry.kind === 'folder'
          const folderId = isFolder ? entry.folder._id : null
          const key = entry.key
          const isSelected = selectedEntryKey === key
          const isDraggable = isEntryDraggable(entry)
          const activeDraggedEntry = draggedEntry || draggedEntryRef.current
          const canAcceptDrop = folderId !== null && activeDraggedEntry ? canDropEntryOnFolder(activeDraggedEntry, folderId) : false
          const isDropTarget = folderId !== null && canAcceptDrop && dropTargetFolderId === folderId
          const itemType = isFolder ? 'Folder' : getDocumentFileType(entry.document)
          const Icon = getFileIcon(itemType, entry.kind)
          const name = isFolder ? entry.folder.name : entry.document.title
          const actor = getEntryActor(entry)
          const actorLabel = getActorLabel(entry)
          const actorAvatarSrc = getProfileAvatarSrc(actor?.avatar, actor?.avatarMimeType)
          const badgeTone = getGridBadgeTone(itemType, entry.kind)
          const destination = getEntryDestination(entry, folderMap)

          return (
            <div
              key={key}
              className={`document-archive__grid-card${isSelected ? ' is-selected' : ''}${isDraggable ? ' is-draggable' : ''}${movingEntryKey === key ? ' is-moving' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
              onClick={() => handleEntryClick(entry)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleRowOpen(entry)
                }
              }}
              draggable={isDraggable}
              onDragStart={(event) => handleEntryDragStart(event, entry)}
              onDragEnd={handleEntryDragEnd}
              onDragOver={folderId ? (event) => handleFolderDragOver(event, folderId) : undefined}
              onDragLeave={folderId ? () => handleFolderDragLeave(folderId) : undefined}
              onDrop={folderId ? (event) => { void handleFolderDrop(event, folderId) } : undefined}
              role="button"
              tabIndex={0}
            >
              <div className="document-archive__grid-card-topline">
                <span className={`document-archive__grid-badge is-${badgeTone}`}>{itemType}</span>
                {renderActionButtons(entry, 'menu')}
              </div>
              <div className="document-archive__grid-card-head">
                <strong title={name}>{name}</strong>
                <button
                  type="button"
                  className="document-archive__destination-link"
                  title={destination.label}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleOpenEntryDestination(entry)
                  }}
                >
                  {destination.label}
                </button>
              </div>
              {renderGridPreview(entry, itemType, Icon)}
              <div className="document-archive__grid-card-footer">
                <span className={`document-archive__grid-avatar${isFolder ? ' is-folder' : ''}`}>
                  {actorAvatarSrc ? (
                    <img src={actorAvatarSrc} alt="" />
                  ) : (
                    actorLabel.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="document-archive__grid-card-copy">
                  <strong title={actorLabel}>{actorLabel}</strong>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="document-archive">
      <header className="document-archive__topbar">
        <div className="document-archive__brand">
          <div className="document-archive__brand-mark">
            <img src="/Logo.jpg" alt="West Coast College" />
          </div>
          <div className="document-archive__brand-copy">
            <strong>Document Archive</strong>
            <span>West Coast College cloud workspace</span>
          </div>
        </div>

        <label className="document-archive__global-search">
          <Search size={18} />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search in Document Archive"
          />
        </label>

        <div className="document-archive__topbar-actions">
          <button
            type="button"
            className="document-archive__icon-button"
            aria-label="Help"
            onClick={() => setFeedback({ tone: 'success', message: 'Archive help shortcuts are ready to connect to your support center.' })}
          >
            <CircleHelp size={16} />
          </button>
          <button
            type="button"
            className="document-archive__icon-button"
            aria-label="Notifications"
            onClick={() => setFeedback({ tone: 'success', message: 'Archive notifications can be connected to activity feeds and alerts.' })}
          >
            <Bell size={16} />
          </button>
          <button
            type="button"
            className="document-archive__icon-button"
            aria-label="Settings"
            onClick={() => {
              if (onNavigate) {
                onNavigate('settings')
                return
              }

              setFeedback({ tone: 'success', message: 'Use the Settings page to manage archive theme colors and preferences.' })
            }}
          >
            <Settings2 size={16} />
          </button>
          <button
            type="button"
            className="document-archive__icon-button"
            aria-label="Profile"
            onClick={() => {
              if (onNavigate) {
                onNavigate('profile')
                return
              }

              setFeedback({ tone: 'success', message: 'Open Profile from the main navigation to manage your account.' })
            }}
          >
            <UserCircle2 size={17} />
          </button>
        </div>
      </header>

      <div className="document-archive__workspace">
        <aside className="document-archive__sidebar">
          <div className="document-archive__sidebar-main">
            {renderCreateMenu('sidebar')}

            <nav className="document-archive__drive-nav" aria-label="Document archive navigation">
              <button
                type="button"
                className={`document-archive__drive-link${workspaceView === 'home' ? ' is-active' : ''}`}
                onClick={() => handleSelectWorkspace('home')}
              >
                <Home size={17} />
                <span>Home</span>
              </button>
              <button
                type="button"
                className={`document-archive__drive-link${workspaceView === 'archive' ? ' is-active' : ''}`}
                onClick={() => handleSelectWorkspace('archive')}
              >
                <FolderOpen size={17} />
                <span>My Archive</span>
              </button>
              <button
                type="button"
                className={`document-archive__drive-link${workspaceView === 'recent' ? ' is-active' : ''}`}
                onClick={() => handleSelectWorkspace('recent')}
              >
                <Clock3 size={17} />
                <span>Recent</span>
              </button>
              <button
                type="button"
                className={`document-archive__drive-link${workspaceView === 'shared' ? ' is-active' : ''}`}
                onClick={() => handleSelectWorkspace('shared')}
              >
                <HardDrive size={17} />
                <span>Department Shared</span>
              </button>
              <button
                type="button"
                className={`document-archive__drive-link${workspaceView === 'trash' ? ' is-active' : ''}`}
                onClick={() => handleSelectWorkspace('trash')}
              >
                <Trash2 size={17} />
                <span>Archive Bin</span>
              </button>
            </nav>
          </div>

          <div className="document-archive__storage-card">
            <div className="document-archive__storage-head">
              <strong>Storage</strong>
              <small>{storagePlan === 'premium' ? 'Premium 1 TB' : 'Default 10 GB'}</small>
            </div>
            <div className="document-archive__storage-meter" aria-hidden="true">
              <span style={{ width: `${storageUsagePercent}%` }} />
            </div>
            <p>{storageUsageLabel}</p>
            <button
              type="button"
              className="document-archive__button document-archive__button--ghost document-archive__button--storage"
              onClick={() => {
                setStoragePlan('premium')
                setFeedback({ tone: 'success', message: 'Premium storage plan preview enabled at 1 TB.' })
              }}
              disabled={storagePlan === 'premium'}
            >
              Upgrade storage
            </button>
          </div>
        </aside>

        <section className="document-archive__content">
          {feedback ? (
            <div className={`document-archive__banner is-${feedback.tone}`}>
              <span>{feedback.message}</span>
              <button type="button" className="document-archive__icon-button" aria-label="Dismiss message" onClick={() => setFeedback(null)}>
                <X size={16} />
              </button>
            </div>
          ) : null}

          <div className="document-archive__page-header">
            <div className="document-archive__page-copy">
              {(currentFolder || shouldRenderBrowser) ? (
                <div className="document-archive__breadcrumbs" aria-label="Breadcrumb">
                  {breadcrumbItems.map((item, index) => {
                    const isLast = index === breadcrumbItems.length - 1

                    return (
                      <React.Fragment key={item.key}>
                        {index > 0 ? <ChevronRight size={14} /> : null}
                        {item.onSelect ? (
                          <button
                            type="button"
                            className={`document-archive__breadcrumb${isLast ? ' is-current' : ''}`}
                            onClick={item.onSelect}
                          >
                            {item.label}
                          </button>
                        ) : (
                          <span className={`document-archive__breadcrumb${isLast ? ' is-current' : ''}`}>
                            {item.label}
                          </span>
                        )}
                      </React.Fragment>
                    )
                  })}
                </div>
              ) : null}
              <h1>{workspaceTitle}</h1>
              <p>{workspaceSubtitle}</p>
            </div>
          </div>

          <div className="document-archive__toolbar">
            <div className="document-archive__toolbar-actions">
              {renderCreateMenu('toolbar')}
              {!isTrashView ? (
                <button type="button" className="document-archive__button document-archive__button--primary is-secondary" onClick={openUploadDialog}>
                  <Upload size={16} />
                  Upload
                </button>
              ) : null}
              <button
                type="button"
                className={`document-archive__button document-archive__button--ghost${showFilters ? ' is-active' : ''}`}
                onClick={() => setShowFilters((currentValue) => !currentValue)}
              >
                <SlidersHorizontal size={16} />
                Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
              <label className="document-archive__sort">
                <span>Sort</span>
                <select value={sortOption} onChange={(event) => setSortOption(event.target.value as SortOption)}>
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="document-archive__view-toggle" role="group" aria-label="Toggle archive view">
                <button
                  type="button"
                  className={viewMode === 'grid' ? ' is-active' : ''}
                  aria-label="Grid view"
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  type="button"
                  className={viewMode === 'list' ? ' is-active' : ''}
                  aria-label="List view"
                  onClick={() => setViewMode('list')}
                >
                  <List size={16} />
                </button>
              </div>
              <button type="button" className="document-archive__icon-button" onClick={refreshArchiveData} aria-label="Refresh archive">
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {showFilters ? (
            <div className="document-archive__filters">
              <label>
                <span>Category</span>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as DocumentCategory | 'all')}>
                  <option value="all">All categories</option>
                  {DOCUMENT_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as DocumentStatus | 'all')}>
                  <option value="all">All statuses</option>
                  {DOCUMENT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Folder segment</span>
                <select value={segmentFilter} onChange={(event) => setSegmentFilter(event.target.value as DocumentFolderSegmentType | 'ALL')}>
                  <option value="ALL">All segments</option>
                  {FOLDER_SEGMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {shouldRenderBrowser ? (
            <>
              <div className="document-archive__browser">
                <div className="document-archive__browser-topline">
                  <span>{browserLabel}</span>
                  <small>{getItemCountLabel(hasArchiveLoadError ? 0 : totalVisibleItems)}</small>
                </div>
                {viewMode === 'list' ? renderListRows() : renderGridCards()}
              </div>

              <div className="document-archive__footer">
                <p>
                  Page {currentPage} of {totalPages}
                </p>
                <div className="document-archive__footer-actions">
                  <button
                    type="button"
                    className="document-archive__button document-archive__button--ghost"
                    onClick={() => setCurrentPage((currentValue) => Math.max(1, currentValue - 1))}
                    disabled={currentPage <= 1 || documentsLoading}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="document-archive__button document-archive__button--ghost"
                    onClick={() => setCurrentPage((currentValue) => Math.min(totalPages, currentValue + 1))}
                    disabled={currentPage >= totalPages || documentsLoading}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : workspaceView === 'recent' ? (
            renderRecentSections()
          ) : (
            renderHomeSections()
          )}
        </section>
      </div>

      {folderDialogOpen ? (
        <div className="document-archive__modal-backdrop" role="presentation" onClick={closeFolderDialog}>
          <div className="document-archive__modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="document-archive__modal-head">
              <div>
                <h3>{folderDialogMode === 'edit' ? 'Edit Folder' : 'New Folder'}</h3>
                <p>{currentFolder ? `Location: ${currentFolderPath.map((folder) => folder.name).join(' / ')}` : 'Create a folder at the current archive level.'}</p>
              </div>
              <button type="button" className="document-archive__icon-button" onClick={closeFolderDialog} aria-label="Close folder dialog">
                <X size={16} />
              </button>
            </div>
            <form className="document-archive__form" onSubmit={handleFolderSubmit}>
              <label>
                <span>Folder name</span>
                <input
                  type="text"
                  placeholder="Example: Finance reports"
                  value={folderForm.name}
                  onChange={(event) => setFolderForm((currentValue) => ({ ...currentValue, name: event.target.value }))}
                />
              </label>
              <label>
                <span>Segment</span>
                <select
                  value={folderForm.segmentType}
                  onChange={(event) => setFolderForm((currentValue) => ({
                    ...currentValue,
                    segmentType: event.target.value as DocumentFolderSegmentType,
                    segmentValue: '',
                  }))}
                >
                  {FOLDER_SEGMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {renderFolderSegmentInput()}
              <label>
                <span>Description</span>
                <textarea
                  placeholder="Optional notes about this folder"
                  value={folderForm.description}
                  onChange={(event) => setFolderForm((currentValue) => ({ ...currentValue, description: event.target.value }))}
                />
              </label>
              <div className="document-archive__modal-actions">
                <button type="button" className="document-archive__button document-archive__button--ghost" onClick={closeFolderDialog}>
                  Cancel
                </button>
                <button type="submit" className="document-archive__button document-archive__button--primary" disabled={savingFolder}>
                  {savingFolder ? <LoaderCircle className="spin" size={16} /> : null}
                  {folderDialogMode === 'edit' ? 'Save changes' : 'Create folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {uploadDialogOpen ? (
        <div className="document-archive__modal-backdrop" role="presentation" onClick={closeUploadDialog}>
          <div className="document-archive__modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="document-archive__modal-head">
              <div>
                <h3>Upload File</h3>
                <p>{currentFolder ? `This file will be uploaded into ${currentFolderPath.map((folder) => folder.name).join(' / ')}.` : 'This file will be uploaded into the archive root.'}</p>
              </div>
              <button type="button" className="document-archive__icon-button" onClick={closeUploadDialog} aria-label="Close upload dialog">
                <X size={16} />
              </button>
            </div>
            <form className="document-archive__form" onSubmit={handleUploadSubmit}>
              <label>
                <span>File</span>
                <input type="file" accept={currentUploadRestriction?.accept} onChange={handleUploadFileChange} />
                {currentUploadRestriction && !selectedUploadFile ? (
                  <small>Only {currentUploadRestriction.label} files are allowed in this folder.</small>
                ) : null}
                <small>{selectedUploadFile ? `${selectedUploadFile.name} - ${formatFileSize(selectedUploadFile.size)}` : 'Select a file to upload'}</small>
              </label>
              <label>
                <span>Document name</span>
                <input
                  type="text"
                  placeholder="Visible file name"
                  value={uploadForm.title}
                  onChange={(event) => setUploadForm((currentValue) => ({ ...currentValue, title: event.target.value }))}
                />
              </label>
              <div className="document-archive__form-grid">
                <label>
                  <span>Category</span>
                  <select
                    value={uploadForm.category}
                    onChange={(event) => setUploadForm((currentValue) => ({ ...currentValue, category: event.target.value as DocumentCategory }))}
                  >
                    {DOCUMENT_CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Department / subcategory</span>
                  <input
                    type="text"
                    placeholder="Example: Registrar"
                    value={uploadForm.subcategory}
                    onChange={(event) => setUploadForm((currentValue) => ({ ...currentValue, subcategory: event.target.value }))}
                  />
                </label>
              </div>
              <div className="document-archive__form-grid">
                <label>
                  <span>Status</span>
                  <select
                    value={uploadForm.status}
                    onChange={(event) => setUploadForm((currentValue) => ({ ...currentValue, status: event.target.value as DocumentStatus }))}
                  >
                    {DOCUMENT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <span>Tags</span>
                <input
                  type="text"
                  placeholder="Comma-separated tags"
                  value={uploadForm.tags}
                  onChange={(event) => setUploadForm((currentValue) => ({ ...currentValue, tags: event.target.value }))}
                />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  placeholder="Optional document notes"
                  value={uploadForm.description}
                  onChange={(event) => setUploadForm((currentValue) => ({ ...currentValue, description: event.target.value }))}
                />
              </label>
              <div className="document-archive__modal-actions">
                <button type="button" className="document-archive__button document-archive__button--ghost" onClick={closeUploadDialog}>
                  Cancel
                </button>
                <button type="submit" className="document-archive__button document-archive__button--primary" disabled={uploading}>
                  {uploading ? <LoaderCircle className="spin" size={16} /> : null}
                  Upload file
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {documentEditorTarget ? (
        <div className="document-archive__modal-backdrop" role="presentation" onClick={closeDocumentEditor}>
          <div className="document-archive__modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="document-archive__modal-head">
              <div>
                <h3>Edit File</h3>
                <p>Update how this file appears in the archive without changing the stored binary.</p>
              </div>
              <button type="button" className="document-archive__icon-button" onClick={closeDocumentEditor} aria-label="Close document editor">
                <X size={16} />
              </button>
            </div>
            <form className="document-archive__form" onSubmit={handleDocumentEditorSubmit}>
              <label>
                <span>Document name</span>
                <input
                  type="text"
                  value={documentForm.title}
                  onChange={(event) => setDocumentForm((currentValue) => ({ ...currentValue, title: event.target.value }))}
                />
              </label>
              <div className="document-archive__form-grid">
                <label>
                  <span>Category</span>
                  <select
                    value={documentForm.category}
                    onChange={(event) => setDocumentForm((currentValue) => ({ ...currentValue, category: event.target.value as DocumentCategory }))}
                  >
                    {DOCUMENT_CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Department / subcategory</span>
                  <input
                    type="text"
                    value={documentForm.subcategory}
                    onChange={(event) => setDocumentForm((currentValue) => ({ ...currentValue, subcategory: event.target.value }))}
                  />
                </label>
              </div>
              <div className="document-archive__form-grid">
                <label>
                  <span>Status</span>
                  <select
                    value={documentForm.status}
                    onChange={(event) => setDocumentForm((currentValue) => ({ ...currentValue, status: event.target.value as DocumentStatus }))}
                  >
                    {DOCUMENT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <span>Tags</span>
                <input
                  type="text"
                  value={documentForm.tags}
                  onChange={(event) => setDocumentForm((currentValue) => ({ ...currentValue, tags: event.target.value }))}
                />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  value={documentForm.description}
                  onChange={(event) => setDocumentForm((currentValue) => ({ ...currentValue, description: event.target.value }))}
                />
              </label>
              <div className="document-archive__modal-actions">
                <button type="button" className="document-archive__button document-archive__button--ghost" onClick={closeDocumentEditor}>
                  Cancel
                </button>
                <button type="submit" className="document-archive__button document-archive__button--primary" disabled={savingDocument}>
                  {savingDocument ? <LoaderCircle className="spin" size={16} /> : null}
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {deleteTarget ? (
        <div className="document-archive__modal-backdrop" role="presentation" onClick={closeDeleteDialog}>
          <div className="document-archive__modal document-archive__modal--compact" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="document-archive__modal-head">
              <div>
                <h3>
                  {(deleteTarget.kind === 'folder' ? deleteTarget.folder.isTrashed : deleteTarget.document.isTrashed)
                    ? 'Delete Permanently'
                    : (deleteTarget.kind === 'folder' ? 'Delete Folder' : 'Delete File')}
                </h3>
                <p>
                  {deleteTarget.kind === 'folder'
                    ? (deleteTarget.folder.isTrashed
                        ? `This will permanently remove "${deleteTarget.folder.name}" from Archive Bin.`
                        : `This will move "${deleteTarget.folder.name}" to Archive Bin for up to ${ARCHIVE_BIN_RETENTION_DAYS} days.`)
                    : (deleteTarget.document.isTrashed
                        ? `This will permanently remove "${deleteTarget.document.title}" from Archive Bin.`
                        : `This will move "${deleteTarget.document.title}" to Archive Bin for up to ${ARCHIVE_BIN_RETENTION_DAYS} days.`)}
                </p>
              </div>
              <button type="button" className="document-archive__icon-button" onClick={closeDeleteDialog} aria-label="Close delete dialog">
                <X size={16} />
              </button>
            </div>
            {deleteTarget.kind === 'folder' ? (
              <div className="document-archive__delete-copy">
                <p>
                  This folder currently has {deleteTarget.folder.directChildFolderCount} subfolder{deleteTarget.folder.directChildFolderCount === 1 ? '' : 's'} and {deleteTarget.folder.directDocumentCount} direct file{deleteTarget.folder.directDocumentCount === 1 ? '' : 's'}.
                </p>
                {!deleteTarget.folder.isTrashed ? (
                  <label className="document-archive__checkbox">
                    <input
                      type="checkbox"
                      checked={forceFolderDelete}
                      onChange={(event) => setForceFolderDelete(event.target.checked)}
                    />
                    <span>Move nested folders and files to Archive Bin too</span>
                  </label>
                ) : (
                  <p>Items already in Archive Bin will be removed permanently.</p>
                )}
              </div>
            ) : (
              <div className="document-archive__delete-copy">
                <p>{deleteTarget.document.isTrashed ? 'The stored upload will be removed permanently.' : `The file will be moved to Archive Bin for up to ${ARCHIVE_BIN_RETENTION_DAYS} days.`}</p>
              </div>
            )}
            <div className="document-archive__modal-actions">
              <button type="button" className="document-archive__button document-archive__button--ghost" onClick={closeDeleteDialog}>
                Cancel
              </button>
              <button type="button" className="document-archive__button document-archive__button--danger" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                {(deleteTarget.kind === 'folder' ? deleteTarget.folder.isTrashed : deleteTarget.document.isTrashed) ? 'Delete permanently' : 'Move to bin'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
