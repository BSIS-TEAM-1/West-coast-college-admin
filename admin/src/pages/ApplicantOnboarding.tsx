import { useEffect, useMemo, useState } from 'react'
import {
  getApplicantCourses,
  submitApplicant,
  type ApplicantPayload,
  type CourseOption
} from '../lib/applicantApi'
import './ApplicantOnboarding.css'

type Props = {
  onBack: () => void
}

const steps = ['Contact', 'Personal', 'Academic', 'Course']

const defaultSchoolYear = (() => {
  const now = new Date()
  const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1
  return `${startYear}-${startYear + 1}`
})()

const initialForm: ApplicantPayload = {
  applicantType: 'New',
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  email: '',
  phoneNumber: '',
  birthDate: '',
  birthPlace: '',
  gender: '',
  civilStatus: '',
  nationality: 'Filipino',
  religion: '',
  currentAddress: '',
  permanentAddress: '',
  fatherName: '',
  motherName: '',
  guardianName: '',
  guardianRelationship: '',
  guardianContactNumber: '',
  emergencyContact: {
    name: '',
    relationship: '',
    contactNumber: '',
    address: ''
  },
  academicDetails: {
    elementary: {
      schoolName: '',
      schoolAddress: '',
      yearGraduated: '',
      generalAverage: '',
      gradesSummary: ''
    },
    highSchool: {
      schoolName: '',
      schoolAddress: '',
      yearGraduated: '',
      generalAverage: '',
      gradesSummary: '',
      strandOrTrack: ''
    }
  },
  selectedCourse: 101,
  requestedYearLevel: 1,
  semester: '1st',
  schoolYear: defaultSchoolYear
}

function setNestedValue(source: ApplicantPayload, path: string, value: string | number): ApplicantPayload {
  const clone = structuredClone(source)
  const keys = path.split('.')
  let target: any = clone

  keys.slice(0, -1).forEach((key) => {
    target = target[key]
  })

  target[keys[keys.length - 1]] = value
  return clone
}

export default function ApplicantOnboarding({ onBack }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState<ApplicantPayload>(initialForm)
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submittedNumber, setSubmittedNumber] = useState('')

  useEffect(() => {
    let mounted = true

    getApplicantCourses()
      .then((items) => {
        if (!mounted) return
        setCourses(items)
        if (items.length > 0) {
          setForm((prev) => ({ ...prev, selectedCourse: items[0].id }))
        }
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load courses.')
      })
      .finally(() => {
        if (mounted) setLoadingCourses(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === Number(form.selectedCourse)),
    [courses, form.selectedCourse]
  )

  const update = (field: string, value: string | number) => {
    setForm((prev) => setNestedValue(prev, field, value))
  }

  const validateStep = () => {
    setError('')

    if (stepIndex === 0) {
      if (!form.firstName || !form.lastName || !form.email || !form.phoneNumber) {
        setError('Please complete your name, email, and phone number.')
        return false
      }
    }

    if (stepIndex === 1) {
      if (!form.birthDate || !form.currentAddress || !form.guardianContactNumber || !form.emergencyContact.name || !form.emergencyContact.relationship || !form.emergencyContact.contactNumber) {
        setError('Please complete your personal, guardian, and emergency contact details.')
        return false
      }
    }

    if (stepIndex === 2) {
      if (!form.academicDetails.elementary.schoolName || !form.academicDetails.elementary.yearGraduated || !form.academicDetails.highSchool.schoolName || !form.academicDetails.highSchool.yearGraduated) {
        setError('Please complete your elementary and high school details.')
        return false
      }
    }

    if (stepIndex === 3) {
      if (!form.selectedCourse || !form.schoolYear) {
        setError('Please choose a course and school year.')
        return false
      }
    }

    return true
  }

  const goNext = () => {
    if (!validateStep()) return
    setStepIndex((current) => Math.min(current + 1, steps.length - 1))
  }

  const goBack = () => {
    setError('')
    setStepIndex((current) => Math.max(current - 1, 0))
  }

  const handleSubmit = async () => {
    if (!validateStep()) return
    setSubmitting(true)
    setError('')

    try {
      const applicant = await submitApplicant(form)
      setSubmittedNumber(applicant.applicantNumber)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit your application.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submittedNumber) {
    return (
      <main className="applicant-page applicant-page-centered">
        <section className="applicant-success">
          <span className="applicant-success-mark">✓</span>
          <h1>Application Sent</h1>
          <p>Your application has been sent to the registrar for processing.</p>
          <div className="applicant-reference">
            <span>Application Number</span>
            <strong>{submittedNumber}</strong>
          </div>
          <button type="button" className="applicant-primary-btn" onClick={onBack}>
            Back to Home
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="applicant-page">
      <header className="applicant-header">
        <button type="button" className="applicant-back-btn" onClick={onBack}>
          Back
        </button>
        <div>
          <p>West Coast College</p>
          <h1>Online Applicant Onboarding</h1>
        </div>
      </header>

      <section className="applicant-shell">
        <aside className="applicant-steps" aria-label="Application steps">
          {steps.map((step, index) => (
            <button
              key={step}
              type="button"
              className={`applicant-step ${index === stepIndex ? 'applicant-step-active' : ''} ${index < stepIndex ? 'applicant-step-done' : ''}`}
              onClick={() => {
                if (index <= stepIndex || validateStep()) setStepIndex(index)
              }}
            >
              <span>{index + 1}</span>
              {step}
            </button>
          ))}
        </aside>

        <form className="applicant-form" onSubmit={(event) => event.preventDefault()}>
          {error ? <div className="applicant-error">{error}</div> : null}

          {stepIndex === 0 ? (
            <section className="applicant-form-section">
              <h2>Contact Information</h2>
              <div className="applicant-grid">
                <label>First name<input value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required /></label>
                <label>Middle name<input value={form.middleName} onChange={(e) => update('middleName', e.target.value)} /></label>
                <label>Last name<input value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required /></label>
                <label>Suffix<input value={form.suffix} onChange={(e) => update('suffix', e.target.value)} /></label>
                <label>Email<input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required /></label>
                <label>Phone number<input value={form.phoneNumber} onChange={(e) => update('phoneNumber', e.target.value)} required /></label>
              </div>
            </section>
          ) : null}

          {stepIndex === 1 ? (
            <section className="applicant-form-section">
              <h2>Personal Details</h2>
              <div className="applicant-grid">
                <label>Birth date<input type="date" value={form.birthDate} onChange={(e) => update('birthDate', e.target.value)} required /></label>
                <label>Birth place<input value={form.birthPlace} onChange={(e) => update('birthPlace', e.target.value)} /></label>
                <label>Gender<input value={form.gender} onChange={(e) => update('gender', e.target.value)} /></label>
                <label>Civil status<input value={form.civilStatus} onChange={(e) => update('civilStatus', e.target.value)} /></label>
                <label>Nationality<input value={form.nationality} onChange={(e) => update('nationality', e.target.value)} /></label>
                <label>Religion<input value={form.religion} onChange={(e) => update('religion', e.target.value)} /></label>
                <label className="applicant-wide">Current address<textarea value={form.currentAddress} onChange={(e) => update('currentAddress', e.target.value)} required /></label>
                <label className="applicant-wide">Permanent address<textarea value={form.permanentAddress} onChange={(e) => update('permanentAddress', e.target.value)} /></label>
                <label>Father's name<input value={form.fatherName} onChange={(e) => update('fatherName', e.target.value)} /></label>
                <label>Mother's name<input value={form.motherName} onChange={(e) => update('motherName', e.target.value)} /></label>
                <label>Guardian name<input value={form.guardianName} onChange={(e) => update('guardianName', e.target.value)} /></label>
                <label>Guardian relationship<input value={form.guardianRelationship} onChange={(e) => update('guardianRelationship', e.target.value)} /></label>
                <label>Parent / guardian contact<input value={form.guardianContactNumber} onChange={(e) => update('guardianContactNumber', e.target.value)} required /></label>
                <label>Emergency contact name<input value={form.emergencyContact.name} onChange={(e) => update('emergencyContact.name', e.target.value)} required /></label>
                <label>Emergency relationship<input value={form.emergencyContact.relationship} onChange={(e) => update('emergencyContact.relationship', e.target.value)} required /></label>
                <label>Emergency contact number<input value={form.emergencyContact.contactNumber} onChange={(e) => update('emergencyContact.contactNumber', e.target.value)} required /></label>
                <label className="applicant-wide">Emergency contact address<textarea value={form.emergencyContact.address} onChange={(e) => update('emergencyContact.address', e.target.value)} /></label>
              </div>
            </section>
          ) : null}

          {stepIndex === 2 ? (
            <section className="applicant-form-section">
              <h2>Academic Details</h2>
              <div className="applicant-school-group">
                <h3>Elementary</h3>
                <div className="applicant-grid">
                  <label>School name<input value={form.academicDetails.elementary.schoolName} onChange={(e) => update('academicDetails.elementary.schoolName', e.target.value)} required /></label>
                  <label>Year graduated<input value={form.academicDetails.elementary.yearGraduated} onChange={(e) => update('academicDetails.elementary.yearGraduated', e.target.value)} required /></label>
                  <label>General average / GPA<input value={form.academicDetails.elementary.generalAverage} onChange={(e) => update('academicDetails.elementary.generalAverage', e.target.value)} /></label>
                  <label className="applicant-wide">School address<textarea value={form.academicDetails.elementary.schoolAddress} onChange={(e) => update('academicDetails.elementary.schoolAddress', e.target.value)} /></label>
                  <label className="applicant-wide">Grades summary<textarea value={form.academicDetails.elementary.gradesSummary} onChange={(e) => update('academicDetails.elementary.gradesSummary', e.target.value)} /></label>
                </div>
              </div>
              <div className="applicant-school-group">
                <h3>High School / Senior High School</h3>
                <div className="applicant-grid">
                  <label>School name<input value={form.academicDetails.highSchool.schoolName} onChange={(e) => update('academicDetails.highSchool.schoolName', e.target.value)} required /></label>
                  <label>Year graduated<input value={form.academicDetails.highSchool.yearGraduated} onChange={(e) => update('academicDetails.highSchool.yearGraduated', e.target.value)} required /></label>
                  <label>Strand or track<input value={form.academicDetails.highSchool.strandOrTrack} onChange={(e) => update('academicDetails.highSchool.strandOrTrack', e.target.value)} /></label>
                  <label>General average / GPA<input value={form.academicDetails.highSchool.generalAverage} onChange={(e) => update('academicDetails.highSchool.generalAverage', e.target.value)} /></label>
                  <label className="applicant-wide">School address<textarea value={form.academicDetails.highSchool.schoolAddress} onChange={(e) => update('academicDetails.highSchool.schoolAddress', e.target.value)} /></label>
                  <label className="applicant-wide">Grades summary<textarea value={form.academicDetails.highSchool.gradesSummary} onChange={(e) => update('academicDetails.highSchool.gradesSummary', e.target.value)} /></label>
                </div>
              </div>
            </section>
          ) : null}

          {stepIndex === 3 ? (
            <section className="applicant-form-section">
              <h2>Course Selection</h2>
              <div className="applicant-grid">
                <label>Applicant type
                  <select value={form.applicantType} onChange={(e) => update('applicantType', e.target.value)}>
                    <option value="New">Freshman / New Student</option>
                    <option value="Transferee">Transferee</option>
                    <option value="Returnee">Returnee</option>
                  </select>
                </label>
                <label>Course
                  <select value={form.selectedCourse} onChange={(e) => update('selectedCourse', Number(e.target.value))} disabled={loadingCourses}>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>{course.code} - {course.name}</option>
                    ))}
                  </select>
                </label>
                <label>Requested year level
                  <select value={form.requestedYearLevel} onChange={(e) => update('requestedYearLevel', Number(e.target.value))}>
                    <option value={1}>First Year</option>
                    <option value={2}>Second Year</option>
                    <option value={3}>Third Year</option>
                    <option value={4}>Fourth Year</option>
                  </select>
                </label>
                <label>Semester
                  <select value={form.semester} onChange={(e) => update('semester', e.target.value)}>
                    <option value="1st">1st Semester</option>
                    <option value="2nd">2nd Semester</option>
                    <option value="Summer">Summer</option>
                  </select>
                </label>
                <label>School year<input value={form.schoolYear} onChange={(e) => update('schoolYear', e.target.value)} required /></label>
              </div>
              <div className="applicant-review-box">
                <span>Selected course</span>
                <strong>{selectedCourse ? `${selectedCourse.code} - ${selectedCourse.name}` : 'Loading courses...'}</strong>
              </div>
            </section>
          ) : null}

          <div className="applicant-actions">
            <button type="button" className="applicant-secondary-btn" onClick={goBack} disabled={stepIndex === 0 || submitting}>
              Previous
            </button>
            {stepIndex < steps.length - 1 ? (
              <button type="button" className="applicant-primary-btn" onClick={goNext}>
                Next
              </button>
            ) : (
              <button type="button" className="applicant-primary-btn" onClick={handleSubmit} disabled={submitting || loadingCourses}>
                {submitting ? 'Submitting...' : 'Submit to Registrar'}
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  )
}
