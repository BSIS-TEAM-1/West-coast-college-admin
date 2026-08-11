import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle, GraduationCap, Plus, Search, Trash2, X, Settings2, Pencil } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import { StudentWorkspaceOverlay, isStudentWorkspaceBackdropTarget } from '../../components/shared/StudentWorkspaceOverlay'
import type { Semester, SubjectItem } from './registrarBlockTypes'

type CreateCurriculumPageProps = {
  onBack: () => void
  onCreated: (id: string) => void
}

type WizardStep = 1 | 2 | 3

const programOptions = [
  { value: 101, label: 'BEED', fullLabel: 'Bachelor of Elementary Education' },
  { value: 102, label: 'BSEd-English', fullLabel: 'Bachelor of Secondary Education - English' },
  { value: 103, label: 'BSEd-Math', fullLabel: 'Bachelor of Secondary Education - Math' },
  { value: 201, label: 'BSBA-HRM', fullLabel: 'Bachelor of Science in Business Administration - HRM' },
]

const subjectTypeOptions = [
  { value: 'General', label: 'General' },
  { value: 'Major', label: 'Major' },
  { value: 'Professional', label: 'Professional' },
  { value: 'Elective', label: 'Elective' },
]

const semesterOptions: { value: Semester; label: string }[] = [
  { value: '1st', label: '1st Semester' },
  { value: '2nd', label: '2nd Semester' },
  { value: 'Summer', label: 'Summer' },
]

const SEARCH_PAGE_SIZE = 20
const PREREQ_SEARCH_LIMIT = 10

const emptyForm = {
  programCode: '',
  name: '',
  version: String(new Date().getFullYear()),
  code: '',
  // Effective School Year is stored internally as two structured numeric
  // fields (start/end). On submit, these are combined into the wire format
  // "YYYY-YYYY" expected by the backend Curriculum model (which validates
  // via regex /^\d{4}-\d{4}$/). This preserves backward compatibility with
  // existing records while giving the registrar a clearer two-field UI.
  effectiveSchoolYearStart: '',
  effectiveSchoolYearEnd: '',
  description: '',
}

// Combine structured start/end into the "YYYY-YYYY" wire format.
// Returns empty string if either side is missing or invalid.
function formatSchoolYear(start: string, end: string): string {
  const s = String(start).trim()
  const e = String(end).trim()
  if (!/^\d{4}$/.test(s) || !/^\d{4}$/.test(e)) return ''
  return `${s}-${e}`
}

// Validate the school year range. Returns an error message string, or '' if valid.
// Rules: both must be 4-digit years, end must be exactly start + 1.
function validateSchoolYear(start: string, end: string): string {
  const s = String(start).trim()
  const e = String(end).trim()
  if (!s && !e) return '' // both empty = optional field, no error
  if (!/^\d{4}$/.test(s)) return 'Start year must be a 4-digit year (e.g. 2026).'
  if (!/^\d{4}$/.test(e)) return 'End year must be a 4-digit year (e.g. 2027).'
  const sNum = Number(s)
  const eNum = Number(e)
  if (eNum !== sNum + 1) {
    if (eNum <= sNum) return 'End year must be after start year.'
    return 'School year must span exactly two consecutive years.'
  }
  return ''
}

// A subject placement drafted in the wizard (not yet persisted). Each
// placement is independent — it owns its own yearLevel, semester, type,
// required, displayOrder, and prerequisiteSubjectIds. Bulk selection
// creates multiple independent DraftPlacement records, never one shared
// configuration object.
type DraftPlacement = {
  localId: string
  subjectId: string
  yearLevel: number
  semester: Semester
  type: string
  isRequired: boolean
  displayOrder: number
  prerequisiteSubjectIds: string[]
  // 'default' = inherit Subject.prerequisiteSubjectIds (send empty array to
  // backend, which seeds from the Subject). 'custom' = use the explicit
  // prerequisiteSubjectIds on this placement.
  prereqMode: 'default' | 'custom'
}

let placementIdCounter = 0
const nextLocalId = () => `place-${++placementIdCounter}`

// ─── Helper: normalize prerequisiteSubjectIds from API ──────────────────
// The API may return prerequisiteSubjectIds as populated objects or as
// string IDs. Normalize to string[] for internal use.
function normalizePrereqIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => (typeof item === 'string' ? item : (item as SubjectItem)?._id ?? '')).filter(Boolean)
}

export default function CreateCurriculumPage({ onBack, onCreated }: CreateCurriculumPageProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [form, setForm] = useState(emptyForm)
  const [placements, setPlacements] = useState<DraftPlacement[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ─── Subject search state (search-first, not list-first) ──────────────
  const [subjectSearch, setSubjectSearch] = useState('')
  const [subjectResults, setSubjectResults] = useState<SubjectItem[]>([])
  const [subjectLoading, setSubjectLoading] = useState(false)
  const [subjectTotal, setSubjectTotal] = useState(0)

  // ─── Bulk selection state ─────────────────────────────────────────────
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set())

  // ─── Draft table selection (for bulk configure) ───────────────────────
  const [draftSelectedIds, setDraftSelectedIds] = useState<Set<string>>(new Set())
  const [bulkConfigOpen, setBulkConfigOpen] = useState(false)

  // ─── Individual placement editor modal ────────────────────────────────
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null)

  // ─── Subject cache: holds all subjects we've fetched (search results +
  // placed subjects + their prereqs) so we can display codes/titles without
  // re-fetching. ─────────────────────────────────────────────────────────
  const subjectCacheRef = useRef<Map<string, SubjectItem>>(new Map())
  const [, forceCacheUpdate] = useState(0)

  const authorizedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getStoredToken()
    if (!token) throw new Error('No authentication token found')
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.message || `Request failed (${response.status})`)
    }
    return data
  }, [])

  // Cache subjects from any fetch into the ref-based cache
  const cacheSubjects = useCallback((subjects: SubjectItem[]) => {
    const cache = subjectCacheRef.current
    let changed = false
    for (const s of subjects) {
      if (!cache.has(s._id)) {
        cache.set(s._id, s)
        changed = true
      } else {
        // Update if the cached version has less info (e.g. no populated prereqs)
        const existing = cache.get(s._id)!
        if (!existing.prerequisiteSubjectIds && s.prerequisiteSubjectIds) {
          cache.set(s._id, s)
          changed = true
        }
      }
    }
    if (changed) forceCacheUpdate((n) => n + 1)
  }, [])

  const subjectMap = subjectCacheRef.current

  const placedSubjectIds = useMemo(() => new Set(placements.map((p) => p.subjectId)), [placements])

  const selectedProgram = programOptions.find((p) => String(p.value) === form.programCode)

  // ─── Curriculum name + code auto-generation ───────────────────────────
  const nameOptions = useMemo(() => {
    if (!selectedProgram) return []
    const v = form.version || String(new Date().getFullYear())
    return [
      `${selectedProgram.label} Curriculum ${v}`,
      `${selectedProgram.fullLabel} Curriculum ${v}`,
      `${selectedProgram.label} Curriculum ${v} (Draft)`,
    ]
  }, [selectedProgram, form.version])

  useEffect(() => {
    if (!selectedProgram || nameOptions.length === 0) return
    const v = form.version || String(new Date().getFullYear())
    const autoCode = `${selectedProgram.label.replace(/\s+/g, '-').toUpperCase()}-${v}`
    setForm((prev) => ({
      ...prev,
      name: nameOptions.includes(prev.name) ? prev.name : nameOptions[0],
      code: autoCode,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameOptions, selectedProgram])

  // ─── Subject search (debounced, server-side, paginated) ───────────────
  const fetchSubjectSearch = useCallback(async (query: string) => {
    setSubjectLoading(true)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      params.set('isActive', 'true')
      params.set('limit', String(SEARCH_PAGE_SIZE))
      // Exclude already-placed subjects from search results
      if (placedSubjectIds.size > 0) {
        params.set('excludeIds', Array.from(placedSubjectIds).join(','))
      }
      const data = await authorizedFetch(`/api/registrar/subjects?${params.toString()}`)
      const results = Array.isArray(data?.data) ? data.data : []
      setSubjectResults(results)
      setSubjectTotal(typeof data?.total === 'number' ? data.total : results.length)
      cacheSubjects(results)
    } catch {
      setSubjectResults([])
      setSubjectTotal(0)
    } finally {
      setSubjectLoading(false)
    }
  }, [authorizedFetch, placedSubjectIds, cacheSubjects])

  // Debounced search trigger
  useEffect(() => {
    if (step !== 2) return
    const timeoutId = window.setTimeout(() => void fetchSubjectSearch(subjectSearch), 250)
    return () => window.clearTimeout(timeoutId)
  }, [subjectSearch, step, fetchSubjectSearch])

  // ─── Step 1 validation ────────────────────────────────────────────────
  const step1Valid = Boolean(form.programCode)

  const goToStep2 = () => {
    if (!step1Valid) {
      setError('Please select a program')
      return
    }
    setError('')
    setStep(2)
  }

  // ─── Step 2: placement drafting ───────────────────────────────────────

  // Fetch a single subject's full data (including populated prereqs) for caching
  const ensureSubjectCached = useCallback(async (subjectId: string) => {
    if (subjectCacheRef.current.has(subjectId)) {
      const existing = subjectCacheRef.current.get(subjectId)!
      if (existing.prerequisiteSubjectIds && Array.isArray(existing.prerequisiteSubjectIds) && existing.prerequisiteSubjectIds.length > 0) {
        return existing
      }
    }
    try {
      const data = await authorizedFetch(`/api/registrar/subjects?q=${subjectId}&isActive=true&limit=50`)
      const results = Array.isArray(data?.data) ? data.data : []
      cacheSubjects(results)
      return results.find((s) => s._id === subjectId) || subjectCacheRef.current.get(subjectId)
    } catch {
      return subjectCacheRef.current.get(subjectId)
    }
  }, [authorizedFetch, cacheSubjects])

  // Add a single subject as a placement with default configuration.
  // Prerequisites default to 'default' mode (inherit from Subject).
  const addPlacement = useCallback((subjectId: string) => {
    if (placedSubjectIds.has(subjectId)) return // duplicate prevention
    setPlacements((prev) => [
      ...prev,
      {
        localId: nextLocalId(),
        subjectId,
        yearLevel: 1,
        semester: '1st',
        type: 'General',
        isRequired: true,
        displayOrder: prev.length, // auto-increment display order
        prerequisiteSubjectIds: [],
        prereqMode: 'default',
      },
    ])
    // Ensure this subject (and its default prereqs) are cached
    void ensureSubjectCached(subjectId)
  }, [placedSubjectIds, ensureSubjectCached])

  // Bulk add: create independent placements for each selected subject.
  // Each gets its own default configuration — no shared state.
  const addBulkPlacements = useCallback((subjectIds: string[]) => {
    setPlacements((prev) => {
      const existing = new Set(prev.map((p) => p.subjectId))
      const toAdd = subjectIds.filter((id) => !existing.has(id))
      if (toAdd.length === 0) return prev
      const newPlacements: DraftPlacement[] = toAdd.map((subjectId) => ({
        localId: nextLocalId(),
        subjectId,
        yearLevel: 1,
        semester: '1st',
        type: 'General',
        isRequired: true,
        displayOrder: prev.length + toAdd.indexOf(subjectId),
        prerequisiteSubjectIds: [],
        prereqMode: 'default',
      }))
      // Ensure all bulk-added subjects are cached
      toAdd.forEach((id) => void ensureSubjectCached(id))
      return [...prev, ...newPlacements]
    })
  }, [ensureSubjectCached])

  const removePlacement = useCallback((localId: string) => {
    setPlacements((prev) => prev.filter((p) => p.localId !== localId))
    setDraftSelectedIds((prev) => { const next = new Set(prev); next.delete(localId); return next })
  }, [])

  // Update a single placement (used by the individual editor modal)
  const updatePlacement = useCallback((localId: string, changes: Partial<DraftPlacement>) => {
    setPlacements((prev) => prev.map((p) => (p.localId === localId ? { ...p, ...changes } : p)))
  }, [])

  // Bulk update: apply changes only to explicitly set fields.
  // `changes` contains only the fields the registrar chose to modify.
  const bulkUpdatePlacements = useCallback((localIds: Set<string>, changes: Partial<DraftPlacement>) => {
    setPlacements((prev) => prev.map((p) => {
      if (!localIds.has(p.localId)) return p
      return { ...p, ...changes }
    }))
  }, [])

  // Toggle a prerequisite for a specific placement
  const togglePrerequisite = useCallback((localId: string, subjectId: string) => {
    setPlacements((prev) => prev.map((p) => {
      if (p.localId !== localId) return p
      // Prevent self-prerequisite
      if (subjectId === p.subjectId) return p
      const has = p.prerequisiteSubjectIds.includes(subjectId)
      return {
        ...p,
        prereqMode: 'custom', // any manual toggle switches to custom mode
        prerequisiteSubjectIds: has
          ? p.prerequisiteSubjectIds.filter((id) => id !== subjectId)
          : [...p.prerequisiteSubjectIds, subjectId],
      }
    }))
  }, [])

  // Switch prerequisite mode for a placement
  const setPrereqMode = useCallback((localId: string, mode: 'default' | 'custom') => {
    setPlacements((prev) => prev.map((p) => {
      if (p.localId !== localId) return p
      if (mode === 'default') {
        return { ...p, prereqMode: 'default', prerequisiteSubjectIds: [] }
      }
      // Switching to custom: seed with the subject's default prereqs if available
      const subject = subjectCacheRef.current.get(p.subjectId)
      const defaultIds = normalizePrereqIds(subject?.prerequisiteSubjectIds)
      return { ...p, prereqMode: 'custom', prerequisiteSubjectIds: defaultIds }
    }))
  }, [])

  const goToStep3 = () => {
    setError('')
    setStep(3)
  }

  // ─── Step 3: review & submit ──────────────────────────────────────────
  // Totals are calculated from the Subject snapshot fields (units,
  // lecturePeriods, labPeriods), not from live Subject academic fields.
  const reviewTotals = useMemo(() => {
    let totalUnits = 0
    let totalLecture = 0
    let totalLab = 0
    for (const p of placements) {
      const s = subjectMap.get(p.subjectId)
      totalUnits += s?.units ?? 0
      totalLecture += s?.lecturePeriods ?? 0
      totalLab += s?.labPeriods ?? 0
    }
    return { totalUnits, totalLecture, totalLab }
  }, [placements, subjectMap])

  const handleCreate = async () => {
    if (!form.programCode) {
      setError('Please select a program')
      setStep(1)
      return
    }
    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        programCode: Number(form.programCode),
        name: form.name || `${selectedProgram?.label} Curriculum ${form.version}`,
        version: form.version,
        code: form.code || undefined,
        // Derive the "YYYY-YYYY" wire format from the structured start/end.
        effectiveSchoolYear: formatSchoolYear(form.effectiveSchoolYearStart, form.effectiveSchoolYearEnd) || undefined,
        description: form.description || undefined,
      }
      if (placements.length > 0) {
        body.subjects = placements.map((p) => ({
          subjectId: p.subjectId,
          yearLevel: p.yearLevel,
          semester: p.semester,
          type: p.type,
          isRequired: p.isRequired,
          displayOrder: p.displayOrder,
          // When prereqMode is 'default', send empty array — the backend
          // seeds from Subject.prerequisiteSubjectIds. When 'custom', send
          // the explicit list.
          prerequisiteSubjectIds: p.prereqMode === 'default' ? [] : p.prerequisiteSubjectIds,
        }))
      }
      const data = await authorizedFetch('/api/registrar/curriculums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (data?.data?._id) {
        onCreated(data.data._id)
      } else {
        onBack()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create curriculum')
    } finally {
      setSaving(false)
    }
  }

  // ─── Helper: get subject display info ─────────────────────────────────
  const getSubject = (id: string) => subjectMap.get(id)
  const getSubjectCode = (id: string) => getSubject(id)?.code || 'N/A'
  const getSubjectTitle = (id: string) => getSubject(id)?.title || 'Subject unavailable'
  const getSubjectUnits = (id: string) => getSubject(id)?.units ?? 0

  // Get the default prerequisite IDs for a subject (from the Subject model)
  const getDefaultPrereqIds = (subjectId: string): string[] => {
    const s = subjectMap.get(subjectId)
    return normalizePrereqIds(s?.prerequisiteSubjectIds)
  }

  // Get the effective prerequisite IDs for display: if 'default' mode, show
  // the Subject's defaults; if 'custom', show the explicit list.
  const getEffectivePrereqIds = (p: DraftPlacement): string[] => {
    if (p.prereqMode === 'custom') return p.prerequisiteSubjectIds
    return getDefaultPrereqIds(p.subjectId)
  }

  // Format prerequisite codes for display
  const formatPrereqs = (p: DraftPlacement): string => {
    const ids = getEffectivePrereqIds(p)
    if (ids.length === 0) return 'None'
    return ids.map((id) => getSubjectCode(id)).join(', ')
  }

  const stepLabels = ['Curriculum Info', 'Add Subjects', 'Review & Create']

  // ─── Editing placement (for the individual editor modal) ──────────────
  const editingPlacement = editingLocalId ? placements.find((p) => p.localId === editingLocalId) : null

  // ─── Bulk toggle helpers ──────────────────────────────────────────────
  const toggleBulkSelect = (subjectId: string) => {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(subjectId)) next.delete(subjectId)
      else next.add(subjectId)
      return next
    })
  }

  const toggleDraftSelect = (localId: string) => {
    setDraftSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(localId)) next.delete(localId)
      else next.add(localId)
      return next
    })
  }

  const selectAllDrafts = () => setDraftSelectedIds(new Set(placements.map((p) => p.localId)))
  const clearDraftSelection = () => setDraftSelectedIds(new Set())

  return (
    <div className="registrar-section curriculum-create-page">
      <button className="registrar-btn registrar-btn-secondary curriculum-back-btn" type="button" onClick={onBack} title="Back to Curriculums">
        <ArrowLeft size={16} />
        Back
      </button>

      {error && <p className="registrar-alert registrar-alert-error">{error}</p>}

      <div className="curriculum-create-header">
        <h2 className="registrar-section-title">Create Curriculum</h2>
        <p className="registrar-section-desc">Create a new academic curriculum for a program, with optional subject placements and prerequisites.</p>
      </div>

      {/* Wizard progress */}
      <div className="curriculum-wizard-steps">
        {stepLabels.map((label, idx) => {
          const stepNum = (idx + 1) as WizardStep
          const active = step === stepNum
          const complete = step > stepNum
          return (
            <div key={label} className={`curriculum-wizard-step ${active ? 'active' : ''} ${complete ? 'complete' : ''}`}>
              <span className="curriculum-wizard-step-number">
                {complete ? <CheckCircle size={16} /> : stepNum}
              </span>
              <span className="curriculum-wizard-step-label">{label}</span>
            </div>
          )
        })}
      </div>

      {/* ───────────────── STEP 1: Curriculum Info ───────────────── */}
      {step === 1 && (
        <div className="curriculum-create-card">
          <h3 className="curriculum-create-card-title">Curriculum Information</h3>
          <p className="curriculum-section-desc" style={{ marginBottom: '16px' }}>
            Define the curriculum's identity. The version and effective school year are independent — for example, version 2023 may be effective for school year 2024-2025.
          </p>
          <div className="curriculum-create-form">
            <label>
              <span>Program</span>
              <select value={form.programCode} onChange={(e) => setForm((prev) => ({ ...prev, programCode: e.target.value }))}>
                <option value="">Select program</option>
                {programOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.fullLabel}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Curriculum Name</span>
              <select
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                disabled={!selectedProgram}
              >
                {!selectedProgram && <option value="">Select program first</option>}
                {nameOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Curriculum Code</span>
              <input
                value={form.code}
                readOnly
                placeholder="Auto-generated from program + version"
                title="Automatically derived from the selected program and version"
              />
            </label>
            <label>
              <span>Version</span>
              <input
                value={form.version}
                onChange={(e) => setForm((prev) => ({ ...prev, version: e.target.value }))}
                placeholder="e.g. 2023"
              />
              <small className="curriculum-field-hint">A curriculum revision identifier. Independent of the effective school year.</small>
            </label>
            <div className="curriculum-form-full">
              <span className="curriculum-field-label">Effective School Year</span>
              <div className="curriculum-schoolyear-range">
                <label className="curriculum-schoolyear-field">
                  <span>Start Year</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{4}"
                    maxLength={4}
                    value={form.effectiveSchoolYearStart}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '').slice(0, 4)
                      setForm((prev) => {
                        const prevStart = prev.effectiveSchoolYearStart
                        const prevEnd = prev.effectiveSchoolYearEnd
                        // Auto-fill end year = start + 1 when:
                        //  - start just became a complete 4-digit year
                        //  - end is empty, OR end was the auto-derived value for the previous start
                        const wasComplete = /^\d{4}$/.test(prevStart)
                        const isComplete = /^\d{4}$/.test(raw)
                        const prevAutoEnd = wasComplete ? String(Number(prevStart) + 1) : ''
                        const endIsAutoOrEmpty = !prevEnd || prevEnd === prevAutoEnd
                        const shouldAutoEnd = isComplete && endIsAutoOrEmpty
                        return {
                          ...prev,
                          effectiveSchoolYearStart: raw,
                          effectiveSchoolYearEnd: shouldAutoEnd ? String(Number(raw) + 1) : prevEnd,
                        }
                      })
                    }}
                    placeholder="2026"
                    aria-label="Effective school year start"
                  />
                </label>
                <span className="curriculum-schoolyear-separator" aria-hidden="true">—</span>
                <label className="curriculum-schoolyear-field">
                  <span>End Year</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{4}"
                    maxLength={4}
                    value={form.effectiveSchoolYearEnd}
                    onChange={(e) => setForm((prev) => ({ ...prev, effectiveSchoolYearEnd: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    placeholder="2027"
                    aria-label="Effective school year end"
                  />
                </label>
              </div>
              {(() => {
                const errMsg = validateSchoolYear(form.effectiveSchoolYearStart, form.effectiveSchoolYearEnd)
                return errMsg
                  ? <small className="curriculum-field-error">{errMsg}</small>
                  : <small className="curriculum-field-hint">The first school year in which this curriculum will be used. End year must be exactly one year after start year.</small>
              })()}
            </div>
            <label className="curriculum-form-full">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={4}
                placeholder="Brief description of this curriculum..."
              />
            </label>
          </div>

          <div className="curriculum-create-actions">
            <button className="registrar-btn registrar-btn-secondary" type="button" onClick={onBack}>
              Cancel
            </button>
            <button className="registrar-btn" type="button" onClick={goToStep2} disabled={!step1Valid}>
              Next: Add Subjects
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ───────────────── STEP 2: Add Subjects ───────────────── */}
      {step === 2 && (
        <div className="curriculum-create-card">
          <h3 className="curriculum-create-card-title">Add Subjects & Prerequisites</h3>
          <p className="curriculum-section-desc" style={{ marginBottom: '12px' }}>
            Search for subjects to add to this curriculum. You can add subjects one at a time or in bulk, then configure placements and prerequisites. You can also skip this step and add subjects later from the curriculum details page.
          </p>

          {/* ─── Search bar + mode toggle ─── */}
          <div className="curriculum-search-bar">
            <div className="curriculum-search-input-wrap">
              <Search size={16} />
              <input
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                placeholder="Search by course code or title..."
                aria-label="Search subjects"
              />
              {subjectSearch && (
                <button type="button" className="curriculum-search-clear" onClick={() => setSubjectSearch('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              type="button"
              className={`registrar-btn ${bulkMode ? '' : 'registrar-btn-secondary'}`}
              onClick={() => { setBulkMode(!bulkMode); setBulkSelectedIds(new Set()) }}
            >
              {bulkMode ? 'Single Select' : 'Bulk Select'}
            </button>
          </div>

          {/* ─── Search results ─── */}
          <div className="curriculum-search-results">
            {subjectLoading && (
              <p className="curriculum-search-status">Searching...</p>
            )}
            {!subjectLoading && subjectResults.length === 0 && (
              <div className="curriculum-search-empty">
                <p>No subjects found.</p>
                <p className="curriculum-search-empty-hint">Try searching by course code or subject title.</p>
              </div>
            )}
            {!subjectLoading && subjectResults.length > 0 && (
              <>
                {bulkMode ? (
                  <>
                    <div className="curriculum-bulk-list">
                      {subjectResults.map((subject) => (
                        <label
                          key={subject._id}
                          className={`curriculum-bulk-item ${bulkSelectedIds.has(subject._id) ? 'selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={bulkSelectedIds.has(subject._id)}
                            onChange={() => toggleBulkSelect(subject._id)}
                          />
                          <div className="curriculum-subject-pick-info">
                            <strong>{subject.code}</strong>
                            <span>{subject.title}</span>
                            <small>{subject.units} units · {subject.lecturePeriods ?? 0} lec / {subject.labPeriods ?? 0} lab</small>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="curriculum-bulk-actions">
                      <span className="curriculum-bulk-count">
                        {bulkSelectedIds.size} subject{bulkSelectedIds.size !== 1 ? 's' : ''} selected
                      </span>
                      <button
                        type="button"
                        className="registrar-btn"
                        disabled={bulkSelectedIds.size === 0}
                        onClick={() => {
                          addBulkPlacements(Array.from(bulkSelectedIds))
                          setBulkSelectedIds(new Set())
                        }}
                      >
                        <Plus size={16} />
                        Add {bulkSelectedIds.size > 0 ? bulkSelectedIds.size : ''} Subject{bulkSelectedIds.size !== 1 ? 's' : ''}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="curriculum-search-list">
                    {subjectResults.map((subject) => (
                      <div
                        key={subject._id}
                        className="curriculum-search-item"
                      >
                        <div className="curriculum-subject-pick-info">
                          <strong>{subject.code}</strong>
                          <span>{subject.title}</span>
                          <small>{subject.units} units · {subject.lecturePeriods ?? 0} lec / {subject.labPeriods ?? 0} lab</small>
                        </div>
                        <button
                          type="button"
                          className="registrar-btn registrar-btn-sm"
                          onClick={() => addPlacement(subject._id)}
                        >
                          <Plus size={14} />
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {subjectTotal > subjectResults.length && (
                  <p className="curriculum-search-more">
                    Showing {subjectResults.length} of {subjectTotal} matching subjects. Refine your search to see more.
                  </p>
                )}
              </>
            )}
          </div>

          {/* ─── Draft placements table ─── */}
          {placements.length > 0 && (
            <div className="curriculum-draft-placements">
              <div className="curriculum-draft-header">
                <h4 className="curriculum-create-card-title">
                  Draft Placements · {placements.length} subject{placements.length !== 1 ? 's' : ''}
                </h4>
                <div className="curriculum-draft-header-actions">
                  {draftSelectedIds.size > 0 && (
                    <button
                      type="button"
                      className="registrar-btn registrar-btn-secondary registrar-btn-sm"
                      onClick={() => setBulkConfigOpen(true)}
                    >
                      <Settings2 size={14} />
                      Bulk Configure ({draftSelectedIds.size})
                    </button>
                  )}
                  <button type="button" className="registrar-btn registrar-btn-secondary registrar-btn-sm" onClick={selectAllDrafts}>
                    Select All
                  </button>
                  {draftSelectedIds.size > 0 && (
                    <button type="button" className="registrar-btn registrar-btn-secondary registrar-btn-sm" onClick={clearDraftSelection}>
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Live totals bar */}
              <div className="curriculum-draft-totals">
                <span><BookOpen size={14} /> {placements.length} subjects</span>
                <span><GraduationCap size={14} /> {reviewTotals.totalUnits} units</span>
                <span>{reviewTotals.totalLecture} lec / {reviewTotals.totalLab} lab</span>
              </div>

              <div className="subject-table-header curriculum-subject-table-header">
                <span className="curriculum-col-select">✓</span>
                <span>Code</span>
                <span>Title</span>
                <span>Year</span>
                <span>Semester</span>
                <span>Type</span>
                <span>Req</span>
                <span>Prerequisites</span>
                <span>Actions</span>
              </div>
              <div className="subject-table-body">
                {placements.map((p) => (
                  <div key={p.localId} className={`subject-table-row curriculum-subject-table-row ${draftSelectedIds.has(p.localId) ? 'selected' : ''}`}>
                    <span className="curriculum-col-select">
                      <input
                        type="checkbox"
                        checked={draftSelectedIds.has(p.localId)}
                        onChange={() => toggleDraftSelect(p.localId)}
                        aria-label={`Select ${getSubjectCode(p.subjectId)}`}
                      />
                    </span>
                    <span>{getSubjectCode(p.subjectId)}</span>
                    <span title={getSubjectTitle(p.subjectId)}>{getSubjectTitle(p.subjectId)}</span>
                    <span>{p.yearLevel}</span>
                    <span>{p.semester}</span>
                    <span>{p.type}</span>
                    <span>{p.isRequired ? 'Yes' : 'No'}</span>
                    <span className="curriculum-prereq-cell">
                      {p.prereqMode === 'default' && getDefaultPrereqIds(p.subjectId).length > 0 && (
                        <span className="curriculum-prereq-badge" title="Inherited from subject defaults">default</span>
                      )}
                      {formatPrereqs(p)}
                    </span>
                    <span className="subject-cell-actions">
                      <button
                        className="subject-action-btn"
                        type="button"
                        onClick={() => setEditingLocalId(p.localId)}
                        title="Edit placement"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        className="subject-action-btn delete"
                        type="button"
                        onClick={() => removePlacement(p.localId)}
                        title="Remove placement"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {placements.length === 0 && !subjectLoading && (
            <div className="curriculum-empty-state">
              <div className="curriculum-empty-state-icon">
                <BookOpen size={32} />
              </div>
              <h4>No subjects added yet</h4>
              <p>Search above to find subjects and add them to this curriculum. You can also skip this step and add subjects later.</p>
            </div>
          )}

          <div className="curriculum-create-actions">
            <button className="registrar-btn registrar-btn-secondary" type="button" onClick={() => setStep(1)}>
              <ArrowLeft size={16} />
              Back
            </button>
            <button className="registrar-btn" type="button" onClick={goToStep3}>
              Next: Review
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ───────────────── STEP 3: Review & Create ───────────────── */}
      {step === 3 && (
        <div className="curriculum-create-card">
          <h3 className="curriculum-create-card-title">Review & Create</h3>

          <div className="curriculum-review-section">
            <h4>Curriculum Information</h4>
            <dl className="curriculum-review-list">
              <div><dt>Program</dt><dd>{selectedProgram?.fullLabel || form.programCode}</dd></div>
              <div><dt>Name</dt><dd>{form.name || `${selectedProgram?.label} Curriculum ${form.version}`}</dd></div>
              {form.code && <div><dt>Code</dt><dd>{form.code}</dd></div>}
              <div><dt>Version</dt><dd>{form.version}</dd></div>
              {formatSchoolYear(form.effectiveSchoolYearStart, form.effectiveSchoolYearEnd) && (
                <div><dt>Effective School Year</dt><dd>{formatSchoolYear(form.effectiveSchoolYearStart, form.effectiveSchoolYearEnd)}</dd></div>
              )}
              {form.description && <div><dt>Description</dt><dd>{form.description}</dd></div>}
              <div><dt>Status</dt><dd>Draft</dd></div>
            </dl>
          </div>

          <div className="curriculum-review-section">
            <h4>Subject Placements ({placements.length})</h4>
            {placements.length === 0 ? (
              <p className="assignment-empty-copy">No subjects added. The curriculum will be created as an empty Draft — you can add subjects later from the details page.</p>
            ) : (
              <>
                <div className="curriculum-overview-stats">
                  <div className="curriculum-stat-card">
                    <div className="curriculum-stat-card-label"><BookOpen size={18} />Total Subjects</div>
                    <strong>{placements.length}</strong>
                  </div>
                  <div className="curriculum-stat-card">
                    <div className="curriculum-stat-card-label"><GraduationCap size={18} />Total Units</div>
                    <strong>{reviewTotals.totalUnits}</strong>
                  </div>
                  <div className="curriculum-stat-card">
                    <div className="curriculum-stat-card-label">Lecture / Lab Periods</div>
                    <strong>{reviewTotals.totalLecture} / {reviewTotals.totalLab}</strong>
                  </div>
                </div>

                <div className="subject-table-header curriculum-subject-table-header" style={{ marginTop: '16px' }}>
                  <span>Code</span>
                  <span>Title</span>
                  <span>Year</span>
                  <span>Semester</span>
                  <span>Units</span>
                  <span>Prerequisites</span>
                </div>
                <div className="subject-table-body">
                  {placements.map((p) => (
                    <div key={p.localId} className="subject-table-row curriculum-subject-table-row">
                      <span>{getSubjectCode(p.subjectId)}</span>
                      <span title={getSubjectTitle(p.subjectId)}>{getSubjectTitle(p.subjectId)}</span>
                      <span>{p.yearLevel}</span>
                      <span>{p.semester}</span>
                      <span>{getSubjectUnits(p.subjectId)}</span>
                      <span className="curriculum-prereq-cell">
                        {p.prereqMode === 'default' && getDefaultPrereqIds(p.subjectId).length > 0 && (
                          <span className="curriculum-prereq-badge" title="Inherited from subject defaults">default</span>
                        )}
                        {formatPrereqs(p)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="curriculum-create-actions">
            <button className="registrar-btn registrar-btn-secondary" type="button" onClick={() => setStep(2)} disabled={saving}>
              <ArrowLeft size={16} />
              Back
            </button>
            <button className="registrar-btn" type="button" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create Curriculum'}
            </button>
          </div>
        </div>
      )}

      {/* ───────────────── Individual Placement Editor Modal ───────────────── */}
      {editingPlacement && (
        <PlacementEditorModal
          placement={editingPlacement}
          subject={getSubject(editingPlacement.subjectId)}
          getSubject={getSubject}
          getDefaultPrereqIds={getDefaultPrereqIds}
          getEffectivePrereqIds={getEffectivePrereqIds}
          onUpdate={(changes) => updatePlacement(editingPlacement.localId, changes)}
          onTogglePrereq={(subjectId) => togglePrerequisite(editingPlacement.localId, subjectId)}
          onSetPrereqMode={(mode) => setPrereqMode(editingPlacement.localId, mode)}
          onClose={() => setEditingLocalId(null)}
          authorizedFetch={authorizedFetch}
          cacheSubjects={cacheSubjects}
          placedSubjectIds={placedSubjectIds}
        />
      )}

      {/* ───────────────── Bulk Configure Modal ───────────────── */}
      {bulkConfigOpen && (
        <BulkConfigureModal
          selectedCount={draftSelectedIds.size}
          onApply={(changes) => {
            bulkUpdatePlacements(draftSelectedIds, changes)
            setBulkConfigOpen(false)
          }}
          onClose={() => setBulkConfigOpen(false)}
        />
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// PlacementEditorModal — edits a single DraftPlacement with search-first
// prerequisite picker. Supports "use subject defaults" vs "customize" mode.
// ───────────────────────────────────────────────────────────────────────────
type PlacementEditorModalProps = {
  placement: DraftPlacement
  subject: SubjectItem | undefined
  getSubject: (id: string) => SubjectItem | undefined
  getDefaultPrereqIds: (subjectId: string) => string[]
  getEffectivePrereqIds: (p: DraftPlacement) => string[]
  onUpdate: (changes: Partial<DraftPlacement>) => void
  onTogglePrereq: (subjectId: string) => void
  onSetPrereqMode: (mode: 'default' | 'custom') => void
  onClose: () => void
  authorizedFetch: (path: string, init?: RequestInit) => Promise<unknown>
  cacheSubjects: (subjects: SubjectItem[]) => void
  placedSubjectIds: Set<string>
}

function PlacementEditorModal({
  placement, subject, getSubject, getDefaultPrereqIds, getEffectivePrereqIds,
  onUpdate, onTogglePrereq, onSetPrereqMode, onClose, authorizedFetch, cacheSubjects, placedSubjectIds,
}: PlacementEditorModalProps) {
  const [prereqSearch, setPrereqSearch] = useState('')
  const [prereqResults, setPrereqResults] = useState<SubjectItem[]>([])
  const [prereqLoading, setPrereqLoading] = useState(false)

  // Debounced prerequisite search
  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      setPrereqLoading(true)
      try {
        const params = new URLSearchParams()
        if (prereqSearch.trim()) params.set('q', prereqSearch.trim())
        params.set('isActive', 'true')
        params.set('limit', String(PREREQ_SEARCH_LIMIT))
        const data = await authorizedFetch(`/api/registrar/subjects?${params.toString()}`) as { data?: SubjectItem[] }
        const results = Array.isArray(data?.data) ? data.data : []
        // Filter out self and already-selected prereqs
        const currentPrereqs = new Set(getEffectivePrereqIds(placement))
        const filtered = results.filter((s) =>
          s._id !== placement.subjectId && !currentPrereqs.has(s._id)
        )
        setPrereqResults(filtered)
        cacheSubjects(results)
      } catch {
        setPrereqResults([])
      } finally {
        setPrereqLoading(false)
      }
    }, 250)
    return () => window.clearTimeout(timeoutId)
  }, [prereqSearch, placement, authorizedFetch, cacheSubjects, getEffectivePrereqIds])

  const effectivePrereqs = getEffectivePrereqIds(placement)
  const defaultPrereqs = getDefaultPrereqIds(placement.subjectId)

  return (
    <StudentWorkspaceOverlay>
      <div
        className="curriculum-modal-backdrop"
        onClick={(e) => { if (isStudentWorkspaceBackdropTarget(e)) onClose() }}
      >
        <div className="curriculum-modal curriculum-modal-placement-editor" role="dialog" aria-label="Edit placement">
          <div className="curriculum-modal-header">
            <h3>Edit Placement</h3>
            <button type="button" className="curriculum-modal-close" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>

          <div className="curriculum-modal-body">
            {/* Subject info */}
            <div className="curriculum-modal-subject-info">
              <strong>{subject?.code || 'N/A'}</strong>
              <span>{subject?.title || 'Subject unavailable'}</span>
              <small>{subject?.units ?? 0} units · {subject?.lecturePeriods ?? 0} lec / {subject?.labPeriods ?? 0} lab</small>
            </div>

            {/* Placement configuration fields */}
            <div className="curriculum-add-form-fields">
              <label>
                <span>Year Level</span>
                <select
                  value={String(placement.yearLevel)}
                  onChange={(e) => onUpdate({ yearLevel: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6].map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Semester</span>
                <select
                  value={placement.semester}
                  onChange={(e) => onUpdate({ semester: e.target.value as Semester })}
                >
                  {semesterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Subject Type</span>
                <select
                  value={placement.type}
                  onChange={(e) => onUpdate({ type: e.target.value })}
                >
                  {subjectTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Required?</span>
                <select
                  value={String(placement.isRequired)}
                  onChange={(e) => onUpdate({ isRequired: e.target.value === 'true' })}
                >
                  <option value="true">Yes</option>
                  <option value="false">No (Elective)</option>
                </select>
              </label>
              <label>
                <span>Display Order</span>
                <input
                  type="number"
                  min={0}
                  value={placement.displayOrder}
                  onChange={(e) => onUpdate({ displayOrder: Number(e.target.value) || 0 })}
                />
              </label>
            </div>

            {/* Prerequisites section */}
            <div className="curriculum-prereq-section">
              <div className="curriculum-prereq-mode-toggle">
                <label>
                  <input
                    type="radio"
                    name={`prereq-mode-${placement.localId}`}
                    checked={placement.prereqMode === 'default'}
                    onChange={() => onSetPrereqMode('default')}
                  />
                  Use subject defaults
                  {defaultPrereqs.length > 0 && (
                    <span className="curriculum-prereq-default-list">
                      ({defaultPrereqs.map((id) => getSubject(id)?.code || id).join(', ')})
                    </span>
                  )}
                  {defaultPrereqs.length === 0 && (
                    <span className="curriculum-prereq-default-list">(none)</span>
                  )}
                </label>
                <label>
                  <input
                    type="radio"
                    name={`prereq-mode-${placement.localId}`}
                    checked={placement.prereqMode === 'custom'}
                    onChange={() => onSetPrereqMode('custom')}
                  />
                  Customize for this curriculum
                </label>
              </div>

              {placement.prereqMode === 'custom' && (
                <>
                  {/* Selected prerequisites as removable chips */}
                  {effectivePrereqs.length > 0 && (
                    <div className="curriculum-prereq-chips">
                      {effectivePrereqs.map((id) => {
                        const s = getSubject(id)
                        return (
                          <span key={id} className="subject-prereq-chip-static curriculum-prereq-chip-removable">
                            {s?.code || id} · {s?.title || ''}
                            <button type="button" onClick={() => onTogglePrereq(id)} aria-label={`Remove ${s?.code || id}`}>
                              <X size={12} />
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {/* Search-first prerequisite picker */}
                  <div className="curriculum-prereq-picker">
                    <div className="curriculum-search-input-wrap curriculum-prereq-search">
                      <Search size={16} />
                      <input
                        value={prereqSearch}
                        onChange={(e) => setPrereqSearch(e.target.value)}
                        placeholder="Search to add a prerequisite..."
                        aria-label="Search prerequisites"
                      />
                    </div>

                    {prereqLoading && <p className="curriculum-search-status">Searching prerequisites...</p>}
                    {!prereqLoading && prereqResults.length === 0 && prereqSearch && (
                      <p className="curriculum-search-status">No matching prerequisites found.</p>
                    )}
                    {!prereqLoading && prereqResults.length > 0 && (
                      <div className="curriculum-prereq-search-results">
                        {prereqResults.map((s) => (
                          <button
                            key={s._id}
                            type="button"
                            className="curriculum-prereq-search-item"
                            onClick={() => onTogglePrereq(s._id)}
                          >
                            <div className="curriculum-subject-pick-info">
                              <strong>{s.code}</strong>
                              <span>{s.title}</span>
                              <small>{s.units} units</small>
                            </div>
                            <Plus size={14} />
                          </button>
                        ))}
                      </div>
                    )}
                    {!prereqLoading && !prereqSearch && (
                      <p className="curriculum-search-status curriculum-search-status-hint">
                        Search by course code or title to find subjects to add as prerequisites.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="curriculum-modal-footer">
            <button className="registrar-btn registrar-btn-secondary" type="button" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </StudentWorkspaceOverlay>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// BulkConfigureModal — applies partial configuration to multiple placements.
// Only fields explicitly changed by the registrar are applied; all others
// remain untouched on each placement.
// ───────────────────────────────────────────────────────────────────────────
type BulkConfigureModalProps = {
  selectedCount: number
  onApply: (changes: Partial<DraftPlacement>) => void
  onClose: () => void
}

function BulkConfigureModal({ selectedCount, onApply, onClose }: BulkConfigureModalProps) {
  // Each field has an "apply this field" checkbox. Only checked fields
  // are included in the changes object, ensuring we never overwrite
  // fields the registrar didn't intend to change.
  const [applyYearLevel, setApplyYearLevel] = useState(false)
  const [yearLevel, setYearLevel] = useState('1')
  const [applySemester, setApplySemester] = useState(false)
  const [semester, setSemester] = useState<Semester>('1st')
  const [applyType, setApplyType] = useState(false)
  const [type, setType] = useState('General')
  const [applyRequired, setApplyRequired] = useState(false)
  const [isRequired, setIsRequired] = useState(true)
  const [applyDisplayOrder, setApplyDisplayOrder] = useState(false)
  const [displayOrderMode, setDisplayOrderMode] = useState<'auto' | 'manual'>('auto')
  const [displayOrder, setDisplayOrder] = useState('0')

  const handleApply = () => {
    const changes: Partial<DraftPlacement> = {}
    if (applyYearLevel) changes.yearLevel = Number(yearLevel)
    if (applySemester) changes.semester = semester
    if (applyType) changes.type = type
    if (applyRequired) changes.isRequired = isRequired
    if (applyDisplayOrder) {
      changes.displayOrder = displayOrderMode === 'auto' ? -1 : Number(displayOrder) || 0
    }
    onApply(changes)
  }

  const anyApplied = applyYearLevel || applySemester || applyType || applyRequired || applyDisplayOrder

  return (
    <StudentWorkspaceOverlay>
      <div
        className="curriculum-modal-backdrop"
        onClick={(e) => { if (isStudentWorkspaceBackdropTarget(e)) onClose() }}
      >
        <div className="curriculum-modal curriculum-modal-bulk-config" role="dialog" aria-label="Bulk configure placements">
          <div className="curriculum-modal-header">
            <h3>Bulk Configure</h3>
            <button type="button" className="curriculum-modal-close" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>

          <div className="curriculum-modal-body">
            <p className="curriculum-bulk-config-info">
              {selectedCount} placement{selectedCount !== 1 ? 's' : ''} selected. Only fields you check will be modified — all others remain unchanged.
            </p>

            <div className="curriculum-bulk-config-fields">
              <label className="curriculum-bulk-config-field">
                <input type="checkbox" checked={applyYearLevel} onChange={(e) => setApplyYearLevel(e.target.checked)} />
                <span>Year Level</span>
                <select value={yearLevel} onChange={(e) => setYearLevel(e.target.value)} disabled={!applyYearLevel}>
                  {[1, 2, 3, 4, 5, 6].map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </label>

              <label className="curriculum-bulk-config-field">
                <input type="checkbox" checked={applySemester} onChange={(e) => setApplySemester(e.target.checked)} />
                <span>Semester</span>
                <select value={semester} onChange={(e) => setSemester(e.target.value as Semester)} disabled={!applySemester}>
                  {semesterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>

              <label className="curriculum-bulk-config-field">
                <input type="checkbox" checked={applyType} onChange={(e) => setApplyType(e.target.checked)} />
                <span>Subject Type</span>
                <select value={type} onChange={(e) => setType(e.target.value)} disabled={!applyType}>
                  {subjectTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>

              <label className="curriculum-bulk-config-field">
                <input type="checkbox" checked={applyRequired} onChange={(e) => setApplyRequired(e.target.checked)} />
                <span>Required?</span>
                <select
                  value={String(isRequired)}
                  onChange={(e) => setIsRequired(e.target.value === 'true')}
                  disabled={!applyRequired}
                >
                  <option value="true">Yes</option>
                  <option value="false">No (Elective)</option>
                </select>
              </label>

              <label className="curriculum-bulk-config-field">
                <input type="checkbox" checked={applyDisplayOrder} onChange={(e) => setApplyDisplayOrder(e.target.checked)} />
                <span>Display Order</span>
                <select
                  value={displayOrderMode}
                  onChange={(e) => setDisplayOrderMode(e.target.value as 'auto' | 'manual')}
                  disabled={!applyDisplayOrder}
                >
                  <option value="auto">Auto (sequential)</option>
                  <option value="manual">Manual</option>
                </select>
                {displayOrderMode === 'manual' && (
                  <input
                    type="number"
                    min={0}
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(e.target.value)}
                    disabled={!applyDisplayOrder}
                    placeholder="0"
                  />
                )}
              </label>
            </div>

            <p className="curriculum-bulk-config-note">
              Prerequisites are not part of bulk configuration — each subject maintains its own independent prerequisites. Use the Edit button on individual placements to configure prerequisites.
            </p>
          </div>

          <div className="curriculum-modal-footer">
            <button className="registrar-btn registrar-btn-secondary" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="registrar-btn" type="button" onClick={handleApply} disabled={!anyApplied}>
              Apply to {selectedCount} Placement{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </StudentWorkspaceOverlay>
  )
}
