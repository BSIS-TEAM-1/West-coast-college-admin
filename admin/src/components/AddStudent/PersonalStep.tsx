import type { WizardFormData, ValidationError } from './types'
import { getFieldError } from './validation'

interface PersonalStepProps {
  data: Partial<WizardFormData>
  onChange: (field: keyof WizardFormData, value: string) => void
  errors: ValidationError[]
}

const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' }
]

const CIVIL_STATUS_OPTIONS = [
  { value: 'Single', label: 'Single' },
  { value: 'Married', label: 'Married' },
  { value: 'Widowed', label: 'Widowed' },
  { value: 'Separated', label: 'Separated' },
  { value: 'Divorced', label: 'Divorced' }
]

const RELIGION_OPTIONS = [
  { value: 'Roman Catholic', label: 'Roman Catholic' },
  { value: 'Islam', label: 'Islam' },
  { value: 'Iglesia ni Cristo', label: 'Iglesia ni Cristo' },
  { value: 'Born Again', label: 'Born Again' },
  { value: 'Protestant', label: 'Protestant' },
  { value: 'Seventh-day Adventist', label: 'Seventh-day Adventist' },
  { value: 'Buddhist', label: 'Buddhist' },
  { value: 'Hindu', label: 'Hindu' },
  { value: 'Other', label: 'Other' },
  { value: 'None', label: 'None' }
]

export default function PersonalStep({ data, onChange, errors }: PersonalStepProps) {
  return (
    <div className="wizard-step">
      <div className="wizard-step-header">
        <h2>Personal Information</h2>
        <p>Enter the student's personal details</p>
      </div>

      <div className="wizard-form-grid">
        {/* Birth Date */}
        <div className="form-group">
          <label htmlFor="birthDate">
            Birth Date <span className="required">*</span>
          </label>
          <input
            id="birthDate"
            type="date"
            value={data.birthDate || ''}
            onChange={(e) => onChange('birthDate', e.target.value)}
            className={getFieldError('birthDate', errors) ? 'input-error' : ''}
          />
          {getFieldError('birthDate', errors) && (
            <div className="field-error">{getFieldError('birthDate', errors)}</div>
          )}
        </div>

        {/* Birth Place */}
        <div className="form-group">
          <label htmlFor="birthPlace">
            Birth Place <span className="required">*</span>
          </label>
          <input
            id="birthPlace"
            type="text"
            value={data.birthPlace || ''}
            onChange={(e) => onChange('birthPlace', e.target.value)}
            placeholder="City/Municipality, Province"
            className={getFieldError('birthPlace', errors) ? 'input-error' : ''}
          />
          {getFieldError('birthPlace', errors) && (
            <div className="field-error">{getFieldError('birthPlace', errors)}</div>
          )}
        </div>

        {/* Gender */}
        <div className="form-group">
          <label htmlFor="gender">
            Gender <span className="required">*</span>
          </label>
          <select
            id="gender"
            value={data.gender || ''}
            onChange={(e) => onChange('gender', e.target.value)}
            className={getFieldError('gender', errors) ? 'input-error' : ''}
          >
            <option value="">Select gender</option>
            {GENDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {getFieldError('gender', errors) && (
            <div className="field-error">{getFieldError('gender', errors)}</div>
          )}
        </div>

        {/* Civil Status */}
        <div className="form-group">
          <label htmlFor="civilStatus">
            Civil Status <span className="required">*</span>
          </label>
          <select
            id="civilStatus"
            value={data.civilStatus || ''}
            onChange={(e) => onChange('civilStatus', e.target.value)}
            className={getFieldError('civilStatus', errors) ? 'input-error' : ''}
          >
            <option value="">Select civil status</option>
            {CIVIL_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {getFieldError('civilStatus', errors) && (
            <div className="field-error">{getFieldError('civilStatus', errors)}</div>
          )}
        </div>

        {/* Nationality */}
        <div className="form-group">
          <label htmlFor="nationality">
            Nationality <span className="required">*</span>
          </label>
          <input
            id="nationality"
            type="text"
            value={data.nationality || 'Filipino'}
            onChange={(e) => onChange('nationality', e.target.value)}
            placeholder="Filipino"
            className={getFieldError('nationality', errors) ? 'input-error' : ''}
          />
          {getFieldError('nationality', errors) && (
            <div className="field-error">{getFieldError('nationality', errors)}</div>
          )}
        </div>

        {/* Religion */}
        <div className="form-group">
          <label htmlFor="religion">Religion</label>
          <select
            id="religion"
            value={data.religion || ''}
            onChange={(e) => onChange('religion', e.target.value)}
          >
            <option value="">Select religion</option>
            {RELIGION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
