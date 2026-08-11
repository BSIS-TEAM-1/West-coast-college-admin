import type { WizardFormData, LocationData, SchoolRecord, AcademicDetails } from './types'

type StudentFormSource = {
  studentNumber?: string
  firstName?: string
  middleName?: string
  lastName?: string
  suffix?: string
  birthDate?: string
  birthPlace?: string
  gender?: string
  civilStatus?: string
  nationality?: string
  religion?: string
  email?: string
  contactNumber?: string
  address?: string
  permanentAddress?: string
  currentLocation?: Partial<LocationData>
  permanentLocation?: Partial<LocationData>
  fatherName?: string
  motherName?: string
  guardianName?: string
  guardianRelationship?: string
  guardianContactNumber?: string
  emergencyContact?: {
    name?: string
    relationship?: string
    contactNumber?: string
    address?: string
  }
  academicDetails?: {
    elementary?: Partial<SchoolRecord>
    highSchool?: Partial<SchoolRecord>
    seniorHighSchool?: Partial<SchoolRecord>
    college?: Partial<SchoolRecord>
  }
  applicantType?: string
  course?: string | number
  schoolYear?: string
  semester?: WizardFormData['semester'] | string
  yearLevel?: string | number
  studentStatus?: string
  scholarship?: string
  lifecycleStatus?: string
}

const EMPTY_LOCATION: LocationData = {
  regionCode: '',
  regionName: '',
  provinceCode: '',
  provinceName: '',
  cityCode: '',
  cityName: '',
  barangayCode: '',
  barangayName: '',
  streetAddress: ''
}

const EMPTY_SCHOOL_RECORD: SchoolRecord = {
  schoolName: '',
  schoolAddress: '',
  yearGraduated: '',
  generalAverage: '',
  gradesSummary: '',
  strandOrTrack: ''
}

const EMPTY_ACADEMIC_DETAILS: AcademicDetails = {
  elementary: { ...EMPTY_SCHOOL_RECORD },
  highSchool: { ...EMPTY_SCHOOL_RECORD },
  seniorHighSchool: { ...EMPTY_SCHOOL_RECORD },
  college: { ...EMPTY_SCHOOL_RECORD }
}

export const DEFAULT_WIZARD_FORM_DATA: Partial<WizardFormData> = {
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
  currentLocation: { ...EMPTY_LOCATION },
  permanentLocation: { ...EMPTY_LOCATION },
  fatherName: '',
  motherName: '',
  guardianName: '',
  guardianRelationship: '',
  guardianContactNumber: '',
  emergencyContactName: '',
  emergencyContactRelationship: '',
  emergencyContactNumber: '',
  emergencyContactAddress: '',
  email: '',
  contactNumber: '',
  currentAddress: '',
  permanentAddress: '',
  academicDetails: { ...EMPTY_ACADEMIC_DETAILS },
  applicantType: 'New',
  course: '',
  schoolYear: '',
  semester: '1st',
  yearLevel: '',
  studentStatus: 'Regular',
  scholarship: '',
  lifecycleStatus: 'Pending'
}

function mergeLocation(source: Partial<LocationData> | undefined): LocationData {
  return { ...EMPTY_LOCATION, ...(source || {}) }
}

function mergeSchoolRecord(source: Partial<SchoolRecord> | undefined): SchoolRecord {
  return { ...EMPTY_SCHOOL_RECORD, ...(source || {}) }
}

export function buildWizardFormData(student?: StudentFormSource): Partial<WizardFormData> {
  if (!student) return { ...DEFAULT_WIZARD_FORM_DATA }

  return {
    ...DEFAULT_WIZARD_FORM_DATA,
    studentNumber: student.studentNumber || '',
    firstName: student.firstName || '',
    middleName: student.middleName || '',
    lastName: student.lastName || '',
    suffix: student.suffix || '',
    birthDate: student.birthDate ? String(student.birthDate).slice(0, 10) : '',
    birthPlace: student.birthPlace || '',
    gender: student.gender || '',
    civilStatus: student.civilStatus || '',
    nationality: student.nationality || 'Filipino',
    religion: student.religion || '',
    currentLocation: mergeLocation(student.currentLocation),
    permanentLocation: mergeLocation(student.permanentLocation),
    fatherName: student.fatherName || '',
    motherName: student.motherName || '',
    guardianName: student.guardianName || '',
    guardianRelationship: student.guardianRelationship || '',
    guardianContactNumber: student.guardianContactNumber || '',
    emergencyContactName: student.emergencyContact?.name || '',
    emergencyContactRelationship: student.emergencyContact?.relationship || '',
    emergencyContactNumber: student.emergencyContact?.contactNumber || '',
    emergencyContactAddress: student.emergencyContact?.address || '',
    email: student.email || '',
    contactNumber: student.contactNumber || '',
    currentAddress: student.address || '',
    permanentAddress: student.permanentAddress || '',
    academicDetails: {
      elementary: mergeSchoolRecord(student.academicDetails?.elementary),
      highSchool: mergeSchoolRecord(student.academicDetails?.highSchool),
      seniorHighSchool: mergeSchoolRecord(student.academicDetails?.seniorHighSchool),
      college: mergeSchoolRecord(student.academicDetails?.college)
    },
    applicantType: (student.applicantType as WizardFormData['applicantType']) || 'New',
    course: student.course ? String(student.course) : '',
    schoolYear: student.schoolYear || '',
    semester: (student.semester as WizardFormData['semester']) || '1st',
    yearLevel: student.yearLevel ? String(student.yearLevel) : '',
    studentStatus: (student.studentStatus as WizardFormData['studentStatus']) || 'Regular',
    scholarship: student.scholarship || '',
    lifecycleStatus: (student.lifecycleStatus as WizardFormData['lifecycleStatus']) || 'Pending'
  }
}

export function buildStudentPayloadFromWizardForm(formData: Partial<WizardFormData>) {
  const emergencyContact = {
    name: formData.emergencyContactName?.trim() || '',
    relationship: formData.emergencyContactRelationship?.trim() || '',
    contactNumber: formData.emergencyContactNumber?.trim() || '',
    address: formData.emergencyContactAddress?.trim() || ''
  }

  // Build a flat address string from structured location for backward compatibility
  const currentLocation = formData.currentLocation
  const flatCurrentAddress = currentLocation?.streetAddress?.trim()
    ? [
        currentLocation.streetAddress,
        currentLocation.barangayName,
        currentLocation.cityName,
        currentLocation.provinceName,
        currentLocation.regionName
      ].filter(Boolean).join(', ')
    : formData.currentAddress?.trim() || ''

  const permanentLocation = formData.permanentLocation
  const flatPermanentAddress = permanentLocation?.streetAddress?.trim()
    ? [
        permanentLocation.streetAddress,
        permanentLocation.barangayName,
        permanentLocation.cityName,
        permanentLocation.provinceName,
        permanentLocation.regionName
      ].filter(Boolean).join(', ')
    : formData.permanentAddress?.trim() || ''

  return {
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
    address: flatCurrentAddress,
    permanentAddress: flatPermanentAddress,
    currentLocation: formData.currentLocation || null,
    permanentLocation: formData.permanentLocation || null,
    birthDate: formData.birthDate || undefined,
    birthPlace: formData.birthPlace?.trim() || '',
    gender: formData.gender?.trim() || '',
    civilStatus: formData.civilStatus?.trim() || '',
    nationality: formData.nationality?.trim() || 'Filipino',
    religion: formData.religion?.trim() || '',
    fatherName: formData.fatherName?.trim() || '',
    motherName: formData.motherName?.trim() || '',
    guardianName: formData.guardianName?.trim() || '',
    guardianRelationship: formData.guardianRelationship?.trim() || '',
    guardianContactNumber: formData.guardianContactNumber?.trim() || '',
    emergencyContact,
    academicDetails: formData.academicDetails || undefined,
    applicantType: formData.applicantType || 'New'
  }
}
