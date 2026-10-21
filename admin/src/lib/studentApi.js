// Student Management API Service (browser-side)
import { API_URL } from './authApi';

class StudentService {
  static async getStudents(token, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `${API_URL}/registrar/students${queryString ? '?' + queryString : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch students');
    }

    return response.json();
  }

  static async getStudentById(token, id) {
    const response = await fetch(`${API_URL}/registrar/students/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch student');
    }

    return response.json();
  }

  static async getStudentByNumber(token, studentNumber) {
    const response = await fetch(`${API_URL}/registrar/students/number/${studentNumber}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch student');
    }

    return response.json();
  }

  static async createStudent(token, studentData) {
    const response = await fetch(`${API_URL}/registrar/students`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(studentData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.details && errorData.details.length > 0
        ? errorData.details.join(', ')
        : (errorData.message || errorData.error || 'Failed to create student');
      throw new Error(errorMessage);
    }

    return response.json();
  }

  static async updateStudent(token, id, studentData) {
    const response = await fetch(`${API_URL}/registrar/students/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(studentData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.details && errorData.details.length > 0
        ? `${errorData.message || 'Failed to update student'}: ${errorData.details.join('; ')}`
        : (errorData.message || errorData.error || 'Failed to update student');
      throw new Error(errorMessage);
    }

    return response.json();
  }

  static async deleteStudent(token, id) {
    const response = await fetch(`${API_URL}/registrar/students/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to delete student');
    }

    return response.json();
  }

  static async enrollStudent(token, id, enrollmentData) {
    const response = await fetch(`${API_URL}/registrar/students/${id}/enroll`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(enrollmentData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to enroll student');
    }

    return response.json();
  }

  static async getCurrentEnrollment(token, id, schoolYear, semester) {
    const query = new URLSearchParams({
      schoolYear: String(schoolYear || ''),
      semester: String(semester || '')
    })
    const response = await fetch(
      `${API_URL}/registrar/students/${id}/current-enrollment?${query.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (response.status === 404) {
      const payload = await response.json().catch(() => ({}))
      if (String(payload?.message || '').toLowerCase().includes('no active enrollment')) {
        return null
      }
      throw new Error(payload?.message || 'Failed to fetch current enrollment')
    }

    if (!response.ok) {
      throw new Error('Failed to fetch current enrollment')
    }

    return response.json()
  }

  static async getEnrollmentHistory(token, id) {
    const response = await fetch(`${API_URL}/registrar/students/${id}/enrollments`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch enrollment history');
    }

    return response.json();
  }

  /**
   * Shared transport for the subject-level enrollment endpoints.
   * Surfaces the server's own message so the UI can show the real reason
   * (duplicate, prerequisite, override required, locked, …) instead of a
   * generic "request failed".
   */
  static async send(token, path, { method = 'GET', body } = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });

    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        detail = payload?.message || payload?.error || '';
      } catch {
        // Response was not JSON; fall through to the generic message.
      }
      throw new Error(detail || `${method} ${path} failed (${response.status})`);
    }

    return response.json();
  }

  /** Subjects the student's curriculum expects for a year level + semester. */
  static getCurriculumSuggestions(token, params) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
    ).toString();
    return this.send(token, `/registrar/curriculum-suggestions${query ? `?${query}` : ''}`);
  }

  /** Curriculum-based completion, progression and graduation evaluation. */
  static getAcademicProgress(token, studentId) {
    return this.send(token, `/registrar/students/${studentId}/academic-progress`);
  }

  /** Dry run — every per-subject reason, before anything is written. */
  static validateEnrollmentSubjects(token, enrollmentId, subjectIds) {
    return this.send(token, `/registrar/enrollments/${enrollmentId}/subjects/validate`, {
      method: 'POST',
      body: { subjectIds }
    });
  }

  /** Add subjects to a term enrollment (overrideReason when a rule is waived). */
  static addEnrollmentSubjects(token, enrollmentId, subjectIds, overrideReason) {
    return this.send(token, `/registrar/enrollments/${enrollmentId}/subjects`, {
      method: 'POST',
      body: { subjectIds, overrideReason }
    });
  }

  /** Official drop — the record and its grade are preserved, never deleted. */
  static dropEnrollmentSubject(token, enrollmentId, subjectId, reason, overrideReason) {
    return this.send(token, `/registrar/enrollments/${enrollmentId}/subjects/${subjectId}/drop`, {
      method: 'POST',
      body: { reason, overrideReason }
    });
  }

  /** Record a retake in a later term. Year level and block are never changed. */
  static retakeSubject(token, studentId, subjectId, { schoolYear, semester, overrideReason }) {
    return this.send(token, `/registrar/students/${studentId}/retake`, {
      method: 'POST',
      body: { subjectId, schoolYear, semester, overrideReason }
    });
  }

  /** Curriculum-derived subjects a block cohort is normally expected to take. */
  static getExpectedBlockSubjects(token, groupId) {
    return this.send(token, `/api/blocks/groups/${groupId}/expected-subjects`);
  }
}
export default StudentService;
