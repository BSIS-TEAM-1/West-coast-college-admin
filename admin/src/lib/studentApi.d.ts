// TypeScript declarations for studentApi module
export interface StudentData {
  _id: string;
  studentNumber: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  course: number;
  curriculumVersion?: string;
  yearLevel: number;
  section?: string;
  semester: string;
  schoolYear: string;
  studentStatus: string;
  lifecycleStatus?: string;
  corStatus?: string;
  scholarship?: string;
  enrollmentStatus: string;
  email: string;
  contactNumber: string;
  address: string;
  permanentAddress?: string;
  birthDate?: string;
  gender?: string;
  civilStatus?: string;
  nationality?: string;
  religion?: string;
  emergencyContact?: {
    name: string;
    relationship: string;
    contactNumber: string;
    address: string;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface EnrollmentData {
  schoolYear: string;
  semester: string;
  subjectIds: string[];
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  reasonCode?: string;
  details?: unknown;
}

export interface SuggestedSubject {
  curriculumSubjectId?: string;
  subjectId: string;
  code: string;
  title: string;
  units?: number;
  yearLevel: number;
  semester: string;
  isRequired?: boolean;
  available?: boolean;
  prerequisiteSubjectIds?: string[];
}

export interface CurriculumSuggestionsData {
  curriculumId: string | null;
  curriculum: { _id?: string; name?: string; programCode?: number; programName?: string; version?: string; status?: string } | null;
  source: string | null;
  reason?: string | null;
  subjects: SuggestedSubject[];
}

export interface SubjectValidationResult {
  subjectId: string;
  code: string | null;
  title: string | null;
  units?: number | null;
  ok: boolean;
  reasonCode: string | null;
  message: string | null;
  requiresOverride: boolean;
  offeredOutsideBlock?: boolean;
  offeredViaCurriculum?: boolean;
  alreadyEnrolled?: boolean;
  unmetPrerequisites?: string[];
}

export interface SubjectValidationData {
  enrollmentId: string;
  schoolYear: string;
  semester: string;
  locked: boolean;
  results: SubjectValidationResult[];
  okIds: string[];
  failedIds: string[];
}

export interface AddSubjectsData {
  enrollmentId: string;
  added: SubjectValidationResult[];
  failed: SubjectValidationResult[];
  usedOverride: boolean;
}

export interface AttemptRecord {
  subjectId?: string;
  schoolYear: string;
  semester: string;
  status: string;
  grade?: number | null;
  gradeMark?: string | null;
  isRetake?: boolean;
  droppedAt?: string;
  dropReason?: string;
  overrideReason?: string;
}

export interface RequirementStatus {
  subjectId: string;
  code: string;
  title: string;
  yearLevel?: number;
  semester?: string;
  units?: number;
  isRequired?: boolean;
  status: string;
  attempts: AttemptRecord[];
  completedWith?: { schoolYear: string; semester: string; grade?: number } | null;
}

export interface AcademicProgressData {
  studentId: string;
  curriculum: { _id: string; name?: string; programCode?: number; programName?: string; version?: string; status?: string } | null;
  summary: {
    totalRequirements: number;
    requiredCount: number;
    electiveCount: number;
    completed: number;
    failed: number;
    dropped: number;
    inProgress: number;
    outstanding: number;
    totalRequiredUnits?: number;
    completedRequiredUnits?: number;
    outstandingRequiredUnits?: number;
    completionPercentage?: number;
    outsideCurriculum?: number;
  } | null;
  requirements: RequirementStatus[];
  outsideCurriculum?: RequirementStatus[];
  graduationEligibility: { eligible: boolean; reason: string; outstanding: RequirementStatus[] };
  progression: {
    currentYearLevel: number;
    recommendedYearLevel: number;
    canAdvance: boolean;
    blockedBy: { code: string; status: string }[];
    reason: string;
  };
  evaluatedAt?: string;
}

declare class StudentService {
  static getStudents(token: string, params?: Record<string, unknown>): Promise<ApiResponse<StudentData[]>>;
  static getStudentById(token: string, id: string): Promise<ApiResponse<StudentData>>;
  static getStudentByNumber(token: string, studentNumber: string): Promise<ApiResponse<StudentData>>;
  static createStudent(token: string, studentData: Partial<StudentData>): Promise<StudentData>;
  static updateStudent(token: string, id: string, studentData: Partial<StudentData>): Promise<StudentData>;
  static deleteStudent(token: string, id: string): Promise<ApiResponse<StudentData>>;
  static enrollStudent(token: string, id: string, enrollmentData: EnrollmentData): Promise<ApiResponse<unknown>>;
  static getCurrentEnrollment(token: string, id: string, schoolYear: string, semester: string): Promise<ApiResponse<unknown> | null>;
  static getEnrollmentHistory(token: string, id: string): Promise<ApiResponse<unknown>>;
  static send(token: string, path: string, options?: { method?: string; body?: unknown }): Promise<ApiResponse<unknown>>;
  static getCurriculumSuggestions(token: string, params: { programCode: number | string; yearLevel: number | string; semester: string; curriculumVersion?: string }): Promise<ApiResponse<CurriculumSuggestionsData>>;
  static getAcademicProgress(token: string, studentId: string): Promise<ApiResponse<AcademicProgressData>>;
  static validateEnrollmentSubjects(token: string, enrollmentId: string, subjectIds: string[]): Promise<ApiResponse<SubjectValidationData>>;
  static addEnrollmentSubjects(token: string, enrollmentId: string, subjectIds: string[], overrideReason?: string): Promise<ApiResponse<AddSubjectsData>>;
  static dropEnrollmentSubject(token: string, enrollmentId: string, subjectId: string, reason?: string, overrideReason?: string): Promise<ApiResponse<unknown>>;
  static retakeSubject(token: string, studentId: string, subjectId: string, options: { schoolYear: string; semester: string; overrideReason?: string }): Promise<ApiResponse<unknown>>;
  static getExpectedBlockSubjects(token: string, groupId: string): Promise<ApiResponse<unknown>>;
}

export default StudentService;
