export type WizardStep = 'identity' | 'personal' | 'contact' | 'academic' | 'review' | 'success'

export type StudentStatus = 'Regular' | 'Irregular'
export type LifecycleStatus = 'Pending' | 'Enrolled' | 'Not Enrolled' | 'Dropped' | 'Inactive' | 'Graduated'
export type Semester = '1st' | '2nd' | 'Summer'
export type ApplicantType = 'New' | 'Transferee' | 'Returnee'

export interface LocationData {
  regionCode: string
  regionName: string
  provinceCode: string
  provinceName: string
  cityCode: string
  cityName: string
  barangayCode: string
  barangayName: string
  streetAddress: string
}

export interface SchoolRecord {
  schoolName: string
  schoolAddress: string
  yearGraduated: string
  generalAverage: string
  gradesSummary: string
  strandOrTrack: string
}

export interface AcademicDetails {
  elementary: SchoolRecord
  highSchool: SchoolRecord
  seniorHighSchool: SchoolRecord
  college: SchoolRecord
}

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
  // Structured addresses (same as Applicant)
  currentLocation: LocationData
  permanentLocation: LocationData
  // Family information (same as Applicant)
  fatherName: string
  motherName: string
  guardianName: string
  guardianRelationship: string
  guardianContactNumber: string
  // Emergency contact (same as Applicant)
  emergencyContactName: string
  emergencyContactRelationship: string
  emergencyContactNumber: string
  emergencyContactAddress: string

  // Step 3 - Contact Information
  email: string
  contactNumber: string
  // Legacy flat address fields (kept for backward compatibility)
  currentAddress: string
  permanentAddress: string

  // Step 4 - Academic History (same as Applicant)
  academicDetails: AcademicDetails

  // Step 5 - Academic Information
  applicantType: ApplicantType
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
