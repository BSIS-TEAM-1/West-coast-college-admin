import type { WizardFormData } from './types'

interface ReviewStepProps {
  data: Partial<WizardFormData>
  onEditStep: (step: string) => void
}

const COURSE_LABELS: Record<string, string> = {
  '101': 'BEED',
  '102': 'BSEd-English',
  '103': 'BSEd-Math',
  '201': 'BSBA-HRM'
}

export default function ReviewStep({ data, onEditStep }: ReviewStepProps) {
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const sections = [
    {
      id: 'identity',
      title: 'Identity Information',
      onEdit: () => onEditStep('identity'),
      fields: [
        { label: 'Student Number', value: data.studentNumber || 'N/A' },
        { label: 'First Name', value: data.firstName || 'N/A' },
        { label: 'Middle Name', value: data.middleName || 'N/A' },
        { label: 'Last Name', value: data.lastName || 'N/A' },
        { label: 'Suffix', value: data.suffix || 'N/A' }
      ]
    },
    {
      id: 'personal',
      title: 'Personal Information',
      onEdit: () => onEditStep('personal'),
      fields: [
        { label: 'Birth Date', value: formatDate(data.birthDate || '') },
        { label: 'Birth Place', value: data.birthPlace || 'N/A' },
        { label: 'Gender', value: data.gender || 'N/A' },
        { label: 'Civil Status', value: data.civilStatus || 'N/A' },
        { label: 'Nationality', value: data.nationality || 'N/A' },
        { label: 'Religion', value: data.religion || 'N/A' }
      ]
    },
    {
      id: 'contact',
      title: 'Contact Information',
      onEdit: () => onEditStep('contact'),
      fields: [
        { label: 'Email', value: data.email || 'N/A' },
        { label: 'Contact Number', value: data.contactNumber || 'N/A' },
        { label: 'Current Address', value: data.currentAddress || 'N/A' },
        { label: 'Permanent Address', value: data.permanentAddress || 'N/A' },
        { label: 'Emergency Contact Name', value: data.emergencyContactName || 'N/A' },
        { label: 'Emergency Contact Relationship', value: data.emergencyContactRelationship || 'N/A' },
        { label: 'Emergency Contact Number', value: data.emergencyContactNumber || 'N/A' }
      ]
    },
    {
      id: 'academic',
      title: 'Academic Information',
      onEdit: () => onEditStep('academic'),
      fields: [
        { label: 'Course', value: COURSE_LABELS[data.course || ''] || data.course || 'N/A' },
        { label: 'School Year', value: data.schoolYear || 'N/A' },
        { label: 'Semester', value: data.semester || 'N/A' },
        { label: 'Year Level', value: data.yearLevel || 'N/A' },
        { label: 'Student Status', value: data.studentStatus || 'N/A' },
        { label: 'Lifecycle Status', value: data.lifecycleStatus || 'Pending' },
        { label: 'Scholarship', value: data.scholarship || 'N/A' }
      ]
    }
  ]

  return (
    <div className="wizard-step">
      <div className="wizard-step-header">
        <h2>Review Information</h2>
        <p>Please review all information before submitting</p>
      </div>

      <div className="review-sections">
        {sections.map((section) => (
          <div key={section.id} className="review-section">
            <div className="review-section-header">
              <h3>{section.title}</h3>
              <button
                type="button"
                onClick={section.onEdit}
                className="btn-text"
              >
                Edit
              </button>
            </div>
            <div className="review-fields">
              {section.fields.map((field, index) => (
                <div key={index} className="review-field">
                  <span className="review-field-label">{field.label}</span>
                  <span className="review-field-value">{field.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
