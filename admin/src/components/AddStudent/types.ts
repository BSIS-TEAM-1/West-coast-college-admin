export type WizardStep = 'identity' | 'personal' | 'contact' | 'academic' | 'review' | 'success'

export type StudentStatus = 'Regular' | 'Irregular'
export type LifecycleStatus = 'Pending' | 'Enrolled' | 'Not Enrolled' | 'Dropped' | 'Inactive' | 'Graduated'
export type Semester = '1st' | '2nd' | 'Summer'

export interface WizardFormData {
  // Step 1 - Identity
  studentNumber: string
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  
  // Step 2 - Personal Information
  birthDate: string
  birthPlace: string
  gender: string
  civilStatus: string
  nationality: string
  religion: string
  
  // Step 3 - Contact Information
  email: string
  contactNumber: string
  currentAddress: string
  permanentAddress: string
  emergencyContactName: string
  emergencyContactRelationship: string
  emergencyContactNumber: string
  
  // Step 4 - Academic Information
  course: string
  schoolYear: string
  semester: Semester
  yearLevel: string
  studentStatus: StudentStatus
  scholarship: string
  lifecycleStatus: LifecycleStatus
}

export interface ValidationError {
  field: string
  message: string
}

export interface WizardStepConfig {
  id: WizardStep
  title: string
  description: string
  isComplete: boolean
  isValid: boolean
}
