import { useEffect, useState } from 'react'
import type { WizardFormData, ValidationError, Semester, SchoolRecord } from './types'
import { getFieldError } from './validation'
import { getAcademicTerm } from '../../lib/settingsApi'

interface AcademicStepProps {
  data: Partial<WizardFormData>
  onChange: (field: keyof WizardFormData, value: string | SchoolRecord) => void
  errors: ValidationError[]
}

const COURSE_OPTIONS = [
  { value: '101', label: 'BEED', fullLabel: 'Bachelor of Elementary Education (BEED)' },
  { value: '102', label: 'BSEd-English', fullLabel: 'Bachelor of Secondary Education - Major in English' },
  { value: '103', label: 'BSEd-Math', fullLabel: 'Bachelor of Secondary Education - Major in Mathematics' },
  { value: '201', label: 'BSBA-HRM', fullLabel: 'Bachelor of Science in Business Administration - Major in HRM' }
]

const YEAR_LEVEL_OPTIONS = [
  { value: '1', label: '1st Year' },
  { value: '2', label: '2nd Year' },
  { value: '3', label: '3rd Year' },
  { value: '4', label: '4th Year' },
  { value: '5', label: '5th Year' }
]

const SEMESTER_OPTIONS: Semester[] = ['1st', '2nd', 'Summer']

const STUDENT_STATUS_OPTIONS = [
  { value: 'Regular', label: 'Regular' },
  { value: 'Irregular', label: 'Irregular' }
]

const LIFECYCLE_STATUS_OPTIONS = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Enrolled', label: 'Enrolled' },
  { value: 'Not Enrolled', label: 'Not Enrolled' },
  { value: 'Dropped', label: 'Dropped' },
  { value: 'Inactive', label: 'Inactive' },
  { value: 'Graduated', label: 'Graduated' }
]

const APPLICANT_TYPE_OPTIONS = [
  { value: 'New', label: 'Freshman / New Student' },
  { value: 'Transferee', label: 'Transferee' },
  { value: 'Returnee', label: 'Returnee' }
]

const STRAND_OPTIONS = [
  'Science, Technology, Engineering and Mathematics',
  'Accountancy, Business and Management',
  'Humanities and Social Sciences',
  'General Academic Strand',
  'Technical-Vocational-Livelihood',
  'Arts and Design',
  'Sports',
  'Not applicable'
]

function SchoolRecordCard({
  title,
  record,
  onChange,
  errors,
  errorPrefix,
  optional,
  showStrand
}: {
  title: string
  record: SchoolRecord | undefined
  onChange: (record: SchoolRecord) => void
  errors: ValidationError[]
  errorPrefix: string
  optional?: boolean
  showStrand?: boolean
}) {
  const r = record || { schoolName: '', schoolAddress: '', yearGraduated: '', generalAverage: '', gradesSummary: '', strandOrTrack: '' }

  return (
    <div className="form-section">
      <h3>
        {title}
        {optional && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 400 }}> (optional)</span>}
      </h3>
      <div className="wizard-form-grid">
        {/* School Name */}
        <div className="form-group form-group--full">
          <label htmlFor={`${errorPrefix}-schoolName`}>School Name</label>
          <input
            id={`${errorPrefix}-schoolName`}
            type="text"
            value={r.schoolName || ''}
            onChange={(e) => onChange({ ...r, schoolName: e.target.value })}
            placeholder={optional ? 'Search school name... (leave blank if not applicable)' : 'Enter school name'}
            maxLength={150}
          />
        </div>

        {/* Year Graduated */}
        <div className="form-group">
          <label htmlFor={`${errorPrefix}-year`}>Year Graduated</label>
          <input
            id={`${errorPrefix}-year`}
            type="text"
            inputMode="numeric"
            value={r.yearGraduated || ''}
            onChange={(e) => onChange({ ...r, yearGraduated: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })}
            placeholder="YYYY"
            maxLength={4}
            className={getFieldError(`${errorPrefix}Year`, errors) ? 'input-error' : ''}
          />
          {getFieldError(`${errorPrefix}Year`, errors) && (
            <div className="field-error">{getFieldError(`${errorPrefix}Year`, errors)}</div>
          )}
        </div>

        {/* General Average */}
        <div className="form-group">
          <label htmlFor={`${errorPrefix}-gpa`}>General Average</label>
          <input
            id={`${errorPrefix}-gpa`}
            type="text"
            inputMode="decimal"
            value={r.generalAverage || ''}
            onChange={(e) => onChange({ ...r, generalAverage: e.target.value.replace(/[^0-9.]/g, '').slice(0, 6) })}
            placeholder="e.g. 89.75"
            className={getFieldError(`${errorPrefix}Gpa`, errors) ? 'input-error' : ''}
          />
          {getFieldError(`${errorPrefix}Gpa`, errors) && (
            <div className="field-error">{getFieldError(`${errorPrefix}Gpa`, errors)}</div>
          )}
        </div>

        {/* Strand or Track (SHS only) */}
        {showStrand && (
          <div className="form-group form-group--full">
            <label htmlFor={`${errorPrefix}-strand`}>Strand or Track</label>
            <select
              id={`${errorPrefix}-strand`}
              value={r.strandOrTrack || ''}
              onChange={(e) => onChange({ ...r, strandOrTrack: e.target.value })}
            >
              <option value="">Select...</option>
              {STRAND_OPTIONS.map((strand) => (
                <option key={strand} value={strand}>{strand}</option>
              ))}
            </select>
          </div>
        )}

        {/* School Address */}
        <div className="form-group form-group--full">
          <label htmlFor={`${errorPrefix}-address`}>School Address</label>
          <textarea
            id={`${errorPrefix}-address`}
            value={r.schoolAddress || ''}
            onChange={(e) => onChange({ ...r, schoolAddress: e.target.value })}
            placeholder="Enter school address"
            rows={2}
            maxLength={255}
          />
        </div>
      </div>
    </div>
  )
}

export default function AcademicStep({ data, onChange, errors }: AcademicStepProps) {
  const currentYear = new Date().getFullYear()
  const [currentTerm, setCurrentTerm] = useState<{ schoolYear: string; semester: Semester } | null>(null)

  useEffect(() => {
    let cancelled = false
    getAcademicTerm()
      .then((term) => {
        if (!cancelled) setCurrentTerm(term)
      })
      .catch(() => {
        // Silently fall back to calendar-year defaults if the setting can't be loaded.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!currentTerm) return
    if (!data.schoolYear) onChange('schoolYear', currentTerm.schoolYear)
    if (!data.semester) onChange('semester', currentTerm.semester)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTerm])

  const schoolYearOptions = Array.from(new Set([
    `${currentYear - 1}-${currentYear}`,
    `${currentYear}-${currentYear + 1}`,
    `${currentYear + 1}-${currentYear + 2}`,
    ...(currentTerm ? [currentTerm.schoolYear] : [])
  ])).sort()

  const academicDetails = data.academicDetails || {
    elementary: { schoolName: '', schoolAddress: '', yearGraduated: '', generalAverage: '', gradesSummary: '', strandOrTrack: '' },
    highSchool: { schoolName: '', schoolAddress: '', yearGraduated: '', generalAverage: '', gradesSummary: '', strandOrTrack: '' },
    seniorHighSchool: { schoolName: '', schoolAddress: '', yearGraduated: '', generalAverage: '', gradesSummary: '', strandOrTrack: '' },
    college: { schoolName: '', schoolAddress: '', yearGraduated: '', generalAverage: '', gradesSummary: '', strandOrTrack: '' }
  }

  const updateAcademicRecord = (level: keyof typeof academicDetails, record: SchoolRecord) => {
    onChange('academicDetails', { ...academicDetails, [level]: record } as any)
  }

  return (
    <div className="wizard-step">
      <div className="wizard-step-header">
        <h2>Academic Information</h2>
        <p>Enter the student's academic history and enrollment details</p>
      </div>

      {/* Academic History */}
      <SchoolRecordCard
        title="Elementary Education"
        record={academicDetails.elementary}
        onChange={(r) => updateAcademicRecord('elementary', r)}
        errors={errors}
        errorPrefix="elem"
      />

      <SchoolRecordCard
        title="Junior High School"
        record={academicDetails.highSchool}
        onChange={(r) => updateAcademicRecord('highSchool', r)}
        errors={errors}
        errorPrefix="hs"
      />

      <SchoolRecordCard
        title="Senior High School"
        record={academicDetails.seniorHighSchool}
        onChange={(r) => updateAcademicRecord('seniorHighSchool', r)}
        errors={errors}
        errorPrefix="shs"
        optional
        showStrand
      />

      <SchoolRecordCard
        title="College"
        record={academicDetails.college}
        onChange={(r) => updateAcademicRecord('college', r)}
        errors={errors}
        errorPrefix="college"
        optional
      />

      {/* Enrollment Details */}
      <div className="form-section">
        <h3>Enrollment Details</h3>
        <div className="wizard-form-grid">
          {/* Applicant Type */}
          <div className="form-group">
            <label htmlFor="applicantType">
              Student Type <span className="required">*</span>
            </label>
            <select
              id="applicantType"
              value={data.applicantType || 'New'}
              onChange={(e) => onChange('applicantType', e.target.value)}
            >
              {APPLICANT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Course */}
          <div className="form-group">
            <label htmlFor="course">
              Course <span className="required">*</span>
            </label>
            <select
              id="course"
              value={data.course || ''}
              onChange={(e) => onChange('course', e.target.value)}
              className={getFieldError('course', errors) ? 'input-error' : ''}
            >
              <option value="">Select course</option>
              {COURSE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.fullLabel}
                </option>
              ))}
            </select>
            {getFieldError('course', errors) && (
              <div className="field-error">{getFieldError('course', errors)}</div>
            )}
          </div>

          {/* School Year */}
          <div className="form-group">
            <label htmlFor="schoolYear">
              School Year <span className="required">*</span>
            </label>
            <select
              id="schoolYear"
              value={data.schoolYear || ''}
              onChange={(e) => onChange('schoolYear', e.target.value)}
              className={getFieldError('schoolYear', errors) ? 'input-error' : ''}
            >
              <option value="">Select school year</option>
              {schoolYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            {getFieldError('schoolYear', errors) && (
              <div className="field-error">{getFieldError('schoolYear', errors)}</div>
            )}
          </div>

          {/* Semester */}
          <div className="form-group">
            <label htmlFor="semester">
              Semester <span className="required">*</span>
            </label>
            <select
              id="semester"
              value={data.semester || ''}
              onChange={(e) => onChange('semester', e.target.value)}
              className={getFieldError('semester', errors) ? 'input-error' : ''}
            >
              <option value="">Select semester</option>
              {SEMESTER_OPTIONS.map((semester) => (
                <option key={semester} value={semester}>
                  {semester}
                </option>
              ))}
            </select>
            {getFieldError('semester', errors) && (
              <div className="field-error">{getFieldError('semester', errors)}</div>
            )}
          </div>

          {/* Year Level */}
          <div className="form-group">
            <label htmlFor="yearLevel">
              Year Level <span className="required">*</span>
            </label>
            <select
              id="yearLevel"
              value={data.yearLevel || ''}
              onChange={(e) => onChange('yearLevel', e.target.value)}
              className={getFieldError('yearLevel', errors) ? 'input-error' : ''}
            >
              <option value="">Select year level</option>
              {YEAR_LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {getFieldError('yearLevel', errors) && (
              <div className="field-error">{getFieldError('yearLevel', errors)}</div>
            )}
          </div>

          {/* Student Status */}
          <div className="form-group">
            <label htmlFor="studentStatus">
              Student Status <span className="required">*</span>
            </label>
            <select
              id="studentStatus"
              value={data.studentStatus || ''}
              onChange={(e) => onChange('studentStatus', e.target.value)}
              className={getFieldError('studentStatus', errors) ? 'input-error' : ''}
            >
              <option value="">Select status</option>
              {STUDENT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {getFieldError('studentStatus', errors) && (
              <div className="field-error">{getFieldError('studentStatus', errors)}</div>
            )}
          </div>

          {/* Lifecycle Status */}
          <div className="form-group">
            <label htmlFor="lifecycleStatus">Lifecycle Status</label>
            <select
              id="lifecycleStatus"
              value={data.lifecycleStatus || 'Pending'}
              onChange={(e) => onChange('lifecycleStatus', e.target.value)}
            >
              {LIFECYCLE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="field-hint">Default: Pending</div>
          </div>

          {/* Scholarship */}
          <div className="form-group form-group--full">
            <label htmlFor="scholarship">Scholarship</label>
            <input
              id="scholarship"
              type="text"
              value={data.scholarship || ''}
              onChange={(e) => onChange('scholarship', e.target.value)}
              placeholder="Enter scholarship name (if applicable)"
            />
          </div>
        </div>
      </div>

      <div className="wizard-note">
        <strong>Note:</strong> Block/Section assignment will be done during the enrollment process.
      </div>
    </div>
  )
}
