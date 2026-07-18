import type { WizardFormData } from './types'

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
  emergencyContact?: {
    name?: string
    relationship?: string
    contactNumber?: string
    address?: string
  }
  course?: string | number
  schoolYear?: string
  semester?: WizardFormData['semester'] | string
  yearLevel?: string | number
  studentStatus?: string
  scholarship?: string
  lifecycleStatus?: string
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
    email: student.email || '',
    contactNumber: student.contactNumber || '',
    currentAddress: student.address || '',
    permanentAddress: student.permanentAddress || '',
    emergencyContactName: student.emergencyContact?.name || '',
    emergencyContactRelationship: student.emergencyContact?.relationship || '',
    emergencyContactNumber: student.emergencyContact?.contactNumber || '',
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
    address: ''
  }

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
}
