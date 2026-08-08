import { API_URL, getStoredToken } from './authApi'

export type RolloverAction = 'promote' | 'retain' | 'graduate' | 'skip'

export type RolloverEvaluation = {
  studentId: string
  studentNumber: string
  name: string
  course: number
  yearLevel: number
  section: string | null
  latestGrade: number | null
  lifecycleStatus: string
  recommendedAction: RolloverAction
  reason: string
  needsReview: boolean
}

export type RolloverPreview = {
  fromSchoolYear: string
  toSchoolYear: string
  semester: string
  totalStudents: number
  summary: {
    promote: number
    retain: number
    graduate: number
    skip: number
    needsReview: number
  }
  evaluations: RolloverEvaluation[]
}

export type RolloverGroupSummary = {
  course: number
  courseLabel: string
  yearLevel: number
  section: string
  total: number
  eligible: number
  retained: number
  graduating: number
  needsReview: number
  status: 'auto_approved' | 'needs_attention'
}

export type RolloverSummaryPreview = {
  fromSchoolYear: string
  toSchoolYear: string
  semester: string
  totalStudents: number
  summary: {
    promote: number
    retain: number
    graduate: number
    skip: number
    needsReview: number
  }
  groups: RolloverGroupSummary[]
}

export type RolloverStudentPage = {
  students: RolloverEvaluation[]
  total: number
  page: number
  totalPages: number
}

export type RolloverGroupDecision = {
  course: number
  yearLevel: number
  section?: string
  action: RolloverAction
}

export type RolloverResultEntry = {
  studentId: string
  studentNumber: string
  name?: string
  fromYearLevel?: number
  toYearLevel?: number
  newSection?: string
}

export type RolloverResult = {
  rolloverBatchId: string
  fromSchoolYear: string
  toSchoolYear: string
  semester: string
  promoted: RolloverResultEntry[]
  retained: RolloverResultEntry[]
  graduated: RolloverResultEntry[]
  skipped: RolloverResultEntry[]
  failures: { studentId: string; error: string }[]
  blocksCreated: Record<string, string>[]
  snapshotIds: string[]
}

export type ArchiveSnapshotSummary = {
  _id: string
  type: string
  title: string
  schoolYear: string
  newSchoolYear?: string
  semester?: string
  rolloverBatchId: string
  counts?: {
    total: number
    promoted: number
    retained: number
    graduated: number
    skipped: number
  }
  generatedBy?: { username?: string; displayName?: string } | null
  generatedAt: string
}

async function authorizedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getStoredToken()
  if (!token) throw new Error('No authentication token found')

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`
    }
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error((payload?.error as string) || (payload?.message as string) || `Request failed (${response.status})`)
  }
  return (payload?.data ?? payload) as T
}

export function previewRollover(body: { fromSchoolYear: string; toSchoolYear?: string; semester?: string }) {
  return authorizedRequest<RolloverPreview>('/api/rollover/preview', {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function previewRolloverSummary(body: { fromSchoolYear: string; toSchoolYear?: string; semester?: string }) {
  return authorizedRequest<RolloverSummaryPreview>('/api/rollover/preview-summary', {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function previewRolloverStudents(body: {
  fromSchoolYear: string
  course?: number
  yearLevel?: number
  section?: string
  page?: number
  limit?: number
  search?: string
  filter?: 'all' | 'needs_review'
}) {
  return authorizedRequest<RolloverStudentPage>('/api/rollover/preview-students', {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function previewRolloverExceptions(body: {
  fromSchoolYear: string
  page?: number
  limit?: number
  search?: string
  course?: number
  yearLevel?: number
}) {
  return authorizedRequest<RolloverStudentPage>('/api/rollover/preview-exceptions', {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function executeRollover(body: {
  fromSchoolYear: string
  toSchoolYear: string
  semester: string
  decisions?: { studentId: string; action: RolloverAction }[]
  groupDecisions?: RolloverGroupDecision[]
  decisionOverrides?: { studentId: string; action: RolloverAction }[]
}) {
  return authorizedRequest<RolloverResult>('/api/rollover/execute', {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function listRolloverSnapshots(params: { schoolYear?: string; type?: string } = {}) {
  const query = new URLSearchParams()
  if (params.schoolYear) query.set('schoolYear', params.schoolYear)
  if (params.type) query.set('type', params.type)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return authorizedRequest<ArchiveSnapshotSummary[]>(`/api/rollover/snapshots${suffix}`)
}

export function getRolloverSnapshot(id: string) {
  return authorizedRequest<ArchiveSnapshotSummary & { data: unknown }>(`/api/rollover/snapshots/${id}`)
}

// ---- Enterprise Audit Report ----

export type AuditLogEntry = {
  _id: string
  action: string
  resourceType: string
  resourceId: string
  resourceName: string
  description: string
  performedBy: { username: string; displayName: string } | null
  performedByRole: string
  ipAddress: string | null
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL'
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  oldValue: unknown
  newValue: unknown
  createdAt: string
}

export type AuditReportStats = {
  totalLogs: number
  recentLogs: number
  criticalLogs: number
  highSeverityLogs: number
  failedActions: number
  actionStats: Array<{ _id: string; count: number }>
  resourceStats: Array<{ _id: string; count: number }>
  severityStats: Array<{ _id: string; count: number }>
}

export type BlockActionLogEntry = {
  _id: string
  actionType: string
  sectionId: string | null
  sectionCode: string | null
  studentId: string
  registrarId: string
  reason: string | null
  details: Record<string, unknown> | null
  timestamp: string
}

export type DailyActivityPoint = {
  date: string
  count: number
}

export type TopUserEntry = {
  _id: string
  username: string
  displayName: string
  count: number
}

export type AuditReportData = {
  stats: AuditReportStats
  activity: {
    logs: AuditLogEntry[]
    page: number
    totalPages: number
    total: number
  }
  blockActions: BlockActionLogEntry[]
  dailyActivity: DailyActivityPoint[]
  topUsers: TopUserEntry[]
  rolloverHistory: Array<ArchiveSnapshotSummary & { counts?: { total: number; promoted: number; retained: number; graduated: number; skipped: number } }>
}

export type AuditReportParams = {
  action?: string
  resourceType?: string
  severity?: string
  sortOrder?: 'newest' | 'oldest'
  performedBy?: string
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}

export function fetchAuditReport(params: AuditReportParams = {}) {
  const query = new URLSearchParams()
  if (params.action) query.set('action', params.action)
  if (params.resourceType) query.set('resourceType', params.resourceType)
  if (params.severity) query.set('severity', params.severity)
  if (params.sortOrder) query.set('sortOrder', params.sortOrder)
  if (params.performedBy) query.set('performedBy', params.performedBy)
  if (params.startDate) query.set('startDate', params.startDate)
  if (params.endDate) query.set('endDate', params.endDate)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return authorizedRequest<AuditReportData>(`/api/rollover/audit-report${suffix}`)
}
