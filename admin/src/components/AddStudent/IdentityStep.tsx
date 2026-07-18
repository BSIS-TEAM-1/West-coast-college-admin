import type { WizardFormData, ValidationError } from './types'
import { getFieldError } from './validation'

interface IdentityStepProps {
  data: Partial<WizardFormData>
  onChange: (field: keyof WizardFormData, value: string) => void
  errors: ValidationError[]
}

export default function IdentityStep({
  data,
  onChange,
  errors
}: IdentityStepProps) {
  return (
    <div className="wizard-step">
      <div className="wizard-step-header">
        <h2>Identity Information</h2>
        <p>Enter the student's basic identity details</p>
      </div>

      <div className="wizard-form-grid wizard-form-grid--identity">
        {/* First Name */}
        <div className="form-group">
          <label htmlFor="firstName">
            First Name <span className="required">*</span>
          </label>
          <input
            id="firstName"
            type="text"
            value={data.firstName || ''}
            onChange={(e) => onChange('firstName', e.target.value)}
            placeholder="Enter first name"
            className={getFieldError('firstName', errors) ? 'input-error' : ''}
          />
          {getFieldError('firstName', errors) && (
            <div className="field-error">{getFieldError('firstName', errors)}</div>
          )}
        </div>

        {/* Middle Name */}
        <div className="form-group">
          <label htmlFor="middleName">Middle Name (Optional)</label>
          <input
            id="middleName"
            type="text"
            value={data.middleName || ''}
            onChange={(e) => onChange('middleName', e.target.value)}
            placeholder="Enter middle name"
          />
        </div>

        {/* Last Name */}
        <div className="form-group">
          <label htmlFor="lastName">
            Last Name <span className="required">*</span>
          </label>
          <input
            id="lastName"
            type="text"
            value={data.lastName || ''}
            onChange={(e) => onChange('lastName', e.target.value)}
            placeholder="Enter last name"
            className={getFieldError('lastName', errors) ? 'input-error' : ''}
          />
          {getFieldError('lastName', errors) && (
            <div className="field-error">{getFieldError('lastName', errors)}</div>
          )}
        </div>

        {/* Suffix */}
        <div className="form-group">
          <label htmlFor="suffix">Suffix (Optional)</label>
          <select
            id="suffix"
            value={data.suffix || ''}
            onChange={(e) => onChange('suffix', e.target.value)}
          >
            <option value="">None</option>
            <option value="Jr.">Jr.</option>
            <option value="Sr.">Sr.</option>
            <option value="III">III</option>
            <option value="IV">IV</option>
          </select>
        </div>
      </div>
    </div>
  )
}
