const BaseRepository = require('../../shared/BaseRepository');
const Curriculum = require('../../../models/Curriculum');

class CurriculumRepository extends BaseRepository {
  constructor() {
    super(Curriculum);
  }

  async findActiveByProgram(programCode, options = {}) {
    return this.findOne({ programCode, status: 'Active' }, options);
  }

  async findAllVersions(programCode, options = {}) {
    return this.find(
      { programCode },
      { sort: { version: -1 }, ...options }
    );
  }

  async findAllActive(options = {}) {
    return this.find({ status: 'Active' }, options);
  }

  async supersede(curriculumId, newVersionId, options = {}) {
    return this.updateById(
      curriculumId,
      { $set: { status: 'Legacy', supersededByVersion: newVersionId } },
      options
    );
  }
}

module.exports = new CurriculumRepository();
