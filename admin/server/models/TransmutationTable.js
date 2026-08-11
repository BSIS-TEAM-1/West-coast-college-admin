const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Transmutation Table
 *
 * Maps raw percentage scores (0-100) to final grades on the 1.0-5.0 scale.
 * A table consists of ordered brackets; the first bracket whose minRaw <= rawScore
 * (and rawScore <= maxRaw) wins. Example:
 *
 *   { minRaw: 99, maxRaw: 100, grade: 1.00, label: 'Excellent' }
 *   { minRaw: 96, maxRaw: 98,  grade: 1.25, label: 'Superior' }
 *   ...
 *   { minRaw: 0,  maxRaw: 74,  grade: 5.00, label: 'Failed' }
 *
 * Only one table can be active at a time (isActive = true). Setting a new
 * active table automatically deactivates the previous one.
 */
const transmutationBracketSchema = new Schema({
  minRaw: { type: Number, required: true, min: 0, max: 100 },
  maxRaw: { type: Number, required: true, min: 0, max: 100 },
  grade: { type: Number, required: true, min: 1.0, max: 5.0 },
  label: { type: String, trim: true, default: '' }
}, { _id: false });

const transmutationTableSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  brackets: {
    type: [transmutationBracketSchema],
    required: true,
    validate: {
      validator: function(brackets) {
        if (!Array.isArray(brackets) || brackets.length === 0) return false;
        // Each bracket must have minRaw <= maxRaw
        return brackets.every(b => typeof b.minRaw === 'number' && typeof b.maxRaw === 'number' && b.minRaw <= b.maxRaw);
      },
      message: 'At least one bracket is required, and each bracket must have minRaw <= maxRaw.'
    }
  },
  isActive: {
    type: Boolean,
    default: false,
    index: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin'
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

transmutationTableSchema.index({ name: 1 }, { unique: true });

/**
 * Convert a raw percentage score to a final grade using this table's brackets.
 * Returns null if no bracket matches (should not happen if brackets cover 0-100).
 */
transmutationTableSchema.methods.transmute = function(rawScore) {
  if (typeof rawScore !== 'number' || !isFinite(rawScore)) return null;
  const clamped = Math.max(0, Math.min(100, rawScore));
  for (const b of this.brackets) {
    if (clamped >= b.minRaw && clamped <= b.maxRaw) {
      return b.grade;
    }
  }
  return null;
};

/**
 * Static helper: get the currently active table.
 */
transmutationTableSchema.statics.getActive = function() {
  return this.findOne({ isActive: true }).lean();
};

/**
 * Static helper: transmute a raw score using the active table.
 * Returns { grade, tableId, tableName } or null if no active table.
 */
transmutationTableSchema.statics.transmuteWithActive = async function(rawScore) {
  const table = await this.getActive();
  if (!table) return null;
  const grade = table.brackets.reduce((found, b) => {
    if (found !== null) return found;
    if (rawScore >= b.minRaw && rawScore <= b.maxRaw) return b.grade;
    return null;
  }, null);
  return grade === null ? null : { grade, tableId: table._id, tableName: table.name };
};

/**
 * When setting isActive = true, deactivate all other tables.
 */
transmutationTableSchema.pre('save', async function(next) {
  if (this.isModified('isActive') && this.isActive) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id }, isActive: true },
      { $set: { isActive: false } }
    );
  }
  next();
});

const TransmutationTable = mongoose.model('TransmutationTable', transmutationTableSchema);

module.exports = TransmutationTable;
