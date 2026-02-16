const mongoose = require('mongoose');

const BlockSectionSchema = new mongoose.Schema({
  blockGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlockGroup', required: true },
  sectionCode: { type: String, required: true }, // e.g., "BSIT-1A"
  capacity: { type: Number, required: true, min: 1 },
  currentPopulation: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
  schedule: { type: String, trim: true },
  classAdviser: { type: String, trim: true, default: '' }
}, {
  timestamps: true
});

BlockSectionSchema.index({ blockGroupId: 1, sectionCode: 1 }, { unique: true });

module.exports = mongoose.model('BlockSection', BlockSectionSchema);
