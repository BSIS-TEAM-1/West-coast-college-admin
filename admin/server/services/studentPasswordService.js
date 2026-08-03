/**
 * Student Password Service
 * Handles password generation and validation for students
 */

class StudentPasswordService {
  /**
   * Generate default password for a student
   * Format: firstInitial + middleInitial + lastInitial + last4DigitsOfStudentNumber
   * Example: Lorenze Nino F. Prepotente, UID: 2024-101-28391 → lnfp28391
   */
  static generateDefaultPassword(student) {
    const firstName = (student.firstName || '').trim();
    const middleName = (student.middleName || '').trim();
    const lastName = (student.lastName || '').trim();
    const studentNumber = (student.studentNumber || '').trim();
    
    // Combine all name parts into one string and split by spaces
    const fullName = `${firstName} ${middleName} ${lastName}`.trim();
    const nameParts = fullName.split(/\s+/).filter(part => part.length > 0);
    
    // Get first letter of each name part (lowercase)
    const initials = nameParts.map(part => part.charAt(0).toLowerCase()).join('');
    
    // Get last 5 digits of student number
    const lastFiveDigits = studentNumber.slice(-5);
    
    // Format: all initials + last 5 digits
    return `${initials}${lastFiveDigits}`;
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