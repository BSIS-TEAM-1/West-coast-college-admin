const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CurriculumSubjectSchema = new Schema({
  curriculumId: {
    type: Schema.Types.ObjectId,
    ref: 'Curriculum',
    required: true,
    index: true,
  },
  subjectId: {
    type: Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
    index: true,
  },
  yearLevel: {
    type: Number,
    required: true,
    min: 1,
    max: 6,
  },
  semester: {
    type: String,
    enum: ['1st', '2nd', 'Summer'],
    required: true,
  },
  type: {
    type: String,
    enum: ['General', 'Major', 'Professional', 'Elective'],
    default: 'General',
  },
  isRequired: {
    type: Boolean,
    default: true,
  },

  // ===========================================================================
  // CURRICULUM SNAPSHOT FIELDS
  // ===========================================================================
  // These fields are copied from Subject at the moment this CurriculumSubject
  // is created (see CurriculumSubjectController.addSubject). Subject is the
  // reusable master/default definition; CurriculumSubject is the approved,
  // curriculum-specific academic record. Once created, these snapshot fields
  // are IMMUTABLE with respect to the global Subject — editing Subject.units,
  // Subject.title, etc. must NEVER cascade into an existing CurriculumSubject.
  // A registrar who wants to update a curriculum's version of a subject must
  // explicitly edit this CurriculumSubject record (PUT .../subjects/:id).
  //
  // Rationale for which fields are snapshotted vs. left as a live reference:
  //   - courseNo / descriptiveTitle / units / lecturePeriods / labPeriods /
  //     prerequisiteSubjectIds: SNAPSHOT — these define the approved academic
  //     identity and load of the subject as printed/approved within this
  //     specific curriculum, and directly drive curriculum unit/period totals.
  //   - subjectType: intentionally left as a LIVE reference via populated
  //     `subjectId` — it is categorical metadata that does not affect totals,
  //     so catalog-wide recategorization should not require editing every
  //     curriculum placement.
  //   - status/isActive: GLOBAL MASTER ONLY — whether a subject can be newly
  //     placed elsewhere is a catalog-wide concern, unrelated to whether it
  //     remains part of an already-approved curriculum.
  courseNo: {
    type: String,
    trim: true,
  },
  descriptiveTitle: {
    type: String,
    trim: true,
  },
  units: {
    type: Number,
    min: 0,
  },
  lecturePeriods: {
    type: Number,
    min: 0,
    default: 0,
  },
  labPeriods: {
    type: Number,
    min: 0,
    default: 0,
  },
  // Placement-time SNAPSHOT of Subject.prerequisiteSubjectIds (the
  // authoritative source — see models/Subject.js). Copied here when the
  // subject is added to this curriculum so the curriculum's approved
  // prerequisite structure is preserved even if the global Subject's
  // prerequisites change later. A registrar may explicitly override this
  // per-placement. Do NOT treat this as an independently-maintained list
  // that drifts on its own — it only changes via explicit registrar edit.
  prerequisiteSubjectIds: [{
    type: Schema.Types.ObjectId,
    ref: 'Subject',
  }],
  displayOrder: {
    type: Number,
    default: 0,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
  },
}, {
  timestamps: true,
});

// Prevent duplicate placement of the same subject within the same curriculum
CurriculumSubjectSchema.index(
  { curriculumId: 1, subjectId: 1 },
  { unique: true }
);

// Efficient querying by curriculum + year + semester
CurriculumSubjectSchema.index({ curriculumId: 1, yearLevel: 1, semester: 1, displayOrder: 1 });

module.exports = mongoose.model('CurriculumSubject', CurriculumSubjectSchema);
