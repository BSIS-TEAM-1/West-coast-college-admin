import { API_URL, getStoredToken } from './authApi'

export type DocumentCategory = 'POLICY' | 'HANDBOOK' | 'ACCREDITATION' | 'FORM' | 'GUIDELINE' | 'PROCEDURE' | 'REPORT' | 'OTHER'
export type DocumentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'SUPERSEDED'
export type DocumentDepartment = 'REGISTRAR' | 'FINANCE' | 'ACADEMIC_AFFAIRS' | 'STUDENT_AFFAIRS' | 'ADMISSIONS' | 'IT' | 'HUMAN_RESOURCES' | 'LIBRARY' | 'GENERAL'

export type ArchiveDocument = {
  _id: string
  title: string
  description?: string
  category: DocumentCategory
  subcategory?: string
  department: DocumentDepartment
  folderId?: { _id: string; name: string; segmentType: string; segmentValue: string; parentFolder?: string | null } | null
  fileName: string
  originalFileName: string
  mimeType: string
  fileSize: number
  version: string
  isPublic: boolean
  allowedRoles: string[]
  tags: string[]
  effectiveDate?: string | null
  expiryDate?: string | null
  status: DocumentStatus
  downloadCount: number
  lastDownloadedAt?: string | null
  createdBy?: { _id: string; username: string; displayName?: string } | null
  updatedBy?: { _id: string; username: string; displayName?: string } | null
  isTrashed: boolean
  createdAt: string
  updatedAt: string
}

export type DocumentFolder = {
  _id: string
  name: string
  category?: DocumentCategory
  segmentType: string
  segmentValue: string
  description?: string
  parentFolder?: { _id: string; name: string } | null
  createdBy?: { _id: string; username: string; displayName?: string } | null
  documentCount?: number
  subfolderCount?: number
  isTrashed: boolean
  createdAt: string
  updatedAt: string
}

export type DocumentListResponse = {
  documents: ArchiveDocument[]
  totalPages: number
  currentPage: number
  total: number
}

export type FolderListResponse = {
  folders: DocumentFolder[]
  total: number
}

export type DocumentQuery = {
  category?: string
  status?: string
  department?: string
  search?: string
  page?: number
  limit?: number
  folderId?: string
  includeUnfoldered?: boolean
  trashed?: 'exclude' | 'include' | 'only'
  visibility?: 'all' | 'public' | 'restricted'
  sortBy?: 'updatedAt' | 'createdAt' | 'title' | 'fileSize' | 'category'
  sortOrder?: 'asc' | 'desc'
}

export type FolderQuery = {
  parentId?: string
  search?: string
  trashed?: 'exclude' | 'include' | 'only'
}

async function request<T>(route: string, init: RequestInit = {}): Promise<T> {
  const token = await getStoredToken()
  if (!token) throw new Error('Authentication required')
  const response = await fetch(`${API_URL}${route}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.success === false) {
    throw new Error(data.error || `Request failed (${response.status})`)
  }
  return data as T
}

export async function listDocuments(query: DocumentQuery = {}): Promise<DocumentListResponse> {
  const params = new URLSearchParams()
  if (query.category) params.set('category', query.category)
  if (query.status) params.set('status', query.status)
  if (query.department) params.set('department', query.department)
  if (query.search) params.set('search', query.search)
  if (query.page) params.set('page', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  if (query.folderId) params.set('folderId', query.folderId)
  if (query.includeUnfoldered) params.set('includeUnfoldered', 'true')
  if (query.trashed) params.set('trashed', query.trashed)
  if (query.visibility) params.set('visibility', query.visibility)
  if (query.sortBy) params.set('sortBy', query.sortBy)
  if (query.sortOrder) params.set('sortOrder', query.sortOrder)
  return request<DocumentListResponse>(`/api/admin/documents?${params.toString()}`)
}

export async function getDocument(id: string): Promise<{ document: ArchiveDocument }> {
  return request(`/api/admin/documents/${id}`)
}

export async function uploadDocument(data: {
  title: string
  description?: string
  category: DocumentCategory
  subcategory?: string
  department?: DocumentDepartment
  folderId?: string | null
  file: File
  version?: string
  isPublic?: boolean
  allowedRoles?: string[]
  tags?: string[]
  effectiveDate?: string
  expiryDate?: string
  status?: DocumentStatus
}): Promise<{ message: string; document: ArchiveDocument }> {
  const formData = new FormData()
  formData.append('file', data.file)
  formData.append('title', data.title)
  if (data.description) formData.append('description', data.description)
  formData.append('category', data.category)
  if (data.subcategory) formData.append('subcategory', data.subcategory)
  if (data.department) formData.append('department', data.department)
  if (data.folderId) formData.append('folderId', data.folderId)
  if (data.version) formData.append('version', data.version)
  if (data.isPublic !== undefined) formData.append('isPublic', String(data.isPublic))
  if (data.allowedRoles) data.allowedRoles.forEach(r => formData.append('allowedRoles', r))
  if (data.tags) data.tags.forEach(t => formData.append('tags', t))
  if (data.effectiveDate) formData.append('effectiveDate', data.effectiveDate)
  if (data.expiryDate) formData.append('expiryDate', data.expiryDate)
  if (data.status) formData.append('status', data.status)

  const token = await getStoredToken()
  if (!token) throw new Error('Authentication required')
  const response = await fetch(`${API_URL}/api/admin/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok || json.success === false) {
    throw new Error(json.error || `Request failed (${response.status})`)
  }
  return json as { message: string; document: ArchiveDocument }
}

export async function updateDocument(id: string, data: Partial<{
  title: string
  description: string
  category: DocumentCategory
  subcategory: string
  department: DocumentDepartment
  folderId: string | null
  isPublic: boolean
  allowedRoles: string[]
  tags: string[]
  effectiveDate: string | null
  expiryDate: string | null
  status: DocumentStatus
}>): Promise<{ message: string; document: ArchiveDocument }> {
  return request(`/api/admin/documents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteDocument(id: string): Promise<{ message: string; permanentlyDeleted?: boolean }> {
  return request(`/api/admin/documents/${id}`, { method: 'DELETE' })
}

export async function trackDownload(id: string): Promise<{ message: string; downloadUrl: string }> {
  return request(`/api/admin/documents/${id}/download`, { method: 'POST' })
}

export async function listFolders(query: FolderQuery = {}): Promise<FolderListResponse> {
  const params = new URLSearchParams()
  if (query.parentId) params.set('parentId', query.parentId)
  if (query.search) params.set('search', query.search)
  if (query.trashed) params.set('trashed', query.trashed)
  return request<FolderListResponse>(`/api/admin/document-folders?${params.toString()}`)
}

export async function createFolder(data: {
  name: string
  category?: DocumentCategory
  segmentType?: string
  segmentValue?: string
  description?: string
  parentFolderId?: string | null
}): Promise<{ message: string; folder: DocumentFolder }> {
  return request('/api/admin/document-folders', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateFolder(id: string, data: {
  name?: string
  category?: DocumentCategory
  description?: string
}): Promise<{ message: string; folder: DocumentFolder }> {
  return request(`/api/admin/document-folders/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteFolder(id: string, cascade: boolean = false): Promise<{ message: string }> {
  return request(`/api/admin/document-folders/${id}?cascade=${cascade}`, { method: 'DELETE' })
}

export function getDocumentAssetUrl(id: string, download: boolean = false): string {
  return `${API_URL}/api/admin/documents/${id}/asset${download ? '?download=true' : ''}`
}

export async function getDocumentAssetUrlWithAuth(id: string, download: boolean = false): Promise<string> {
  const token = await getStoredToken()
  return `${API_URL}/api/admin/documents/${id}/asset${download ? '?download=true' : ''}&token=${encodeURIComponent(token || '')}`
}
