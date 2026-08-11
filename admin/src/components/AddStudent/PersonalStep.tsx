import LocationSelector from '../LocationSelector'
import type { WizardFormData, ValidationError, LocationData } from './types'
import { getFieldError } from './validation'

interface PersonalStepProps {
  data: Partial<WizardFormData>
  onChange: (field: keyof WizardFormData, value: string | LocationData) => void
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

      {/* Current Address */}
      <div className="form-section">
        <h3>Current Address</h3>
        <div className="form-group">
          <label htmlFor="currentStreet">
            Street / House no. <span className="required">*</span>
          </label>
          <input
            id="currentStreet"
            type="text"
            value={data.currentLocation?.streetAddress || ''}
            onChange={(e) => onChange('currentLocation', { ...data.currentLocation!, streetAddress: e.target.value } as LocationData)}
            placeholder="Enter street / house no."
            className={getFieldError('currentStreet', errors) ? 'input-error' : ''}
            maxLength={255}
          />
          {getFieldError('currentStreet', errors) && (
            <div className="field-error">{getFieldError('currentStreet', errors)}</div>
          )}
        </div>
        <LocationSelector
          value={data.currentLocation || {}}
          onChange={(value) => onChange('currentLocation', { ...data.currentLocation, ...value, streetAddress: data.currentLocation?.streetAddress || '' } as LocationData)}
          labels={{ region: 'Region', province: 'Province', city: 'City / Municipality', barangay: 'Barangay' }}
        />
      </div>

      {/* Permanent Address */}
      <div className="form-section">
        <h3>Permanent Address</h3>
        <div className="form-group">
          <label htmlFor="permanentStreet">Permanent Street / House no.</label>
          <input
            id="permanentStreet"
            type="text"
            value={data.permanentLocation?.streetAddress || ''}
            onChange={(e) => onChange('permanentLocation', { ...data.permanentLocation!, streetAddress: e.target.value } as LocationData)}
            placeholder="Enter permanent street / house no."
            maxLength={255}
          />
        </div>
        <LocationSelector
          value={data.permanentLocation || {}}
          onChange={(value) => onChange('permanentLocation', { ...data.permanentLocation, ...value, streetAddress: data.permanentLocation?.streetAddress || '' } as LocationData)}
          labels={{ region: 'Permanent Region', province: 'Permanent Province', city: 'Permanent City / Municipality', barangay: 'Permanent Barangay' }}
        />
      </div>

      {/* Family & Emergency Contacts */}
      <div className="form-section">
        <h3>Family &amp; Emergency Contacts</h3>
        <div className="wizard-form-grid">
          {/* Mother's Name */}
          <div className="form-group">
            <label htmlFor="motherName">Mother's Name</label>
            <input
              id="motherName"
              type="text"
              value={data.motherName || ''}
              onChange={(e) => onChange('motherName', e.target.value)}
              placeholder="Enter mother's full name"
            />
          </div>

          {/* Father's Name */}
          <div className="form-group">
            <label htmlFor="fatherName">Father's Name</label>
            <input
              id="fatherName"
              type="text"
              value={data.fatherName || ''}
              onChange={(e) => onChange('fatherName', e.target.value)}
              placeholder="Enter father's full name"
            />
          </div>

          {/* Guardian Name */}
          <div className="form-group">
            <label htmlFor="guardianName">Guardian Name</label>
            <input
              id="guardianName"
              type="text"
              value={data.guardianName || ''}
              onChange={(e) => onChange('guardianName', e.target.value)}
              placeholder="Enter guardian's full name"
            />
          </div>

          {/* Guardian Relationship */}
          <div className="form-group">
            <label htmlFor="guardianRelationship">Guardian Relationship</label>
            <input
              id="guardianRelationship"
              type="text"
              value={data.guardianRelationship || ''}
              onChange={(e) => onChange('guardianRelationship', e.target.value)}
              placeholder="e.g., Parent, Aunt, Uncle"
            />
          </div>

          {/* Guardian Contact Number */}
          <div className="form-group">
            <label htmlFor="guardianContactNumber">Parent / Guardian Contact Number</label>
            <input
              id="guardianContactNumber"
              type="tel"
              value={data.guardianContactNumber || ''}
              onChange={(e) => onChange('guardianContactNumber', e.target.value)}
              placeholder="09171234567"
              maxLength={13}
              className={getFieldError('guardianContactNumber', errors) ? 'input-error' : ''}
            />
            {getFieldError('guardianContactNumber', errors) && (
              <div className="field-error">{getFieldError('guardianContactNumber', errors)}</div>
            )}
          </div>
        </div>

        <div className="wizard-form-grid" style={{ marginTop: '1rem' }}>
          {/* Emergency Contact Name */}
          <div className="form-group">
            <label htmlFor="emergencyContactName">
              Emergency Contact Name <span className="required">*</span>
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

          {/* Emergency Contact Relationship */}
          <div className="form-group">
            <label htmlFor="emergencyContactRelationship">
              Emergency Contact Relationship <span className="required">*</span>
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

          {/* Emergency Contact Number */}
          <div className="form-group">
            <label htmlFor="emergencyContactNumber">
              Emergency Contact Number <span className="required">*</span>
            </label>
            <input
              id="emergencyContactNumber"
              type="tel"
              value={data.emergencyContactNumber || ''}
              onChange={(e) => onChange('emergencyContactNumber', e.target.value)}
              placeholder="09171234567"
              maxLength={13}
              className={getFieldError('emergencyContactNumber', errors) ? 'input-error' : ''}
            />
            {getFieldError('emergencyContactNumber', errors) && (
              <div className="field-error">{getFieldError('emergencyContactNumber', errors)}</div>
            )}
          </div>

          {/* Emergency Contact Address */}
          <div className="form-group form-group--full">
            <label htmlFor="emergencyContactAddress">Emergency Contact Address</label>
            <textarea
              id="emergencyContactAddress"
              value={data.emergencyContactAddress || ''}
              onChange={(e) => onChange('emergencyContactAddress', e.target.value)}
              placeholder="Enter emergency contact address (optional)"
              rows={2}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
