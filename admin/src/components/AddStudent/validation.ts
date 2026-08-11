import type { WizardFormData, ValidationError } from './types'

const PHONE_RE = /^(09|\+639)\d{9}$/
const YEAR_RE = /^\d{4}$/
const GPA_MIN = 60
const GPA_MAX = 100

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email.trim())
}

function isValidPhone(value: string): boolean {
  const v = value.trim()
  const digits = v.replace(/[^0-9]/g, '')
  if (PHONE_RE.test(v)) return true
  if (digits.length === 11 && digits.startsWith('09')) return true
  if (digits.length === 13 && digits.startsWith('639')) return true
  return false
}

function isValidGpa(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  const num = parseFloat(v)
  return !isNaN(num) && num >= GPA_MIN && num <= GPA_MAX
}

export const validateStep = (step: string, data: Partial<WizardFormData>, mode: 'create' | 'edit' = 'create'): ValidationError[] => {
  const errors: ValidationError[] = []

  switch (step) {
    case 'identity':
      if (!data.firstName?.trim()) {
        errors.push({ field: 'firstName', message: 'First name is required' })
      }
      if (!data.lastName?.trim()) {
        errors.push({ field: 'lastName', message: 'Last name is required' })
      }
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
      // Current address — street is required
      if (!data.currentLocation?.streetAddress?.trim()) {
        errors.push({ field: 'currentStreet', message: 'Street / House no. is required' })
      }
      // Guardian contact number (if provided, must be valid)
      if (data.guardianContactNumber?.trim() && !isValidPhone(data.guardianContactNumber)) {
        errors.push({ field: 'guardianContactNumber', message: 'Guardian contact number must be a valid Philippine mobile number' })
      }
      // Emergency contact
      if (!data.emergencyContactName?.trim()) {
        errors.push({ field: 'emergencyContactName', message: 'Emergency contact name is required' })
      }
      if (!data.emergencyContactRelationship?.trim()) {
        errors.push({ field: 'emergencyContactRelationship', message: 'Emergency contact relationship is required' })
      }
      if (!data.emergencyContactNumber?.trim()) {
        errors.push({ field: 'emergencyContactNumber', message: 'Emergency contact number is required' })
      } else if (!isValidPhone(data.emergencyContactNumber)) {
        errors.push({ field: 'emergencyContactNumber', message: 'Emergency contact number must be a valid Philippine mobile number' })
      }
      break

    case 'contact':
      if (!data.email?.trim()) {
        if (mode !== 'edit') {
          errors.push({ field: 'email', message: 'Email is required' })
        }
      } else if (!isValidEmail(data.email)) {
        errors.push({ field: 'email', message: 'Please enter a valid email address' })
      }
      if (!data.contactNumber?.trim()) {
        errors.push({ field: 'contactNumber', message: 'Contact number is required' })
      } else if (!isValidPhone(data.contactNumber)) {
        errors.push({ field: 'contactNumber', message: 'Contact number must be a valid Philippine mobile number' })
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
      // Academic history validation (elementary + high school required)
      const elem = data.academicDetails?.elementary
      if (elem?.schoolName?.trim() && !YEAR_RE.test(elem.yearGraduated?.trim() || '')) {
        errors.push({ field: 'elemYear', message: 'Elementary year graduated must be a 4-digit year' })
      }
      if (elem?.generalAverage?.trim() && !isValidGpa(elem.generalAverage)) {
        errors.push({ field: 'elemGpa', message: `Elementary general average must be between ${GPA_MIN} and ${GPA_MAX}` })
      }
      const hs = data.academicDetails?.highSchool
      if (hs?.schoolName?.trim() && !YEAR_RE.test(hs.yearGraduated?.trim() || '')) {
        errors.push({ field: 'hsYear', message: 'High school year graduated must be a 4-digit year' })
      }
      if (hs?.generalAverage?.trim() && !isValidGpa(hs.generalAverage)) {
        errors.push({ field: 'hsGpa', message: `High school general average must be between ${GPA_MIN} and ${GPA_MAX}` })
      }
      const shs = data.academicDetails?.seniorHighSchool
      if (shs?.schoolName?.trim()) {
        if (shs.yearGraduated?.trim() && !YEAR_RE.test(shs.yearGraduated.trim())) {
          errors.push({ field: 'shsYear', message: 'Senior high school year graduated must be a 4-digit year' })
        }
        if (shs.generalAverage?.trim() && !isValidGpa(shs.generalAverage)) {
          errors.push({ field: 'shsGpa', message: `Senior high school general average must be between ${GPA_MIN} and ${GPA_MAX}` })
        }
      }
      const college = data.academicDetails?.college
      if (college?.schoolName?.trim()) {
        if (college.yearGraduated?.trim() && !YEAR_RE.test(college.yearGraduated.trim())) {
          errors.push({ field: 'collegeYear', message: 'College year graduated must be a 4-digit year' })
        }
        if (college.generalAverage?.trim() && !isValidGpa(college.generalAverage)) {
          errors.push({ field: 'collegeGpa', message: `College general average must be between ${GPA_MIN} and ${GPA_MAX}` })
        }
      }
      break

    case 'review':
      const allErrors = [
        ...validateStep('identity', data, mode),
        ...validateStep('personal', data, mode),
        ...validateStep('contact', data, mode),
        ...validateStep('academic', data, mode)
      ]
      if (!data.studentNumber?.trim()) {
        errors.push({ field: 'studentNumber', message: 'Student number is required' })
      }
      errors.push(...allErrors)
      break
  }

  return errors
}

export const getStepErrors = (step: string, data: Partial<WizardFormData>, mode: 'create' | 'edit' = 'create'): ValidationError[] => {
  return validateStep(step, data, mode)
}

export const hasStepErrors = (step: string, data: Partial<WizardFormData>, mode: 'create' | 'edit' = 'create'): boolean => {
  return validateStep(step, data, mode).length > 0
}

export const getFieldError = (field: string, errors: ValidationError[]): string | undefined => {
  return errors.find(e => e.field === field)?.message
}
