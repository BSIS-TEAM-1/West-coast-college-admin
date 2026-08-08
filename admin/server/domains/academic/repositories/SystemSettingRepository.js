const BaseRepository = require('../../shared/BaseRepository');
const SystemSetting = require('../../../models/SystemSetting');

class SystemSettingRepository extends BaseRepository {
  constructor() {
    super(SystemSetting);
  }

  async get(key, options = {}) {
    const doc = await this.findOne({ key }, options);
    return doc ? doc.value : null;
  }

  async set(key, value, options = {}) {
    return this.model
      .findOneAndUpdate(
        { key },
        { $set: { key, value } },
        { upsert: true, new: true, runValidators: true }
      )
      .session(options.session || null)
      .exec();
  }

  async getAcademicTerm(options = {}) {
    const schoolYear = await this.get('schoolYear', options);
    const semester = await this.get('semester', options);
    return { schoolYear, semester };
  }

  async setAcademicTerm(schoolYear, semester, options = {}) {
    await this.set('schoolYear', schoolYear, options);
    await this.set('semester', semester, options);
    return { schoolYear, semester };
  }
}

module.exports = new SystemSettingRepository();
