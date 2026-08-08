const BaseRepository = require('../../shared/BaseRepository');
const Enrollment = require('../../../models/Enrollment');

class EnrollmentRepository extends BaseRepository {
  constructor() {
    super(Enrollment);
  }

  async findCurrentByStudent(studentId, options = {}) {
    return this.findOne(
      { studentId, isCurrent: true, lockedAt: null },
      options
    );
  }

  async findByStudentAndYear(studentId, schoolYear, options = {}) {
    return this.findOne(
      { studentId, schoolYear, isCurrent: true, lockedAt: null },
      options
    );
  }

  async findHistoryByStudent(studentId, options = {}) {
    let query = this.model
      .find({ studentId })
      .sort({ schoolYear: -1, semester: -1 });
    if (options.populate) query = query.populate(options.populate);
    if (options.lean) query = query.lean();
    return query.exec();
  }

  async lockEnrollment(enrollmentId, lockData, options = {}) {
    return this.updateById(
      enrollmentId,
      {
        $set: {
          lockedAt: lockData.lockedAt,
          lockedBy: lockData.lockedBy,
          rolloverBatchId: lockData.rolloverBatchId,
          isCurrent: false,
          status: lockData.status,
          updatedBy: lockData.lockedBy,
        },
      },
      options
    );
  }

  async retireCurrentEnrollments(studentId, options = {}) {
    return this.updateMany(
      { studentId, isCurrent: true },
      { $set: { isCurrent: false } },
      options
    );
  }
}

module.exports = new EnrollmentRepository();
