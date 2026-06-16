import { useEffect, useState } from 'react'
import { ArrowLeft, Award, BarChart3, CalendarDays, Download, Info, MapPin, Users } from 'lucide-react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import { fetchWithAutoReconnect, isAbortRequestError, isNetworkRequestError } from '../../lib/network'
import type { ProfessorAssignedStudent, ProfessorSubjectDetailState } from './professorTypes'
import { buildReconnectMessage } from './professorUtils'
import './ProfessorSubjectDetail.css'

interface ProfessorSubjectDetailProps {
  detail: ProfessorSubjectDetailState | null
  onBack: () => void
  onOpenRosterClass?: (classKey: string, mode?: 'students' | 'attendance') => void
  onOpenGradesView?: (classKey?: string) => void
}

function ProfessorSubjectDetail({ detail, onBack, onOpenRosterClass, onOpenGradesView }: ProfessorSubjectDetailProps) {
  const [students, setStudents] = useState<ProfessorAssignedStudent[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState('')

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const fetchSubjectStudents = async () => {
      if (!detail?.sectionId) {
        setStudents([])
        setStudentsError('No section is linked to this subject assignment yet.')
        return
      }

      try {
        setStudentsLoading(true)
        setStudentsError('')

        const token = await getStoredToken()
        if (!token) {
          setStudents([])
          setStudentsError('You are not logged in.')
          return
        }

        const query = new URLSearchParams({
          semester: detail.semester,
          schoolYear: detail.schoolYear
        })

        const response = await fetchWithAutoReconnect(`${API_URL}/api/professor/sections/${detail.sectionId}/subjects/${detail.subject.subjectId}/students?${query.toString()}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        })

        if (!response.ok) {
          throw new Error(`Failed to load students: ${response.status}`)
        }

        const payload = await response.json().catch(() => ({}))
        const list = Array.isArray(payload?.data?.students) ? payload.data.students : []
        if (!cancelled) {
          setStudents(list)
        }
      } catch (error) {
        if (isAbortRequestError(error)) {
          return
        }

        console.error('Failed to fetch subject students:', error)
        if (!cancelled) {
          if (!isNetworkRequestError(error)) {
            setStudents([])
          }
          setStudentsError(
            isNetworkRequestError(error)
              ? buildReconnectMessage('the student list')
              : (error instanceof Error ? error.message : 'Failed to load students.')
          )
        }
      } finally {
        if (!cancelled) {
          setStudentsLoading(false)
        }
      }
    }

    void fetchSubjectStudents()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [detail?.sectionId])

  const formatStudentName = (student: ProfessorAssignedStudent) => {
    return [student.lastName, student.firstName, student.middleName, student.suffix]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(', ')
  }

  const getCourseCode = (value: string | number) => {
    const text = String(value ?? '').trim()
    if (!text) return ''
    if (/^\d+$/.test(text)) return text

    const normalized = text.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-')
    if (normalized.includes('BEED')) return '101'
    if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return '102'
    if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return '103'
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return '201'
    return ''
  }

  const formatStudentNumber = (student: ProfessorAssignedStudent) => {
    const raw = String(student.studentNumber || '').trim()
    const fallbackCourseCode = getCourseCode(student.course ?? detail?.courseCode ?? '')

    if (!raw) return fallbackCourseCode ? `0000-${fallbackCourseCode}-00000` : 'N/A'

    const parts = raw.split('-').map((part) => part.trim()).filter(Boolean)

    let year = /^\d{4}$/.test(parts[0] || '') ? parts[0] : '0000'
    let seqPart = [...parts].reverse().find((part) => /^\d+$/.test(part)) || '00000'

    const compactDigits = raw.replace(/\D+/g, '')
    if (parts.length === 1 && /^\d{8,}$/.test(compactDigits)) {
      year = compactDigits.slice(0, 4)
      seqPart = compactDigits.slice(-5)
    }

    const seq = seqPart.slice(-5).padStart(5, '0')
    const codeFromRaw = getCourseCode(parts.find((part) => /[A-Za-z]/.test(part)) || parts[1] || '')
    const courseCode = fallbackCourseCode || codeFromRaw || '000'

    return `${year}-${courseCode}-${seq}`
  }

  const buildClassKey = () => {
    if (!detail?.sectionId || !detail.subject.subjectId) return ''
    return `${detail.courseCode}|${detail.sectionId}|${detail.subject.subjectId}`
  }

  const getBadgeClass = (value: string | undefined, type: 'student' | 'cor') => {
    const normalized = String(value || '').trim().toLowerCase()
    if (type === 'student') {
      if (normalized.includes('irregular')) return 'is-red'
      if (normalized.includes('probation')) return 'is-orange'
      return 'is-green'
    }

    if (normalized.includes('approved')) return 'is-green'
    if (normalized.includes('reject')) return 'is-red'
    return 'is-yellow'
  }

  const handleOpenAttendance = () => {
    const classKey = buildClassKey()
    if (classKey) onOpenRosterClass?.(classKey, 'attendance')
  }

  const handleOpenGrades = () => {
    const classKey = buildClassKey()
    if (classKey) onOpenGradesView?.(classKey)
  }

  const handleExportClassList = () => {
    if (!detail || students.length === 0) return

    const headers = ['Student', 'Student No.', 'Course', 'Year', 'Status', 'COR Status']
    const rows = students.map((student) => [
      formatStudentName(student),
      formatStudentNumber(student),
      student.course || 'N/A',
      student.yearLevel ?? 'N/A',
      student.studentStatus || 'Regular',
      student.corStatus || 'Pending'
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${detail.subject.code || 'class'}-${detail.blockCode || 'students'}-class-list.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!detail) {
    return (
      <div className="professor-section">
        <h2 className="professor-section-title">Subject Details</h2>
        <p className="professor-section-desc">No subject selected.</p>
        <button className="professor-btn" onClick={onBack}>Back to My Courses</button>
      </div>
    )
  }

  return (
    <div className="professor-section">
      <section className="professor-subject-overview" aria-labelledby="professor-subject-heading">
        <div className="professor-subject-page-header">
          <button className="professor-subject-back-btn" onClick={onBack} aria-label="Back to my courses">
            <ArrowLeft size={16} />
            Back to My Courses
          </button>
          <div className="professor-subject-title-block">
            <span className="professor-subject-context-pill">{detail.courseCode} / {detail.blockCode}</span>
            <h1 id="professor-subject-heading">{detail.subject.code} - {detail.subject.title}</h1>
            <p>{detail.semester} {detail.schoolYear} / Section {detail.sectionCode}</p>
          </div>
          <div className="professor-subject-action-bar">
            <button type="button" className="professor-subject-action-btn" onClick={handleOpenAttendance} disabled={!buildClassKey()}>
              <CalendarDays size={16} />
              Attendance
            </button>
            <button type="button" className="professor-subject-action-btn" onClick={handleOpenGrades} disabled={!buildClassKey()}>
              <Award size={16} />
              Grades
            </button>
            <button type="button" className="professor-subject-action-btn" onClick={() => window.print()}>
              <BarChart3 size={16} />
              Reports
            </button>
            <button type="button" className="professor-subject-action-btn is-primary" onClick={handleExportClassList} disabled={students.length === 0}>
              <Download size={16} />
              Export Class List
            </button>
          </div>
        </div>

        <div className="professor-subject-stat-grid">
          <article className="professor-subject-stat-card">
            <span className="professor-subject-stat-icon"><Users size={18} /></span>
            <div>
              <span>Enrolled Students</span>
              <strong>{detail.subject.enrolledStudents}</strong>
            </div>
          </article>
          <article className="professor-subject-stat-card">
            <span className="professor-subject-stat-icon"><CalendarDays size={18} /></span>
            <div>
              <span>Schedule</span>
              <strong>{detail.subject.schedule || 'TBA'}</strong>
            </div>
          </article>
          <article className="professor-subject-stat-card">
            <span className="professor-subject-stat-icon"><MapPin size={18} /></span>
            <div>
              <span>Room</span>
              <strong>{detail.subject.room || 'TBA'}</strong>
            </div>
          </article>
          <article className="professor-subject-stat-card">
            <span className="professor-subject-stat-icon"><BarChart3 size={18} /></span>
            <div>
              <span>Block</span>
              <strong>{detail.blockCode}</strong>
            </div>
          </article>
        </div>

        <div className="professor-subject-info-card">
          <h2>
            <Info size={19} />
            Course Information
          </h2>
          <div className="professor-subject-info-grid">
            <div className="professor-subject-info-item"><span>Subject Code</span><strong>{detail.subject.code}</strong></div>
            <div className="professor-subject-info-item"><span>Block</span><strong>{detail.blockCode}</strong></div>
            <div className="professor-subject-info-item"><span>Subject Title</span><strong>{detail.subject.title}</strong></div>
            <div className="professor-subject-info-item"><span>Section</span><strong>{detail.sectionCode}</strong></div>
            <div className="professor-subject-info-item"><span>Course</span><strong>{detail.courseCode}</strong></div>
            <div className="professor-subject-info-item"><span>Term</span><strong>{detail.semester} {detail.schoolYear}</strong></div>
          </div>
        </div>
      </section>

      <div className="professor-subject-students-card">
        <div className="professor-subject-students-head">
          <div>
            <span className="professor-subject-eyebrow">Class Roster</span>
            <h3>Students</h3>
          </div>
          <span>{students.length} loaded</span>
        </div>
        {studentsLoading ? (
          <p>Loading students...</p>
        ) : studentsError ? (
          <p className="professor-data-error">{studentsError}</p>
        ) : students.length === 0 ? (
          <p>No students found for this assigned subject/block.</p>
        ) : (
          <div className="professor-subject-table-shell">
            <table className="professor-subject-roster-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Student No.</th>
                  <th>Course</th>
                  <th>Year</th>
                  <th>Status</th>
                  <th>COR</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student._id}>
                    <td data-label="Student">
                      <div className="professor-subject-student-main">
                        <strong>{formatStudentName(student)}</strong>
                      </div>
                    </td>
                    <td data-label="Student No.">{formatStudentNumber(student)}</td>
                    <td data-label="Course">{student.course || 'N/A'}</td>
                    <td data-label="Year">{student.yearLevel ?? 'N/A'}</td>
                    <td data-label="Status">
                      <span className={`professor-subject-status-badge ${getBadgeClass(student.studentStatus, 'student')}`}>
                        {student.studentStatus || 'Regular'}
                      </span>
                    </td>
                    <td data-label="COR">
                      <span className={`professor-subject-status-badge ${getBadgeClass(student.corStatus, 'cor')}`}>
                        {student.corStatus || 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default ProfessorSubjectDetail
