const mongoose = require('mongoose');

const BlockGroupSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g., "BSIT-1"
  semester: { type: String, required: true, enum: ['1st', '2nd', 'Summer'] },
  year: { type: Number, required: true },
  policies: {
    overcapPolicy: { type: String, enum: ['allow', 'deny', 'waitlist'], default: 'allow' },
    maxOvercap: { type: Number, default: 5 },
    allowCapacityIncrease: { type: Boolean, default: true },
    allowAutoSectionCreation: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

BlockGroupSchema.index({ name: 1, semester: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('BlockGroup', BlockGroupSchema);
