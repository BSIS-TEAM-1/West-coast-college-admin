import { useEffect, useMemo, useState } from 'react'
import LocationSelector from '../components/LocationSelector'
import {
  getApplicantCourses,
  searchSchools,
  submitApplicant,
  type ApplicantPayload,
  type CourseOption
} from '../lib/applicantApi'
import './ApplicantOnboarding.css'

type Props = {
  onBack: () => void
}

const steps = ['Contact', 'Personal', 'Academic', 'Course']
const suffixOptions = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V']

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^(09|\+639)\d{9}$/
const SCHOOL_NAME_RE = /^[a-zA-Z0-9\s,.'\-()]+$/
const YEAR_RE = /^\d{4}$/
const GPA_MIN = 60
const GPA_MAX = 100

function isValidPhone(value: string): boolean {
  const v = value.trim()
  const digits = v.replace(/[^0-9]/g, '')
  if (PHONE_RE.test(v)) return true
  if (digits.length === 11 && digits.startsWith('09')) return true
  if (digits.length === 13 && digits.startsWith('639')) return true
  return false
}

function isValidGpa(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  const num = parseFloat(v)
  return !isNaN(num) && num >= GPA_MIN && num <= GPA_MAX
}

function isValidSchoolName(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  if (v.length > 150) return false
  return SCHOOL_NAME_RE.test(v)
}

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

function RequiredLabel({ children }: { children: string }) {
  return (
    <span className="applicant-label-text">
      {children}
      <span className="required-asterisk" aria-hidden="true">*</span>
    </span>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <span className="applicant-field-error">{message}</span>
}

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
  currentLocation: {
    regionCode: '',
    regionName: '',
    provinceCode: '',
    provinceName: '',
    cityCode: '',
    cityName: '',
    barangayCode: '',
    barangayName: '',
    streetAddress: ''
  },
  permanentLocation: {
    regionCode: '',
    regionName: '',
    provinceCode: '',
    provinceName: '',
    cityCode: '',
    cityName: '',
    barangayCode: '',
    barangayName: '',
    streetAddress: ''
  },
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
    },
    seniorHighSchool: {
      schoolName: '',
      schoolAddress: '',
      yearGraduated: '',
      generalAverage: '',
      gradesSummary: '',
      strandOrTrack: ''
    },
    college: {
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

function setNestedValue(source: ApplicantPayload, path: string, value: unknown): ApplicantPayload {
  const clone = structuredClone(source)
  const keys = path.split('.')
  let target: any = clone

  keys.slice(0, -1).forEach((key) => {
    target = target[key]
  })

  target[keys[keys.length - 1]] = value
  return clone
}

type SchoolOption = {
  _id: string
  name: string
  municipality: string
  division: string
  barangay: string
}

function SchoolSearchInput({
  value,
  onChange,
  placeholder = 'Search school name...',
  required = false,
  label
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  label: React.ReactNode
}) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<SchoolOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [hasTyped, setHasTyped] = useState(false)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    if (!hasTyped || query.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }

    let cancelled = false
    const handler = setTimeout(() => {
      setLoading(true)
      searchSchools(query.trim(), 10)
        .then((schools) => {
          if (cancelled) return
          setResults(schools)
          setOpen(schools.length > 0)
        })
        .catch(() => {
          if (cancelled) return
          setResults([])
          setOpen(false)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(handler)
    }
  }, [query, hasTyped])

  const handleSelect = (school: SchoolOption) => {
    setQuery(school.name)
    onChange(school.name)
    setOpen(false)
    setHasTyped(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    setQuery(next)
    onChange(next)
    setHasTyped(true)
  }

  return (
    <div className="school-search-input">
      <label>
        {label}
        <input
          type="text"
          className="form-input"
          value={query}
          onChange={handleChange}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          onBlur={() => { setTimeout(() => setOpen(false), 150) }}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
        />
      </label>
      {loading && <span className="school-search-loading">Loading...</span>}
      {open && (
        <ul className="school-search-results" role="listbox">
          {results.map((school) => (
            <li
              key={school._id}
              className="school-search-result"
              onMouseDown={() => handleSelect(school)}
              role="option"
              tabIndex={-1}
            >
              <span className="school-search-result-name">{school.name}</span>
              <span className="school-search-result-meta">{school.barangay}, {school.municipality}, {school.division}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ApplicantOnboarding({ onBack }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState<ApplicantPayload>(initialForm)
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submittedNumber, setSubmittedNumber] = useState('')
  const [emailNotice, setEmailNotice] = useState('')
  const [religionIsOther, setReligionIsOther] = useState(false)
  const [religionOther, setReligionOther] = useState('')
  const [emergencyRelIsOther, setEmergencyRelIsOther] = useState(false)
  const [emergencyRelOther, setEmergencyRelOther] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

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

  const update = (field: string, value: unknown) => {
    setForm((prev) => setNestedValue(prev, field, value))
  }

  const validateStep = () => {
    setError('')
    const errors: Record<string, string> = {}

    if (stepIndex === 0) {
      if (!form.firstName.trim()) errors.firstName = 'First name is required.'
      if (!form.lastName.trim()) errors.lastName = 'Last name is required.'
      if (!form.email.trim()) {
        errors.email = 'Email address is required.'
      } else if (!isValidEmail(form.email)) {
        errors.email = 'Email address is invalid.'
      }
      if (!form.phoneNumber.trim()) {
        errors.phoneNumber = 'Phone number is required.'
      } else if (!isValidPhone(form.phoneNumber)) {
        errors.phoneNumber = 'Phone number must be a valid Philippine mobile number (e.g. 09171234567 or +639171234567).'
      }
    }

    if (stepIndex === 1) {
      if (!form.birthDate) errors.birthDate = 'Birth date is required.'
      if (!form.currentLocation?.cityCode) errors.currentCity = 'Please select a city/municipality.'
      if (!form.currentLocation?.streetAddress?.trim()) errors.currentStreet = 'Street address is required.'
      if (!form.guardianContactNumber.trim()) {
        errors.guardianContactNumber = 'Parent/guardian contact number is required.'
      } else if (!isValidPhone(form.guardianContactNumber)) {
        errors.guardianContactNumber = 'Guardian contact number must be a valid Philippine mobile number.'
      }
      if (!form.emergencyContact.name.trim()) errors.emergencyName = 'Emergency contact name is required.'
      if (!form.emergencyContact.relationship.trim()) errors.emergencyRelationship = 'Emergency contact relationship is required.'
      if (!form.emergencyContact.contactNumber.trim()) {
        errors.emergencyContactNumber = 'Emergency contact number is required.'
      } else if (!isValidPhone(form.emergencyContact.contactNumber)) {
        errors.emergencyContactNumber = 'Emergency contact number must be a valid Philippine mobile number.'
      }
    }

    if (stepIndex === 2) {
      const elem = form.academicDetails.elementary
      if (!isValidSchoolName(elem.schoolName)) {
        errors.elemSchoolName = 'Please enter a valid elementary school name (letters, numbers, spaces, and basic punctuation only, max 150 characters).'
      }
      if (!YEAR_RE.test(elem.yearGraduated.trim())) {
        errors.elemYear = 'Elementary year graduated must be a 4-digit year.'
      }
      if (elem.generalAverage?.trim() && !isValidGpa(elem.generalAverage)) {
        errors.elemGpa = `Elementary general average must be a number between ${GPA_MIN} and ${GPA_MAX}.`
      }

      const hs = form.academicDetails.highSchool
      if (!isValidSchoolName(hs.schoolName)) {
        errors.hsSchoolName = 'Please enter a valid high school name (letters, numbers, spaces, and basic punctuation only, max 150 characters).'
      }
      if (!YEAR_RE.test(hs.yearGraduated.trim())) {
        errors.hsYear = 'High school year graduated must be a 4-digit year.'
      }
      if (hs.generalAverage?.trim() && !isValidGpa(hs.generalAverage)) {
        errors.hsGpa = `High school general average must be a number between ${GPA_MIN} and ${GPA_MAX}.`
      }

      const shs = form.academicDetails.seniorHighSchool
      if (shs && shs.schoolName.trim()) {
        if (!isValidSchoolName(shs.schoolName)) {
          errors.shsSchoolName = 'Please enter a valid senior high school name.'
        }
        if (shs.yearGraduated.trim() && !YEAR_RE.test(shs.yearGraduated.trim())) {
          errors.shsYear = 'Senior high school year graduated must be a 4-digit year.'
        }
        if (shs.generalAverage?.trim() && !isValidGpa(shs.generalAverage)) {
          errors.shsGpa = `Senior high school general average must be a number between ${GPA_MIN} and ${GPA_MAX}.`
        }
      }

      const college = form.academicDetails.college
      if (college && college.schoolName.trim()) {
        if (!isValidSchoolName(college.schoolName)) {
          errors.collegeSchoolName = 'Please enter a valid college/university name.'
        }
        if (college.yearGraduated.trim() && !YEAR_RE.test(college.yearGraduated.trim())) {
          errors.collegeYear = 'College year graduated must be a 4-digit year.'
        }
        if (college.generalAverage?.trim() && !isValidGpa(college.generalAverage)) {
          errors.collegeGpa = `College general average must be a number between ${GPA_MIN} and ${GPA_MAX}.`
        }
      }
    }

    if (stepIndex === 3) {
      if (!form.selectedCourse) errors.selectedCourse = 'Please choose a course.'
      if (!form.schoolYear?.trim()) {
        errors.schoolYear = 'School year is required.'
      } else if (!/^\d{4}-\d{4}$/.test(form.schoolYear.trim())) {
        errors.schoolYear = 'School year must be in YYYY-YYYY format.'
      }
    }

    setFieldErrors(errors)
    const errorMessages = Object.values(errors)
    if (errorMessages.length > 0) {
      setError(errorMessages[0])
      return false
    }
    return true
  }

  const goNext = () => {
    if (!validateStep()) return
    setStepIndex((current) => Math.min(current + 1, steps.length - 1))
  }

  const goBack = () => {
    setError('')
    setFieldErrors({})
    setStepIndex((current) => Math.max(current - 1, 0))
  }

  const handleSubmit = async () => {
    if (!validateStep()) return
    setSubmitting(true)
    setError('')

    try {
      const { data: applicant, emailNotification } = await submitApplicant(form)
      setSubmittedNumber(applicant.applicantNumber)
      if (emailNotification) {
        setEmailNotice(
          emailNotification.sent
            ? `A confirmation email has been sent to ${emailNotification.recipient || form.email}.`
            : ''
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit your application.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submittedNumber) {
    return (
      <main className="applicant-success-page">
        <section className="applicant-success-card">
          <span className="applicant-success-icon">✓</span>
          <h2 className="applicant-success-title">Application Submitted</h2>
          <p className="applicant-success-text">Your applicant number is <strong className="applicant-success-number">{submittedNumber}</strong></p>
          {emailNotice && (
            <p className="applicant-success-email-notice">{emailNotice}</p>
          )}
          <button type="button" onClick={onBack} className="applicant-success-btn">
            Back to Home
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="applicant-page">
      <div className="applicant-container">
        <header className="applicant-header">
          <button
            type="button"
            onClick={onBack}
            className="applicant-back-btn"
          >
            Back
          </button>
          <div>
            <h2 className="applicant-header-subtitle">West Coast College</h2>
            <h1 className="applicant-header-title">Online Applicant Onboarding</h1>
          </div>
        </header>

        <div className="applicant-layout">
          <aside className="applicant-sidebar">
            <nav className="applicant-stepper">
              <ul>
                {steps.map((step, index) => {
                  const isActive = index === stepIndex
                  const isDone = index < stepIndex
                  const itemClass = isActive
                    ? 'applicant-step-btn applicant-step-btn-active'
                    : isDone
                      ? 'applicant-step-btn applicant-step-btn-done'
                      : 'applicant-step-btn applicant-step-btn-pending'
                  const circleClass = isActive
                    ? 'applicant-step-circle applicant-step-circle-active'
                    : isDone
                      ? 'applicant-step-circle applicant-step-circle-done'
                      : 'applicant-step-circle applicant-step-circle-pending'
                  return (
                    <li key={step}>
                      <button
                        type="button"
                        className={itemClass}
                        onClick={() => {
                          if (index <= stepIndex || validateStep()) setStepIndex(index)
                        }}
                      >
                        <span className={circleClass}>{index + 1}</span>
                        <span>{step}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </aside>

          <section className="applicant-form-card">
            {error ? (
              <div className="applicant-error-banner">
                {error}
              </div>
            ) : null}

            <form className="applicant-form" onSubmit={(event) => event.preventDefault()}>
              {stepIndex === 0 ? (
                <>
                  <h2 className="applicant-section-title">Contact Information</h2>
                  <div className="applicant-grid-2">
                    <div className="applicant-field">
                      <label className="applicant-field-label" htmlFor="firstName"><RequiredLabel>First name</RequiredLabel></label>
                      <input id="firstName" name="firstName" className={`form-input${fieldErrors.firstName ? ' form-input-error' : ''}`} value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required type="text" maxLength={80} />
                      <FieldError message={fieldErrors.firstName} />
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label" htmlFor="middleName">Middle name</label>
                      <input id="middleName" name="middleName" className="form-input" value={form.middleName} onChange={(e) => update('middleName', e.target.value)} type="text" maxLength={80} />
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label" htmlFor="lastName"><RequiredLabel>Last name</RequiredLabel></label>
                      <input id="lastName" name="lastName" className={`form-input${fieldErrors.lastName ? ' form-input-error' : ''}`} value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required type="text" maxLength={80} />
                      <FieldError message={fieldErrors.lastName} />
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label" htmlFor="suffix">Suffix</label>
                      <select id="suffix" name="suffix" className="form-select" value={form.suffix} onChange={(e) => update('suffix', e.target.value)}>
                        {suffixOptions.map((suffix) => (
                          <option key={suffix || 'none'} value={suffix}>{suffix || 'None'}</option>
                        ))}
                      </select>
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label" htmlFor="email"><RequiredLabel>Email</RequiredLabel></label>
                      <input id="email" name="email" className={`form-input${fieldErrors.email ? ' form-input-error' : ''}`} type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required maxLength={254} />
                      <FieldError message={fieldErrors.email} />
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label" htmlFor="phoneNumber"><RequiredLabel>Phone number</RequiredLabel></label>
                      <input id="phoneNumber" name="phoneNumber" className={`form-input${fieldErrors.phoneNumber ? ' form-input-error' : ''}`} value={form.phoneNumber} onChange={(e) => update('phoneNumber', e.target.value)} required type="tel" placeholder="09171234567" maxLength={13} />
                      <FieldError message={fieldErrors.phoneNumber} />
                    </div>
                  </div>
                </>
              ) : null}

              {stepIndex === 1 ? (
                <>
                  <h2 className="applicant-section-title">Personal Details</h2>
                  <div className="applicant-grid-2">
                    <div className="applicant-field">
                      <label className="applicant-field-label" htmlFor="birthDate"><RequiredLabel>Birth date</RequiredLabel></label>
                      <input id="birthDate" name="birthDate" className={`form-input${fieldErrors.birthDate ? ' form-input-error' : ''}`} type="date" value={form.birthDate} onChange={(e) => update('birthDate', e.target.value)} required />
                      <FieldError message={fieldErrors.birthDate} />
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label" htmlFor="birthPlace">Birth place</label>
                      <input id="birthPlace" name="birthPlace" className="form-input" type="text" value={form.birthPlace} onChange={(e) => update('birthPlace', e.target.value)} />
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label" htmlFor="gender">Gender</label>
                      <select id="gender" name="gender" className="form-select" value={form.gender} onChange={(e) => update('gender', e.target.value)}>
                        <option value="">Select...</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Non-binary">Non-binary</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                      </select>
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label" htmlFor="civilStatus">Civil status</label>
                      <select id="civilStatus" name="civilStatus" className="form-select" value={form.civilStatus} onChange={(e) => update('civilStatus', e.target.value)}>
                        <option value="">Select...</option>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                        <option value="Separated">Separated</option>
                      </select>
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label" htmlFor="nationality">Nationality</label>
                      <input id="nationality" name="nationality" className="form-input" type="text" value={form.nationality} onChange={(e) => update('nationality', e.target.value)} />
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label" htmlFor="religion">Religion</label>
                      <select id="religion" name="religion" className="form-select" value={religionIsOther ? 'Other' : form.religion} onChange={(e) => { if (e.target.value === 'Other') { setReligionIsOther(true); update('religion', '') } else { setReligionIsOther(false); setReligionOther(''); update('religion', e.target.value) } }}>
                        <option value="">Select...</option>
                        <option value="Roman Catholic">Roman Catholic</option>
                        <option value="Iglesia ni Cristo">Iglesia ni Cristo</option>
                        <option value="Born Again Christian">Born Again Christian</option>
                        <option value="Islam">Islam</option>
                        <option value="Buddhist">Buddhist</option>
                        <option value="Other">Other</option>
                      </select>
                      {religionIsOther && (
                        <div className="applicant-mt-2">
                          <input className="form-input" value={religionOther} onChange={(e) => { setReligionOther(e.target.value); update('religion', e.target.value) }} placeholder="Please specify religion" required />
                        </div>
                      )}
                    </div>
                  </div>

                  <fieldset className="applicant-fieldset">
                    <legend className="applicant-fieldset-legend">Current Address</legend>
                    <div className="applicant-fieldset-body">
                      <div className="applicant-field">
                        <label className="applicant-field-label" htmlFor="currentStreet"><RequiredLabel>Street / House no.</RequiredLabel></label>
                        <input id="currentStreet" name="currentStreet" className={`form-input${fieldErrors.currentStreet ? ' form-input-error' : ''}`} value={form.currentLocation?.streetAddress} onChange={(e) => update('currentLocation.streetAddress', e.target.value)} required type="text" maxLength={255} />
                        <FieldError message={fieldErrors.currentStreet} />
                      </div>
                      <LocationSelector
                        value={form.currentLocation || {}}
                        onChange={(value) => update('currentLocation', value)}
                        labels={{ region: 'Region', province: 'Province', city: 'City / Municipality', barangay: 'Barangay' }}
                      />
                    </div>
                  </fieldset>

                  <fieldset className="applicant-fieldset">
                    <legend className="applicant-fieldset-legend">Permanent Address</legend>
                    <div className="applicant-fieldset-body">
                      <div className="applicant-field">
                        <label className="applicant-field-label" htmlFor="permanentStreet">Permanent Street / House no.</label>
                        <input id="permanentStreet" name="permanentStreet" className="form-input" value={form.permanentLocation?.streetAddress} onChange={(e) => update('permanentLocation.streetAddress', e.target.value)} type="text" />
                      </div>
                      <LocationSelector
                        value={form.permanentLocation || {}}
                        onChange={(value) => update('permanentLocation', value)}
                        labels={{ region: 'Permanent Region', province: 'Permanent Province', city: 'Permanent City / Municipality', barangay: 'Permanent Barangay' }}
                      />
                    </div>
                  </fieldset>

                  <fieldset className="applicant-fieldset">
                    <legend className="applicant-fieldset-legend">Family &amp; Emergency Contacts</legend>
                    <div className="applicant-grid-2 applicant-spacer">
                      <div className="applicant-fieldset-body-sm">
                        <div className="applicant-field">
                          <label className="applicant-field-label" htmlFor="motherName">Mother&apos;s name</label>
                          <input id="motherName" name="motherName" className="form-input" type="text" value={form.motherName} onChange={(e) => update('motherName', e.target.value)} />
                        </div>
                        <div className="applicant-field">
                          <label className="applicant-field-label" htmlFor="guardianRelationship">Guardian relationship</label>
                          <input id="guardianRelationship" name="guardianRelationship" className="form-input" type="text" value={form.guardianRelationship} onChange={(e) => update('guardianRelationship', e.target.value)} />
                        </div>
                      </div>
                      <div className="applicant-fieldset-body-sm">
                        <div className="applicant-field">
                          <label className="applicant-field-label" htmlFor="fatherName">Father&apos;s name</label>
                          <input id="fatherName" name="fatherName" className="form-input" type="text" value={form.fatherName} onChange={(e) => update('fatherName', e.target.value)} />
                        </div>
                        <div className="applicant-field">
                          <label className="applicant-field-label" htmlFor="guardianName">Guardian name</label>
                          <input id="guardianName" name="guardianName" className="form-input" type="text" value={form.guardianName} onChange={(e) => update('guardianName', e.target.value)} />
                        </div>
                      </div>
                    </div>
                    <div className="applicant-grid-2">
                      <div className="applicant-field">
                        <label className="applicant-field-label" htmlFor="guardianContactNumber"><RequiredLabel>Parent / guardian contact</RequiredLabel></label>
                        <input id="guardianContactNumber" name="guardianContactNumber" className={`form-input${fieldErrors.guardianContactNumber ? ' form-input-error' : ''}`} value={form.guardianContactNumber} onChange={(e) => update('guardianContactNumber', e.target.value)} required type="tel" placeholder="09171234567" maxLength={13} />
                        <FieldError message={fieldErrors.guardianContactNumber} />
                      </div>
                      <div className="applicant-col-span-2" />
                      <div className="applicant-field">
                        <label className="applicant-field-label" htmlFor="emergencyContact.name"><RequiredLabel>Emergency contact name</RequiredLabel></label>
                        <input id="emergencyContact.name" name="emergencyContact.name" className={`form-input${fieldErrors.emergencyName ? ' form-input-error' : ''}`} value={form.emergencyContact.name} onChange={(e) => update('emergencyContact.name', e.target.value)} required type="text" maxLength={100} />
                        <FieldError message={fieldErrors.emergencyName} />
                      </div>
                      <div className="applicant-field">
                        <label className="applicant-field-label" htmlFor="emergencyContact.relationship"><RequiredLabel>Emergency relationship</RequiredLabel></label>
                        <select id="emergencyContact.relationship" name="emergencyContact.relationship" className="form-select" value={emergencyRelIsOther ? 'Other' : form.emergencyContact.relationship} onChange={(e) => { if (e.target.value === 'Other') { setEmergencyRelIsOther(true); update('emergencyContact.relationship', '') } else { setEmergencyRelIsOther(false); setEmergencyRelOther(''); update('emergencyContact.relationship', e.target.value) } }} required>
                          <option value="">Select...</option>
                          <option value="Father">Father</option>
                          <option value="Mother">Mother</option>
                          <option value="Sibling">Sibling</option>
                          <option value="Guardian">Guardian</option>
                          <option value="Spouse">Spouse</option>
                          <option value="Relative">Relative</option>
                          <option value="Friend">Friend</option>
                          <option value="Other">Other</option>
                        </select>
                        {emergencyRelIsOther && (
                          <div className="applicant-mt-2">
                            <input className="form-input" value={emergencyRelOther} onChange={(e) => { setEmergencyRelOther(e.target.value); update('emergencyContact.relationship', e.target.value) }} placeholder="Please specify relationship" required />
                          </div>
                        )}
                      </div>
                      <div className="applicant-field">
                        <label className="applicant-field-label" htmlFor="emergencyContact.contactNumber"><RequiredLabel>Emergency contact number</RequiredLabel></label>
                        <input id="emergencyContact.contactNumber" name="emergencyContact.contactNumber" className={`form-input${fieldErrors.emergencyContactNumber ? ' form-input-error' : ''}`} value={form.emergencyContact.contactNumber} onChange={(e) => update('emergencyContact.contactNumber', e.target.value)} required type="tel" placeholder="09171234567" maxLength={13} />
                        <FieldError message={fieldErrors.emergencyContactNumber} />
                      </div>
                      <div className="applicant-col-span-2">
                        <label className="applicant-field-label" htmlFor="emergencyContact.address">Emergency contact address</label>
                        <textarea id="emergencyContact.address" name="emergencyContact.address" className="form-textarea" rows={3} value={form.emergencyContact.address} onChange={(e) => update('emergencyContact.address', e.target.value)} />
                      </div>
                    </div>
                  </fieldset>
                </>
              ) : null}

              {stepIndex === 2 ? (
                <>
                  <h2 className="applicant-section-title">Academic Details</h2>

                  <div className="academic-card">
                    <div className="academic-card-header">
                      <h3 className="academic-card-title">Elementary Education</h3>
                    </div>
                    <div className="academic-card-body">
                      <div className="applicant-grid-2">
                        <div className="applicant-col-span-2">
                          <SchoolSearchInput
                            value={form.academicDetails.elementary.schoolName}
                            onChange={(value) => update('academicDetails.elementary.schoolName', value)}
                            label={<RequiredLabel>School</RequiredLabel>}
                            required
                          />
                          <FieldError message={fieldErrors.elemSchoolName} />
                        </div>
                        <div className="applicant-field">
                          <label className="applicant-field-label"><RequiredLabel>Year graduated</RequiredLabel></label>
                          <input className={`form-input${fieldErrors.elemYear ? ' form-input-error' : ''}`} value={form.academicDetails.elementary.yearGraduated} onChange={(e) => update('academicDetails.elementary.yearGraduated', e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} required type="text" inputMode="numeric" placeholder="YYYY" maxLength={4} />
                          <FieldError message={fieldErrors.elemYear} />
                        </div>
                        <div className="applicant-field">
                          <label className="applicant-field-label">General average</label>
                          <input className={`form-input${fieldErrors.elemGpa ? ' form-input-error' : ''}`} value={form.academicDetails.elementary.generalAverage} onChange={(e) => update('academicDetails.elementary.generalAverage', e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))} type="text" inputMode="decimal" placeholder="e.g. 89.75" />
                          <FieldError message={fieldErrors.elemGpa} />
                        </div>
                        <div className="applicant-col-span-2">
                          <label className="applicant-field-label">School address</label>
                          <textarea className="form-textarea" rows={2} value={form.academicDetails.elementary.schoolAddress} onChange={(e) => update('academicDetails.elementary.schoolAddress', e.target.value)} maxLength={255} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="academic-card">
                    <div className="academic-card-header">
                      <h3 className="academic-card-title">Junior High School</h3>
                    </div>
                    <div className="academic-card-body">
                      <div className="applicant-grid-2">
                        <div className="applicant-col-span-2">
                          <SchoolSearchInput
                            value={form.academicDetails.highSchool.schoolName}
                            onChange={(value) => update('academicDetails.highSchool.schoolName', value)}
                            label={<RequiredLabel>School</RequiredLabel>}
                            required
                          />
                          <FieldError message={fieldErrors.hsSchoolName} />
                        </div>
                        <div className="applicant-field">
                          <label className="applicant-field-label"><RequiredLabel>Year graduated</RequiredLabel></label>
                          <input className={`form-input${fieldErrors.hsYear ? ' form-input-error' : ''}`} value={form.academicDetails.highSchool.yearGraduated} onChange={(e) => update('academicDetails.highSchool.yearGraduated', e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} required type="text" inputMode="numeric" placeholder="YYYY" maxLength={4} />
                          <FieldError message={fieldErrors.hsYear} />
                        </div>
                        <div className="applicant-field">
                          <label className="applicant-field-label">General average</label>
                          <input className={`form-input${fieldErrors.hsGpa ? ' form-input-error' : ''}`} value={form.academicDetails.highSchool.generalAverage} onChange={(e) => update('academicDetails.highSchool.generalAverage', e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))} type="text" inputMode="decimal" placeholder="e.g. 89.75" />
                          <FieldError message={fieldErrors.hsGpa} />
                        </div>
                        <div className="applicant-col-span-2">
                          <label className="applicant-field-label">School address</label>
                          <textarea className="form-textarea" rows={2} value={form.academicDetails.highSchool.schoolAddress} onChange={(e) => update('academicDetails.highSchool.schoolAddress', e.target.value)} maxLength={255} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="academic-card">
                    <div className="academic-card-header">
                      <h3 className="academic-card-title">Senior High School <span className="academic-card-optional">(optional)</span></h3>
                    </div>
                    <div className="academic-card-body">
                      <div className="applicant-grid-2">
                        <div className="applicant-col-span-2">
                          <SchoolSearchInput
                            value={form.academicDetails.seniorHighSchool?.schoolName || ''}
                            onChange={(value) => update('academicDetails.seniorHighSchool.schoolName', value)}
                            label={<span className="applicant-label-text">School</span>}
                            placeholder="Search school name... (leave blank if not applicable)"
                          />
                          <FieldError message={fieldErrors.shsSchoolName} />
                        </div>
                        <div className="applicant-field">
                          <label className="applicant-field-label">Year graduated</label>
                          <input className={`form-input${fieldErrors.shsYear ? ' form-input-error' : ''}`} value={form.academicDetails.seniorHighSchool?.yearGraduated || ''} onChange={(e) => update('academicDetails.seniorHighSchool.yearGraduated', e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} type="text" inputMode="numeric" placeholder="YYYY" maxLength={4} />
                          <FieldError message={fieldErrors.shsYear} />
                        </div>
                        <div className="applicant-field">
                          <label className="applicant-field-label">General average</label>
                          <input className={`form-input${fieldErrors.shsGpa ? ' form-input-error' : ''}`} value={form.academicDetails.seniorHighSchool?.generalAverage || ''} onChange={(e) => update('academicDetails.seniorHighSchool.generalAverage', e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))} type="text" inputMode="decimal" placeholder="e.g. 89.75" />
                          <FieldError message={fieldErrors.shsGpa} />
                        </div>
                        <div className="applicant-field">
                          <label className="applicant-field-label">Strand or track</label>
                          <select className="form-select" value={form.academicDetails.seniorHighSchool?.strandOrTrack || ''} onChange={(e) => update('academicDetails.seniorHighSchool.strandOrTrack', e.target.value)}>
                            <option value="">Select...</option>
                            <option value="Science, Technology, Engineering and Mathematics">Science, Technology, Engineering and Mathematics</option>
                            <option value="Accountancy, Business and Management">Accountancy, Business and Management</option>
                            <option value="Humanities and Social Sciences">Humanities and Social Sciences</option>
                            <option value="General Academic Strand">General Academic Strand</option>
                            <option value="Technical-Vocational-Livelihood">Technical-Vocational-Livelihood</option>
                            <option value="Not applicable">Not applicable</option>
                          </select>
                        </div>
                        <div className="applicant-col-span-2">
                          <label className="applicant-field-label">School address</label>
                          <textarea className="form-textarea" rows={2} value={form.academicDetails.seniorHighSchool?.schoolAddress || ''} onChange={(e) => update('academicDetails.seniorHighSchool.schoolAddress', e.target.value)} maxLength={255} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="academic-card">
                    <div className="academic-card-header">
                      <h3 className="academic-card-title">College <span className="academic-card-optional">(if transferee)</span></h3>
                    </div>
                    <div className="academic-card-body">
                      <div className="applicant-grid-2">
                        <div className="applicant-col-span-2">
                          <SchoolSearchInput
                            value={form.academicDetails.college?.schoolName || ''}
                            onChange={(value) => update('academicDetails.college.schoolName', value)}
                            label={<span className="applicant-label-text">School</span>}
                            placeholder="Search school name... (leave blank if not applicable)"
                          />
                          <FieldError message={fieldErrors.collegeSchoolName} />
                        </div>
                        <div className="applicant-field">
                          <label className="applicant-field-label">Year graduated</label>
                          <input className={`form-input${fieldErrors.collegeYear ? ' form-input-error' : ''}`} value={form.academicDetails.college?.yearGraduated || ''} onChange={(e) => update('academicDetails.college.yearGraduated', e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} type="text" inputMode="numeric" placeholder="YYYY" maxLength={4} />
                          <FieldError message={fieldErrors.collegeYear} />
                        </div>
                        <div className="applicant-field">
                          <label className="applicant-field-label">General average</label>
                          <input className={`form-input${fieldErrors.collegeGpa ? ' form-input-error' : ''}`} value={form.academicDetails.college?.generalAverage || ''} onChange={(e) => update('academicDetails.college.generalAverage', e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))} type="text" inputMode="decimal" placeholder="e.g. 1.75" />
                          <FieldError message={fieldErrors.collegeGpa} />
                        </div>
                        <div className="applicant-col-span-2">
                          <label className="applicant-field-label">School address</label>
                          <textarea className="form-textarea" rows={2} value={form.academicDetails.college?.schoolAddress || ''} onChange={(e) => update('academicDetails.college.schoolAddress', e.target.value)} maxLength={255} />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}

              {stepIndex === 3 ? (
                <>
                  <h2 className="applicant-section-title">Course Selection</h2>
                  <div className="applicant-grid-2 applicant-spacer">
                    <div className="applicant-field">
                      <label className="applicant-field-label"><RequiredLabel>Applicant type</RequiredLabel></label>
                      <select className="form-select" value={form.applicantType} onChange={(e) => update('applicantType', e.target.value)} required>
                        <option value="New">Freshman / New Student</option>
                        <option value="Transferee">Transferee</option>
                        <option value="Returnee">Returnee</option>
                      </select>
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label"><RequiredLabel>Course</RequiredLabel></label>
                      <select className="form-select" value={form.selectedCourse} onChange={(e) => update('selectedCourse', Number(e.target.value))} disabled={loadingCourses} required>
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>{course.code} - {course.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label"><RequiredLabel>Requested year level</RequiredLabel></label>
                      <select className="form-select" value={form.requestedYearLevel} onChange={(e) => update('requestedYearLevel', Number(e.target.value))} required>
                        <option value={1}>First Year</option>
                        <option value={2}>Second Year</option>
                        <option value={3}>Third Year</option>
                        <option value={4}>Fourth Year</option>
                      </select>
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label"><RequiredLabel>Semester</RequiredLabel></label>
                      <select className="form-select" value={form.semester} onChange={(e) => update('semester', e.target.value)} required>
                        <option value="1st">1st Semester</option>
                        <option value="2nd">2nd Semester</option>
                        <option value="Summer">Summer</option>
                      </select>
                    </div>
                    <div className="applicant-field">
                      <label className="applicant-field-label"><RequiredLabel>School year</RequiredLabel></label>
                      <input className="form-input" value={form.schoolYear} onChange={(e) => update('schoolYear', e.target.value)} required type="text" />
                    </div>
                  </div>
                  <div className="applicant-review-box">
                    <span>Selected course</span>
                    <strong>{selectedCourse ? `${selectedCourse.code} - ${selectedCourse.name}` : 'Loading courses...'}</strong>
                  </div>
                </>
              ) : null}

              <div className="applicant-actions">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={stepIndex === 0 || submitting}
                  className="applicant-btn-prev"
                >
                  Previous
                </button>
                {stepIndex < steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="applicant-btn-next"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || loadingCourses}
                    className="applicant-btn-next"
                  >
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                )}
              </div>
            </form>
          </section>
        </div>
      </div>
    </main>
  )
}
