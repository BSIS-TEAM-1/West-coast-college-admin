// TypeScript declarations for studentApi module
export interface StudentData {
  _id: string;
  studentNumber: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  course: number;
  yearLevel: number;
  section?: string;
  semester: string;
  schoolYear: string;
  studentStatus: string;
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
}

declare class StudentService {
  static getStudents(token: string, params?: Record<string, any>): Promise<ApiResponse<StudentData[]>>;
  static getStudentById(token: string, id: string): Promise<ApiResponse<StudentData>>;
  static getStudentByNumber(token: string, studentNumber: string): Promise<ApiResponse<StudentData>>;
  static createStudent(token: string, studentData: Partial<StudentData>): Promise<StudentData>;
  static updateStudent(token: string, id: string, studentData: Partial<StudentData>): Promise<StudentData>;
  static deleteStudent(token: string, id: string): Promise<ApiResponse<StudentData>>;
  static enrollStudent(token: string, id: string, enrollmentData: EnrollmentData): Promise<any>;
  static getCurrentEnrollment(token: string, id: string, schoolYear: string, semester: string): Promise<ApiResponse<any>>;
  static getEnrollmentHistory(token: string, id: string): Promise<ApiResponse<any>>;
}

export default StudentService;
