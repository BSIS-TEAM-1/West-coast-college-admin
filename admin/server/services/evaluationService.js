const EvaluationPeriod = require('../models/EvaluationPeriod');
const EvaluationResponse = require('../models/EvaluationResponse');
const EvaluationCompletion = require('../models/EvaluationCompletion');
const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const Admin = require('../models/Admin');
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

const EVALUATION_QUESTIONS = [
  { number: 1, text: 'The professor explains lessons clearly.' },
  { number: 2, text: 'The professor demonstrates knowledge of the subject.' },
  { number: 3, text: 'The professor comes to class prepared and on time.' },
  { number: 4, text: 'The professor treats students fairly and respectfully.' },
  { number: 5, text: 'The professor communicates effectively.' },
  { number: 6, text: 'The professor encourages student participation.' },
  { number: 7, text: 'The professor manages class time effectively.' },
  { number: 8, text: 'The professor provides helpful feedback.' },
  { number: 9, text: 'The professor uses effective teaching methods.' },
  { number: 10, text: 'Overall, the professor demonstrates teaching effectiveness.' }
];

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
  if (effectiveStatus === 'closed' && periodDoc.status !== 'closed') {
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

  return {
    id: String(periodDoc._id),
    _id: String(periodDoc._id),
    title: periodDoc.title || `${periodDoc.semester} Semester ${periodDoc.schoolYear} Evaluation`,
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
    extensionHistory: Array.isArray(periodDoc.extensionHistory) ? periodDoc.extensionHistory : [],
    createdAt: periodDoc.createdAt,
    updatedAt: periodDoc.updatedAt
  };
}

async function ensurePeriodForTerm(semester, schoolYear, createIfMissing = true) {
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
      description: 'Official faculty teaching effectiveness evaluation period.'
    });
    period = created.toObject();
  }

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
  const isPlaceholder = !rawInstructor || /^tba$/i.test(rawInstructor) || /^n\/a$/i.test(rawInstructor);
  const candidateName = !isPlaceholder
    ? rawInstructor
    : String(student?.assignedProfessor || '').trim();

  if (candidateName) {
    const matched = professorLookup.byIdentifier.get(candidateName.toLowerCase());
    if (matched) {
      return {
        professorId: matched.professorId,
        professorName: matched.professorName
      };
    }
    return {
      professorId: null,
      professorName: candidateName
    };
  }

  // Keep the card actionable even when the registrar has not assigned a
  // professor yet. The first registered professor is used as a safe fallback.
  if (professorLookup.professors.length > 0) {
    const first = professorLookup.professors[0];
    return {
      professorId: String(first._id),
      professorName: String(first.displayName || first.username || 'Assigned Professor').trim()
    };
  }

  return {
    professorId: null,
    professorName: 'Assigned Faculty'
  };
}

function adviserKeyFor(professorId, professorName) {
  if (professorId) return `id:${String(professorId)}`;
  return `name:${String(professorName || 'Assigned Faculty').trim().toLowerCase()}`;
}

async function getStudentTermEvaluationStatus(student, enrollment, preloadedLookup = null, preloadedCompletions = null) {
  if (!student || !enrollment) {
    return {
      requiredCount: 0,
      completedCount: 0,
      pendingCount: 0,
      allCompleted: true,
      gradesLocked: false,
      period: null,
      subjectsByCode: new Map(),
      subjectsList: []
    };
  }

  const professorLookup = preloadedLookup || await loadProfessorLookup();
  const activeSubjects = (enrollment.subjects || []).filter(
    (subj) => ['Enrolled', 'Incomplete', 'Completed'].includes(subj.status || 'Enrolled')
  );

  const completions = preloadedCompletions || await EvaluationCompletion.find({
    studentId: student._id,
    semester: enrollment.semester,
    schoolYear: enrollment.schoolYear
  }).lean();

  const period = await ensurePeriodForTerm(
    enrollment.semester,
    enrollment.schoolYear,
    Boolean(enrollment.isCurrent)
  );

  const completionByCode = new Map();
  for (const comp of completions) {
    const code = String(comp.subjectCode || '').trim().toUpperCase();
    if (code) completionByCode.set(code, comp);
  }

  const subjectsByCode = new Map();
  const subjectsList = [];

  for (const subj of activeSubjects) {
    const code = String(subj.code || '').trim().toUpperCase();
    if (!code) continue;

    const prof = resolveSubjectProfessor(subj, student, professorLookup);
    const completion = completionByCode.get(code) || null;
    const isCompleted = Boolean(completion);
    const canEvaluate = !isCompleted && Boolean(period?.isOpen);

    const item = {
      enrollmentId: String(enrollment._id),
      subjectId: subj.subjectId ? String(subj.subjectId) : null,
      subjectCode: code,
      subjectTitle: String(subj.title || code).trim(),
      units: Number(subj.units || 0),
      schedule: subj.schedule || 'TBA',
      room: subj.room || 'TBA',
      instructor: prof.professorName,
      professorId: completion?.professorId ? String(completion.professorId) : prof.professorId,
      professorName: completion?.professorName || prof.professorName,
      adviserKey: adviserKeyFor(
        completion?.professorId ? String(completion.professorId) : prof.professorId,
        completion?.professorName || prof.professorName
      ),
      evaluationRequired: true,
      evaluationCompleted: isCompleted,
      completedAt: completion?.completedAt || null,
      canEvaluate
    };

    subjectsByCode.set(code, item);
    subjectsList.push(item);
  }

  const requiredCount = subjectsList.length;
  const completedCount = subjectsList.filter((s) => s.evaluationCompleted).length;
  const pendingCount = Math.max(0, requiredCount - completedCount);
  const allCompleted = requiredCount === 0 ? true : completedCount >= requiredCount;

  return {
    requiredCount,
    completedCount,
    pendingCount,
    allCompleted,
    gradesLocked: !allCompleted,
    period,
    subjectsByCode,
    subjectsList
  };
}

/**
 * Collapse per-subject evaluation rows into one card per adviser/professor.
 * Evaluating an adviser unlocks every subject taught by that adviser.
 */
function groupEvaluationSubjectsByAdviser(subjectsList, period) {
  const groups = new Map();

  for (const item of subjectsList || []) {
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
          subjectId: s.subjectId || null,
          subjectCode: s.subjectCode,
          subjectTitle: s.subjectTitle,
          units: s.units,
          schedule: s.schedule,
          room: s.room,
          evaluationCompleted: Boolean(s.evaluationCompleted),
          completedAt: s.completedAt || null
        }))
      };
    })
    .sort((a, b) => String(a.professorName).localeCompare(String(b.professorName)));
}

module.exports = {
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
  getStudentTermEvaluationStatus,
  groupEvaluationSubjectsByAdviser,
  EvaluationPeriod,
  EvaluationResponse,
  EvaluationCompletion,
  Enrollment,
  Student,
  Admin
};
