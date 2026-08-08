const BaseRepository = require('../../shared/BaseRepository');
const Subject = require('../../../models/Subject');

class SubjectRepository extends BaseRepository {
  constructor() {
    super(Subject);
  }

  async findByCode(code, options = {}) {
    return this.findOne({ code: code.toUpperCase() }, options);
  }

  async findActiveByCourseAndYear(course, yearLevel, options = {}) {
    return this.find(
      { course, yearLevel, isActive: true },
      { sort: { code: 1 }, ...options }
    );
  }

  async findActive(options = {}) {
    return this.find({ isActive: true }, { sort: { code: 1 }, ...options });
  }

  async deactivate(id, updatedBy, options = {}) {
    return this.updateById(id, { $set: { isActive: false, updatedBy } }, options);
  }
}

module.exports = new SubjectRepository();
