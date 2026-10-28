const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const {
  EVALUATION_QUESTIONS,
  EMOJI_RATING_SCALE,
  RATING_BY_SCORE,
  parseDateTimeInput,
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
  Admin
} = require('../services/evaluationService');

const ANONYMITY_NOTICE =
  'Your identity (name and student number) is strictly hidden from professors. Evaluation responses are stored separately from completion tracking.';

async function writeAuditEntry({
  action = 'READ',
  resourceType = 'EVALUATION',
  resourceId = '',
  resourceName = '',
  description = '',
  req,
  oldValue = null,
  newValue = null,
  severity = 'MEDIUM'
}) {
  try {
    const performedBy = req?.adminId && mongoose.Types.ObjectId.isValid(String(req.adminId))
      ? req.adminId
      : null;
    if (!performedBy) return;
    const role = ['admin', 'registrar'].includes(String(req?.accountType || '').toLowerCase())
      ? String(req.accountType).toLowerCase()
      : 'registrar';

    await AuditLog.create({
      action,
      resourceType,
      resourceId: String(resourceId || 'evaluation'),
      resourceName: String(resourceName || 'Professor Evaluation'),
      description: String(description || 'Professor evaluation action'),
      performedBy,
      performedByRole: role,
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || 'unknown',
      userAgent: req?.headers?.['user-agent'] || 'unknown',
      oldValue,
      newValue,
      status: 'SUCCESS',
      severity
    });
  } catch (err) {
    console.warn('Non-fatal evaluation audit log error:', err?.message || err);
  }
}

class EvaluationController {
  // GET /api/student/evaluations
  // Groups the student's enrolled subjects by adviser so the mobile app can
  // present one evaluation card per adviser instead of one per subject.
  static async getStudentEvaluations(req, res) {
    try {
      const student = req.student;
      if (!student) {
        return res.status(401).json({ error: 'Unauthorized student session.' });
      }

      const requestedSemester = String(req.query.semester || '').trim();
      const requestedSchoolYear = String(req.query.schoolYear || '').trim();

      const enrollmentQuery = {
        studentId: student._id,
        status: { $ne: 'Dropped' }
      };
      if (requestedSemester) enrollmentQuery.semester = requestedSemester;
      if (requestedSchoolYear) enrollmentQuery.schoolYear = requestedSchoolYear;

      let enrollment = await Enrollment.findOne(
        requestedSemester || requestedSchoolYear
          ? enrollmentQuery
          : { ...enrollmentQuery, isCurrent: true }
      ).sort({ isCurrent: -1, createdAt: -1 });

      if (!enrollment) {
        enrollment = await Enrollment.findOne(enrollmentQuery).sort({ isCurrent: -1, createdAt: -1 });
      }

      if (!enrollment) {
        const activeTerm = await getActiveAcademicTerm();
        const fallbackSemester = student.semester || activeTerm.semester;
        const fallbackSchoolYear = student.schoolYear || activeTerm.schoolYear;
        const defaultPeriod = await ensurePeriodForTerm(
          fallbackSemester,
          fallbackSchoolYear,
          true
        );
        return res.json({
          success: true,
          data: {
            questions: EVALUATION_QUESTIONS,
            emojiScale: EMOJI_RATING_SCALE,
            anonymityNotice: ANONYMITY_NOTICE,
            period: defaultPeriod,
            semester: fallbackSemester,
            schoolYear: fallbackSchoolYear,
            summary: {
              requiredCount: 0,
              completedCount: 0,
              pendingCount: 0,
              allCompleted: true,
              gradesLocked: false
            },
            advisers: [],
            subjects: []
          }
        });
      }

      const professorLookup = await loadProfessorLookup();
      const evalStatus = await getStudentTermEvaluationStatus(student, enrollment, professorLookup);
      const advisers = groupEvaluationSubjectsByAdviser(evalStatus.subjectsList, evalStatus.period);
      const completedAdvisers = advisers.filter((item) => item.evaluationCompleted).length;
      const pendingAdvisers = Math.max(0, advisers.length - completedAdvisers);

      return res.json({
        success: true,
        data: {
          questions: EVALUATION_QUESTIONS,
          emojiScale: EMOJI_RATING_SCALE,
          anonymityNotice: ANONYMITY_NOTICE,
          period: evalStatus.period,
          semester: enrollment.semester,
          schoolYear: enrollment.schoolYear,
          summary: {
            requiredCount: advisers.length,
            completedCount: completedAdvisers,
            pendingCount: pendingAdvisers,
            allCompleted: pendingAdvisers === 0,
            gradesLocked: pendingAdvisers > 0
          },
          advisers,
          // Kept for older clients that still render the per-subject list.
          subjects: evalStatus.subjectsList
        }
      });
    } catch (error) {
      console.error('Get student evaluations error:', error);
      return res.status(500).json({ error: 'Failed to load professor evaluations.' });
    }
  }

  // POST /api/student/evaluations
  // The student chooses an adviser. A single submission records the anonymous
  // rating and marks every subject taught by that adviser as evaluated.
  static async submitStudentEvaluation(req, res) {
    try {
      const student = req.student;
      if (!student) {
        return res.status(401).json({ error: 'Unauthorized student session.' });
      }

      const {
        professorId: rawProfessorId,
        professorName: rawProfessorName,
        subjectCode: rawSubjectCode,
        subjectCodes: rawSubjectCodes,
        semester: rawSemester,
        schoolYear: rawSchoolYear,
        ratings: rawRatings,
        comment: rawComment
      } = req.body || {};

      const normalizedProfessorId = String(rawProfessorId || '').trim();
      const normalizedProfessorName = String(rawProfessorName || '').trim();
      const requestedSubjectCodes = new Set(
        [
          rawSubjectCode,
          ...(Array.isArray(rawSubjectCodes) ? rawSubjectCodes : [])
        ]
          .map((code) => String(code || '').trim().toUpperCase())
          .filter(Boolean)
      );

      if (!normalizedProfessorId && !normalizedProfessorName && requestedSubjectCodes.size === 0) {
        return res.status(400).json({ error: 'Please choose an adviser to evaluate.' });
      }

      // 1. Validate ratings (all 10 questions, integers 1..5)
      let scores = [];
      if (Array.isArray(rawRatings)) {
        if (rawRatings.length !== 10) {
          return res.status(400).json({
            error: 'All 10 evaluation questions require a rating between 1 and 5.'
          });
        }
        scores = rawRatings.map((item) => {
          if (typeof item === 'number') return Number(item);
          if (item && typeof item === 'object') return Number(item.score ?? item.rating ?? item.value);
          return Number(item);
        });
      } else if (rawRatings && typeof rawRatings === 'object') {
        scores = EVALUATION_QUESTIONS.map((q) => Number(rawRatings[q.number] ?? rawRatings[String(q.number)]));
      } else {
        return res.status(400).json({
          error: 'Please provide ratings for all 10 evaluation questions.'
        });
      }

      const invalidScore = scores.some((score) => !Number.isInteger(score) || score < 1 || score > 5);
      if (scores.length !== 10 || invalidScore) {
        return res.status(400).json({
          error: 'Every question must be rated with an integer from 1 (😡 Very Poor) to 5 (🤩 Excellent).'
        });
      }

      // 2. Find the student's enrollment for the requested term
      const enrollmentQuery = {
        studentId: student._id,
        status: { $ne: 'Dropped' }
      };
      if (rawSemester) enrollmentQuery.semester = String(rawSemester).trim();
      if (rawSchoolYear) enrollmentQuery.schoolYear = String(rawSchoolYear).trim();

      let enrollment = await Enrollment.findOne(
        rawSemester || rawSchoolYear
          ? enrollmentQuery
          : { ...enrollmentQuery, isCurrent: true }
      ).sort({ isCurrent: -1, createdAt: -1 });

      if (!enrollment) {
        enrollment = await Enrollment.findOne(enrollmentQuery).sort({ isCurrent: -1, createdAt: -1 });
      }

      if (!enrollment) {
        return res.status(403).json({ error: 'You do not have an active enrollment for this term.' });
      }

      // 3. Resolve the adviser group from the enrolled subjects
      const professorLookup = await loadProfessorLookup();
      const activeSubjects = (enrollment.subjects || []).filter(
        (subj) => ['Enrolled', 'Incomplete', 'Completed'].includes(subj.status || 'Enrolled')
      );
      const resolvedSubjects = activeSubjects
        .map((subj) => ({
          subject: subj,
          professor: resolveSubjectProfessor(subj, student, professorLookup)
        }))
        .filter((item) => String(item.subject.code || '').trim());

      let group = [];
      if (normalizedProfessorId || normalizedProfessorName) {
        const requestedKey = normalizedProfessorId
          ? adviserKeyFor(normalizedProfessorId, normalizedProfessorName)
          : adviserKeyFor(null, normalizedProfessorName);
        group = resolvedSubjects.filter(
          (item) => adviserKeyFor(item.professor.professorId, item.professor.professorName) === requestedKey
        );
      }

      if (group.length === 0 && requestedSubjectCodes.size > 0) {
        group = resolvedSubjects.filter(
          (item) => requestedSubjectCodes.has(String(item.subject.code || '').trim().toUpperCase())
        );
      }

      if (group.length === 0) {
        return res.status(403).json({
          error: 'You are not enrolled in any subject handled by this adviser for the selected academic term.'
        });
      }

      const groupKey = adviserKeyFor(group[0].professor.professorId, group[0].professor.professorName);
      group = group.filter(
        (item) => adviserKeyFor(item.professor.professorId, item.professor.professorName) === groupKey
      );

      const semester = enrollment.semester;
      const schoolYear = enrollment.schoolYear;
      const groupCodes = group.map((item) => String(item.subject.code || '').trim().toUpperCase());
      const professorName = group[0].professor.professorName;
      const professorId = group[0].professor.professorId;

      // 4. Enforce evaluation deadlines
      const period = await ensurePeriodForTerm(semester, schoolYear, Boolean(enrollment.isCurrent));
      if (!period || !period.isOpen) {
        const statusMsg = period?.status === 'scheduled'
          ? `Evaluation period has not started yet (opens ${period.startDisplay}).`
          : `Evaluation deadline (${period?.deadlineDisplay || 'closed'}) has passed. Submissions are closed unless an authorized extension is granted by the Registrar.`;
        return res.status(403).json({
          error: statusMsg,
          code: 'EVALUATION_PERIOD_CLOSED',
          period
        });
      }

      // 5. Prevent duplicate evaluations for an adviser who is fully evaluated
      const existingCompletions = await EvaluationCompletion.find({
        studentId: student._id,
        semester,
        schoolYear,
        subjectCode: { $in: groupCodes }
      }).lean();
      const completedCodes = new Set(
        existingCompletions.map((item) => String(item.subjectCode || '').trim().toUpperCase())
      );
      const missingSubjects = group.filter(
        (item) => !completedCodes.has(String(item.subject.code || '').trim().toUpperCase())
      );

      if (missingSubjects.length === 0) {
        return res.status(409).json({
          error: 'You have already evaluated this adviser for the selected academic term.',
          code: 'DUPLICATE_EVALUATION'
        });
      }

      // 6. Store the anonymous response. The response is intentionally not
      // linked to the student's completion records.
      const anchor = group[0];
      const anchorCode = String(anchor.subject.code || '').trim().toUpperCase();
      const formattedRatings = EVALUATION_QUESTIONS.map((q, idx) => {
        const score = scores[idx];
        const scaleItem = RATING_BY_SCORE.get(score) || { emoji: '😐', label: 'Average' };
        return {
          questionNumber: q.number,
          questionText: q.text,
          score,
          emoji: scaleItem.emoji,
          label: scaleItem.label
        };
      });

      const sumScores = scores.reduce((acc, val) => acc + val, 0);
      const averageRating = Number((sumScores / 10).toFixed(2));
      const sanitizedComment = String(rawComment || '').trim().slice(0, 2000);

      const savedResponse = await EvaluationResponse.create({
        periodId: period.id && mongoose.Types.ObjectId.isValid(period.id) ? period.id : null,
        semester,
        schoolYear,
        subjectId: anchor.subject.subjectId || null,
        subjectCode: anchorCode,
        subjectTitle: group.length > 1
          ? `Adviser Evaluation (${groupCodes.join(', ')})`
          : anchor.subject.title,
        subjectCodes: groupCodes,
        sectionCode: student.section || '',
        course: String(enrollment.course || student.course || ''),
        yearLevel: enrollment.yearLevel || student.yearLevel || null,
        professorId: professorId && mongoose.Types.ObjectId.isValid(professorId) ? professorId : null,
        professorName,
        ratings: formattedRatings,
        questionScores: scores,
        averageRating,
        comment: sanitizedComment,
        submittedAt: new Date()
      });

      // 7. Mark every subject taught by this adviser as evaluated so each
      // subject's grade unlocks independently.
      const fullName = [student.lastName, student.firstName, student.middleName, student.suffix]
        .filter(Boolean)
        .join(', ')
        .replace(', ,', ',')
        .trim() || student.studentNumber;

      try {
        await EvaluationCompletion.bulkWrite(
          missingSubjects.map((item) => {
            const code = String(item.subject.code || '').trim().toUpperCase();
            return {
              updateOne: {
                filter: {
                  studentId: student._id,
                  schoolYear,
                  semester,
                  subjectCode: code
                },
                update: {
                  $setOnInsert: {
                    studentId: student._id,
                    studentNumber: String(student.studentNumber || ''),
                    studentName: fullName,
                    course: String(enrollment.course || student.course || ''),
                    yearLevel: enrollment.yearLevel || student.yearLevel || null,
                    sectionCode: student.section || '',
                    enrollmentId: enrollment._id,
                    periodId: period.id && mongoose.Types.ObjectId.isValid(period.id) ? period.id : null,
                    semester,
                    schoolYear,
                    subjectId: item.subject.subjectId || null,
                    subjectCode: code,
                    subjectTitle: item.subject.title || code,
                    professorId: item.professor.professorId && mongoose.Types.ObjectId.isValid(item.professor.professorId)
                      ? item.professor.professorId
                      : null,
                    professorName: item.professor.professorName,
                    completedAt: new Date()
                  }
                },
                upsert: true
              }
            };
          })
        );
      } catch (completionError) {
        await EvaluationResponse.deleteOne({ _id: savedResponse._id }).catch(() => null);
        throw completionError;
      }

      const updatedStatus = await getStudentTermEvaluationStatus(student, enrollment, professorLookup);
      const advisers = groupEvaluationSubjectsByAdviser(updatedStatus.subjectsList, updatedStatus.period);
      const updatedAdviser = advisers.find((item) => item.key === groupKey) || null;
      const completedAdvisers = advisers.filter((item) => item.evaluationCompleted).length;
      const pendingAdvisers = Math.max(0, advisers.length - completedAdvisers);

      return res.status(201).json({
        success: true,
        message: `Thank you for evaluating ${professorName}. Your responses were recorded anonymously.`,
        data: {
          professorId: professorId || null,
          professorName,
          subjectCodes: groupCodes,
          averageRating,
          submittedAt: savedResponse.submittedAt,
          adviser: updatedAdviser,
          summary: {
            requiredCount: advisers.length,
            completedCount: completedAdvisers,
            pendingCount: pendingAdvisers,
            allCompleted: pendingAdvisers === 0,
            gradesLocked: pendingAdvisers > 0
          }
        }
      });
    } catch (error) {
      console.error('Submit student evaluation error:', error);
      return res.status(500).json({ error: 'Failed to submit professor evaluation.' });
    }
  }

  // GET /api/professor/evaluations
  static async getProfessorEvaluations(req, res) {
    try {
      if (String(req.accountType || '').toLowerCase() !== 'professor') {
        return res.status(403).json({ error: 'Forbidden. Professor access required.' });
      }

      const professor = await Admin.findById(req.adminId)
        .select('_id username displayName uid accountType')
        .lean();

      if (!professor) {
        return res.status(404).json({ error: 'Professor account not found.' });
      }

      const escapeRegExp = (val) => String(val || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nameIdentifiers = Array.from(
        new Set(
          [professor.displayName, professor.username, professor.uid]
            .map((v) => String(v || '').trim())
            .filter(Boolean)
        )
      );
      const nameRegexes = nameIdentifiers.map((v) => new RegExp(`^\\s*${escapeRegExp(v)}\\s*$`, 'i'));

      const orFilters = [{ professorId: professor._id }];
      if (nameRegexes.length > 0) {
        orFilters.push({ professorName: { $in: nameRegexes } });
      }

      const filterSubject = String(req.query.subjectCode || req.query.subject || '').trim().toUpperCase();
      const filterSemester = String(req.query.semester || '').trim();
      const filterSchoolYear = String(req.query.schoolYear || '').trim();

      const baseQuery = { $or: orFilters };
      const allProfResponses = await EvaluationResponse.find(baseQuery)
        .select('-__v')
        .sort({ submittedAt: -1 })
        .lean();

      const activeTerm = await getActiveAcademicTerm();
      const assignedSubjectsMap = new Map();
      const schoolYearSet = new Set([activeTerm.schoolYear]);
      const semesterSet = new Set(['1st', '2nd', 'Summer']);

      const responseSubjectCodes = (resp) => {
        const codes = Array.isArray(resp?.subjectCodes) && resp.subjectCodes.length > 0
          ? resp.subjectCodes
          : [resp?.subjectCode];
        return codes.map((code) => String(code || '').trim().toUpperCase()).filter(Boolean);
      };

      for (const resp of allProfResponses) {
        if (resp.schoolYear) schoolYearSet.add(resp.schoolYear);
        if (resp.semester) semesterSet.add(resp.semester);
        for (const code of responseSubjectCodes(resp)) {
          if (!assignedSubjectsMap.has(code)) {
            assignedSubjectsMap.set(code, {
              subjectCode: code,
              subjectTitle: resp.subjectTitle || code
            });
          }
        }
      }

      const filteredResponses = allProfResponses.filter((resp) => {
        if (filterSubject && filterSubject !== 'ALL' && !responseSubjectCodes(resp).includes(filterSubject)) {
          return false;
        }
        if (filterSemester && filterSemester !== 'ALL' && resp.semester !== filterSemester) {
          return false;
        }
        if (filterSchoolYear && filterSchoolYear !== 'ALL' && resp.schoolYear !== filterSchoolYear) {
          return false;
        }
        return true;
      });

      const totalResponses = filteredResponses.length;
      const overallAverage = totalResponses > 0
        ? Number((filteredResponses.reduce((sum, r) => sum + Number(r.averageRating || 0), 0) / totalResponses).toFixed(2))
        : 0;
      const overallEmoji = getEmojiForAverage(overallAverage);

      const activeTermPeriod = await ensurePeriodForTerm(
        filterSemester && filterSemester !== 'ALL' ? filterSemester : activeTerm.semester,
        filterSchoolYear && filterSchoolYear !== 'ALL' ? filterSchoolYear : activeTerm.schoolYear,
        false
      );

      const questionSummaries = EVALUATION_QUESTIONS.map((q, idx) => {
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let scoreSum = 0;
        let count = 0;

        for (const resp of filteredResponses) {
          const score = Array.isArray(resp.questionScores) && resp.questionScores[idx]
            ? Number(resp.questionScores[idx])
            : Number(resp.ratings?.find((rt) => rt.questionNumber === q.number)?.score || 0);
          if (score >= 1 && score <= 5) {
            distribution[score] = (distribution[score] || 0) + 1;
            scoreSum += score;
            count += 1;
          }
        }

        const avg = count > 0 ? Number((scoreSum / count).toFixed(2)) : 0;
        const emojiMeta = getEmojiForAverage(avg);

        return {
          questionNumber: q.number,
          questionText: q.text,
          averageScore: avg,
          responseCount: count,
          emoji: emojiMeta.emoji,
          label: emojiMeta.label,
          distribution
        };
      });

      const subjectGroupMap = new Map();
      for (const resp of filteredResponses) {
        for (const code of responseSubjectCodes(resp)) {
          const key = `${code}|${resp.semester}|${resp.schoolYear}`;
          if (!subjectGroupMap.has(key)) {
            subjectGroupMap.set(key, {
              subjectCode: code,
              subjectTitle: resp.subjectTitle || code,
              semester: resp.semester,
              schoolYear: resp.schoolYear,
              responseCount: 0,
              ratingSum: 0
            });
          }
          const entry = subjectGroupMap.get(key);
          entry.responseCount += 1;
          entry.ratingSum += Number(resp.averageRating || 0);
        }
      }

      const subjectSummaries = Array.from(subjectGroupMap.values()).map((item) => {
        const avg = item.responseCount > 0 ? Number((item.ratingSum / item.responseCount).toFixed(2)) : 0;
        const emojiMeta = getEmojiForAverage(avg);
        return {
          subjectCode: item.subjectCode,
          subjectTitle: item.subjectTitle,
          semester: item.semester,
          schoolYear: item.schoolYear,
          responseCount: item.responseCount,
          averageRating: avg,
          emoji: emojiMeta.emoji,
          label: emojiMeta.label
        };
      });

      // Strictly anonymous feedback items — no student names, IDs, or student numbers
      const anonymousFeedback = filteredResponses.map((resp, index) => {
        const emojiMeta = getEmojiForAverage(resp.averageRating);
        return {
          id: String(resp._id),
          anonymousLabel: `Anonymous Response #${filteredResponses.length - index}`,
          subjectCode: resp.subjectCode,
          subjectTitle: resp.subjectTitle,
          subjectCodes: responseSubjectCodes(resp),
          semester: resp.semester,
          schoolYear: resp.schoolYear,
          averageRating: resp.averageRating,
          emoji: emojiMeta.emoji,
          ratingLabel: emojiMeta.label,
          comment: resp.comment || '',
          ratings: resp.ratings || [],
          submittedAt: resp.submittedAt
        };
      });

      return res.json({
        success: true,
        data: {
          professorName: professor.displayName || professor.username,
          totalResponses,
          subjectsWithFeedbackCount: subjectSummaries.length,
          overallAverage,
          overallEmoji: overallEmoji.emoji,
          overallLabel: overallEmoji.label,
          evaluationPeriod: activeTermPeriod,
          emojiScale: EMOJI_RATING_SCALE,
          questions: EVALUATION_QUESTIONS,
          questionSummaries,
          subjectSummaries,
          comments: anonymousFeedback.filter((item) => Boolean(item.comment)),
          responses: anonymousFeedback,
          filters: {
            subjects: Array.from(assignedSubjectsMap.values()),
            semesters: Array.from(semesterSet),
            schoolYears: Array.from(schoolYearSet).sort().reverse()
          }
        }
      });
    } catch (error) {
      console.error('Get professor evaluations error:', error);
      return res.status(500).json({ error: 'Failed to load professor evaluations.' });
    }
  }

  // GET /api/registrar/evaluation-periods
  static async listEvaluationPeriods(req, res) {
    try {
      const activeTerm = await getActiveAcademicTerm();
      await ensurePeriodForTerm(activeTerm.semester, activeTerm.schoolYear, false);
      const rawPeriods = await EvaluationPeriod.find({})
        .sort({ schoolYear: -1, semester: 1, createdAt: -1 })
        .lean();

      const periods = [];
      for (const p of rawPeriods) {
        const synced = await syncPeriodEffectiveStatus(p);
        const statsRows = await EvaluationResponse.aggregate([
          { $match: { semester: p.semester, schoolYear: p.schoolYear } },
          {
            $group: {
              _id: null,
              totalResponses: { $sum: 1 },
              averageRating: { $avg: '$averageRating' },
              professors: { $addToSet: '$professorName' },
              subjects: { $addToSet: '$subjectCode' }
            }
          }
        ]);
        const stats = statsRows[0] || {};

        periods.push({
          ...synced,
          totalResponses: stats.totalResponses || 0,
          averageRating: stats.averageRating ? Number(Number(stats.averageRating).toFixed(2)) : 0,
          professorCount: Array.isArray(stats.professors) ? stats.professors.filter(Boolean).length : 0,
          subjectCount: Array.isArray(stats.subjects) ? stats.subjects.filter(Boolean).length : 0
        });
      }

      return res.json({
        success: true,
        data: periods
      });
    } catch (error) {
      console.error('List evaluation periods error:', error);
      return res.status(500).json({ error: 'Failed to load evaluation periods.' });
    }
  }

  // POST /api/registrar/evaluation-periods
  static async createEvaluationPeriod(req, res) {
    try {
      const {
        title,
        semester,
        schoolYear,
        startDate,
        startTime = '08:00',
        deadlineDate,
        closingTime = '23:59',
        description = '',
        saveAsDraft = false,
        applicablePrograms = ['All Programs'],
        applicableSubjects = 'All Enrolled Subjects',
        applicableProfessors = 'All Assigned Faculty'
      } = req.body || {};

      if (!['1st', '2nd', 'Summer'].includes(String(semester || '').trim())) {
        return res.status(400).json({ error: 'Valid semester (1st, 2nd, or Summer) is required.' });
      }
      if (!/^\d{4}-\d{4}$/.test(String(schoolYear || '').trim())) {
        return res.status(400).json({ error: 'Valid school year (YYYY-YYYY) is required.' });
      }
      if (!startDate || !deadlineDate) {
        return res.status(400).json({ error: 'Start date and deadline date are required.' });
      }

      const startAt = parseDateTimeInput(startDate, startTime);
      const endAt = parseDateTimeInput(deadlineDate, closingTime);

      if (!startAt || !endAt) {
        return res.status(400).json({ error: 'Invalid start date/time or deadline date/time.' });
      }
      if (endAt <= startAt) {
        return res.status(400).json({ error: 'Deadline must be after the start date and time.' });
      }

      const actor = req.adminId ? await Admin.findById(req.adminId).select('username displayName').lean() : null;
      const actorName = actor?.displayName || actor?.username || 'Registrar';
      const now = new Date();
      const initialStatus = saveAsDraft
        ? 'draft'
        : (now < startAt ? 'scheduled' : (now > endAt ? 'closed' : 'open'));
      const normalizedPrograms = Array.isArray(applicablePrograms)
        ? applicablePrograms.map((p) => String(p || '').trim()).filter(Boolean)
        : String(applicablePrograms || 'All Programs').split(',').map((p) => p.trim()).filter(Boolean);

      const created = await EvaluationPeriod.create({
        title: String(title || '').trim() || `${semester} Semester ${schoolYear} Professor Evaluation`,
        semester: String(semester).trim(),
        schoolYear: String(schoolYear).trim(),
        startDate: String(startDate).trim(),
        startTime: String(startTime || '08:00').trim(),
        startAt,
        deadlineDate: String(deadlineDate).trim(),
        closingTime: String(closingTime || '23:59').trim(),
        endAt,
        status: initialStatus,
        manualState: saveAsDraft ? 'draft' : (initialStatus === 'open' ? 'started' : 'auto'),
        applicablePrograms: normalizedPrograms.length > 0 ? normalizedPrograms : ['All Programs'],
        applicableSubjects: String(applicableSubjects || 'All Enrolled Subjects').trim() || 'All Enrolled Subjects',
        applicableProfessors: String(applicableProfessors || 'All Assigned Faculty').trim() || 'All Assigned Faculty',
        description: String(description || '').trim(),
        createdBy: req.adminId || null,
        createdByName: actorName,
        updatedBy: req.adminId || null,
        updatedByName: actorName
      });

      const synced = await syncPeriodEffectiveStatus(created.toObject());

      await writeAuditEntry({
        action: 'CREATE',
        resourceType: 'EVALUATION_PERIOD',
        resourceId: String(created._id),
        resourceName: synced.title,
        description: `Created evaluation period for ${semester} Semester ${schoolYear} (deadline: ${synced.deadlineDisplay})`,
        req,
        newValue: synced,
        severity: 'LOW'
      });

      return res.status(201).json({
        success: true,
        message: 'Evaluation period created successfully.',
        data: synced
      });
    } catch (error) {
      console.error('Create evaluation period error:', error);
      return res.status(500).json({ error: 'Failed to create evaluation period.' });
    }
  }

  // PATCH /api/registrar/evaluation-periods/:id/status
  static async updateEvaluationPeriodStatus(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid evaluation period ID.' });
      }

      const period = await EvaluationPeriod.findById(id);
      if (!period) {
        return res.status(404).json({ error: 'Evaluation period not found.' });
      }

      const {
        action,
        deadlineDate,
        closingTime,
        startDate,
        startTime,
        reason = ''
      } = req.body || {};

      const actor = req.adminId ? await Admin.findById(req.adminId).select('username displayName').lean() : null;
      const actorName = actor?.displayName || actor?.username || 'Registrar';
      const now = new Date();
      const previousState = period.toObject();

      switch (String(action || '').toLowerCase()) {
        case 'draft': {
          period.status = 'draft';
          period.manualState = 'draft';
          break;
        }
        case 'start': {
          if (period.startAt > now) {
            period.startAt = now;
            period.startDate = now.toISOString().slice(0, 10);
          }
          if (period.endAt <= now) {
            const futureEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
            period.endAt = futureEnd;
            period.deadlineDate = futureEnd.toISOString().slice(0, 10);
          }
          period.status = 'open';
          period.manualState = 'started';
          break;
        }
        case 'close': {
          period.status = 'closed';
          period.manualState = 'closed';
          break;
        }
        case 'extend': {
          const nextDeadlineDate = String(deadlineDate || period.deadlineDate || '').trim();
          const nextClosingTime = String(closingTime || period.closingTime || '23:59').trim();
          const nextEndAt = parseDateTimeInput(nextDeadlineDate, nextClosingTime);
          if (!nextEndAt || nextEndAt <= now) {
            return res.status(400).json({
              error: 'Extension deadline must be a valid future date and time.'
            });
          }
          period.extensionHistory.push({
            previousEndAt: period.endAt,
            newEndAt: nextEndAt,
            reason: String(reason || 'Authorized Registrar deadline extension').trim(),
            extendedBy: req.adminId || null,
            extendedByName: actorName,
            extendedAt: now
          });
          period.deadlineDate = nextDeadlineDate;
          period.closingTime = nextClosingTime;
          period.endAt = nextEndAt;
          period.status = 'extended';
          period.manualState = 'extended';
          break;
        }
        case 'reopen': {
          let nextEndAt = period.endAt;
          if (deadlineDate) {
            const parsed = parseDateTimeInput(deadlineDate, closingTime || period.closingTime || '23:59');
            if (parsed) {
              nextEndAt = parsed;
              period.deadlineDate = String(deadlineDate).trim();
              if (closingTime) period.closingTime = String(closingTime).trim();
            }
          }
          if (!nextEndAt || new Date(nextEndAt) <= now) {
            nextEndAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            period.deadlineDate = nextEndAt.toISOString().slice(0, 10);
            period.closingTime = '23:59';
          }
          if (startDate) {
            const parsedStart = parseDateTimeInput(startDate, startTime || period.startTime || '08:00');
            if (parsedStart) {
              period.startAt = parsedStart;
              period.startDate = String(startDate).trim();
              if (startTime) period.startTime = String(startTime).trim();
            }
          } else if (period.startAt > now) {
            period.startAt = now;
          }
          period.endAt = nextEndAt;
          period.status = 'open';
          period.manualState = 'reopened';
          break;
        }
        default:
          return res.status(400).json({
            error: 'Invalid action. Supported actions: start, close, extend, reopen.'
          });
      }

      period.updatedBy = req.adminId || null;
      period.updatedByName = actorName;
      await period.save();

      const synced = await syncPeriodEffectiveStatus(period.toObject());

      await writeAuditEntry({
        action: 'UPDATE',
        resourceType: 'EVALUATION_PERIOD',
        resourceId: String(period._id),
        resourceName: synced.title,
        description: `Registrar ${actorName} performed '${action}' on evaluation period (${synced.semester} ${synced.schoolYear})`,
        req,
        oldValue: { status: previousState.status, endAt: previousState.endAt },
        newValue: { status: synced.status, endAt: synced.endAt, action, reason },
        severity: 'MEDIUM'
      });

      const actionLabel = {
        draft: 'saved as draft',
        start: 'started',
        close: 'closed',
        extend: 'extended',
        reopen: 'reopened'
      }[String(action || '').toLowerCase()] || 'updated';

      return res.json({
        success: true,
        message: `Evaluation period ${actionLabel} successfully.`,
        data: synced
      });
    } catch (error) {
      console.error('Update evaluation period status error:', error);
      return res.status(500).json({ error: 'Failed to update evaluation period.' });
    }
  }

  // DELETE /api/registrar/evaluation-periods/:id
  static async deleteEvaluationPeriod(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid evaluation period ID.' });
      }

      const period = await EvaluationPeriod.findById(id);
      if (!period) {
        return res.status(404).json({ error: 'Evaluation period not found.' });
      }

      const actor = req.adminId ? await Admin.findById(req.adminId).select('username displayName').lean() : null;
      const actorName = actor?.displayName || actor?.username || 'Registrar';
      const previousState = period.toObject();

      // If this is the only period for the term, older responses without a
      // periodId also belong to it and should be removed with it.
      const siblingCount = await EvaluationPeriod.countDocuments({
        _id: { $ne: period._id },
        semester: period.semester,
        schoolYear: period.schoolYear
      });
      const responseFilter = siblingCount > 0
        ? { periodId: period._id }
        : {
            $or: [
              { periodId: period._id },
              { periodId: null, semester: period.semester, schoolYear: period.schoolYear }
            ]
          };

      const deletedResponses = await EvaluationResponse.deleteMany(responseFilter);
      await EvaluationPeriod.findByIdAndDelete(period._id);

      await writeAuditEntry({
        action: 'DELETE',
        resourceType: 'EVALUATION_PERIOD',
        resourceId: String(period._id),
        resourceName: period.title,
        description: `Registrar ${actorName} removed evaluation period (${period.semester} ${period.schoolYear}) and ${deletedResponses.deletedCount || 0} anonymous response(s)`,
        req,
        oldValue: previousState,
        newValue: null,
        severity: 'HIGH'
      });

      return res.json({
        success: true,
        message: 'Evaluation period removed successfully.',
        data: {
          id: String(period._id),
          deletedResponses: deletedResponses.deletedCount || 0
        }
      });
    } catch (error) {
      console.error('Delete evaluation period error:', error);
      return res.status(500).json({ error: 'Failed to remove evaluation period.' });
    }
  }

  // GET /api/registrar/evaluations/overview
  static async getRegistrarEvaluationOverview(req, res) {
    try {
      const activeTerm = await getActiveAcademicTerm();
      const semester = String(req.query.semester || activeTerm.semester).trim();
      const schoolYear = String(req.query.schoolYear || activeTerm.schoolYear).trim();
      const subjectFilter = String(req.query.subjectCode || '').trim().toUpperCase();
      const professorFilter = String(req.query.professorName || '').trim().toLowerCase();

      const activePeriod = await ensurePeriodForTerm(
        semester === 'ALL' ? activeTerm.semester : semester,
        schoolYear === 'ALL' ? activeTerm.schoolYear : schoolYear,
        false
      );

      const termQuery = {};
      if (semester && semester !== 'ALL') termQuery.semester = semester;
      if (schoolYear && schoolYear !== 'ALL') termQuery.schoolYear = schoolYear;

      const responses = await EvaluationResponse.find(termQuery)
        .sort({ submittedAt: -1 })
        .lean();

      const responseSubjectCodes = (resp) => {
        const codes = Array.isArray(resp?.subjectCodes) && resp.subjectCodes.length > 0
          ? resp.subjectCodes
          : [resp?.subjectCode];
        return codes.map((code) => String(code || '').trim().toUpperCase()).filter(Boolean);
      };

      const filteredResponses = responses.filter((resp) => {
        if (subjectFilter && subjectFilter !== 'ALL' && !responseSubjectCodes(resp).includes(subjectFilter)) {
          return false;
        }
        if (professorFilter && professorFilter !== 'all' && !String(resp.professorName || '').toLowerCase().includes(professorFilter)) {
          return false;
        }
        return true;
      });

      const evaluations = filteredResponses.map((resp, idx) => {
        const emojiMeta = getEmojiForAverage(resp.averageRating);
        const rId = String(resp._id);
        const yearPrefix = String(resp.schoolYear || '2026').slice(0, 4);
        const seqNum = String(filteredResponses.length - idx).padStart(4, '0');
        return {
          id: rId,
          _id: rId,
          recordNumber: `EV-${yearPrefix}-${seqNum}`,
          semester: resp.semester,
          schoolYear: resp.schoolYear,
          subjectCode: resp.subjectCode,
          subjectTitle: resp.subjectTitle,
          subjectCodes: responseSubjectCodes(resp),
          sectionCode: resp.sectionCode || '',
          course: resp.course || '',
          professorId: resp.professorId ? String(resp.professorId) : null,
          professorName: resp.professorName,
          averageRating: resp.averageRating,
          emoji: emojiMeta.emoji,
          ratingLabel: emojiMeta.label,
          ratings: resp.ratings || [],
          comment: resp.comment || '',
          submittedAt: resp.submittedAt
        };
      });

      const professorMap = new Map();
      for (const resp of filteredResponses) {
        const key = String(resp.professorName || 'Assigned Faculty');
        if (!professorMap.has(key)) {
          professorMap.set(key, {
            professorName: key,
            responseCount: 0,
            ratingSum: 0,
            subjects: new Set()
          });
        }
        const entry = professorMap.get(key);
        entry.responseCount += 1;
        entry.ratingSum += Number(resp.averageRating || 0);
        for (const code of responseSubjectCodes(resp)) entry.subjects.add(code);
      }

      const professorSummaries = Array.from(professorMap.values()).map((p) => {
        const avg = p.responseCount > 0 ? Number((p.ratingSum / p.responseCount).toFixed(2)) : 0;
        const emojiMeta = getEmojiForAverage(avg);
        return {
          professorName: p.professorName,
          responseCount: p.responseCount,
          subjectCount: p.subjects.size,
          subjects: Array.from(p.subjects),
          averageRating: avg,
          emoji: emojiMeta.emoji,
          label: emojiMeta.label
        };
      });

      const subjectMap = new Map();
      for (const resp of filteredResponses) {
        for (const code of responseSubjectCodes(resp)) {
          const key = `${code}|${resp.semester}|${resp.schoolYear}`;
          if (!subjectMap.has(key)) {
            subjectMap.set(key, {
              subjectCode: code,
              subjectTitle: resp.subjectTitle || code,
              semester: resp.semester,
              schoolYear: resp.schoolYear,
              responseCount: 0,
              ratingSum: 0,
              professors: new Set()
            });
          }
          const entry = subjectMap.get(key);
          entry.responseCount += 1;
          entry.ratingSum += Number(resp.averageRating || 0);
          if (resp.professorName) entry.professors.add(resp.professorName);
        }
      }

      const subjectSummaries = Array.from(subjectMap.values()).map((s) => {
        const avg = s.responseCount > 0 ? Number((s.ratingSum / s.responseCount).toFixed(2)) : 0;
        const emojiMeta = getEmojiForAverage(avg);
        return {
          subjectCode: s.subjectCode,
          subjectTitle: s.subjectTitle,
          semester: s.semester,
          schoolYear: s.schoolYear,
          responseCount: s.responseCount,
          professorCount: s.professors.size,
          averageRating: avg,
          emoji: emojiMeta.emoji,
          label: emojiMeta.label
        };
      });

      const totalResponses = filteredResponses.length;
      const averageRating = totalResponses > 0
        ? Number((filteredResponses.reduce((sum, r) => sum + Number(r.averageRating || 0), 0) / totalResponses).toFixed(2))
        : 0;

      return res.json({
        success: true,
        data: {
          activePeriod,
          questions: EVALUATION_QUESTIONS,
          emojiScale: EMOJI_RATING_SCALE,
          progress: {
            totalResponses,
            averageRating,
            professorCount: professorSummaries.length,
            subjectCount: subjectSummaries.length,
            semester: semester === 'ALL' ? 'All Semesters' : semester,
            schoolYear: schoolYear === 'ALL' ? 'All School Years' : schoolYear
          },
          evaluations,
          professorSummaries,
          subjectSummaries
        }
      });
    } catch (error) {
      console.error('Get registrar evaluation overview error:', error);
      return res.status(500).json({ error: 'Failed to load evaluation overview.' });
    }
  }
}

module.exports = EvaluationController;
