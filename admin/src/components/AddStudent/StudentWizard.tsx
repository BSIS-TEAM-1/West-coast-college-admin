import { useState, useEffect } from 'react'
import type { WizardFormData, WizardStep } from './types'
import { validateStep, getStepErrors } from './validation'
import IdentityStep from './IdentityStep'
import PersonalStep from './PersonalStep'
import ContactStep from './ContactStep'
import AcademicStep from './AcademicStep'
import ReviewStep from './ReviewStep'
import SuccessStep from './SuccessStep'
import { API_URL, getStoredToken } from '../../lib/authApi'
import StudentService from '../../lib/studentApi'
import './StudentWizard.css'

interface StudentWizardProps {
  onClose: () => void
  onSuccess?: (studentId: string, studentNumber: string) => void
}

const STEPS: WizardStep[] = ['identity', 'personal', 'contact', 'academic', 'review', 'success']

const STEP_CONFIGS = [
  { id: 'identity', title: 'Basic Information', description: '' },
  { id: 'personal', title: 'Personal Details', description: '' },
  { id: 'contact', title: 'Contact Information', description: '' },
  { id: 'academic', title: 'Academic Details', description: '' },
  { id: 'review', title: 'Review & Submit', description: '' }
]

const DEFAULT_FORM_DATA: Partial<WizardFormData> = {
  studentNumber: '',
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  birthDate: '',
  birthPlace: '',
  gender: '',
  civilStatus: '',
  nationality: 'Filipino',
  religion: '',
  email: '',
  contactNumber: '',
  currentAddress: '',
  permanentAddress: '',
  emergencyContactName: '',
  emergencyContactRelationship: '',
  emergencyContactNumber: '',
  course: '',
  schoolYear: '',
  semester: '1st',
  yearLevel: '',
  studentStatus: 'Regular',
  scholarship: '',
  lifecycleStatus: 'Pending'
}

export default function StudentWizard({ onClose, onSuccess }: StudentWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('identity')
  const [formData, setFormData] = useState<Partial<WizardFormData>>(DEFAULT_FORM_DATA)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [createdStudentNumber, setCreatedStudentNumber] = useState('')
  const [studentNumberPreview, setStudentNumberPreview] = useState('')

  // Generate student number preview when course and school year change
  useEffect(() => {
    const course = formData.course
    const schoolYear = formData.schoolYear

    if (course && schoolYear && /^\d{4}-\d{4}$/.test(schoolYear)) {
      fetchStudentNumberPreview(course, schoolYear)
    } else {
      setStudentNumberPreview('')
    }
  }, [formData.course, formData.schoolYear])

  // Auto-fill student number when preview is available and field is empty
  useEffect(() => {
    if (studentNumberPreview && !formData.studentNumber) {
      setFormData((prev: Partial<WizardFormData>) => ({ ...prev, studentNumber: studentNumberPreview }))
    }
  }, [studentNumberPreview, formData.studentNumber])

  const fetchStudentNumberPreview = async (course: string, schoolYear: string) => {
    try {
      const token = await getStoredToken()
      if (!token) return

      const query = new URLSearchParams({
        course: String(Number(course) || ''),
        schoolYear: String(schoolYear || '').trim()
      })

      const response = await fetch(`${API_URL}/registrar/students/next-number?${query.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const payload = await response.json()
        const nextNumber = String(payload?.data?.studentNumber || '').trim()
        setStudentNumberPreview(nextNumber)
      }
    } catch (error) {
      console.error('Failed to fetch student number preview:', error)
    }
  }

  const handleChange = (field: keyof WizardFormData, value: string) => {
    setFormData((prev: Partial<WizardFormData>) => ({ ...prev, [field]: value }))
  }

  const handleNext = () => {
    // Only validate when user clicks Next
    const stepErrors = validateStep(currentStep, formData)
    if (stepErrors.length > 0) {
      return
    }

    const currentIndex = STEPS.indexOf(currentStep)
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1])
    }
  }

  const handleBack = () => {
    const currentIndex = STEPS.indexOf(currentStep)
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1])
    }
  }

  const handleEditStep = (step: string) => {
    setCurrentStep(step as WizardStep)
  }

  const handleSubmit = async () => {
    const allErrors = validateStep('review', formData)
    if (allErrors.length > 0) {
      return
    }

    setSubmitting(true)
    setSubmitError('')

    try {
      const token = await getStoredToken()
      if (!token) {
        console.error('No authentication token found in localStorage')
        throw new Error('No authentication token found. Please log in again.')
      }

      console.log('Token found, length:', token.length)

      const emergencyContact = {
        name: formData.emergencyContactName?.trim() || '',
        relationship: formData.emergencyContactRelationship?.trim() || '',
        contactNumber: formData.emergencyContactNumber?.trim() || '',
        address: ''
      }

      const payload = {
        firstName: formData.firstName?.trim() || '',
        middleName: formData.middleName?.trim() || '',
        lastName: formData.lastName?.trim() || '',
        suffix: formData.suffix?.trim() || '',
        course: Number(formData.course) || 101,
        yearLevel: Number(formData.yearLevel) || 1,
        semester: formData.semester || '1st',
        schoolYear: formData.schoolYear?.trim() || '',
        studentStatus: formData.studentStatus?.trim() || 'Regular',
        lifecycleStatus: formData.lifecycleStatus || 'Pending',
        scholarship: formData.scholarship?.trim() || 'N/A',
        email: formData.email?.trim() || '',
        contactNumber: formData.contactNumber?.trim() || '',
        address: formData.currentAddress?.trim() || '',
        permanentAddress: formData.permanentAddress?.trim() || '',
        birthDate: formData.birthDate || undefined,
        birthPlace: formData.birthPlace?.trim() || '',
        gender: formData.gender?.trim() || '',
        civilStatus: formData.civilStatus?.trim() || '',
        nationality: formData.nationality?.trim() || 'Filipino',
        religion: formData.religion?.trim() || '',
        emergencyContact
      }

      console.log('Creating student with payload:', payload)

      const response = await StudentService.createStudent(token, payload)
      const createdStudent = (response as any).data || response
      const studentNumber = createdStudent.studentNumber || formData.studentNumber || ''

      setCreatedStudentNumber(studentNumber)
      setCurrentStep('success')

      if (onSuccess && createdStudent._id) {
        onSuccess(createdStudent._id, studentNumber)
      }
    } catch (error) {
      console.error('Failed to create student:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create student record'
      console.error('Error message:', errorMessage)
      setSubmitError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const getCurrentStepErrors = () => {
    if (currentStep === 'success') return []
    return getStepErrors(currentStep, formData)
  }

  const canProceed = () => {
    if (currentStep === 'success') return false
    return getCurrentStepErrors().length === 0
  }

  const getStepIndex = () => {
    return STEPS.indexOf(currentStep)
  }

  const isLastStep = () => {
    return currentStep === 'review'
  }

  const renderStep = () => {
    const stepErrors = getCurrentStepErrors()

    switch (currentStep) {
      case 'identity':
        return (
          <IdentityStep
            data={formData}
            onChange={handleChange}
            errors={stepErrors}
          />
        )
      case 'personal':
        return (
          <PersonalStep
            data={formData}
            onChange={handleChange}
            errors={stepErrors}
          />
        )
      case 'contact':
        return (
          <ContactStep
            data={formData}
            onChange={handleChange}
            errors={stepErrors}
          />
        )
      case 'academic':
        return (
          <AcademicStep
            data={formData}
            onChange={handleChange}
            errors={stepErrors}
          />
        )
      case 'review':
        return (
          <ReviewStep
            data={formData}
            onEditStep={handleEditStep}
          />
        )
      case 'success':
        return (
          <SuccessStep
            data={formData}
            studentNumber={createdStudentNumber}
            onReturnToDirectory={onClose}
          />
        )
      default:
        return null
    }
  }

  if (currentStep === 'success') {
    return (
      <div className="student-wizard-page">
        <div className="student-wizard-container">
          <div className="wizard-content">
            {renderStep()}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="student-wizard-page">
      <div className="student-wizard-container">
        <div className="wizard-header">
          <h1>Add New Student</h1>
          <button
            type="button"
            onClick={onClose}
            className="wizard-close"
            aria-label="Close wizard"
          >
            ×
          </button>
        </div>

        {/* Progress Indicator */}
        <div className="wizard-progress">
          {STEP_CONFIGS.map((config, index) => (
            <div
              key={config.id}
              className={`progress-step ${index <= getStepIndex() ? 'active' : ''} ${index < getStepIndex() ? 'completed' : ''}`}
            >
              <div className="progress-step-number">{index + 1}</div>
              <div className="progress-step-label">
                <span className="progress-step-title">{config.title}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="wizard-content">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="wizard-footer">
          {submitError && (
            <div className="wizard-error">{submitError}</div>
          )}
          <div className="wizard-actions">
            {getStepIndex() > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="btn-secondary"
              >
                Back
              </button>
            )}
            {isLastStep() ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canProceed() || submitting}
                className="btn-primary"
              >
                {submitting ? 'Creating Student...' : 'Create Student'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceed()}
                className="btn-primary"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
