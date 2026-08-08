/**
 * BaseRepository — generic CRUD wrapper for Mongoose models.
 * All domain repositories extend this class to encapsulate data access.
 */
class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  async findById(id, options = {}) {
    let query = this.model.findById(id);
    if (options.select) query = query.select(options.select);
    if (options.populate) query = query.populate(options.populate);
    if (options.session) query = query.session(options.session);
    if (options.lean) query = query.lean();
    return query.exec();
  }

  async findOne(filter, options = {}) {
    let query = this.model.findOne(filter);
    if (options.select) query = query.select(options.select);
    if (options.populate) query = query.populate(options.populate);
    if (options.session) query = query.session(options.session);
    if (options.lean) query = query.lean();
    return query.exec();
  }

  async find(filter = {}, options = {}) {
    let query = this.model.find(filter);
    if (options.select) query = query.select(options.select);
    if (options.populate) query = query.populate(options.populate);
    if (options.sort) query = query.sort(options.sort);
    if (options.limit) query = query.limit(options.limit);
    if (options.skip) query = query.skip(options.skip);
    if (options.session) query = query.session(options.session);
    if (options.lean) query = query.lean();
    return query.exec();
  }

  async countDocuments(filter = {}) {
    return this.model.countDocuments(filter).exec();
  }

  async create(data, options = {}) {
    if (Array.isArray(data)) {
      return this.model.create(data, options);
    }
    const doc = new this.model(data);
    await doc.save(options.session ? { session: options.session } : undefined);
    return doc;
  }

  async createMany(docs, options = {}) {
    return this.model.create(docs, options);
  }

  async updateById(id, update, options = {}) {
    let query = this.model.findByIdAndUpdate(id, update, {
      new: options.returnNew !== false,
      runValidators: options.runValidators !== false,
    });
    if (options.session) query = query.session(options.session);
    if (options.lean) query = query.lean();
    return query.exec();
  }

  async updateOne(filter, update, options = {}) {
    let query = this.model.updateOne(filter, update, {
      runValidators: options.runValidators !== false,
      upsert: options.upsert || false,
    });
    if (options.session) query = query.session(options.session);
    return query.exec();
  }

  async updateMany(filter, update, options = {}) {
    let query = this.model.updateMany(filter, update, {
      runValidators: options.runValidators !== false,
    });
    if (options.session) query = query.session(options.session);
    return query.exec();
  }

  async deleteById(id, options = {}) {
    let query = this.model.findByIdAndDelete(id);
    if (options.session) query = query.session(options.session);
    return query.exec();
  }

  async deleteOne(filter, options = {}) {
    let query = this.model.deleteOne(filter);
    if (options.session) query = query.session(options.session);
    return query.exec();
  }

  async deleteMany(filter, options = {}) {
    let query = this.model.deleteMany(filter);
    if (options.session) query = query.session(options.session);
    return query.exec();
  }

  async aggregate(pipeline, options = {}) {
    let agg = this.model.aggregate(pipeline);
    if (options.session) agg = agg.session(options.session);
    return agg.exec();
  }
}

module.exports = BaseRepository;
