import { API_URL, getStoredToken } from './authApi'
import { fetchWithAutoReconnect, isAbortRequestError, isNetworkRequestError, sleep } from './network'

export type DocumentCategory =
  | 'POLICY'
  | 'HANDBOOK'
  | 'ACCREDITATION'
  | 'FORM'
  | 'GUIDELINE'
  | 'PROCEDURE'
  | 'REPORT'
  | 'OTHER'

export type DocumentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'SUPERSEDED'
export type DocumentVisibilityFilter = 'all' | 'public' | 'restricted'
export type DocumentFolderSegmentType = 'DOCUMENT_TYPE' | 'DEPARTMENT' | 'DATE' | 'CUSTOM'
export type ArchiveTrashedFilter = 'exclude' | 'only' | 'include'

type ArchiveActor = {
  _id?: string
  username?: string
  displayName?: string
  avatar?: string
  avatarMimeType?: string
}

type ArchiveFolderReference = {
  _id: string
  name: string
  segmentType?: DocumentFolderSegmentType
  segmentValue?: string
  parentFolder?: string | null
}

export type ArchiveFolder = {
  _id: string
  name: string
  segmentType: DocumentFolderSegmentType
  segmentValue?: string
  description?: string
  parentFolder: ArchiveFolderReference | null
  directDocumentCount: number
  directChildFolderCount: number
  directStorageBytes: number
  createdBy?: ArchiveActor
  updatedBy?: ArchiveActor
  isTrashed?: boolean
  trashedAt?: string
  createdAt: string
  updatedAt: string
}

export type ArchiveDocument = {
  _id: string
  title: string
  description?: string
  category: DocumentCategory
  subcategory?: string
  folderId: ArchiveFolderReference | null
  fileName: string
  originalFileName: string
  mimeType: string
  fileSize: number
  filePath: string
  version: string
  isPublic: boolean
  allowedRoles: string[]
  tags: string[]
  effectiveDate?: string
  expiryDate?: string
  status: DocumentStatus
  downloadCount: number
  lastDownloadedAt?: string
  createdBy?: ArchiveActor
  updatedBy?: ArchiveActor
  isTrashed?: boolean
  trashedAt?: string
  createdAt: string
  updatedAt: string
}

export type ArchiveFolderPayload = {
  name: string
  segmentType: DocumentFolderSegmentType
  segmentValue?: string
  description?: string
  parentFolderId?: string | null
}

export type ArchiveDocumentUploadPayload = {
  title: string
  description?: string
  category: DocumentCategory
  subcategory?: string
  folderId?: string
  fileName: string
  originalFileName: string
  mimeType: string
  fileSize: number
  fileData: string
  version?: string
  isPublic?: boolean
  allowedRoles?: string[]
  tags?: string[]
  effectiveDate?: string
  expiryDate?: string
  status?: DocumentStatus
}

export type ArchiveDocumentUpdatePayload = {
  title?: string
  description?: string
  category?: DocumentCategory
  subcategory?: string
  folderId?: string | null
  isPublic?: boolean
  allowedRoles?: string[]
  tags?: string[]
  effectiveDate?: string
  expiryDate?: string
  status?: DocumentStatus
}

export type ListDocumentsParams = {
  folderId?: string | null
  includeUnfoldered?: boolean
  trashed?: ArchiveTrashedFilter
  trashRootOnly?: boolean
  category?: DocumentCategory | 'all'
  status?: DocumentStatus | 'all'
  visibility?: DocumentVisibilityFilter
  search?: string
  page?: number
  limit?: number
  sortBy?: 'updatedAt' | 'createdAt' | 'title' | 'fileSize' | 'category'
  sortOrder?: 'asc' | 'desc'
}

export class ArchiveApiError extends Error {
  status: number
  details?: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ArchiveApiError'
    this.status = status
    this.details = details
  }
}

const ARCHIVE_REQUEST_TIMEOUT_MS = 12000
const ARCHIVE_GET_MAX_ATTEMPTS = 3
const ARCHIVE_RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])

function getArchiveFallbackErrorMessage(status: number): string {
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return 'You do not have permission to access this document.'
  if (status === 404) return 'The requested document could not be found.'
  if (status === 429) return 'Too many requests. Please wait a moment and try again.'
  if (status >= 500) return 'The archive server is unavailable right now.'
  return 'Archive request failed.'
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function linkAbortSignal(sourceSignal: AbortSignal | undefined, controller: AbortController): () => void {
  if (!sourceSignal) {
    return () => {}
  }

  if (sourceSignal.aborted) {
    controller.abort()
    return () => {}
  }

  const handleAbort = () => controller.abort()
  sourceSignal.addEventListener('abort', handleAbort, { once: true })
  return () => sourceSignal.removeEventListener('abort', handleAbort)
}

function parseRetryAfterMs(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) {
    return null
  }

  const seconds = Number(retryAfterHeader)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }

  const retryDate = new Date(retryAfterHeader)
  if (Number.isNaN(retryDate.getTime())) {
    return null
  }

  return Math.max(0, retryDate.getTime() - Date.now())
}

function getArchiveRetryDelayMs(status: number, attempt: number, retryAfterHeader: string | null): number {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader)
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, 15000)
  }

  const baseDelayMs = status === 429 ? 1800 : 1200
  return baseDelayMs + attempt * 1800
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = String(init.method || 'GET').toUpperCase()
  const shouldRetry = method === 'GET' || method === 'HEAD'
  const maxAttempts = shouldRetry ? ARCHIVE_GET_MAX_ATTEMPTS : 1
  const headers = {
    ...(await authHeaders()),
    ...(init.headers || {}),
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const detachAbortListener = linkAbortSignal(init.signal ?? undefined, controller)
    let didTimeout = false
    const timeoutId = shouldRetry
      ? window.setTimeout(() => {
          didTimeout = true
          controller.abort()
        }, ARCHIVE_REQUEST_TIMEOUT_MS)
      : null

    try {
      const response = await fetchWithAutoReconnect(
        `${API_URL}${path}`,
        {
          ...init,
          headers,
          signal: controller.signal,
        },
        shouldRetry
          ? { maxRetries: 1, retryDelayMs: 900, retryBackoffMs: 1200 }
          : { maxRetries: 0 }
      )

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (shouldRetry && ARCHIVE_RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxAttempts - 1) {
          await sleep(getArchiveRetryDelayMs(response.status, attempt, response.headers.get('retry-after')))
          continue
        }

        throw new ArchiveApiError(
          (data?.error as string) || getArchiveFallbackErrorMessage(response.status),
          response.status,
          data?.details
        )
      }

      return data as T
    } catch (error) {
      if (didTimeout) {
        if (shouldRetry && attempt < maxAttempts - 1) {
          await sleep(getArchiveRetryDelayMs(408, attempt, null))
          continue
        }

        throw new ArchiveApiError('The archive is taking too long to respond. Please try again.', 408)
      }

      if (isAbortRequestError(error)) {
        throw error
      }

      if (isNetworkRequestError(error)) {
        throw new ArchiveApiError('Unable to reach the archive server right now.', 503)
      }

      throw error
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      detachAbortListener()
    }
  }

  throw new ArchiveApiError('Archive request failed.', 500)
}

export async function listDocumentFolders(options: {
  search?: string
  trashed?: ArchiveTrashedFilter
} = {}): Promise<{ folders: ArchiveFolder[]; total: number }> {
  const params = new URLSearchParams()
  if (options.search?.trim()) {
    params.set('search', options.search.trim())
  }
  if (options.trashed && options.trashed !== 'exclude') {
    params.set('trashed', options.trashed)
  }

  const query = params.toString()
  return requestJson<{ folders: ArchiveFolder[]; total: number }>(
    `/api/admin/document-folders${query ? `?${query}` : ''}`
  )
}

export async function createDocumentFolder(payload: ArchiveFolderPayload): Promise<ArchiveFolder> {
  const response = await requestJson<{ folder: ArchiveFolder }>(
    '/api/admin/document-folders',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )

  return response.folder
}

export async function updateDocumentFolder(folderId: string, payload: Partial<ArchiveFolderPayload>): Promise<ArchiveFolder> {
  const response = await requestJson<{ folder: ArchiveFolder }>(
    `/api/admin/document-folders/${folderId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  )

  return response.folder
}

export async function deleteDocumentFolder(folderId: string, force = false): Promise<{
  message: string
  deletedFolderCount: number
  deletedDocumentCount: number
  movedToTrash?: boolean
  permanentlyDeleted?: boolean
}> {
  const query = force ? '?force=true' : ''
  return requestJson(`/api/admin/document-folders/${folderId}${query}`, {
    method: 'DELETE',
  })
}

export async function listArchiveDocuments(params: ListDocumentsParams = {}): Promise<{
  documents: ArchiveDocument[]
  totalPages: number
  currentPage: number
  total: number
}> {
  const query = new URLSearchParams()

  if (params.folderId) {
    query.set('folderId', params.folderId)
  } else if (params.includeUnfoldered) {
    query.set('includeUnfoldered', 'true')
  }

  if (params.category && params.category !== 'all') {
    query.set('category', params.category)
  }
  if (params.status && params.status !== 'all') {
    query.set('status', params.status)
  }
  if (params.trashed && params.trashed !== 'exclude') {
    query.set('trashed', params.trashed)
  }
  if (params.trashRootOnly) {
    query.set('trashRootOnly', 'true')
  }
  if (params.visibility && params.visibility !== 'all') {
    query.set('visibility', params.visibility)
  }
  if (params.search?.trim()) {
    query.set('search', params.search.trim())
  }
  if (typeof params.page === 'number') {
    query.set('page', String(params.page))
  }
  if (typeof params.limit === 'number') {
    query.set('limit', String(params.limit))
  }
  if (params.sortBy) {
    query.set('sortBy', params.sortBy)
  }
  if (params.sortOrder) {
    query.set('sortOrder', params.sortOrder)
  }

  return requestJson(`/api/admin/documents?${query.toString()}`)
}

export async function getArchiveDocument(documentId: string): Promise<ArchiveDocument> {
  const response = await requestJson<{ document: ArchiveDocument }>(`/api/admin/documents/${documentId}`)
  return response.document
}

export async function uploadArchiveDocument(payload: ArchiveDocumentUploadPayload): Promise<ArchiveDocument> {
  const response = await requestJson<{ document: ArchiveDocument }>(
    '/api/admin/documents',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )

  return response.document
}

export async function updateArchiveDocument(documentId: string, payload: ArchiveDocumentUpdatePayload): Promise<ArchiveDocument> {
  const response = await requestJson<{ document: ArchiveDocument }>(
    `/api/admin/documents/${documentId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  )

  return response.document
}

export async function deleteArchiveDocument(documentId: string): Promise<{
  message: string
  movedToTrash?: boolean
  permanentlyDeleted?: boolean
}> {
  return requestJson(`/api/admin/documents/${documentId}`, {
    method: 'DELETE',
  })
}

export async function trackArchiveDocumentDownload(documentId: string): Promise<string> {
  const response = await requestJson<{ downloadUrl: string }>(
    `/api/admin/documents/${documentId}/download`,
    {
      method: 'POST',
    }
  )

  return new URL(response.downloadUrl, API_URL).toString()
}

export function getArchiveDocumentAssetUrl(document: Pick<ArchiveDocument, 'filePath'>): string {
  const normalizedPath = String(document.filePath || '').replace(/^\/+/, '').replace(/\\/g, '/')
  return new URL(`/uploads/${normalizedPath}`, API_URL).toString()
}

export function getArchiveDocumentViewerPath(documentId: string): string {
  return `/document-viewer/${encodeURIComponent(documentId)}`
}

export function openArchiveDocumentViewerRoute(document: ArchiveDocument | string): void {
  const documentId = typeof document === 'string' ? document : document._id
  const state = typeof document === 'string'
    ? { documentViewerId: documentId }
    : { documentViewerId: documentId, documentViewerSnapshot: document }

  window.history.pushState(state, '', getArchiveDocumentViewerPath(documentId))
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read the selected file.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result) {
        reject(new Error('Failed to read the selected file.'))
        return
      }
      resolve(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
