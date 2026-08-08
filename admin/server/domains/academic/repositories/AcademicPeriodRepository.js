const BaseRepository = require('../../shared/BaseRepository');
const AcademicPeriod = require('../../../models/AcademicPeriod');

class AcademicPeriodRepository extends BaseRepository {
  constructor() {
    super(AcademicPeriod);
  }

  async findActive(options = {}) {
    return this.findOne({ status: 'Active' }, options);
  }

  async findBySchoolYear(schoolYear, options = {}) {
    return this.find(
      { schoolYear },
      { sort: { term: 1 }, ...options }
    );
  }

  async archiveAll(options = {}) {
    return this.updateMany(
      { status: 'Active' },
      { $set: { status: 'Archived', archivedAt: new Date() } },
      options
    );
  }

  async activate(periodId, options = {}) {
    // Archive all active periods first
    await this.archiveAll(options);
    // Then activate the specified one
    return this.updateById(
      periodId,
      { $set: { status: 'Active' } },
      options
    );
  }
}

module.exports = new AcademicPeriodRepository();
