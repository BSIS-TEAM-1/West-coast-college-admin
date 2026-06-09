import { useEffect, useState } from 'react'
import { API_URL, getStoredToken } from '../../lib/authApi'
import { fetchWithAutoReconnect, isAbortRequestError, isNetworkRequestError } from '../../lib/network'
import type { ProfessorAssignedStudent, ProfessorSubjectDetailState } from './professorTypes'
import { buildReconnectMessage } from './professorUtils'

interface ProfessorSubjectDetailProps {
  detail: ProfessorSubjectDetailState | null
  onBack: () => void
}

function ProfessorSubjectDetail({ detail, onBack }: ProfessorSubjectDetailProps) {
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
      <h2 className="professor-section-title">Subject Details</h2>
      <p className="professor-section-desc">Assigned subject and block information.</p>

      <div className="professor-course-toolbar">
        <button className="professor-btn" onClick={onBack}>Back to My Courses</button>
      </div>

      <div className="placeholder-card professor-subject-detail-card">
        <div className="professor-detail-grid">
          <div><strong>Course:</strong> {detail.courseCode}</div>
          <div><strong>Block:</strong> {detail.blockCode}</div>
          <div><strong>Section:</strong> {detail.sectionCode}</div>
          <div><strong>Term:</strong> {detail.semester} {detail.schoolYear}</div>
          <div><strong>Subject Code:</strong> {detail.subject.code}</div>
          <div><strong>Subject Title:</strong> {detail.subject.title}</div>
          <div><strong>Schedule:</strong> {detail.subject.schedule || 'TBA'}</div>
          <div><strong>Room:</strong> {detail.subject.room || 'TBA'}</div>
          <div><strong>Enrolled Students:</strong> {detail.subject.enrolledStudents}</div>
        </div>
      </div>

      <div className="placeholder-card professor-subject-students-card">
        <h3>Students</h3>
        {studentsLoading ? (
          <p>Loading students...</p>
        ) : studentsError ? (
          <p className="professor-data-error">{studentsError}</p>
        ) : students.length === 0 ? (
          <p>No students found for this assigned subject/block.</p>
        ) : (
          <div className="professor-student-grid">
            {students.map((student) => (
              <div key={student._id} className="professor-student-item">
                <div className="professor-student-name">{formatStudentName(student)}</div>
                <div className="professor-student-meta">Student No: {formatStudentNumber(student)}</div>
                <div className="professor-student-meta">Course: {student.course || 'N/A'}</div>
                <div className="professor-student-meta">Year Level: {student.yearLevel ?? 'N/A'}</div>
                <div className="professor-student-meta">Status: {student.studentStatus || 'N/A'}</div>
                <div className="professor-student-meta">COR: {student.corStatus || 'Pending'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProfessorSubjectDetail
