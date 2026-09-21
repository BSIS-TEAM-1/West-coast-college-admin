const BaseRepository = require('../../shared/BaseRepository');
const Student = require('../../../models/Student');

class StudentRepository extends BaseRepository {
  constructor() {
    super(Student);
  }

  async findByStudentNumber(studentNumber, options = {}) {
    return this.findOne({ studentNumber }, options);
  }

  async findActiveStudents(options = {}) {
    const filter = { isActive: { $ne: false } };
    return this.find(filter, options);
  }

  async findByCourseAndYear(course, yearLevel, options = {}) {
    return this.find({ course, yearLevel, isActive: { $ne: false } }, options);
  }

  async updateLifecycleStatus(studentId, lifecycleStatus, updatedBy, options = {}) {
    const normalized = String(lifecycleStatus || '').trim();
    // The backend is the sole authority for ENROLLED: even this repository
    // path must prove a valid block assignment first (same rule as the
    // registrar update endpoint). See services/enrollmentGuard.js.
    if (normalized === 'Enrolled') {
      const enrollmentGuard = require('../../services/enrollmentGuard');
      const student = await Student.findById(studentId).lean();
      if (!student) {
        throw Object.assign(new Error('Student not found'), { statusCode: 404 });
      }
      await enrollmentGuard.assertEnrolledRequirements(student, { session: options?.session });
    }
    const update = { lifecycleStatus, updatedBy };
    if (lifecycleStatus === 'Graduated') {
      update.enrollmentStatus = 'Not Enrolled';
      update.isActive = false;
    } else if (lifecycleStatus === 'Enrolled') {
      update.enrollmentStatus = 'Enrolled';
      update.isActive = true;
    } else if (lifecycleStatus === 'Inactive') {
      update.isActive = false;
    }
    return this.updateById(studentId, { $set: update }, options);
  }
}

module.exports = new StudentRepository();
