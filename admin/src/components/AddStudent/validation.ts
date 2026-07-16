import type { WizardFormData, ValidationError } from './types'

export const validateStep = (step: string, data: Partial<WizardFormData>): ValidationError[] => {
  const errors: ValidationError[] = []

  switch (step) {
    case 'identity':
      if (!data.firstName?.trim()) {
        errors.push({ field: 'firstName', message: 'First name is required' })
      }
      if (!data.lastName?.trim()) {
        errors.push({ field: 'lastName', message: 'Last name is required' })
      }
      // Student number is auto-generated, not validated in Step 1
      break

    case 'personal':
      if (!data.birthDate) {
        errors.push({ field: 'birthDate', message: 'Birth date is required' })
      }
      if (!data.birthPlace?.trim()) {
        errors.push({ field: 'birthPlace', message: 'Birth place is required' })
      }
      if (!data.gender?.trim()) {
        errors.push({ field: 'gender', message: 'Gender is required' })
      }
      if (!data.civilStatus?.trim()) {
        errors.push({ field: 'civilStatus', message: 'Civil status is required' })
      }
      if (!data.nationality?.trim()) {
        errors.push({ field: 'nationality', message: 'Nationality is required' })
      }
      break

    case 'contact':
      if (!data.email?.trim()) {
        errors.push({ field: 'email', message: 'Email is required' })
      } else if (!isValidEmail(data.email)) {
        errors.push({ field: 'email', message: 'Please enter a valid email address' })
      }
      if (!data.contactNumber?.trim()) {
        errors.push({ field: 'contactNumber', message: 'Contact number is required' })
      } else if (!isValidPhoneNumber(data.contactNumber)) {
        errors.push({ field: 'contactNumber', message: 'Please enter a valid phone number' })
      }
      if (!data.currentAddress?.trim()) {
        errors.push({ field: 'currentAddress', message: 'Current address is required' })
      }
      if (!data.emergencyContactName?.trim()) {
        errors.push({ field: 'emergencyContactName', message: 'Emergency contact name is required' })
      }
      if (!data.emergencyContactRelationship?.trim()) {
        errors.push({ field: 'emergencyContactRelationship', message: 'Emergency contact relationship is required' })
      }
      if (!data.emergencyContactNumber?.trim()) {
        errors.push({ field: 'emergencyContactNumber', message: 'Emergency contact number is required' })
      }
      break

    case 'academic':
      if (!data.course?.trim()) {
        errors.push({ field: 'course', message: 'Course is required' })
      }
      if (!data.schoolYear?.trim()) {
        errors.push({ field: 'schoolYear', message: 'School year is required' })
      }
      if (!data.semester?.trim()) {
        errors.push({ field: 'semester', message: 'Semester is required' })
      }
      if (!data.yearLevel?.trim()) {
        errors.push({ field: 'yearLevel', message: 'Year level is required' })
      }
      if (!data.studentStatus?.trim()) {
        errors.push({ field: 'studentStatus', message: 'Student status is required' })
      }
      break

    case 'review':
      // Review step validates all fields including student number
      const allErrors = [
        ...validateStep('identity', data),
        ...validateStep('personal', data),
        ...validateStep('contact', data),
        ...validateStep('academic', data)
      ]
      // Add student number validation only in review step
      if (!data.studentNumber?.trim()) {
        errors.push({ field: 'studentNumber', message: 'Student number is required' })
      }
      errors.push(...allErrors)
      break
  }

  return errors
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function isValidPhoneNumber(phone: string): boolean {
  // Accept Philippine phone formats: 09XX-XXX-XXXX, 09XXXXXXXXX, +63 9XX XXX XXXX
  const phoneRegex = /^(\+63\s?|0)9\d{2}[-.\s]?\d{3}[-.\s]?\d{4}$/
  return phoneRegex.test(phone.replace(/[\s-]/g, ''))
}

export const getStepErrors = (step: string, data: Partial<WizardFormData>): ValidationError[] => {
  return validateStep(step, data)
}

export const hasStepErrors = (step: string, data: Partial<WizardFormData>): boolean => {
  return validateStep(step, data).length > 0
}

export const getFieldError = (field: string, errors: ValidationError[]): string | undefined => {
  return errors.find(e => e.field === field)?.message
}
