import type { WizardFormData, ValidationError } from './types'
import { getFieldError } from './validation'

interface ContactStepProps {
  data: Partial<WizardFormData>
  onChange: (field: keyof WizardFormData, value: string) => void
  errors: ValidationError[]
}

export default function ContactStep({ data, onChange, errors }: ContactStepProps) {
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
            Email Address <span className="required">*</span>
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
            placeholder="09XX-XXX-XXXX"
            className={getFieldError('contactNumber', errors) ? 'input-error' : ''}
          />
          {getFieldError('contactNumber', errors) && (
            <div className="field-error">{getFieldError('contactNumber', errors)}</div>
          )}
        </div>

        {/* Current Address */}
        <div className="form-group form-group--full">
          <label htmlFor="currentAddress">
            Current Address <span className="required">*</span>
          </label>
          <textarea
            id="currentAddress"
            value={data.currentAddress || ''}
            onChange={(e) => onChange('currentAddress', e.target.value)}
            placeholder="Enter complete current address"
            rows={3}
            className={getFieldError('currentAddress', errors) ? 'input-error' : ''}
          />
          {getFieldError('currentAddress', errors) && (
            <div className="field-error">{getFieldError('currentAddress', errors)}</div>
          )}
        </div>

        {/* Permanent Address */}
        <div className="form-group form-group--full">
          <label htmlFor="permanentAddress">Permanent Address</label>
          <textarea
            id="permanentAddress"
            value={data.permanentAddress || ''}
            onChange={(e) => onChange('permanentAddress', e.target.value)}
            placeholder="Enter permanent address (if different from current)"
            rows={3}
          />
        </div>

        {/* Emergency Contact Section */}
        <div className="form-section">
          <h3>Emergency Contact</h3>
          
          <div className="form-group">
            <label htmlFor="emergencyContactName">
              Contact Name <span className="required">*</span>
            </label>
            <input
              id="emergencyContactName"
              type="text"
              value={data.emergencyContactName || ''}
              onChange={(e) => onChange('emergencyContactName', e.target.value)}
              placeholder="Full name of emergency contact"
              className={getFieldError('emergencyContactName', errors) ? 'input-error' : ''}
            />
            {getFieldError('emergencyContactName', errors) && (
              <div className="field-error">{getFieldError('emergencyContactName', errors)}</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="emergencyContactRelationship">
              Relationship <span className="required">*</span>
            </label>
            <input
              id="emergencyContactRelationship"
              type="text"
              value={data.emergencyContactRelationship || ''}
              onChange={(e) => onChange('emergencyContactRelationship', e.target.value)}
              placeholder="e.g., Parent, Spouse, Sibling"
              className={getFieldError('emergencyContactRelationship', errors) ? 'input-error' : ''}
            />
            {getFieldError('emergencyContactRelationship', errors) && (
              <div className="field-error">{getFieldError('emergencyContactRelationship', errors)}</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="emergencyContactNumber">
              Contact Number <span className="required">*</span>
            </label>
            <input
              id="emergencyContactNumber"
              type="tel"
              value={data.emergencyContactNumber || ''}
              onChange={(e) => onChange('emergencyContactNumber', e.target.value)}
              placeholder="09XX-XXX-XXXX"
              className={getFieldError('emergencyContactNumber', errors) ? 'input-error' : ''}
            />
            {getFieldError('emergencyContactNumber', errors) && (
              <div className="field-error">{getFieldError('emergencyContactNumber', errors)}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
