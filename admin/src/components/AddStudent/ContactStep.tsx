import type { WizardFormData, ValidationError } from './types'
import { getFieldError } from './validation'

interface ContactStepProps {
  data: Partial<WizardFormData>
  onChange: (field: keyof WizardFormData, value: string) => void
  errors: ValidationError[]
  isEditMode?: boolean
}

export default function ContactStep({ data, onChange, errors, isEditMode = false }: ContactStepProps) {
  return (
    <div className="wizard-step">
      <div className="wizard-step-header">
        <h2>Contact Information</h2>
        <p>Enter the student's contact details</p>
      </div>

      <div className="wizard-form-grid">
        {/* Email */}
        <div className="form-group form-group--full">
          <label htmlFor="email">
            Email Address {isEditMode ? <span className="field-hint">(optional &mdash; set by the student)</span> : <span className="required">*</span>}
          </label>
          <input
            id="email"
            type="email"
            value={data.email || ''}
            onChange={(e) => onChange('email', e.target.value)}
            placeholder="student@example.com"
            className={getFieldError('email', errors) ? 'input-error' : ''}
          />
          {getFieldError('email', errors) && (
            <div className="field-error">{getFieldError('email', errors)}</div>
          )}
        </div>

        {/* Contact Number */}
        <div className="form-group">
          <label htmlFor="contactNumber">
            Contact Number <span className="required">*</span>
          </label>
          <input
            id="contactNumber"
            type="tel"
            value={data.contactNumber || ''}
            onChange={(e) => onChange('contactNumber', e.target.value)}
            placeholder="09171234567"
            maxLength={13}
            className={getFieldError('contactNumber', errors) ? 'input-error' : ''}
          />
          {getFieldError('contactNumber', errors) && (
            <div className="field-error">{getFieldError('contactNumber', errors)}</div>
          )}
        </div>
      </div>

      <div className="wizard-note">
        <strong>Note:</strong> Address and emergency contact information are collected in the Personal Information step.
      </div>
    </div>
  )
}
