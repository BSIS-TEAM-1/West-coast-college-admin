const EvaluationPeriod = require('../models/EvaluationPeriod');
const EvaluationResponse = require('../models/EvaluationResponse');
const EvaluationCompletion = require('../models/EvaluationCompletion');
const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const Admin = require('../models/Admin');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const BlockSection = require('../models/BlockSection');
const BlockSubjectAssignment = require('../models/BlockSubjectAssignment');
const SystemSetting = require('../models/SystemSetting');
const { DEFAULT_SCHOOL_YEAR, DEFAULT_SEMESTER } = require('../lib/academicTerm');

async function getActiveAcademicTerm() {
  try {
    const setting = await SystemSetting.findOne({ key: 'academicTerm' }).lean();
    const value = setting?.value || {};
    const schoolYear = /^\d{4}-\d{4}$/.test(String(value.schoolYear || '').trim())
      ? String(value.schoolYear).trim()
      : DEFAULT_SCHOOL_YEAR;
    const semester = ['1st', '2nd', 'Summer'].includes(value.semester)
      ? value.semester
      : DEFAULT_SEMESTER;
    return { schoolYear, semester };
  } catch {
    return { schoolYear: DEFAULT_SCHOOL_YEAR, semester: DEFAULT_SEMESTER };
  }
}

const EVALUATION_CRITERIA = [
  'Subject Knowledge',
  'Teaching Effectiveness',
  'Communication Skills',
  'Classroom Management',
  'Punctuality & Professionalism',
  'Student Engagement'
];

const DEFAULT_EVALUATION_QUESTIONS = [
  {
    number: 1,
    category: 'Subject Knowledge',
    criteria: 'Subject Knowledge',
    text: 'The professor demonstrates in-depth knowledge and mastery of the subject matter.'
  },
  {
    number: 2,
    category: 'Subject Knowledge',
    criteria: 'Subject Knowledge',
    text: 'The professor explains lessons clearly and illustrates concepts with relevant examples.'
  },
  {
    number: 3,
    category: 'Teaching Effectiveness',
    criteria: 'Teaching Effectiveness',
    text: 'The professor organizes course material effectively and employs helpful teaching methods.'
  },
  {
    number: 4,
    category: 'Teaching Effectiveness',
    criteria: 'Teaching Effectiveness',
    text: 'Overall, the professor demonstrates effective teaching and facilitates deep learning.'
  },
  {
    number: 5,
    category: 'Communication Skills',
    criteria: 'Communication Skills',
    text: 'The professor communicates course expectations, instructions, and feedback clearly.'
  },
  {
    number: 6,
    category: 'Classroom Management',
    criteria: 'Classroom Management',
    text: 'The professor manages class time effectively and maintains an orderly learning environment.'
  },
  {
    number: 7,
    category: 'Punctuality & Professionalism',
    criteria: 'Punctuality & Professionalism',
    text: 'The professor comes to class on time, well-prepared, and maintains high professional standards.'
  },
  {
    number: 8,
    category: 'Punctuality & Professionalism',
    criteria: 'Punctuality & Professionalism',
    text: 'The professor treats students fairly, respectfully, and without bias or favoritism.'
  },
  {
    number: 9,
    category: 'Student Engagement',
    criteria: 'Student Engagement',
    text: 'The professor encourages active participation, questions, and thoughtful discussions.'
  },
  {
    number: 10,
    category: 'Student Engagement',
    criteria: 'Student Engagement',
    text: 'The professor provides helpful guidance and constructive support for student growth.'
  }
];

const EVALUATION_QUESTIONS = DEFAULT_EVALUATION_QUESTIONS;

const EMOJI_RATING_SCALE = [
  { score: 1, emoji: '😡', label: 'Very Poor' },
  { score: 2, emoji: '😕', label: 'Poor' },
  { score: 3, emoji: '😐', label: 'Average' },
  { score: 4, emoji: '😊', label: 'Good' },
  { score: 5, emoji: '🤩', label: 'Excellent' }
];

const RATING_BY_SCORE = new Map(EMOJI_RATING_SCALE.map((item) => [item.score, item]));

function parseDateTimeInput(dateStr, timeStr = '23:59') {
  const cleanDate = String(dateStr || '').trim();
  const cleanTime = String(timeStr || '23:59').trim() || '23:59';
  if (!cleanDate) return null;
  const isoCandidate = `${cleanDate}T${cleanTime.length === 5 ? `${cleanTime}:00` : cleanTime}`;
  const parsed = new Date(isoCandidate);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = new Date(cleanDate);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatDateTimeDisplay(dateValue) {
  if (!dateValue) return 'TBA';
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'TBA';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function getEmojiForAverage(avg) {
  const numeric = Number(avg || 0);
  if (numeric <= 0) return { emoji: '😐', label: 'No Ratings Yet' };
  const rounded = Math.min(5, Math.max(1, Math.round(numeric)));
  return RATING_BY_SCORE.get(rounded) || { emoji: '😐', label: 'Average' };
}

async function syncPeriodEffectiveStatus(periodDoc) {
  if (!periodDoc) return null;
  const now = new Date();
  const effectiveStatus = EvaluationPeriod.computeEffectiveStatus(periodDoc, now);

  // Automatically close in DB if deadline has passed and period was open/extended/scheduled
  if (effectiveStatus === 'closed' && periodDoc.status !== 'closed' && periodDoc._id) {
    await EvaluationPeriod.updateOne(
      { _id: periodDoc._id },
      { $set: { status: 'closed' } }
    ).catch(() => null);
    periodDoc.status = 'closed';
  }

  const startAt = periodDoc.startAt ? new Date(periodDoc.startAt) : null;
  const endAt = periodDoc.endAt ? new Date(periodDoc.endAt) : null;
  const isOpen = effectiveStatus === 'open' || effectiveStatus === 'extended';
  const isExpired = Boolean(endAt && now > endAt);

  const questions = Array.isArray(periodDoc.questions) && periodDoc.questions.length > 0
    ? periodDoc.questions
    : DEFAULT_EVALUATION_QUESTIONS;

  return {
    id: String(periodDoc._id || ''),
    _id: String(periodDoc._id || ''),
    title: periodDoc.title || `${periodDoc.semester} Semester ${periodDoc.schoolYear} Professor Evaluation`,
    semester: periodDoc.semester,
    schoolYear: periodDoc.schoolYear,
    startDate: periodDoc.startDate,
    startTime: periodDoc.startTime || '08:00',
    startAt: startAt ? startAt.toISOString() : null,
    startDisplay: formatDateTimeDisplay(startAt),
    deadlineDate: periodDoc.deadlineDate,
    closingTime: periodDoc.closingTime || '23:59',
    endAt: endAt ? endAt.toISOString() : null,
    deadlineDisplay: formatDateTimeDisplay(endAt),
    status: effectiveStatus,
    rawStatus: periodDoc.status,
    manualState: periodDoc.manualState || 'auto',
    isOpen,
    isExpired,
    applicablePrograms: Array.isArray(periodDoc.applicablePrograms) && periodDoc.applicablePrograms.length > 0
      ? periodDoc.applicablePrograms
      : ['All Programs'],
    applicableSubjects: periodDoc.applicableSubjects || 'All Enrolled Subjects',
    applicableProfessors: periodDoc.applicableProfessors || 'All Assigned Faculty',
    description: periodDoc.description || '',
    questions,
    extensionHistory: Array.isArray(periodDoc.extensionHistory) ? periodDoc.extensionHistory : [],
    createdAt: periodDoc.createdAt,
    updatedAt: periodDoc.updatedAt
  };
}

async function ensurePeriodForTerm(semester, schoolYear, createIfMissing = false) {
  const activeTerm = (!semester || !schoolYear) ? await getActiveAcademicTerm() : null;
  const normalizedSemester = ['1st', '2nd', 'Summer'].includes(String(semester || '').trim())
    ? String(semester).trim()
    : (activeTerm?.semester || DEFAULT_SEMESTER);
  const normalizedSchoolYear = /^\d{4}-\d{4}$/.test(String(schoolYear || '').trim())
    ? String(schoolYear).trim()
    : (activeTerm?.schoolYear || (await getActiveAcademicTerm()).schoolYear);

  let period = await EvaluationPeriod.findOne({
    semester: normalizedSemester,
    schoolYear: normalizedSchoolYear
  }).sort({ createdAt: -1 }).lean();

  if (!period && createIfMissing) {
    const now = new Date();
    const startAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const endAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const toDateStr = (d) => d.toISOString().slice(0, 10);

    const created = await EvaluationPeriod.create({
      title: `${normalizedSemester} Semester ${normalizedSchoolYear} Professor Evaluation`,
      semester: normalizedSemester,
      schoolYear: normalizedSchoolYear,
      startDate: toDateStr(startAt),
      startTime: '08:00',
      startAt,
      deadlineDate: toDateStr(endAt),
      closingTime: '23:59',
      endAt,
      status: 'open',
      manualState: 'started',
      questions: DEFAULT_EVALUATION_QUESTIONS,
      description: 'Official faculty teaching effectiveness evaluation period.'
    });
    period = created.toObject();
  }

  if (!period) return null;
  return syncPeriodEffectiveStatus(period);
}

async function loadProfessorLookup() {
  const professors = await Admin.find({ accountType: 'professor' })
    .select('_id username displayName uid email')
    .lean();

  const byIdentifier = new Map();
  for (const prof of professors) {
    const entry = {
      professorId: String(prof._id),
      professorName: String(prof.displayName || prof.username || 'Professor').trim(),
      username: String(prof.username || '').trim()
    };
    for (const key of [prof.displayName, prof.username, prof.uid]) {
      const normalized = String(key || '').trim().toLowerCase();
      if (normalized) {
        byIdentifier.set(normalized, entry);
      }
    }
  }

  return { professors, byIdentifier };
}

function resolveSubjectProfessor(subject, student, professorLookup) {
  const rawInstructor = String(subject?.instructor || '').trim();
  const isPlaceholder = !rawInstructor || /^tba$/i.test(rawInstructor) || /^n\/a$/i.test(rawInstructor) || /^unassigned$/i.test(rawInstructor);
  const candidateName = !isPlaceholder
    ? rawInstructor
    : String(student?.assignedProfessor || '').trim();

  const isCandidatePlaceholder = !candidateName || /^tba$/i.test(candidateName) || /^n\/a$/i.test(candidateName) || /^unassigned$/i.test(candidateName);

  if (!isCandidatePlaceholder) {
    const matched = professorLookup?.byIdentifier?.get(candidateName.toLowerCase());
    if (matched) {
      return {
        professorId: matched.professorId,
        professorName: matched.professorName,
        isAssigned: true
      };
    }
    return {
      professorId: null,
      professorName: candidateName,
      isAssigned: true
    };
  }

  // If no professor is assigned to this subject, do NOT assign an arbitrary professor.
  // Evaluation entries must only be generated for actual teaching assignments.
  return {
    professorId: null,
    professorName: 'Unassigned Faculty',
    isAssigned: false
  };
}

function adviserKeyFor(professorId, professorName) {
  if (professorId) return `id:${String(professorId)}`;
  return `name:${String(professorName || 'Assigned Faculty').trim().toLowerCase()}`;
}

async function getStudentSectionCode(student, enrollment) {
  try {
    if (student?._id) {
      const blockAssignment = await StudentBlockAssignment.findOne({
        studentId: student._id,
        status: 'ASSIGNED',
        semester: enrollment.semester
      }).lean();

      if (blockAssignment?.sectionId) {
        const section = await BlockSection.findById(blockAssignment.sectionId).select('sectionCode').lean();
        if (section?.sectionCode) return section.sectionCode;
      }
    }
  } catch {
    // Non-fatal, fallback to student.section or enrollment
  }
  return student?.section || enrollment?.sectionCode || 'Unassigned';
}

async function getStudentTermEvaluationStatus(student, enrollment, preloadedLookup = null, preloadedCompletions = null, explicitPeriod = null) {
  if (!student || !enrollment) {
    return {
      requiredCount: 0,
      completedCount: 0,
      pendingCount: 0,
      allCompleted: true,
      completionPercentage: 100,
      gradesLocked: false,
      period: null,
      subjectsByCode: new Map(),
      subjectsList: [],
      evaluationEntries: []
    };
  }

  const professorLookup = preloadedLookup || await loadProfessorLookup();
  // Ineligible subjects (e.g. Dropped or Removed) must NOT generate evaluation entries
  const activeSubjects = (enrollment.subjects || []).filter((subj) => {
    const status = String(subj.status || 'Enrolled').trim();
    return ['Enrolled', 'Incomplete', 'Completed'].includes(status) &&
      status.toLowerCase() !== 'dropped' &&
      status.toLowerCase() !== 'removed';
  });

  const completions = preloadedCompletions || await EvaluationCompletion.find({
    studentId: student._id,
    semester: enrollment.semester,
    schoolYear: enrollment.schoolYear
  }).lean();

  const period = explicitPeriod || await ensurePeriodForTerm(
    enrollment.semester,
    enrollment.schoolYear,
    false
  );

  const sectionCode = await getStudentSectionCode(student, enrollment);

  let sectionId = null;
  if (student?._id) {
    try {
      const blockAssignment = await StudentBlockAssignment.findOne({
        studentId: student._id,
        status: 'ASSIGNED',
        semester: enrollment.semester
      }).lean();
      if (blockAssignment?.sectionId) {
        sectionId = blockAssignment.sectionId;
      }
    } catch {
      // Non-fatal
    }
  }

  const bsaMap = new Map();
  if (sectionId) {
    try {
      const bsaDocs = await BlockSubjectAssignment.find({
        blockSectionId: sectionId,
        semester: enrollment.semester,
        academicYear: enrollment.schoolYear
      }).lean();
      for (const bsa of bsaDocs || []) {
        if (bsa.subjectId) {
          bsaMap.set(String(bsa.subjectId), String(bsa._id));
        }
      }
    } catch {
      // Non-fatal
    }
  }

  const completionByCode = new Map();
  for (const comp of completions) {
    const code = String(comp.subjectCode || '').trim().toUpperCase();
    if (code) completionByCode.set(code, comp);
  }

  const subjectsByCode = new Map();
  const subjectsList = [];
  const evaluationEntries = [];

  for (const subj of activeSubjects) {
    const code = String(subj.code || '').trim().toUpperCase();
    if (!code) continue;

    const prof = resolveSubjectProfessor(subj, student, professorLookup);
    const completion = completionByCode.get(code) || null;
    const isCompleted = Boolean(completion);
    const canEvaluate = !isCompleted && prof.isAssigned && Boolean(period?.isOpen);

    const statusLabel = isCompleted
      ? 'Completed'
      : (period && period.isOpen ? 'Pending' : 'Closed');

    const bsaId = subj.subjectId ? bsaMap.get(String(subj.subjectId)) : null;
    const teachingAssignmentId = bsaId || (subj._id ? String(subj._id) : `${code}-${enrollment._id}`);
    const subjectName = String(subj.title || code).trim();

    const item = {
      id: `${code}-${enrollment._id}`,
      enrollmentId: String(enrollment._id),
      studentId: student?._id ? String(student._id) : '',
      teachingAssignmentId: String(teachingAssignmentId),
      subjectId: subj.subjectId ? String(subj.subjectId) : null,
      subjectCode: code,
      subjectName,
      subjectTitle: subjectName,
      units: Number(subj.units || 0),
      schedule: subj.schedule || 'TBA',
      room: subj.room || 'TBA',
      sectionCode: sectionCode || student.section || 'Unassigned',
      schoolYear: enrollment.schoolYear,
      academicYear: enrollment.schoolYear,
      semester: enrollment.semester,
      evaluationPeriod: period ? (period.id || period._id) : null,
      periodId: period ? (period.id || period._id) : null,
      instructor: prof.professorName,
      professorId: completion?.professorId ? String(completion.professorId) : prof.professorId,
      professorName: completion?.professorName || prof.professorName,
      isAssigned: prof.isAssigned,
      adviserKey: adviserKeyFor(
        completion?.professorId ? String(completion.professorId) : prof.professorId,
        completion?.professorName || prof.professorName
      ),
      evaluationRequired: prof.isAssigned,
      evaluationCompleted: isCompleted,
      status: statusLabel,
      completedAt: completion?.completedAt || null,
      canEvaluate
    };

    subjectsByCode.set(code, item);
    subjectsList.push(item);

    // Only eligible, assigned faculty teaching assignments generate active evaluation cards
    if (prof.isAssigned) {
      evaluationEntries.push(item);
    }
  }

  const eligibleItems = subjectsList.filter((s) => s.evaluationRequired);
  const requiredCount = eligibleItems.length;
  const completedCount = eligibleItems.filter((s) => s.evaluationCompleted).length;
  const pendingCount = Math.max(0, requiredCount - completedCount);
  const allCompleted = requiredCount === 0 ? true : completedCount >= requiredCount;
  const completionPercentage = requiredCount > 0 ? Math.round((completedCount / requiredCount) * 100) : 100;

  return {
    requiredCount,
    completedCount,
    pendingCount,
    allCompleted,
    completionPercentage,
    gradesLocked: !allCompleted,
    period,
    subjectsByCode,
    subjectsList,
    evaluationEntries
  };
}

/**
 * Group subjects by professor for views that display grouped courses,
 * while maintaining strict per-subject evaluation tracking.
 */
function groupEvaluationSubjectsByAdviser(subjectsList, period) {
  const groups = new Map();

  for (const item of subjectsList || []) {
    if (!item.isAssigned && !item.evaluationRequired) continue;
    const key = item.adviserKey || adviserKeyFor(item.professorId, item.professorName);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        professorId: item.professorId || null,
        professorName: item.professorName || 'Assigned Faculty',
        subjects: []
      });
    }
    groups.get(key).subjects.push(item);
  }

  return Array.from(groups.values())
    .map((group) => {
      const completedCount = group.subjects.filter((s) => s.evaluationCompleted).length;
      const subjectCount = group.subjects.length;
      const evaluationCompleted = subjectCount > 0 && completedCount >= subjectCount;
      const completedDates = group.subjects
        .map((s) => (s.completedAt ? new Date(s.completedAt).getTime() : 0))
        .filter((value) => value > 0);

      return {
        key: group.key,
        professorId: group.professorId,
        professorName: group.professorName,
        subjectCodes: group.subjects.map((s) => s.subjectCode),
        subjectCount,
        completedCount,
        evaluationCompleted,
        canEvaluate: !evaluationCompleted && Boolean(period?.isOpen),
        evaluatedAt: completedDates.length > 0 ? new Date(Math.max(...completedDates)) : null,
        subjects: group.subjects.map((s) => ({
          id: s.id,
          studentId: s.studentId || null,
          teachingAssignmentId: s.teachingAssignmentId || null,
          subjectId: s.subjectId || null,
          subjectCode: s.subjectCode,
          subjectName: s.subjectName || s.subjectTitle,
          subjectTitle: s.subjectTitle,
          units: s.units,
          schedule: s.schedule,
          room: s.room,
          sectionCode: s.sectionCode,
          schoolYear: s.schoolYear,
          academicYear: s.academicYear || s.schoolYear,
          semester: s.semester,
          status: s.status,
          evaluationCompleted: Boolean(s.evaluationCompleted),
          canEvaluate: Boolean(s.canEvaluate),
          completedAt: s.completedAt || null
        }))
      };
    })
    .sort((a, b) => String(a.professorName).localeCompare(String(b.professorName)));
}

module.exports = {
  EVALUATION_CRITERIA,
  DEFAULT_EVALUATION_QUESTIONS,
  EVALUATION_QUESTIONS,
  EMOJI_RATING_SCALE,
  RATING_BY_SCORE,
  parseDateTimeInput,
  formatDateTimeDisplay,
  getEmojiForAverage,
  syncPeriodEffectiveStatus,
  getActiveAcademicTerm,
  ensurePeriodForTerm,
  loadProfessorLookup,
  resolveSubjectProfessor,
  adviserKeyFor,
  getStudentSectionCode,
  getStudentTermEvaluationStatus,
  groupEvaluationSubjectsByAdviser,
  EvaluationPeriod,
  EvaluationResponse,
  EvaluationCompletion,
  Enrollment,
  Student,
  Admin,
  BlockSubjectAssignment
};
