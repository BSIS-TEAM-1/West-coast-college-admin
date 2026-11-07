const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const StudentNotification = require('../models/StudentNotification');
const {
  DEFAULT_EVALUATION_QUESTIONS,
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
  getStudentSectionCode,
  adviserKeyFor,
  getStudentTermEvaluationStatus,
  groupEvaluationSubjectsByAdviser,
  EvaluationPeriod,
  EvaluationResponse,
  EvaluationCompletion,
  Enrollment,
  Student,
  Admin,
  BlockSubjectAssignment
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

async function notifyStudentSubmissionSuccess(student, subjectCode, professorName) {
  try {
    if (!student?._id) return;
    const eventKey = `eval-sub-${student._id}-${subjectCode}-${Date.now()}`;
    await StudentNotification.create({
      studentId: student._id,
      studentNumber: student.studentNumber || '',
      type: 'ACADEMIC',
      title: 'Evaluation Submitted',
      message: `You have successfully evaluated ${professorName} for ${subjectCode}. Your response has been anonymously recorded.`,
      data: { subjectCode, professorName },
      eventKey
    });
  } catch (err) {
    console.warn('Failed to dispatch evaluation submission notification:', err?.message || err);
  }
}

async function notifyStudentsPeriodOpened(period) {
  try {
    if (!period || !period.semester || !period.schoolYear) return;
    const enrollments = await Enrollment.find({
      semester: period.semester,
      schoolYear: period.schoolYear,
      status: { $ne: 'Dropped' }
    }).select('studentId').lean();

    const studentIds = Array.from(new Set(enrollments.map((e) => String(e.studentId)).filter((id) => mongoose.Types.ObjectId.isValid(id))));
    if (studentIds.length === 0) return;

    const notifications = studentIds.map((sid) => ({
      studentId: sid,
      type: 'SYSTEM',
      title: 'Professor Evaluation Period Opened',
      message: `The evaluation period for ${period.semester} Semester ${period.schoolYear} is now open until ${period.deadlineDate || 'the announced deadline'}. Please evaluate your instructors.`,
      data: { periodId: String(period._id || period.id) },
      eventKey: `eval-period-opened-${period._id || period.id}-${sid}`
    }));

    await StudentNotification.insertMany(notifications, { ordered: false }).catch(() => null);
  } catch (err) {
    console.warn('Failed to broadcast evaluation period opened notifications:', err?.message || err);
  }
}

class EvaluationController {
  // GET /api/student/evaluations
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

      const activeTerm = await getActiveAcademicTerm();
      const termSemester = enrollment?.semester || student.semester || activeTerm.semester;
      const termSchoolYear = enrollment?.schoolYear || student.schoolYear || activeTerm.schoolYear;

      const period = await ensurePeriodForTerm(termSemester, termSchoolYear, false);
      const questions = period?.questions && period.questions.length > 0
        ? period.questions
        : DEFAULT_EVALUATION_QUESTIONS;

      if (!enrollment) {
        return res.json({
          success: true,
          data: {
            questions,
            emojiScale: EMOJI_RATING_SCALE,
            anonymityNotice: ANONYMITY_NOTICE,
            period,
            semester: termSemester,
            schoolYear: termSchoolYear,
            summary: {
              requiredCount: 0,
              completedCount: 0,
              pendingCount: 0,
              allCompleted: true,
              completionPercentage: 100,
              gradesLocked: false
            },
            evaluations: [],
            advisers: [],
            subjects: []
          }
        });
      }

      const professorLookup = await loadProfessorLookup();
      const evalStatus = await getStudentTermEvaluationStatus(student, enrollment, professorLookup, null, period);
      const advisers = groupEvaluationSubjectsByAdviser(evalStatus.subjectsList, evalStatus.period);

      return res.json({
        success: true,
        data: {
          questions,
          emojiScale: EMOJI_RATING_SCALE,
          anonymityNotice: ANONYMITY_NOTICE,
          period: evalStatus.period,
          semester: enrollment.semester,
          schoolYear: enrollment.schoolYear,
          summary: {
            requiredCount: evalStatus.requiredCount,
            completedCount: evalStatus.completedCount,
            pendingCount: evalStatus.pendingCount,
            allCompleted: evalStatus.allCompleted,
            completionPercentage: evalStatus.completionPercentage,
            gradesLocked: evalStatus.gradesLocked
          },
          evaluations: evalStatus.evaluationEntries,
          advisers,
          subjects: evalStatus.subjectsList
        }
      });
    } catch (error) {
      console.error('Get student evaluations error:', error);
      return res.status(500).json({ error: 'Failed to load professor evaluations.' });
    }
  }

  // POST /api/student/evaluations
  // Evaluates a professor for a specific teaching assignment (subject enrollment).
  // A professor teaching multiple subjects is evaluated separately for each subject.
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
        subjectName: rawSubjectName,
        teachingAssignmentId: rawTeachingAssignmentId,
        semester: rawSemester,
        schoolYear: rawSchoolYear,
        academicYear: rawAcademicYear,
        ratings: rawRatings,
        comment: rawComment
      } = req.body || {};

      const targetSubjectCode = String(
        rawSubjectCode || (Array.isArray(rawSubjectCodes) && rawSubjectCodes[0]) || ''
      ).trim().toUpperCase();

      if (!targetSubjectCode) {
        return res.status(400).json({ error: 'Please choose a subject to evaluate.' });
      }

      // 1. Find the student's enrollment for the requested term
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

      const semester = enrollment.semester;
      const schoolYear = enrollment.schoolYear;

      // 2. Validate evaluation period timing (Registrar controls start and deadline dates)
      const period = await ensurePeriodForTerm(semester, schoolYear, false);
      if (!period || !period.isOpen) {
        const statusMsg = period?.status === 'scheduled'
          ? `Evaluation period has not started yet (opens ${period.startDisplay || period.startDate}).`
          : `Evaluation deadline (${period?.deadlineDisplay || period?.deadlineDate || 'closed'}) has passed. Submissions are closed unless an authorized extension is granted by the Registrar.`;
        return res.status(403).json({
          error: statusMsg,
          code: 'EVALUATION_PERIOD_CLOSED',
          period
        });
      }

      // 3. Find the enrolled subject and verify eligibility
      const enrolledSubject = (enrollment.subjects || []).find(
        (subj) => String(subj.code || '').trim().toUpperCase() === targetSubjectCode
      );

      if (!enrolledSubject) {
        return res.status(403).json({
          error: `You are not officially enrolled in subject ${targetSubjectCode} for this academic term.`
        });
      }

      const subjectStatus = String(enrolledSubject.status || 'Enrolled').toLowerCase();
      if (subjectStatus === 'dropped' || subjectStatus === 'removed') {
        return res.status(403).json({
          error: `Subject ${targetSubjectCode} was dropped or removed and is not eligible for evaluation.`
        });
      }

      // 4. Resolve the professor assigned to this teaching assignment
      const professorLookup = await loadProfessorLookup();
      const prof = resolveSubjectProfessor(enrolledSubject, student, professorLookup);

      if (!prof.isAssigned) {
        return res.status(400).json({
          error: `No professor is currently assigned to subject ${targetSubjectCode}. You cannot evaluate an unassigned course.`
        });
      }

      const professorId = prof.professorId || (mongoose.Types.ObjectId.isValid(rawProfessorId) ? rawProfessorId : null);
      const professorName = prof.professorName;

      // 5. Enforce one evaluation per teaching assignment (subject code + term) to prevent duplicates
      const existingCompletion = await EvaluationCompletion.findOne({
        studentId: student._id,
        schoolYear,
        semester,
        subjectCode: targetSubjectCode
      }).lean();

      if (existingCompletion) {
        return res.status(409).json({
          success: false,
          error: `You have already submitted an evaluation for ${professorName} in ${targetSubjectCode}.`,
          code: 'ALREADY_EVALUATED',
          data: {
            alreadyEvaluated: true,
            subjectCode: targetSubjectCode,
            professorName,
            completedAt: existingCompletion.completedAt
          }
        });
      }

      // 6. Validate questionnaire ratings
      const questions = period?.questions && period.questions.length > 0
        ? period.questions
        : DEFAULT_EVALUATION_QUESTIONS;

      const questionCount = questions.length;
      let scores = [];

      if (Array.isArray(rawRatings)) {
        if (rawRatings.length !== questionCount) {
          return res.status(400).json({
            error: `All ${questionCount} evaluation questions require a rating between 1 and 5.`
          });
        }
        scores = rawRatings.map((item) => {
          if (typeof item === 'number') return Number(item);
          if (item && typeof item === 'object') return Number(item.score ?? item.rating ?? item.value);
          return Number(item);
        });
      } else if (rawRatings && typeof rawRatings === 'object') {
        scores = questions.map((q) => Number(rawRatings[q.number] ?? rawRatings[String(q.number)]));
      } else {
        return res.status(400).json({
          error: `Please provide ratings for all ${questionCount} evaluation questions.`
        });
      }

      const invalidScore = scores.some((score) => !Number.isInteger(score) || score < 1 || score > 5);
      if (scores.length !== questionCount || invalidScore) {
        return res.status(400).json({
          error: 'Every question must be rated with an integer from 1 (😡 Very Poor) to 5 (🤩 Excellent).'
        });
      }

      // 7. Store the anonymous evaluation response
      // Notice: student identity (studentId, studentNumber, studentName) is strictly NOT stored here.
      const formattedRatings = questions.map((q, idx) => {
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
      const averageRating = Number((sumScores / questionCount).toFixed(2));
      const sanitizedComment = String(rawComment || '').trim().slice(0, 2000);
      const sectionCode = await getStudentSectionCode(student, enrollment);

      let teachingAssignmentId = rawTeachingAssignmentId ? String(rawTeachingAssignmentId) : null;
      if (!teachingAssignmentId) {
        try {
          const blockAssignment = await StudentBlockAssignment.findOne({
            studentId: student._id,
            status: 'ASSIGNED',
            semester
          }).lean();
          if (blockAssignment?.sectionId && enrolledSubject.subjectId) {
            const bsa = await BlockSubjectAssignment.findOne({
              blockSectionId: blockAssignment.sectionId,
              subjectId: enrolledSubject.subjectId,
              semester,
              academicYear: schoolYear
            }).lean();
            if (bsa?._id) {
              teachingAssignmentId = String(bsa._id);
            }
          }
        } catch {
          // Non-fatal
        }
      }
      if (!teachingAssignmentId) {
        teachingAssignmentId = enrolledSubject._id ? String(enrolledSubject._id) : `${targetSubjectCode}-${enrollment._id}`;
      }

      const resolvedSubjectName = String(rawSubjectName || enrolledSubject.title || targetSubjectCode).trim();

      const savedResponse = await EvaluationResponse.create({
        studentId: student._id,
        teachingAssignmentId,
        periodId: period.id && mongoose.Types.ObjectId.isValid(period.id) ? period.id : null,
        semester,
        schoolYear,
        academicYear: schoolYear,
        subjectId: enrolledSubject.subjectId || null,
        subjectCode: targetSubjectCode,
        subjectName: resolvedSubjectName,
        subjectTitle: resolvedSubjectName,
        subjectCodes: [targetSubjectCode],
        sectionCode: sectionCode || student.section || '',
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

      // 8. Track student completion to unlock grades and prevent duplicates
      const fullName = [student.lastName, student.firstName, student.middleName, student.suffix]
        .filter(Boolean)
        .join(', ')
        .replace(', ,', ',')
        .trim() || student.studentNumber;

      try {
        await EvaluationCompletion.create({
          studentId: student._id,
          studentNumber: String(student.studentNumber || ''),
          studentName: fullName,
          course: String(enrollment.course || student.course || ''),
          yearLevel: enrollment.yearLevel || student.yearLevel || null,
          sectionCode: sectionCode || student.section || '',
          enrollmentId: enrollment._id,
          teachingAssignmentId,
          periodId: period.id && mongoose.Types.ObjectId.isValid(period.id) ? period.id : null,
          semester,
          schoolYear,
          academicYear: schoolYear,
          subjectId: enrolledSubject.subjectId || null,
          subjectCode: targetSubjectCode,
          subjectName: resolvedSubjectName,
          subjectTitle: resolvedSubjectName,
          professorId: professorId && mongoose.Types.ObjectId.isValid(professorId) ? professorId : null,
          professorName,
          completedAt: new Date()
        });
      } catch (completionError) {
        // Rollback anonymous response if completion write fails or duplicate constraint tripped
        await Promise.resolve(EvaluationResponse.deleteOne({ _id: savedResponse._id })).catch(() => null);
        if (completionError.code === 11000) {
          return res.status(409).json({
            success: false,
            error: `You have already evaluated ${professorName} for ${targetSubjectCode}.`,
            code: 'ALREADY_EVALUATED'
          });
        }
        throw completionError;
      }

      // 9. Dispatch in-app notification confirming successful evaluation submission
      await notifyStudentSubmissionSuccess(student, targetSubjectCode, professorName);

      // 10. Return updated status and metrics
      const updatedStatus = await getStudentTermEvaluationStatus(student, enrollment, professorLookup, null, period);
      const updatedEntry = updatedStatus.evaluationEntries.find((e) => e.subjectCode === targetSubjectCode) || null;
      const advisers = groupEvaluationSubjectsByAdviser(updatedStatus.subjectsList, updatedStatus.period);

      return res.status(201).json({
        success: true,
        message: `Thank you for evaluating ${professorName} in ${targetSubjectCode}. Your response was recorded anonymously.`,
        data: {
          studentId: String(student._id),
          teachingAssignmentId,
          professorId: professorId || null,
          professorName,
          subjectId: enrolledSubject.subjectId ? String(enrolledSubject.subjectId) : null,
          subjectCode: targetSubjectCode,
          subjectName: resolvedSubjectName,
          subjectTitle: resolvedSubjectName,
          sectionCode: sectionCode || student.section || '',
          academicYear: schoolYear,
          schoolYear,
          semester,
          evaluationPeriod: period.id || null,
          averageRating,
          submittedAt: savedResponse.submittedAt,
          entry: updatedEntry,
          advisers,
          summary: {
            requiredCount: updatedStatus.requiredCount,
            completedCount: updatedStatus.completedCount,
            pendingCount: updatedStatus.pendingCount,
            allCompleted: updatedStatus.allCompleted,
            completionPercentage: updatedStatus.completionPercentage,
            gradesLocked: updatedStatus.gradesLocked
          }
        }
      });
    } catch (error) {
      console.error('Submit student evaluation error:', error);
      return res.status(500).json({ error: 'Failed to submit professor evaluation.' });
    }
  }

  // GET /api/professor/evaluations
  // Strictly aggregated results only. Student identity is never exposed.
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

      const questions = activeTermPeriod?.questions && activeTermPeriod.questions.length > 0
        ? activeTermPeriod.questions
        : DEFAULT_EVALUATION_QUESTIONS;

      const questionSummaries = questions.map((q, idx) => {
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
          category: q.category || 'Teaching Effectiveness',
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

      // Anonymous feedback items only: strictly NO student identity fields
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
          questions,
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
        questions: customQuestions,
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

      const questionsToSave = Array.isArray(customQuestions) && customQuestions.length > 0
        ? customQuestions.map((q, idx) => ({
            number: Number(q.number || idx + 1),
            text: String(q.text || '').trim(),
            category: String(q.category || q.criteria || 'General Teaching Effectiveness').trim(),
            criteria: String(q.criteria || q.category || '').trim(),
            required: q.required !== false
          }))
        : DEFAULT_EVALUATION_QUESTIONS;

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
        questions: questionsToSave,
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

      // If created as open, broadcast notification to enrolled students
      if (initialStatus === 'open') {
        void notifyStudentsPeriodOpened(synced);
      }

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
        reason = '',
        questions: customQuestions
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
          void notifyStudentsPeriodOpened(period);
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
          void notifyStudentsPeriodOpened(period);
          break;
        }
        case 'configure_questionnaire': {
          if (Array.isArray(customQuestions) && customQuestions.length > 0) {
            period.questions = customQuestions.map((q, idx) => ({
              number: Number(q.number || idx + 1),
              text: String(q.text || '').trim(),
              category: String(q.category || q.criteria || 'General Teaching Effectiveness').trim(),
              criteria: String(q.criteria || q.category || '').trim(),
              required: q.required !== false
            }));
          }
          break;
        }
        default:
          return res.status(400).json({
            error: 'Invalid action. Supported actions: start, close, extend, reopen, draft, configure_questionnaire.'
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

      return res.json({
        success: true,
        message: `Evaluation period updated successfully (${action}).`,
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
        description: `Registrar ${actorName} removed evaluation period (${period.semester} ${period.schoolYear}) and ${deletedResponses.deletedCount || 0} response(s)`,
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
  // Comprehensive monitoring of student completion, evaluated professors, aggregated results, and filters
  static async getRegistrarEvaluationOverview(req, res) {
    try {
      const activeTerm = await getActiveAcademicTerm();
      const semester = String(req.query.semester || activeTerm.semester).trim();
      const rawYear = String(req.query.academicYear || req.query.schoolYear || activeTerm.schoolYear).trim();
      const schoolYear = rawYear;
      const subjectFilter = String(req.query.subjectCode || req.query.subject || '').trim().toUpperCase();
      const subjectNameFilter = String(req.query.subjectName || '').trim().toLowerCase();
      const professorFilter = String(req.query.professorName || req.query.professor || '').trim().toLowerCase();
      const sectionFilter = String(req.query.sectionCode || req.query.section || '').trim().toUpperCase();
      const periodIdFilter = String(req.query.periodId || '').trim();

      const activePeriod = await ensurePeriodForTerm(
        semester === 'ALL' ? activeTerm.semester : semester,
        schoolYear === 'ALL' ? activeTerm.schoolYear : schoolYear,
        false
      );

      const termQuery = {};
      if (semester && semester !== 'ALL') termQuery.semester = semester;
      if (schoolYear && schoolYear !== 'ALL') {
        termQuery.$or = [{ schoolYear }, { academicYear: schoolYear }];
      }
      if (periodIdFilter && mongoose.Types.ObjectId.isValid(periodIdFilter)) {
        termQuery.periodId = periodIdFilter;
      }

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
        if (subjectFilter && subjectFilter !== 'ALL') {
          const codes = responseSubjectCodes(resp);
          const matches = codes.some((code) => code.includes(subjectFilter));
          if (!matches) return false;
        }
        if (subjectNameFilter && subjectNameFilter !== 'all') {
          const name = String(resp.subjectName || resp.subjectTitle || '').toLowerCase();
          if (!name.includes(subjectNameFilter)) return false;
        }
        if (professorFilter && professorFilter !== 'all') {
          const profName = String(resp.professorName || '').toLowerCase();
          if (!profName.includes(professorFilter)) return false;
        }
        if (sectionFilter && sectionFilter !== 'ALL' && String(resp.sectionCode || '').toUpperCase() !== sectionFilter) {
          return false;
        }
        return true;
      });

      // ── Calculate Student Completion Statistics ──
      const enrollmentFilter = { status: { $ne: 'Dropped' } };
      if (semester && semester !== 'ALL') enrollmentFilter.semester = semester;
      if (schoolYear && schoolYear !== 'ALL') enrollmentFilter.schoolYear = schoolYear;

      const enrollments = await Enrollment.find(enrollmentFilter).select('_id studentId semester schoolYear subjects course sectionCode').lean();
      const completions = await EvaluationCompletion.find(termQuery).select('studentId subjectCode schoolYear semester').lean();

      const completionsByStudent = new Map();
      completions.forEach((comp) => {
        const key = `${comp.studentId}|${comp.schoolYear}|${comp.semester}`;
        const set = completionsByStudent.get(key) || new Set();
        set.add(String(comp.subjectCode || '').toUpperCase());
        completionsByStudent.set(key, set);
      });

      let totalEligibleStudents = 0;
      let completedStudents = 0;
      let pendingStudents = 0;
      const uniqueEligibleStudentIds = new Set();

      for (const enr of enrollments) {
        const activeSubjs = (enr.subjects || []).filter((s) => {
          const st = String(s.status || 'Enrolled').toLowerCase();
          const instr = String(s.instructor || '').trim().toLowerCase();
          return st !== 'dropped' && st !== 'removed' && instr && instr !== 'tba' && instr !== 'n/a';
        });

        if (activeSubjs.length === 0) continue;
        const sid = String(enr.studentId);
        uniqueEligibleStudentIds.add(sid);

        const compKey = `${enr.studentId}|${enr.schoolYear}|${enr.semester}`;
        const completedCodes = completionsByStudent.get(compKey) || new Set();

        const allDone = activeSubjs.every((s) => completedCodes.has(String(s.code || '').toUpperCase()));
        if (allDone) {
          completedStudents += 1;
        } else {
          pendingStudents += 1;
        }
      }

      totalEligibleStudents = uniqueEligibleStudentIds.size;
      const completionPercentage = totalEligibleStudents > 0
        ? Math.round((completedStudents / totalEligibleStudents) * 100)
        : (filteredResponses.length > 0 ? 100 : 0);

      const evaluations = filteredResponses.map((resp, idx) => {
        const emojiMeta = getEmojiForAverage(resp.averageRating);
        const rId = String(resp._id);
        const yearPrefix = String(resp.schoolYear || resp.academicYear || '2026').slice(0, 4);
        const seqNum = String(filteredResponses.length - idx).padStart(4, '0');
        const subjectName = String(resp.subjectName || resp.subjectTitle || resp.subjectCode).trim();
        return {
          id: rId,
          _id: rId,
          recordNumber: `EV-${yearPrefix}-${seqNum}`,
          studentId: resp.studentId ? String(resp.studentId) : null,
          teachingAssignmentId: resp.teachingAssignmentId ? String(resp.teachingAssignmentId) : null,
          semester: resp.semester,
          schoolYear: resp.schoolYear || resp.academicYear || '',
          academicYear: resp.academicYear || resp.schoolYear || '',
          periodId: resp.periodId ? String(resp.periodId) : null,
          subjectId: resp.subjectId ? String(resp.subjectId) : null,
          subjectCode: resp.subjectCode,
          subjectName,
          subjectTitle: subjectName,
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
            professorId: resp.professorId ? String(resp.professorId) : null,
            responseCount: 0,
            ratingSum: 0,
            subjects: new Set(),
            sections: new Set()
          });
        }
        const entry = professorMap.get(key);
        entry.responseCount += 1;
        entry.ratingSum += Number(resp.averageRating || 0);
        for (const code of responseSubjectCodes(resp)) entry.subjects.add(code);
        if (resp.sectionCode) entry.sections.add(resp.sectionCode);
      }

      const professorSummaries = Array.from(professorMap.values()).map((p) => {
        const avg = p.responseCount > 0 ? Number((p.ratingSum / p.responseCount).toFixed(2)) : 0;
        const emojiMeta = getEmojiForAverage(avg);
        return {
          professorName: p.professorName,
          professorId: p.professorId,
          responseCount: p.responseCount,
          subjectCount: p.subjects.size,
          subjects: Array.from(p.subjects),
          sections: Array.from(p.sections),
          averageRating: avg,
          emoji: emojiMeta.emoji,
          label: emojiMeta.label
        };
      });

      const subjectMap = new Map();
      const sectionSet = new Set();
      for (const resp of filteredResponses) {
        if (resp.sectionCode) sectionSet.add(resp.sectionCode);
        for (const code of responseSubjectCodes(resp)) {
          const key = `${code}|${resp.semester}|${resp.schoolYear || resp.academicYear}`;
          if (!subjectMap.has(key)) {
            const subjectName = String(resp.subjectName || resp.subjectTitle || code).trim();
            subjectMap.set(key, {
              subjectCode: code,
              subjectName,
              subjectTitle: subjectName,
              semester: resp.semester,
              schoolYear: resp.schoolYear || resp.academicYear,
              academicYear: resp.academicYear || resp.schoolYear,
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
          subjectName: s.subjectName || s.subjectTitle,
          subjectTitle: s.subjectTitle || s.subjectName,
          semester: s.semester,
          schoolYear: s.schoolYear,
          academicYear: s.academicYear || s.schoolYear,
          responseCount: s.responseCount,
          professorCount: s.professors.size,
          professors: Array.from(s.professors),
          averageRating: avg,
          emoji: emojiMeta.emoji,
          label: emojiMeta.label
        };
      });

      const totalResponses = filteredResponses.length;
      const averageRating = totalResponses > 0
        ? Number((filteredResponses.reduce((sum, r) => sum + Number(r.averageRating || 0), 0) / totalResponses).toFixed(2))
        : 0;

      const questions = activePeriod?.questions && activePeriod.questions.length > 0
        ? activePeriod.questions
        : DEFAULT_EVALUATION_QUESTIONS;

      // Extract unique filter lists from all responses in term
      const allProfessorNames = Array.from(new Set(responses.map((r) => String(r.professorName || '').trim()).filter(Boolean))).sort();
      const allSubjectCodes = Array.from(new Set(responses.map((r) => String(r.subjectCode || '').trim().toUpperCase()).filter(Boolean))).sort();
      const allSubjectNames = Array.from(new Set(responses.map((r) => String(r.subjectName || r.subjectTitle || '').trim()).filter(Boolean))).sort();
      const allSections = Array.from(new Set(responses.map((r) => String(r.sectionCode || '').trim()).filter(Boolean))).sort();
      const allYears = Array.from(new Set(responses.map((r) => String(r.schoolYear || r.academicYear || '').trim()).filter(Boolean))).sort().reverse();

      return res.json({
        success: true,
        data: {
          activePeriod,
          questions,
          emojiScale: EMOJI_RATING_SCALE,
          metrics: {
            totalEligibleStudents,
            completedStudents,
            pendingStudents,
            completionPercentage,
            evaluatedProfessorsCount: professorSummaries.length,
            totalResponses,
            averageRating
          },
          progress: {
            totalEligibleStudents,
            completedStudents,
            pendingStudents,
            completionPercentage,
            totalResponses,
            averageRating,
            professorCount: professorSummaries.length,
            subjectCount: subjectSummaries.length,
            semester: semester === 'ALL' ? 'All Semesters' : semester,
            schoolYear: schoolYear === 'ALL' ? 'All School Years' : schoolYear
          },
          evaluations,
          professorSummaries,
          subjectSummaries,
          availableFilters: {
            sections: allSections.length > 0 ? allSections : Array.from(sectionSet).sort(),
            professors: allProfessorNames,
            subjectCodes: allSubjectCodes,
            subjectNames: allSubjectNames,
            academicYears: allYears,
            semesters: ['1st', '2nd', 'Summer'],
            subjects: Array.from(subjectMap.values()).map((s) => ({
              subjectCode: s.subjectCode,
              subjectName: s.subjectName || s.subjectTitle,
              subjectTitle: s.subjectTitle || s.subjectName
            }))
          }
        }
      });
    } catch (error) {
      console.error('Get registrar evaluation overview error:', error);
      return res.status(500).json({ error: 'Failed to load evaluation overview.' });
    }
  }

  // GET /api/registrar/evaluations/export
  // Generates CSV export of evaluation monitoring data
  static async exportEvaluationReport(req, res) {
    try {
      const activeTerm = await getActiveAcademicTerm();
      const semester = String(req.query.semester || activeTerm.semester).trim();
      const schoolYear = String(req.query.academicYear || req.query.schoolYear || activeTerm.schoolYear).trim();

      const termQuery = {};
      if (semester && semester !== 'ALL') termQuery.semester = semester;
      if (schoolYear && schoolYear !== 'ALL') {
        termQuery.$or = [{ schoolYear }, { academicYear: schoolYear }];
      }

      const responses = await EvaluationResponse.find(termQuery).sort({ submittedAt: -1 }).lean();

      const header = [
        'Record ID',
        'Academic Year',
        'Semester',
        'Professor Name',
        'Subject Code',
        'Subject Name',
        'Teaching Assignment ID',
        'Section',
        'Average Rating',
        'Rating Label',
        'Submitted Date',
        'Comment'
      ];
      const rows = responses.map((r, i) => {
        const yearPrefix = String(r.schoolYear || r.academicYear || '2026').slice(0, 4);
        const seq = String(responses.length - i).padStart(4, '0');
        const emojiMeta = getEmojiForAverage(r.averageRating);
        const subjectName = String(r.subjectName || r.subjectTitle || r.subjectCode).trim();
        return [
          `"EV-${yearPrefix}-${seq}"`,
          `"${r.academicYear || r.schoolYear}"`,
          `"${r.semester}"`,
          `"${(r.professorName || '').replace(/"/g, '""')}"`,
          `"${r.subjectCode}"`,
          `"${subjectName.replace(/"/g, '""')}"`,
          `"${r.teachingAssignmentId ? String(r.teachingAssignmentId) : ''}"`,
          `"${r.sectionCode || ''}"`,
          r.averageRating,
          `"${emojiMeta.label}"`,
          `"${new Date(r.submittedAt).toLocaleDateString()}"`,
          `"${(r.comment || '').replace(/"/g, '""')}"`
        ].join(',');
      });

      const csvContent = [header.join(','), ...rows].join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=evaluation-report-${schoolYear}-${semester}.csv`);
      return res.send(csvContent);
    } catch (error) {
      console.error('Export evaluation report error:', error);
      return res.status(500).json({ error: 'Failed to export evaluation report.' });
    }
  }
}

module.exports = EvaluationController;
