import type { WizardFormData, ValidationError, Semester } from './types'
import { getFieldError } from './validation'

interface AcademicStepProps {
  data: Partial<WizardFormData>
  onChange: (field: keyof WizardFormData, value: string) => void
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

export default function AcademicStep({ data, onChange, errors }: AcademicStepProps) {
  const currentYear = new Date().getFullYear()
  const schoolYearOptions = [
    `${currentYear - 1}-${currentYear}`,
    `${currentYear}-${currentYear + 1}`,
    `${currentYear + 1}-${currentYear + 2}`
  ]

  return (
    <div className="wizard-step">
      <div className="wizard-step-header">
        <h2>Academic Information</h2>
        <p>Enter the student's academic details</p>
      </div>

      <div className="wizard-form-grid">
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

      <div className="wizard-note">
        <strong>Note:</strong> Block/Section assignment will be done during the enrollment process.
      </div>
    </div>
  )
}
