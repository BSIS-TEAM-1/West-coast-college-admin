import React, { useState, useEffect } from 'react';
import { Search, Edit, Eye, UserPlus, GraduationCap, X, Check, AlertCircle, FileText as FileTextIcon, ExternalLink, Trash2 } from 'lucide-react';
import { API_URL, getStoredToken } from '../lib/authApi';
import StudentService from '../lib/studentApi';
import './StudentManagement.css';

interface Student {
  _id: string;
  studentNumber: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  course: number;
  major?: string;
  yearLevel: number;
  semester: string;
  schoolYear: string;
  studentStatus: string;
  enrollmentStatus: string;
  scholarship?: string;
  corStatus?: 'Pending' | 'Received' | 'Verified';
  assignedProfessor?: string;
  schedule?: string;
  latestGrade?: number;
  gradeProfessor?: string;
  gradeDate?: string;
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
}

interface StudentFormData {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  course: number;
  major: string;
  yearLevel: number;
  semester: string;
  schoolYear: string;
  studentStatus: string;
  scholarship: string;
  assignedProfessor: string;
  schedule: string;
  latestGrade: string;
  gradeProfessor: string;
  gradeDate: string;
  contactNumber: string;
  address: string;
  permanentAddress: string;
  birthDate: string;
  gender: string;
  civilStatus: string;
  nationality: string;
  religion: string;
  emergencyContact: {
    name: string;
    relationship: string;
    contactNumber: string;
    address: string;
  };
}

const scholarshipOptions = [
  'N/A',
  'CHED Scholarship Programs',
  'OWWA Scholarship Programs',
  'DOST-SEI Undergraduate Scholarships',
  'Tertiary Education Subsidy',
  'GrabScholar College Scholarship',
  'SM College Scholarship (SM Foundation)',
  'Foundation Scholarships'
];

const formatYearLevel = (level: number | string): string => {
  const n = Number(level);
  if (!Number.isFinite(n)) return `${level} Year`;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th Year`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st Year`;
  if (mod10 === 2) return `${n}nd Year`;
  if (mod10 === 3) return `${n}rd Year`;
  return `${n}th Year`;
};

const StudentManagement: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [filterYearLevel, setFilterYearLevel] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState<StudentFormData>({
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    course: 101,
    major: 'General Education',
    yearLevel: 1,
    semester: '1st',
    schoolYear: '2024-2025',
    studentStatus: 'Regular',
    scholarship: 'N/A',
    assignedProfessor: '',
    schedule: '',
    latestGrade: '',
    gradeProfessor: '',
    gradeDate: '',
    contactNumber: '',
    address: '',
    permanentAddress: '',
    birthDate: '',
    gender: '',
    civilStatus: 'Single',
    nationality: 'Filipino',
    religion: '',
    emergencyContact: {
      name: '',
      relationship: '',
      contactNumber: '',
      address: ''
    }
  });

  const courses = [
    { value: 101, label: 'Bachelor of Elementary Education (BEED)' },
    { value: 102, label: 'Bachelor of Secondary Education – Major in English' },
    { value: 103, label: 'Bachelor of Secondary Education – Major in Mathematics' },
    { value: 201, label: 'Bachelor of Science in Business Administration – Major in HRM' },
  ];

  const majorOptionsByCourse: Record<number, string[]> = {
    101: ['General Education'],
    102: ['English'],
    103: ['Mathematics'],
    201: ['HRM'],
  };

  const courseLabel = (value: number | string) =>
    courses.find(c => c.value === Number(value))?.label ?? String(value);

  const courseAbbreviation = (value: number | string) => {
    const codeMap: Record<number, string> = {
      101: 'BEED',
      102: 'BSEd-English',
      103: 'BSEd-Math',
      201: 'BSBA-HRM'
    };
    return codeMap[Number(value)] ?? String(value);
  };

  const formatStudentNumberForLogs = (student: Student) => {
    const studentNo = String(student.studentNumber || '').trim();
    if (!studentNo) return 'N/A';

    const parts = studentNo.split('-');
    const normalizedCourse = normalizeCourse(student.course);

    // Handle legacy format like YYYY-103-MATH-XXXXX by removing the alpha course segment.
    if (parts.length >= 4 && /^[A-Za-z]+$/.test(parts[2])) {
      return `${parts[0]}-${normalizedCourse}-${parts.slice(3).join('-')}`;
    }

    if (parts.length >= 3) {
      // Force numeric course code in the course section of the student number.
      if (parts[1] && /^[A-Za-z]+(?:-[A-Za-z]+)*$/.test(parts[1])) {
        return `${parts[0]}-${normalizedCourse}-${parts.slice(2).join('-')}`;
      }
      return `${parts[0]}-${normalizeCourse(student.course)}-${parts.slice(2).join('-')}`;
    }

    return studentNo;
  };

  // Convert course number to number if it's a string
  const normalizeCourse = (course: number | string): number => {
    if (typeof course === 'string') {
      const raw = course.trim();
      const upper = raw.toUpperCase();

      const aliasMap: Record<string, number> = {
        BEED: 101,
        'BSED-ENGLISH': 102,
        ENGLISH: 102,
        'BSED-MATH': 103,
        MATH: 103,
        MATHEMATICS: 103,
        'BSBA-HRM': 201,
        'BSBS-HRM': 201,
        HRM: 201,
      };
      if (aliasMap[upper]) return aliasMap[upper];

      if (/^\d+$/.test(raw)) return parseInt(raw, 10);

      // Try to match by course code or number
      const found = courses.find(c => {
        const labelUpper = c.label.toUpperCase();
        return c.value.toString() === raw || labelUpper.includes(upper);
      });
      return found ? found.value : 101;
    }
    return course;
  };

  const semesters = ['1st', '2nd', 'Summer'];

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getStoredToken();
      if (!token) throw new Error('No authentication token found');

      const response = await StudentService.getStudents(token);
      const normalizedStudents = (response.data || []).map((student: Student) =>
        student.corStatus === 'Verified' && student.enrollmentStatus !== 'Enrolled'
          ? { ...student, enrollmentStatus: 'Enrolled' }
          : student
      );
      setStudents(normalizedStudents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleAddStudent = () => {
    setFormData({
      firstName: '',
      middleName: '',
      lastName: '',
      suffix: '',
      course: 101,
      major: 'General Education',
      yearLevel: 1,
      semester: '1st',
      schoolYear: '2024-2025',
      studentStatus: 'Regular',
      scholarship: 'N/A',
      assignedProfessor: '',
      schedule: '',
      latestGrade: '',
      gradeProfessor: '',
      gradeDate: '',
      contactNumber: '',
      address: '',
      permanentAddress: '',
      birthDate: '',
      gender: '',
      civilStatus: 'Single',
      nationality: 'Filipino',
      religion: '',
      emergencyContact: {
        name: '',
        relationship: '',
        contactNumber: '',
        address: ''
      }
    });
    setShowAddModal(true);
  };

  const handleEditStudent = (student: Student) => {
    setFormData({
      firstName: student.firstName,
      middleName: student.middleName || '',
      lastName: student.lastName,
      suffix: student.suffix || '',
      course: normalizeCourse(student.course),
      major: student.major || majorOptionsByCourse[normalizeCourse(student.course)]?.[0] || 'General Education',
      yearLevel: student.yearLevel,
      semester: student.semester,
      schoolYear: student.schoolYear,
      studentStatus: student.studentStatus || 'Regular',
      scholarship: student.scholarship || 'N/A',
      assignedProfessor: student.assignedProfessor || '',
      schedule: student.schedule || '',
      latestGrade: student.latestGrade?.toString() || '',
      gradeProfessor: student.gradeProfessor || '',
      gradeDate: student.gradeDate ? new Date(student.gradeDate).toISOString().slice(0, 10) : '',
      contactNumber: student.contactNumber,
      address: student.address,
      permanentAddress: student.permanentAddress || '',
      birthDate: student.birthDate ? new Date(student.birthDate).toISOString().slice(0, 10) : '',
      gender: student.gender || '',
      civilStatus: student.civilStatus || '',
      nationality: student.nationality || 'Filipino',
      religion: student.religion || '',
      emergencyContact: student.emergencyContact || {
        name: '',
        relationship: '',
        contactNumber: '',
        address: ''
      }
    });
    setSelectedStudent(student);
    setShowEditModal(true);
  };

  const fetchCorBlob = async (student: Student) => {
    try {
      const token = await getStoredToken();
      if (!token) throw new Error('No authentication token found');

      const response = await fetch(`${API_URL}/api/registrar/students/${student._id}/cor`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        let message = 'Failed to generate COR';
        try {
          const data = await response.json();
          if (data?.message) message = data.message;
        } catch {
          // Fallback for non-JSON error responses
        }
        throw new Error(message);
      }

      return response.blob();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download COR');
      throw err;
    }
  };

  const handleDownloadCor = async (student: Student) => {
    try {
      const blob = await fetchCorBlob(student);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `COR-${student.studentNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // Error state is already set in fetchCorBlob
    }
  };

  const handleViewCor = async (student: Student) => {
    try {
      const blob = await fetchCorBlob(student);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
    } catch {
      // Error state is already set in fetchCorBlob
    }
  };

  const handleDeleteStudent = async (student: Student) => {
    const studentName = `${student.firstName} ${student.lastName}`.trim();
    const confirmed = window.confirm(`Delete student "${studentName}" (${student.studentNumber})? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      const token = await getStoredToken();
      if (!token) throw new Error('No authentication token found');

      await StudentService.deleteStudent(token, student._id);
      setSelectedStudent((prev) => (prev?._id === student._id ? null : prev));
      setShowEditModal(false);
      setShowAddModal(false);
      setError(null);
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete student');
    }
  };

  const handleSubmitStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await getStoredToken();
      if (!token) throw new Error('No authentication token found');

      const normalizedStatus = ['Regular', 'Dropped', 'Returnee', 'Transferee'].includes(formData.studentStatus)
        ? formData.studentStatus
        : 'Regular';

      const payload = {
        ...formData,
        latestGrade: undefined,
        gradeProfessor: undefined,
        gradeDate: undefined,
        studentStatus: normalizedStatus,
        civilStatus: formData.civilStatus || 'Single'
      };

      if (selectedStudent) {
        // Update existing student
        await StudentService.updateStudent(token, selectedStudent._id, payload);
        setShowEditModal(false);
      } else {
        // Create new student
        await StudentService.createStudent(token, payload);
        setShowAddModal(false);
      }

      setSelectedStudent(null);
      loadStudents(); // Reload students list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save student');
    }
  };

  const filteredStudents = students.filter(student => {
    const matchesSearch = searchTerm === '' ||
      student.studentNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.lastName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCourse = filterCourse === '' || student.course === Number(filterCourse);
    const matchesYearLevel = filterYearLevel === '' || student.yearLevel.toString() === filterYearLevel;

    return matchesSearch && matchesCourse && matchesYearLevel;
  });

  const effectiveEnrollmentStatus = (student: Student): string =>
    student.corStatus === 'Verified' ? 'Enrolled' : student.enrollmentStatus;

  if (loading) {
    return (
      <div className="student-management">
        <div className="student-loading-state">
          <div className="student-loading-spinner"></div>
          <p>Loading students...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="student-management">
      <div className="student-management-header">
        <div className="header-info">
          <h2 className="section-title">Student Management</h2>
          <p className="section-description">Manage student admissions, enrollment, and academic records</p>
        </div>
        <button type="button" className="add-student-btn" onClick={handleAddStudent}>
          <UserPlus size={16} />
          Add New Student
        </button>
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="student-filters">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search students by name, student number, or email..."
            value={searchTerm}
            onChange={handleSearch}
          />
        </div>

        <div className="filter-selects">
          <select value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
            <option value="">All Courses</option>
            {courses.map(course => (
              <option key={course.value} value={course.value}>{course.label}</option>
            ))}
          </select>

          <select value={filterYearLevel} onChange={(e) => setFilterYearLevel(e.target.value)}>
            <option value="">All Year Levels</option>
            {[1, 2, 3, 4, 5].map(level => (
              <option key={level} value={level.toString()}>{formatYearLevel(level)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="student-table-container">
        <table className="student-table">
          <thead>
            <tr>
              <th>Student Number</th>
              <th>Name</th>
              <th>Course</th>
              <th>Year Level</th>
              <th>Status</th>
              <th>COR</th>
              <th>Contact</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map(student => (
              <tr key={student._id}>
                <td className="student-number">{formatStudentNumberForLogs(student)}</td>
                <td className="student-name">
                  {student.firstName} {student.middleName} {student.lastName} {student.suffix}
                </td>
                <td>{courseAbbreviation(normalizeCourse(student.course))}</td>
                <td>{formatYearLevel(student.yearLevel)}</td>
                <td>
                  <span className={`status-badge ${effectiveEnrollmentStatus(student).toLowerCase().replace(' ', '-')}`}>
                    {effectiveEnrollmentStatus(student)}
                  </span>
                </td>
                <td>
                  <span className={`status-badge cor-${(student.corStatus || 'Pending').toLowerCase()}`}>
                    {student.corStatus || 'Pending'}
                  </span>
                </td>
                <td>{student.contactNumber}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      type="button"
                      className="action-btn view"
                      onClick={() => setSelectedStudent(student)}
                      title="View Details"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      className="action-btn edit"
                      onClick={() => handleEditStudent(student)}
                      title="Edit Student"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      type="button"
                      className="action-btn cor"
                      onClick={() => handleDownloadCor(student)}
                      title="Download COR"
                    >
                      <FileTextIcon size={14} />
                    </button>
                    <button
                      type="button"
                      className="action-btn cor view-cor"
                      onClick={() => handleViewCor(student)}
                      title="View COR"
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button
                      type="button"
                      className="action-btn delete"
                      onClick={() => handleDeleteStudent(student)}
                      title="Delete Student"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredStudents.length === 0 && (
          <div className="no-students">
            <GraduationCap size={48} />
            <h3>No Students Found</h3>
            <p>
              {students.length === 0
                ? "No students have been added yet. Click 'Add New Student' to get started."
                : "No students match your search criteria. Try adjusting your filters."
              }
            </p>
          </div>
        )}
      </div>

      {/* Add Student Modal */}
      {showAddModal && (
        <StudentFormModal
          title="Add New Student"
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmitStudent}
          onClose={() => setShowAddModal(false)}
          courses={courses}
          majorOptionsByCourse={majorOptionsByCourse}
          semesters={semesters}
        />
      )}

      {/* Edit Student Modal */}
      {showEditModal && (
        <StudentFormModal
          title="Edit Student"
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmitStudent}
          onClose={() => setShowEditModal(false)}
          courses={courses}
          majorOptionsByCourse={majorOptionsByCourse}
          semesters={semesters}
        />
      )}

      {/* Student Details Modal */}
      {selectedStudent && !showAddModal && !showEditModal && (
        <StudentDetailsModal
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
          onEdit={() => handleEditStudent(selectedStudent)}
          courseLabel={courseLabel}
          normalizeCourse={normalizeCourse}
        />
      )}
    </div>
  );
};

// Student Form Modal Component
interface StudentFormModalProps {
  title: string;
  formData: StudentFormData;
  setFormData: (data: StudentFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  courses: { value: number; label: string; }[];
  majorOptionsByCourse: Record<number, string[]>;
  semesters: string[];
}

const StudentFormModal: React.FC<StudentFormModalProps> = ({
  title,
  formData,
  setFormData,
  onSubmit,
  onClose,
  courses,
  majorOptionsByCourse,
  semesters
}) => {
  const majorOptions = majorOptionsByCourse[Number(formData.course)] || ['General Education'];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'course') {
      const courseNumber = Number(value);
      const courseMajorOptions = majorOptionsByCourse[courseNumber] || ['General Education'];
      const nextMajor = courseMajorOptions.includes(formData.major) ? formData.major : courseMajorOptions[0];
      setFormData({ ...formData, course: courseNumber, major: nextMajor });
      return;
    }
    setFormData({ ...formData, [name]: value });
  };

  const handleEmergencyContactChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      emergencyContact: { ...formData.emergencyContact, [name]: value }
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content student-modal">
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="student-form">
          <div className="form-grid">
            {/* Personal Information */}
            <div className="form-section">
              <h4>Personal Information</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>First Name <span className="required-asterisk">*</span></label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Middle Name</label>
                  <input
                    type="text"
                    name="middleName"
                    value={formData.middleName}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label>Last Name <span className="required-asterisk">*</span></label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Suffix</label>
                  <input
                    type="text"
                    name="suffix"
                    value={formData.suffix}
                    onChange={handleChange}
                    placeholder="Jr., Sr., III"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Contact Number <span className="required-asterisk">*</span></label>
                  <input
                    type="tel"
                    name="contactNumber"
                    value={formData.contactNumber}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Address <span className="required-asterisk">*</span></label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Academic Information */}
            <div className="form-section">
              <h4>Academic Information</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Course <span className="required-asterisk">*</span></label>
                  <select
                    name="course"
                    value={formData.course}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Course</option>
                    {courses.map(course => (
                      <option key={course.value} value={course.value}>{course.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Year Level <span className="required-asterisk">*</span></label>
                  <select
                    name="yearLevel"
                    value={formData.yearLevel}
                    onChange={(e) => setFormData({ ...formData, yearLevel: parseInt(e.target.value) })}
                    required
                  >
                    {[1, 2, 3, 4, 5].map(level => (
                      <option key={level} value={level}>{formatYearLevel(level)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Major <span className="required-asterisk">*</span></label>
                  <select
                    name="major"
                    value={formData.major}
                    onChange={handleChange}
                    required
                  >
                    {majorOptions.map((major) => (
                      <option key={major} value={major}>{major}</option>
                    ))}
                  </select>
                </div>
              </div>

            <div className="form-row">
              <div className="form-group">
                <label>Semester <span className="required-asterisk">*</span></label>
                <select
                  name="semester"
                    value={formData.semester}
                    onChange={handleChange}
                    required
                  >
                    {semesters.map(semester => (
                      <option key={semester} value={semester}>{semester}</option>
                    ))}
                  </select>
                </div>
              <div className="form-group">
                <label>School Year <span className="required-asterisk">*</span></label>
                <input
                  type="text"
                  name="schoolYear"
                    value={formData.schoolYear}
                    onChange={handleChange}
                    placeholder="2024-2025"
                    required
                  />
                </div>
              <div className="form-group">
                <label>Student Status <span className="required-asterisk">*</span></label>
                <select
                  name="studentStatus"
                  value={formData.studentStatus}
                  onChange={handleChange}
                  required
                >
                  <option value="Regular">Regular</option>
                  <option value="Dropped">Dropped</option>
                  <option value="Returnee">Returnee</option>
                  <option value="Transferee">Transferee</option>
                </select>
              </div>
              <div className="form-group">
                <label>Scholarship</label>
                <select
                  name="scholarship"
                  value={formData.scholarship}
                  onChange={handleChange}
                >
                  {scholarshipOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              </div>
            </div>

          {/* Additional Information */}
          <div className="form-section">
            <h4>Additional Information</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Birth Date</label>
                  <input
                    type="date"
                    name="birthDate"
                    value={formData.birthDate}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label>Sex <span className="required-asterisk">*</span></label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Sex</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Civil Status</label>
                  <select
                    name="civilStatus"
                    value={formData.civilStatus}
                    onChange={handleChange}
                  >
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Separated">Separated</option>
                    <option value="Divorced">Divorced</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Nationality</label>
                  <input
                    type="text"
                    name="nationality"
                    value={formData.nationality}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label>Religion</label>
                  <input
                    type="text"
                    name="religion"
                    value={formData.religion}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="form-section">
              <h4>Emergency Contact</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Contact Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.emergencyContact.name}
                    onChange={handleEmergencyContactChange}
                  />
                </div>
                <div className="form-group">
                  <label>Relationship</label>
                  <input
                    type="text"
                    name="relationship"
                    value={formData.emergencyContact.relationship}
                    onChange={handleEmergencyContactChange}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Contact Number</label>
                  <input
                    type="tel"
                    name="contactNumber"
                    value={formData.emergencyContact.contactNumber}
                    onChange={handleEmergencyContactChange}
                  />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <input
                    type="text"
                    name="address"
                    value={formData.emergencyContact.address}
                    onChange={handleEmergencyContactChange}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="submit-btn">
              <Check size={16} />
              {title.includes('Add') ? 'Create Student' : 'Update Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Student Details Modal Component
interface StudentDetailsModalProps {
  student: Student;
  onClose: () => void;
  onEdit: () => void;
  courseLabel: (value: number | string) => string;
  normalizeCourse: (course: number | string) => number;
}

const StudentDetailsModal: React.FC<StudentDetailsModalProps> = ({ student, onClose, onEdit, courseLabel, normalizeCourse }) => {
  return (
    <div className="modal-overlay">
      <div className="modal-content student-details-modal">
        <div className="modal-header">
          <h3>Student Details</h3>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="student-details-content">
          <div className="student-header">
            <div className="student-avatar">
              <GraduationCap size={32} />
            </div>
            <div className="student-basic-info">
              <p className="student-number">{student.studentNumber}</p>
              <h4>{student.firstName} {student.middleName} {student.lastName} {student.suffix}</h4>
              <p className="student-program">
                {courseLabel(normalizeCourse(student.course))} (Course No.: {normalizeCourse(student.course)}) - {formatYearLevel(student.yearLevel)}
              </p>
              {student.assignedProfessor && (
                <p className="student-program">Professor: {student.assignedProfessor}</p>
              )}
              {student.schedule && (
                <p className="student-program">Schedule: {student.schedule}</p>
              )}
            </div>
          </div>
          <button className="edit-btn" onClick={onEdit}>
            <Edit size={16} />
            Edit
          </button>

          <div className="details-grid">
            <div className="detail-section">
              <h5>Personal Information</h5>
              <div className="detail-item">
                <label>Email:</label>
                <span>{student.email}</span>
              </div>
              <div className="detail-item">
                <label>Contact Number:</label>
                <span>{student.contactNumber}</span>
              </div>
              <div className="detail-item">
                <label>Address:</label>
                <span>{student.address}</span>
              </div>
              {student.birthDate && (
                <div className="detail-item">
                  <label>Birth Date:</label>
                  <span>{new Date(student.birthDate).toLocaleDateString()}</span>
                </div>
              )}
              {student.gender && (
                <div className="detail-item">
                  <label>Gender:</label>
                  <span>{student.gender}</span>
                </div>
              )}
            </div>

            <div className="detail-section">
              <h5>Academic Information</h5>
              <div className="detail-item">
                <label>Course:</label>
                <span>{courseLabel(normalizeCourse(student.course))} (Course No.: {normalizeCourse(student.course)})</span>
              </div>
              <div className="detail-item">
                <label>Year Level:</label>
                <span>{formatYearLevel(student.yearLevel)}</span>
              </div>
              <div className="detail-item">
                <label>Semester:</label>
                <span>{student.semester}</span>
              </div>
              <div className="detail-item">
                <label>School Year:</label>
                <span>{student.schoolYear}</span>
              </div>
              <div className="detail-item">
                <label>Student Status:</label>
                <span>{student.studentStatus}</span>
              </div>
              <div className="detail-item">
                <label>Scholarship:</label>
                <span>{student.scholarship || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <label>Enrollment Status:</label>
                <span>{student.corStatus === 'Verified' ? 'Enrolled' : student.enrollmentStatus}</span>
              </div>
            </div>

            <div className="detail-section">
              <h5>Grades / Outputs</h5>
              <div className="detail-item">
                <label>Latest COR Status:</label>
                <span>{student.corStatus || 'Pending'}</span>
              </div>
              <div className="detail-item">
                <label>Most Recent Term:</label>
                <span>{student.semester} • {student.schoolYear}</span>
              </div>
            </div>

            {student.emergencyContact && (
              <div className="detail-section">
                <h5>Emergency Contact</h5>
                <div className="detail-item">
                  <label>Name:</label>
                  <span>{student.emergencyContact.name}</span>
                </div>
                <div className="detail-item">
                  <label>Relationship:</label>
                  <span>{student.emergencyContact.relationship}</span>
                </div>
                <div className="detail-item">
                  <label>Contact Number:</label>
                  <span>{student.emergencyContact.contactNumber}</span>
                </div>
                <div className="detail-item">
                  <label>Address:</label>
                  <span>{student.emergencyContact.address}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentManagement;
