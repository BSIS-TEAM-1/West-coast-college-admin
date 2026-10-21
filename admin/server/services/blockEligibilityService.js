const mongoose = require('mongoose');
const Student = require('../models/Student');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const Enrollment = require('../models/Enrollment');

const COURSE_MAP = {
  101: 'BEED',
  102: 'BSEd-English',
  103: 'BSEd-Math',
  201: 'BSBA-HRM',
};

function normalizeCourseCode(rawCourse) {
  if (rawCourse === null || rawCourse === undefined) return null;
  const text = String(rawCourse).trim();
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const upper = text.toUpperCase().replace(/\u2013/g, '-');
  if (upper === 'BEED') return 101;
  if (upper === 'BSED-ENGLISH' || upper === 'ENGLISH') return 102;
  if (upper === 'BSED-MATH' || upper === 'MATH' || upper === 'MATHEMATICS') return 103;
  if (upper === 'BSBA-HRM' || upper === 'BSBS-HRM' || upper === 'HRM') return 201;

  return null;
}

function formatSchoolYearFromStartYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year) || year < 1000) return '';
  return `${year}-${year + 1}`;
}

/**
 * Find the active/current enrollment for a student.
 * Prefers isCurrent=true with status Enrolled or Pending.
 * Falls back to the most recent enrollment matching schoolYear/semester.
 */
async function findActiveEnrollment(studentId, schoolYear, semester) {
  let query = { studentId, isCurrent: true, status: { $in: ['Enrolled', 'Pending'] } };
  if (schoolYear) query.schoolYear = schoolYear;
  if (semester) query.semester = semester;

  let enrollment = await Enrollment.findOne(query).lean();
  if (enrollment) return enrollment;

  query = { studentId };
  if (schoolYear) query.schoolYear = schoolYear;
  if (semester) query.semester = semester;
  enrollment = await Enrollment.findOne(query).sort({ createdAt: -1 }).lean();
  return enrollment;
}

/**
 * Evaluate whether a student may join a specific block section.
 *
 * Deliberately simple: a student can join any section that matches their
 * course and year level and still has a free slot. Curriculum version,
 * student classification, school year, semester, enrollment status and prior
 * assignments are NOT blocking conditions — the registrar decides those, and
 * the enrollment is created or reconciled when the assignment is saved.
 *
 * The extra parameters are kept so existing callers keep working; they are no
 * longer consulted.
 *
 * @param {Object|null} enrollment - Enrollment document (lean); course/year source when present
 * @param {Object} student - Student document (lean)
 * @param {Object} blockGroup - BlockGroup document (lean)
 * @param {Object} blockSection - BlockSection document (lean)
 * @param {Object|null} _existingAssignment - Ignored
 * @param {Object|null} _curriculumDoc - Ignored
 * @param {Object|null} _activePeriod - Ignored
 * @param {Object} [_options] - Ignored
 * @returns {{ eligible: boolean, reasons: string[], checks: Object }}
 */
function evaluateStudentEligibility(enrollment, student, blockGroup, blockSection, _existingAssignment, _curriculumDoc, _activePeriod, _options = {}) {
  const reasons = [];
  const checks = {
    program: true,
    yearLevel: true,
    capacity: true,
  };

  // 1. Course / program only. The enrollment is authoritative when present,
  //    because its course enum may be coarser than the numeric student code
  //    (BSED-English vs BSED-Math); fall back to student.course otherwise.
  const enrollmentCourse = enrollment ? normalizeCourseCode(enrollment.course) : null;
  const studentCourse = enrollmentCourse || normalizeCourseCode(student.course);
  const groupCourse = normalizeCourseCode(blockGroup.courseId || blockGroup.courseCode);
  if (groupCourse && studentCourse !== groupCourse) {
    checks.program = false;
    const studentLabel = COURSE_MAP[studentCourse] || studentCourse || 'Unknown';
    const blockLabel = COURSE_MAP[groupCourse] || groupCourse || 'Unknown';
    reasons.push(`Program/course does not match this block. Student is ${studentLabel}, block requires ${blockLabel}.`);
  }

  // 2. Year level only.
  const groupYearLevel = Number(blockGroup.yearLevel);
  const enrollmentYearLevel = enrollment ? Number(enrollment.yearLevel) : NaN;
  const effectiveYearLevel = Number.isFinite(enrollmentYearLevel)
    ? enrollmentYearLevel
    : Number(student.yearLevel);
  if (Number.isFinite(groupYearLevel) && groupYearLevel > 0 && effectiveYearLevel !== groupYearLevel) {
    checks.yearLevel = false;
    reasons.push(`Student year level does not match this block. Student is Year ${effectiveYearLevel}, block requires Year ${groupYearLevel}.`);
  }

  // 3. Capacity is a property of the section, not of the student, so it stays
  //    a hard stop — a section cannot hold more students than it has slots.
  if (blockSection) {
    const current = Number(blockSection.currentPopulation) || 0;
    const capacity = Number(blockSection.capacity) || 0;
    if (current >= capacity) {
      checks.capacity = false;
      reasons.push(`Block section is full. ${current} / ${capacity} students.`);
    }
  }

  const eligible = reasons.length === 0;

  return { eligible, reasons, checks };
}

/**
 * Get all eligible and ineligible blocks for a student.
 *
 * @param {string} studentId - Student ObjectId string
 * @param {Object} options - Optional overrides { schoolYear, semester }
 * @returns {Promise<Object>} { student, enrollment, eligible, ineligible, recommended }
 */
async function getEligibleBlocks(studentId, options = {}) {
  const student = await Student.findById(studentId)
    .select('studentNumber firstName lastName course yearLevel classification curriculumVersion schoolYear semester studentStatus')
    .lean();

  if (!student) {
    throw new Error('Student not found');
  }

  const schoolYear = options.schoolYear || student.schoolYear || '';
  const semester = options.semester || student.semester || '';

  // Find the active enrollment
  const enrollment = await findActiveEnrollment(studentId, schoolYear, semester);

  // Use enrollment's academic info if available, fall back to student
  const effectiveSchoolYear = enrollment ? enrollment.schoolYear : schoolYear;
  const effectiveSemester = enrollment ? enrollment.semester : semester;

  const studentSummary = {
    _id: String(student._id),
    studentNumber: student.studentNumber,
    name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
    course: student.course,
    yearLevel: student.yearLevel,
    classification: student.classification || 'Regular',
    curriculumVersion: student.curriculumVersion,
    schoolYear: effectiveSchoolYear,
    semester: effectiveSemester,
    studentStatus: student.studentStatus,
  };

  const enrollmentSummary = enrollment ? {
    _id: String(enrollment._id),
    schoolYear: enrollment.schoolYear,
    semester: enrollment.semester,
    yearLevel: enrollment.yearLevel,
    course: enrollment.course,
    curriculumId: enrollment.curriculumId ? String(enrollment.curriculumId) : null,
    status: enrollment.status,
  } : null;

  if (!effectiveSchoolYear || !effectiveSemester) {
    return { student: studentSummary, enrollment: enrollmentSummary, eligible: [], ineligible: [], recommended: null };
  }

  // Only blocks for the student's current term are offered; course, year
  // level and capacity decide the rest.
  const groups = await BlockGroup.find({ schoolYear: effectiveSchoolYear, semester: effectiveSemester }).lean();

  if (!groups.length) {
    return { student: studentSummary, enrollment: enrollmentSummary, eligible: [], ineligible: [], recommended: null };
  }

  // Load all open sections for these groups
  const groupIds = groups.map((g) => g._id);
  const sections = await BlockSection.find({ blockGroupId: { $in: groupIds }, status: 'OPEN' }).lean();

  // Group sections by blockGroupId
  const sectionsByGroup = {};
  for (const section of sections) {
    const gid = String(section.blockGroupId);
    if (!sectionsByGroup[gid]) sectionsByGroup[gid] = [];
    sectionsByGroup[gid].push(section);
  }

  const eligible = [];
  const ineligible = [];

  for (const group of groups) {
    const groupSections = sectionsByGroup[String(group._id)] || [];

    for (const section of groupSections) {
      const result = evaluateStudentEligibility(
        enrollment,
        student,
        group,
        section
      );

      const entry = {
        blockGroup: {
          _id: String(group._id),
          name: group.name,
          courseId: group.courseId,
          courseCode: group.courseCode,
          yearLevel: group.yearLevel,
          semester: group.semester,
          schoolYear: group.schoolYear,
          year: group.year,
          section: group.section,
          curriculumId: group.curriculumId ? String(group.curriculumId) : null,
          studentClassification: group.studentClassification || 'All',
        },
        section: {
          _id: String(section._id),
          sectionCode: section.sectionCode,
          capacity: section.capacity,
          currentPopulation: section.currentPopulation,
          status: section.status,
        },
        slotsAvailable: Math.max(0, (section.capacity || 0) - (section.currentPopulation || 0)),
      };

      if (result.eligible) {
        eligible.push(entry);
      } else {
        ineligible.push({ ...entry, reasons: result.reasons, checks: result.checks });
      }
    }
  }

  // Recommendation: lowest currentPopulation, tie-break by sectionCode (deterministic)
  eligible.sort((a, b) => {
    const popDiff = (a.section.currentPopulation || 0) - (b.section.currentPopulation || 0);
    if (popDiff !== 0) return popDiff;
    return String(a.section.sectionCode).localeCompare(String(b.section.sectionCode));
  });

  const recommended = eligible.length > 0 ? eligible[0] : null;

  return { student: studentSummary, enrollment: enrollmentSummary, eligible, ineligible, recommended };
}

/**
 * Evaluate eligibility for multiple students against a single block section.
 * Uses the same evaluateStudentEligibility function as single-student checks.
 *
 * @param {string[]} studentIds - Array of Student ObjectId strings
 * @param {string} sectionId - BlockSection ObjectId string
 * @returns {Promise<Object>} { section, eligible, ineligible, summary }
 */
async function getBulkEligibility(studentIds, sectionId) {
  if (!Array.isArray(studentIds) || !studentIds.length) {
    throw new Error('studentIds must be a non-empty array');
  }
  if (!sectionId || !mongoose.Types.ObjectId.isValid(sectionId)) {
    throw new Error('Valid sectionId is required');
  }

  const section = await BlockSection.findById(sectionId).lean();
  if (!section) {
    throw new Error('Block section not found');
  }

  const group = await BlockGroup.findById(section.blockGroupId).lean();
  if (!group) {
    throw new Error('Block group not found for this section');
  }

  // Load all students in one query
  const students = await Student.find({ _id: { $in: studentIds } })
    .select('studentNumber firstName lastName course yearLevel classification curriculumVersion schoolYear semester studentStatus')
    .lean();

  const studentById = Object.fromEntries(students.map((s) => [String(s._id), s]));

  // Load all active enrollments for these students in one query
  const enrollments = await Enrollment.find({
    studentId: { $in: studentIds },
    isCurrent: true,
    status: { $in: ['Enrolled', 'Pending'] },
  }).lean();

  // Build a map of studentId → enrollment (most recent per student)
  const enrollmentByStudent = {};
  for (const enr of enrollments) {
    const sid = String(enr.studentId);
    if (!enrollmentByStudent[sid] || new Date(enr.createdAt) > new Date(enrollmentByStudent[sid].createdAt)) {
      enrollmentByStudent[sid] = enr;
    }
  }

  const eligible = [];
  const ineligible = [];

  for (const studentId of studentIds) {
    const student = studentById[String(studentId)];
    if (!student) {
      ineligible.push({
        studentId: String(studentId),
        studentName: 'Unknown',
        eligible: false,
        reasons: ['Student not found.'],
        checks: {},
      });
      continue;
    }

    const enrollment = enrollmentByStudent[String(studentId)] || null;

    const result = evaluateStudentEligibility(
      enrollment,
      student,
      group,
      section
    );

    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();

    if (result.eligible) {
      eligible.push({
        studentId: String(studentId),
        studentName,
        studentNumber: student.studentNumber,
        eligible: true,
      });
    } else {
      ineligible.push({
        studentId: String(studentId),
        studentName,
        studentNumber: student.studentNumber,
        eligible: false,
        reasons: result.reasons,
        checks: result.checks,
      });
    }
  }

  return {
    section: {
      _id: String(section._id),
      sectionCode: section.sectionCode,
      capacity: section.capacity,
      currentPopulation: section.currentPopulation,
      status: section.status,
    },
    blockGroup: {
      _id: String(group._id),
      name: group.name,
      curriculumId: group.curriculumId ? String(group.curriculumId) : null,
      studentClassification: group.studentClassification || 'All',
    },
    eligible,
    ineligible,
    summary: {
      total: studentIds.length,
      eligibleCount: eligible.length,
      ineligibleCount: ineligible.length,
      slotsAvailable: Math.max(0, (section.capacity || 0) - (section.currentPopulation || 0)),
    },
  };
}

module.exports = {
  evaluateStudentEligibility,
  getEligibleBlocks,
  getBulkEligibility,
  findActiveEnrollment,
  normalizeCourseCode,
  formatSchoolYearFromStartYear,
};
