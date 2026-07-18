const mongoose = require('mongoose');

const BlockGroupSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Display label only.
  courseId: { type: Number, index: true },
  courseCode: { type: String, trim: true, uppercase: true },
  yearLevel: { type: Number, min: 1, max: 5, index: true },
  semester: { type: String, required: true, enum: ['1st', '2nd', 'Summer'] },
  schoolYear: { type: String, trim: true, match: /^\d{4}-\d{4}$/ },
  year: { type: Number, required: true },
  section: { type: String, trim: true, uppercase: true },
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
BlockGroupSchema.index({ courseId: 1, yearLevel: 1, section: 1, semester: 1, schoolYear: 1 });

module.exports = mongoose.model('BlockGroup', BlockGroupSchema);
