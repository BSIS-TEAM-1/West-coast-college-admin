const BaseRepository = require('../../shared/BaseRepository');
const BlockGroup = require('../../../models/BlockGroup');

class BlockGroupRepository extends BaseRepository {
  constructor() {
    super(BlockGroup);
  }

  async findByYearAndSemester(schoolYear, semester, options = {}) {
    return this.find({ year: schoolYear, semester }, options);
  }

  async findByCourseAndYear(courseId, yearLevel, options = {}) {
    return this.find({ courseId, yearLevel }, options);
  }
}

module.exports = new BlockGroupRepository();
