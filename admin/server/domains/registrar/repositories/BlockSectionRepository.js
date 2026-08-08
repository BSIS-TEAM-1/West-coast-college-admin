const BaseRepository = require('../../shared/BaseRepository');
const BlockSection = require('../../../models/BlockSection');

class BlockSectionRepository extends BaseRepository {
  constructor() {
    super(BlockSection);
  }

  async findByBlockGroupId(blockGroupId, options = {}) {
    return this.find({ blockGroupId }, options);
  }

  async findAvailableSections(options = {}) {
    return this.find({ status: 'Active' }, options);
  }

  async incrementPopulation(sectionId, options = {}) {
    return this.updateById(
      sectionId,
      { $inc: { currentPopulation: 1 } },
      options
    );
  }

  async decrementPopulation(sectionId, options = {}) {
    return this.updateById(
      sectionId,
      { $inc: { currentPopulation: -1 } },
      options
    );
  }
}

module.exports = new BlockSectionRepository();
