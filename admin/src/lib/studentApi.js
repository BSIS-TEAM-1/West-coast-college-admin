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
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create student');
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
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update student');
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
    const response = await fetch(
      `${API_URL}/registrar/students/${id}/current-enrollment?schoolYear=${schoolYear}&semester=${semester}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch current enrollment');
    }

    return response.json();
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
}
export default StudentService;
