const mongoose = require('mongoose');
const Student = require('../models/Student');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const Enrollment = require('../models/Enrollment');
const Curriculum = require('../models/Curriculum');
const AcademicPeriod = require('../models/AcademicPeriod');

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
 * Evaluate whether a student's enrollment is eligible for a specific block section.
 *
 * @param {Object|null} enrollment - Enrollment document (lean), authoritative academic source
 * @param {Object} student - Student document (lean), for classification + studentStatus
 * @param {Object} blockGroup - BlockGroup document (lean)
 * @param {Object} blockSection - BlockSection document (lean)
 * @param {Object|null} existingAssignment - Existing StudentBlockAssignment or null
 * @param {Object|null} curriculumDoc - Curriculum document for blockGroup.curriculumId, or null
 * @param {Object|null} activePeriod - Active AcademicPeriod, or null
 * @returns {{ eligible: boolean, reasons: string[], checks: Object }}
 */
function evaluateStudentEligibility(enrollment, student, blockGroup, blockSection, existingAssignment, curriculumDoc, activePeriod, options = {}) {
  const { allowAutoEnroll = false } = options;
  const reasons = [];
  const checks = {
    program: true,
    yearLevel: true,
    curriculum: true,
    classification: true,
    capacity: true,
    conflicts: true,
    schoolYear: true,
    semester: true,
    enrollmentStatus: true,
  };

  // Use Enrollment as the authoritative academic source, fall back to Student for legacy
  const enrollmentCourse = enrollment ? enrollment.course : null;
  const enrollmentYearLevel = enrollment ? Number(enrollment.yearLevel) : null;
  const enrollmentSchoolYear = enrollment ? enrollment.schoolYear : null;
  const enrollmentSemester = enrollment ? enrollment.semester : null;

  // 1. Program / Course
  // The Enrollment.course field uses a limited enum (e.g. 'BSED') that may not
  // distinguish between sub-programs (BSED-English=102 vs BSED-Math=103).
  // If the enrollment course doesn't normalize to a numeric code, fall back to
  // student.course (which stores the numeric code: 101, 102, 103, 201).
  const normalizedEnrollmentCourse = normalizeCourseCode(enrollmentCourse);
  const studentCourse = normalizedEnrollmentCourse || normalizeCourseCode(student.course);
  const groupCourse = normalizeCourseCode(blockGroup.courseId || blockGroup.courseCode);
  if (groupCourse && studentCourse !== groupCourse) {
    checks.program = false;
    const studentLabel = COURSE_MAP[studentCourse] || studentCourse || 'Unknown';
    const blockLabel = COURSE_MAP[groupCourse] || groupCourse || 'Unknown';
    reasons.push(`Program/course does not match this block. Student is ${studentLabel}, block requires ${blockLabel}.`);
  }

  // 2. Year Level
  const groupYearLevel = Number(blockGroup.yearLevel);
  const effectiveYearLevel = Number.isFinite(enrollmentYearLevel) ? enrollmentYearLevel : Number(student.yearLevel);
  if (Number.isFinite(groupYearLevel) && groupYearLevel > 0) {
    if (effectiveYearLevel !== groupYearLevel) {
      checks.yearLevel = false;
      reasons.push(`Student year level does not match this block. Student is Year ${effectiveYearLevel}, block requires Year ${groupYearLevel}.`);
    }
  }

  // 3. Curriculum — Enrollment.curriculumId is authoritative, Student.curriculumVersion is legacy fallback.
  //
  // ARCHITECTURAL RULE:
  //   New enrollments should have curriculumId populated at creation time.
  //   Legacy enrollments (created before this field existed) may have curriculumId = null.
  //   For legacy records ONLY, Student.curriculumVersion is used as a temporary fallback
  //   to match against Curriculum.version.
  //
  //   Student.curriculumVersion MUST NEVER override an explicit Enrollment.curriculumId.
  //   This ensures historical immutability: a student changing their curriculum version
  //   cannot reinterpret locked historical enrollment records.
  if (blockGroup.curriculumId) {
    // Prefer Enrollment.curriculumId (authoritative, school-year-specific)
    const enrollmentCurriculumId = enrollment && enrollment.curriculumId ? String(enrollment.curriculumId) : null;

    if (enrollmentCurriculumId) {
      // Direct ObjectId comparison: enrollment curriculum vs block curriculum
      if (enrollmentCurriculumId !== String(blockGroup.curriculumId)) {
        checks.curriculum = false;
        const blockLabel = curriculumDoc
          ? `${curriculumDoc.programName || ''} ${curriculumDoc.version || ''}`.trim()
          : 'the required curriculum';
        reasons.push(`Curriculum mismatch. This block uses ${blockLabel}.`);
      }
    } else {
      // Legacy fallback: use Student.curriculumVersion to match against Curriculum.version
      const studentCurriculumVersion = String(student.curriculumVersion || '').trim();
      if (!studentCurriculumVersion) {
        // If auto-enroll is allowed and the block has a curriculum, the auto-created
        // enrollment will inherit the block's curriculum — so this is not a blocker.
        if (!allowAutoEnroll) {
          checks.curriculum = false;
          reasons.push('Student enrollment has no curriculum configured.');
        }
      } else if (curriculumDoc) {
        const blockVersion = String(curriculumDoc.version || '').trim();
        if (blockVersion && studentCurriculumVersion && blockVersion !== studentCurriculumVersion) {
          checks.curriculum = false;
          reasons.push(`Curriculum mismatch. This block uses the ${curriculumDoc.programName || ''} ${blockVersion} curriculum.`);
        }
      }
    }
  }

  // 4. Student Classification
  const blockClassification = blockGroup.studentClassification || 'All';
  if (blockClassification !== 'All') {
    const studentClassification = student.classification || 'Regular';
    if (studentClassification !== blockClassification) {
      checks.classification = false;
      reasons.push(`This block accepts ${blockClassification} students only.`);
    }
  }

  // 5. Capacity
  if (blockSection) {
    const current = Number(blockSection.currentPopulation) || 0;
    const capacity = Number(blockSection.capacity) || 0;
    if (current >= capacity) {
      checks.capacity = false;
      reasons.push(`Block section is full. ${current} / ${capacity} students.`);
    }
  }

  // 6. Existing assignment conflict
  if (existingAssignment) {
    checks.conflicts = false;
    reasons.push('Student already has a block assignment for this school year and semester.');
  }

  // 7. School Year — block must match enrollment's school year
  const blockSchoolYear = blockGroup.schoolYear || formatSchoolYearFromStartYear(blockGroup.year);
  if (enrollmentSchoolYear && blockSchoolYear && enrollmentSchoolYear !== blockSchoolYear) {
    checks.schoolYear = false;
    reasons.push(`Block belongs to a different school year (${blockSchoolYear}).`);
  }

  // Also reject if the block's school year is archived
  if (activePeriod && blockSchoolYear) {
    if (activePeriod.status === 'Archived' && activePeriod.schoolYear === blockSchoolYear) {
      checks.schoolYear = false;
      reasons.push(`School year ${blockSchoolYear} is archived and closed for new assignments.`);
    }
  }

  // 8. Semester — enrollment semester must match block semester
  if (enrollmentSemester && blockGroup.semester && enrollmentSemester !== blockGroup.semester) {
    checks.semester = false;
    reasons.push(`Block belongs to a different semester (${blockGroup.semester}).`);
  }

  // 9. Enrollment Status — reject locked/cancelled/dropped enrollments
  if (enrollment) {
    if (enrollment.lockedAt) {
      checks.enrollmentStatus = false;
      reasons.push('Enrollment is locked as a historical record and cannot receive new assignments.');
    }
    if (enrollment.status === 'Cancelled' || enrollment.status === 'Dropped') {
      checks.enrollmentStatus = false;
      reasons.push(`Enrollment status is ${enrollment.status} and cannot receive assignments.`);
    }
  } else if (!allowAutoEnroll) {
    checks.enrollmentStatus = false;
    reasons.push('No active enrollment found for this student.');
  }
  // If allowAutoEnroll is true and there's no enrollment, the enrollment will be
  // auto-created at assignment time — so this is not a blocker.

  // 10. Dropped student check
  if (student.studentStatus === 'Dropped') {
    checks.enrollmentStatus = false;
    reasons.push('Student is marked as Dropped and cannot be assigned to a block.');
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

  // Load active academic period
  const activePeriod = await AcademicPeriod.findOne({ status: 'Active' }).lean();

  // Load block groups for this school year and semester
  const groups = await BlockGroup.find({ schoolYear: effectiveSchoolYear, semester: effectiveSemester }).lean();

  if (!groups.length) {
    return { student: studentSummary, enrollment: enrollmentSummary, eligible: [], ineligible: [], recommended: null };
  }

  // Load all open sections for these groups
  const groupIds = groups.map((g) => g._id);
  const sections = await BlockSection.find({ blockGroupId: { $in: groupIds }, status: 'OPEN' }).lean();

  // Load curriculum docs for groups that have curriculumId
  const curriculumIds = [...new Set(groups.map((g) => g.curriculumId).filter(Boolean).map(String))];
  const curricula = curriculumIds.length
    ? await Curriculum.find({ _id: { $in: curriculumIds } }).select('version programCode programName status').lean()
    : [];
  const curriculumById = Object.fromEntries(curricula.map((c) => [String(c._id), c]));

  // Check for existing assignment — prefer enrollmentId if available
  let existingAssignment = null;
  if (enrollment) {
    existingAssignment = await StudentBlockAssignment.findOne({
      $or: [
        { enrollmentId: enrollment._id },
        { studentId: String(student._id), schoolYear: effectiveSchoolYear, semester: effectiveSemester },
      ],
      status: 'ASSIGNED',
    }).lean();
  } else {
    existingAssignment = await StudentBlockAssignment.findOne({
      studentId: String(student._id),
      schoolYear: effectiveSchoolYear,
      semester: effectiveSemester,
      status: 'ASSIGNED',
    }).lean();
  }

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
    const curriculumDoc = group.curriculumId ? curriculumById[String(group.curriculumId)] : null;

    for (const section of groupSections) {
      const isCurrentSection = existingAssignment && String(existingAssignment.sectionId) === String(section._id);
      const result = evaluateStudentEligibility(
        enrollment,
        student,
        group,
        section,
        isCurrentSection ? null : existingAssignment,
        curriculumDoc,
        activePeriod,
        { allowAutoEnroll: true }
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

  // Load curriculum doc for the block group if configured
  let curriculumDoc = null;
  if (group.curriculumId) {
    curriculumDoc = await Curriculum.findById(group.curriculumId).select('version programCode programName status').lean();
  }

  // Load active academic period
  const activePeriod = await AcademicPeriod.findOne({ status: 'Active' }).lean();

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

  // Check for existing assignments for all these students
  const existingAssignments = await StudentBlockAssignment.find({
    studentId: { $in: studentIds.map(String) },
    status: 'ASSIGNED',
  }).lean();
  const assignmentByStudent = {};
  for (const a of existingAssignments) {
    const sid = String(a.studentId);
    // Only flag as conflict if it's for a different section
    if (String(a.sectionId) !== String(section._id)) {
      assignmentByStudent[sid] = a;
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
    const existingAssignment = assignmentByStudent[String(studentId)] || null;

    const result = evaluateStudentEligibility(
      enrollment,
      student,
      group,
      section,
      existingAssignment,
      curriculumDoc,
      activePeriod,
      { allowAutoEnroll: true }
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
