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
import { DEFAULT_WIZARD_FORM_DATA, buildStudentPayloadFromWizardForm } from './formLogic'
import './StudentWizard.css'

interface StudentWizardProps {
  onClose: () => void
  onSuccess?: (studentId: string, studentNumber: string) => void
  mode?: 'create' | 'edit'
  studentId?: string
  initialData?: Partial<WizardFormData>
}

const STEPS: WizardStep[] = ['identity', 'personal', 'contact', 'academic', 'review', 'success']

const STEP_CONFIGS = [
  { id: 'identity', title: 'Basic Information', description: '' },
  { id: 'personal', title: 'Personal Details', description: '' },
  { id: 'contact', title: 'Contact Information', description: '' },
  { id: 'academic', title: 'Academic Details', description: '' },
  { id: 'review', title: 'Review & Submit', description: '' }
]

export default function StudentWizard({ onClose, onSuccess, mode = 'create', studentId, initialData }: StudentWizardProps) {
  const isEditMode = mode === 'edit'
  const [currentStep, setCurrentStep] = useState<WizardStep>('identity')
  const [formData, setFormData] = useState<Partial<WizardFormData>>({
    ...DEFAULT_WIZARD_FORM_DATA,
    ...(initialData || {})
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [createdStudentNumber, setCreatedStudentNumber] = useState('')
  const [studentNumberPreview, setStudentNumberPreview] = useState('')

  // Generate student number preview when course and school year change
  useEffect(() => {
    const course = formData.course
    const schoolYear = formData.schoolYear

    if (!isEditMode && course && schoolYear && /^\d{4}-\d{4}$/.test(schoolYear)) {
      fetchStudentNumberPreview(course, schoolYear)
    } else {
      setStudentNumberPreview('')
    }
  }, [formData.course, formData.schoolYear, isEditMode])

  // Auto-fill student number when preview is available and field is empty
  useEffect(() => {
    if (!isEditMode && studentNumberPreview && !formData.studentNumber) {
      setFormData((prev: Partial<WizardFormData>) => ({ ...prev, studentNumber: studentNumberPreview }))
    }
  }, [isEditMode, studentNumberPreview, formData.studentNumber])

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

      const payload = buildStudentPayloadFromWizardForm(formData)

      if (isEditMode) {
        if (!studentId) {
          throw new Error('Missing student id for update.')
        }

        const response = await StudentService.updateStudent(token, studentId, payload)
        const updatedStudent = (response as any).data || response
        const studentNumber = updatedStudent.studentNumber || formData.studentNumber || ''

        if (onSuccess) {
          onSuccess(studentId, studentNumber)
        }
      } else {
        const response = await StudentService.createStudent(token, payload)
        const createdStudent = (response as any).data || response
        const studentNumber = createdStudent.studentNumber || formData.studentNumber || ''

        setCreatedStudentNumber(studentNumber)
        setCurrentStep('success')

        if (onSuccess && createdStudent._id) {
          onSuccess(createdStudent._id, studentNumber)
        }
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
          <h1>{isEditMode ? 'Edit Student' : 'Add New Student'}</h1>
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
                {submitting ? (isEditMode ? 'Saving Changes...' : 'Creating Student...') : (isEditMode ? 'Save Changes' : 'Create Student')}
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
