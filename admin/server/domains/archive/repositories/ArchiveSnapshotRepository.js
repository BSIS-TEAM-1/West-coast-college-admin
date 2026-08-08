const BaseRepository = require('../../shared/BaseRepository');
const ArchiveSnapshot = require('../../../models/ArchiveSnapshot');

class ArchiveSnapshotRepository extends BaseRepository {
  constructor() {
    super(ArchiveSnapshot);
  }

  async findBySchoolYear(schoolYear, options = {}) {
    return this.find({ schoolYear }, options);
  }

  async findByType(type, options = {}) {
    return this.find({ type }, options);
  }

  async findByBatchId(rolloverBatchId, options = {}) {
    return this.find({ rolloverBatchId }, options);
  }

  // Override create to enforce append-only — no update/delete methods exposed
  async createSnapshot(data, options = {}) {
    return this.create(data, options);
  }
}

module.exports = new ArchiveSnapshotRepository();
