/**
 * Student Password Service
 * Handles password generation and validation for students
 */

class StudentPasswordService {
  /**
   * Generate default password for a student
   * Format: firstInitial + lastName (lowercase) + last5DigitsOfStudentNumber
   * Example: Lorenze Nino F. Prepotente, UID: 2024-101-28391 → lprepotente28391
   * Example: John Doe, UID: 2024-101-12345 → jdoe12345
   */
  static generateDefaultPassword(student) {
    const firstName = (student.firstName || '').trim();
    const lastName = (student.lastName || '').trim();
    const studentNumber = (student.studentNumber || '').trim();
    
    // Get first initial (lowercase)
    const firstInitial = firstName.charAt(0).toLowerCase();
    
    // Get full last name (lowercase, spaces removed)
    const lastNameClean = lastName.toLowerCase().replace(/\s+/g, '');
    
    // Get last 5 digits of student number
    const lastFiveDigits = studentNumber.slice(-5);
    
    // Format: first initial + full last name + last 5 digits
    return `${firstInitial}${lastNameClean}${lastFiveDigits}`;
  }

  /**
   * Validate password complexity (if registrar wants to set custom password)
   */
  static validatePasswordStrength(password) {
    if (!password || password.length < 8) {
      return {
        valid: false,
        message: 'Password must be at least 8 characters long'
      };
    }

    // Add more validation rules if needed
    return {
      valid: true,
      message: 'Password is valid'
    };
  }

  /**
   * Generate a random password (for reset scenarios)
   */
  static generateRandomPassword() {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }
}

module.exports = StudentPasswordService;