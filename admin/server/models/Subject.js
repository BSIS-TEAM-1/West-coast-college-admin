const mongoose = require('mongoose');

const SubjectSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  version: {
    type: Number,
    default: 1,
    min: 1,
  },
  supersededById: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    default: null,
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  units: {
    type: Number,
    required: true,
    min: 0.5,
    max: 6
  },
  course: {
    type: Number,
    enum: [101, 102, 103, 201]
  },
  yearLevel: {
    type: Number,
    min: 1,
    max: 5
  },
  semester: {
    type: String,
    enum: ['1st', '2nd', 'Summer']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Versioned: unique is now (code, version) instead of just code
SubjectSchema.index({ code: 1, version: 1 }, { unique: true });
SubjectSchema.index({ course: 1, yearLevel: 1, semester: 1, isActive: 1 });
SubjectSchema.index({ isActive: 1, code: 1 });
SubjectSchema.index({ supersededById: 1 });

// Static: find the latest active version of a subject by code
SubjectSchema.statics.findLatestVersion = function (code) {
  return this.findOne({ code: code.toUpperCase(), isActive: true })
    .sort({ version: -1 })
    .exec();
};

// Static: find all versions of a subject by code
SubjectSchema.statics.findAllVersions = function (code) {
  return this.find({ code: code.toUpperCase() })
    .sort({ version: -1 })
    .exec();
};

// Static: create a new version of an existing subject (supersedes the old one)
SubjectSchema.statics.createNewVersion = async function (subjectId, updateData, updatedBy) {
  const oldSubject = await this.findById(subjectId);
  if (!oldSubject) throw new Error('Subject not found');
  if (oldSubject.supersededById) {
    throw new Error('Cannot revise an already superseded subject version.');
  }

  const newVersion = await this.create({
    code: oldSubject.code,
    title: updateData.title || oldSubject.title,
    units: updateData.units || oldSubject.units,
    course: updateData.course || oldSubject.course,
    yearLevel: updateData.yearLevel || oldSubject.yearLevel,
    semester: updateData.semester || oldSubject.semester,
    version: oldSubject.version + 1,
    isActive: true,
    createdBy: updatedBy,
    updatedBy: updatedBy,
  });

  // Mark old version as superseded and inactive
  await this.findByIdAndUpdate(subjectId, {
    $set: {
      supersededById: newVersion._id,
      isActive: false,
      updatedBy,
    },
  });

  return newVersion;
};

module.exports = mongoose.model('Subject', SubjectSchema);
