const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const gradingScaleService = require('../services/gradingScaleService');
const {
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
  getStudentTermEvaluationStatus,
  resolveStudentSectionCode,
  EvaluationPeriod,
  EvaluationResponse,
  EvaluationCompletion,
  EvaluationIdentityRevealLog,
  Enrollment,
  Student,
  Admin
} = require('../services/evaluationService');

const ANONYMITY_NOTICE =
  'Your identity (name and student number) is strictly hidden from professors. Evaluation responses are stored separately from completion tracking. Authorized Registrar access to identity mapping is restricted and audited.';

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
            subjects: []
          }
        });
      }

      const professorLookup = await loadProfessorLookup();
      const evalStatus = await getStudentTermEvaluationStatus(student, enrollment, professorLookup);
      const gradeScale = await gradingScaleService.loadGradeScale();

      const activeSubjects = (enrollment.subjects || []).filter(
        (subj) => ['Enrolled', 'Incomplete', 'Completed'].includes(subj.status || 'Enrolled')
      );

      const subjects = activeSubjects.map((subj) => {
        const code = String(subj.code || '').trim().toUpperCase();
        const meta = evalStatus.subjectsByCode.get(code);
        const isPublished = (subj.submissionStatus || 'Draft') === 'Published';
        const isUnlocked = evalStatus.allCompleted && isPublished;

        return {
          enrollmentId: String(enrollment._id),
          subjectId: subj.subjectId ? String(subj.subjectId) : null,
          subjectCode: code,
          subjectTitle: subj.title,
          units: Number(subj.units || 0),
          schedule: subj.schedule || 'TBA',
          room: subj.room || 'TBA',
          instructor: meta?.professorName || subj.instructor || 'Assigned Faculty',
          professorName: meta?.professorName || subj.instructor || 'Assigned Faculty',
          professorId: meta?.professorId || null,
          status: subj.status || 'Enrolled',
          evaluationRequired: true,
          evaluationCompleted: Boolean(meta?.evaluationCompleted),
          completedAt: meta?.completedAt || null,
          canEvaluate: Boolean(meta?.canEvaluate),
          gradePublished: isPublished,
          gradeLocked: !isUnlocked,
          lockReason: !evalStatus.allCompleted
            ? 'Complete the required professor evaluations to access your grades.'
            : (!isPublished ? 'Grades are not yet officially released by the Registrar.' : null),
          grade: isUnlocked && subj.grade != null ? subj.grade : null,
          gradeMark: isUnlocked ? (subj.gradeMark || null) : null,
          remarks: isUnlocked
            ? (subj.remarks || (subj.gradeMark ? subj.gradeMark : (subj.grade != null && gradingScaleService.isPassingGrade(subj.grade, gradeScale) ? 'PASSED' : 'FAILED')))
            : 'LOCKED'
        };
      });

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
            requiredCount: evalStatus.requiredCount,
            completedCount: evalStatus.completedCount,
            pendingCount: evalStatus.pendingCount,
            allCompleted: evalStatus.allCompleted,
            gradesLocked: evalStatus.gradesLocked
          },
          subjects
        }
      });
    } catch (error) {
      console.error('Get student evaluations error:', error);
      return res.status(500).json({ error: 'Failed to load professor evaluations.' });
    }
  }

  // POST /api/student/evaluations
  static async submitStudentEvaluation(req, res) {
    try {
      const student = req.student;
      if (!student) {
        return res.status(401).json({ error: 'Unauthorized student session.' });
      }

      const {
        subjectCode: rawSubjectCode,
        subjectId: rawSubjectId,
        semester: rawSemester,
        schoolYear: rawSchoolYear,
        ratings: rawRatings,
        comment: rawComment
      } = req.body || {};

      const normalizedCode = String(rawSubjectCode || '').trim().toUpperCase();
      if (!normalizedCode && !rawSubjectId) {
        return res.status(400).json({ error: 'Subject code or subject ID is required.' });
      }

      // 1. Validate ratings array (must have all 10 questions rated 1..5)
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

      // 2. Verify that the logged-in student is enrolled in the selected subject
      const enrollmentQuery = {
        studentId: student._id,
        status: { $ne: 'Dropped' }
      };
      if (rawSemester) enrollmentQuery.semester = String(rawSemester).trim();
      if (rawSchoolYear) enrollmentQuery.schoolYear = String(rawSchoolYear).trim();

      const enrollments = await Enrollment.find(enrollmentQuery).sort({ isCurrent: -1, createdAt: -1 });
      let matchedEnrollment = null;
      let matchedSubject = null;

      for (const enr of enrollments) {
        const found = (enr.subjects || []).find((subj) => {
          if (!['Enrolled', 'Incomplete', 'Completed'].includes(subj.status || 'Enrolled')) {
            return false;
          }
          const subjCode = String(subj.code || '').trim().toUpperCase();
          const subjId = subj.subjectId ? String(subj.subjectId) : '';
          if (normalizedCode && subjCode === normalizedCode) return true;
          if (rawSubjectId && subjId === String(rawSubjectId)) return true;
          return false;
        });
        if (found) {
          matchedEnrollment = enr;
          matchedSubject = found;
          break;
        }
      }

      if (!matchedEnrollment || !matchedSubject) {
        return res.status(403).json({
          error: 'You are not enrolled in this subject for the selected academic term.'
        });
      }

      const canonicalCode = String(matchedSubject.code || '').trim().toUpperCase();
      const semester = matchedEnrollment.semester;
      const schoolYear = matchedEnrollment.schoolYear;

      // 3. Enforce evaluation deadlines on the server
      const period = await ensurePeriodForTerm(semester, schoolYear, true);
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

      // 4. Prevent duplicate evaluation submissions
      const existingCompletion = await EvaluationCompletion.findOne({
        studentId: student._id,
        semester,
        schoolYear,
        subjectCode: canonicalCode
      }).lean();

      if (existingCompletion) {
        return res.status(409).json({
          error: 'You have already submitted an evaluation for this subject and professor.',
          code: 'DUPLICATE_EVALUATION'
        });
      }

      // 5. Resolve professor & section info
      const professorLookup = await loadProfessorLookup();
      const profInfo = resolveSubjectProfessor(matchedSubject, student, professorLookup);
      const sectionInfo = await resolveStudentSectionCode(student._id, semester, schoolYear);

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

      // 6. Save ratings securely in EvaluationResponse BEFORE marking completion
      const savedResponse = await EvaluationResponse.create({
        periodId: period.id && mongoose.Types.ObjectId.isValid(period.id) ? period.id : null,
        semester,
        schoolYear,
        subjectId: matchedSubject.subjectId || null,
        subjectCode: canonicalCode,
        subjectTitle: matchedSubject.title,
        sectionId: sectionInfo.sectionId,
        sectionCode: sectionInfo.sectionCode || student.section || '',
        course: String(matchedEnrollment.course || student.course || ''),
        yearLevel: matchedEnrollment.yearLevel || student.yearLevel || null,
        professorId: profInfo.professorId && mongoose.Types.ObjectId.isValid(profInfo.professorId)
          ? profInfo.professorId
          : null,
        professorName: profInfo.professorName,
        ratings: formattedRatings,
        questionScores: scores,
        averageRating,
        comment: sanitizedComment,
        submittedAt: new Date()
      });

      // 7. Record completion separately (rollback response if duplicate race occurs)
      try {
        const fullName = [student.lastName, student.firstName, student.middleName, student.suffix]
          .filter(Boolean)
          .join(', ')
          .replace(', ,', ',')
          .trim() || student.studentNumber;

        await EvaluationCompletion.create({
          studentId: student._id,
          studentNumber: String(student.studentNumber || ''),
          studentName: fullName,
          course: String(matchedEnrollment.course || student.course || ''),
          yearLevel: matchedEnrollment.yearLevel || student.yearLevel || null,
          sectionCode: sectionInfo.sectionCode || student.section || '',
          enrollmentId: matchedEnrollment._id,
          periodId: period.id && mongoose.Types.ObjectId.isValid(period.id) ? period.id : null,
          semester,
          schoolYear,
          subjectId: matchedSubject.subjectId || null,
          subjectCode: canonicalCode,
          subjectTitle: matchedSubject.title,
          professorId: profInfo.professorId && mongoose.Types.ObjectId.isValid(profInfo.professorId)
            ? profInfo.professorId
            : null,
          professorName: profInfo.professorName,
          responseId: savedResponse._id,
          completedAt: new Date()
        });
      } catch (completionError) {
        await EvaluationResponse.deleteOne({ _id: savedResponse._id }).catch(() => null);
        if (completionError && completionError.code === 11000) {
          return res.status(409).json({
            error: 'You have already submitted an evaluation for this subject.',
            code: 'DUPLICATE_EVALUATION'
          });
        }
        throw completionError;
      }

      const updatedStatus = await getStudentTermEvaluationStatus(student, matchedEnrollment, professorLookup);

      return res.status(201).json({
        success: true,
        message: updatedStatus.allCompleted
          ? 'Thank you! All required professor evaluations are complete. Published grades are now unlocked.'
          : `Evaluation submitted! (${updatedStatus.completedCount} of ${updatedStatus.requiredCount} completed)`,
        data: {
          subjectCode: canonicalCode,
          subjectTitle: matchedSubject.title,
          professorName: profInfo.professorName,
          averageRating,
          submittedAt: savedResponse.submittedAt,
          summary: {
            requiredCount: updatedStatus.requiredCount,
            completedCount: updatedStatus.completedCount,
            pendingCount: updatedStatus.pendingCount,
            allCompleted: updatedStatus.allCompleted,
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

      // Also find any subject codes assigned to this professor in Enrollment records
      const assignedEnrollments = await Enrollment.find({
        status: { $ne: 'Dropped' },
        subjects: {
          $elemMatch: {
            instructor: { $in: nameRegexes },
            status: { $ne: 'Dropped' }
          }
        }
      }).select('semester schoolYear subjects').lean();

      const activeTerm = await getActiveAcademicTerm();
      const assignedSubjectsMap = new Map();
      const schoolYearSet = new Set([activeTerm.schoolYear]);
      const semesterSet = new Set(['1st', '2nd', 'Summer']);

      for (const enr of assignedEnrollments) {
        if (enr.schoolYear) schoolYearSet.add(enr.schoolYear);
        if (enr.semester) semesterSet.add(enr.semester);
        for (const subj of enr.subjects || []) {
          const matchesProf = nameRegexes.some((rx) => rx.test(String(subj.instructor || '')));
          if (matchesProf && subj.code) {
            const code = String(subj.code).trim().toUpperCase();
            if (!assignedSubjectsMap.has(code)) {
              assignedSubjectsMap.set(code, {
                subjectCode: code,
                subjectTitle: subj.title || code
              });
            }
          }
        }
      }

      const orFilters = [{ professorId: professor._id }];
      if (nameRegexes.length > 0) {
        orFilters.push({ professorName: { $in: nameRegexes } });
      }
      if (assignedSubjectsMap.size > 0) {
        orFilters.push({ subjectCode: { $in: Array.from(assignedSubjectsMap.keys()) } });
      }

      const filterSubject = String(req.query.subjectCode || req.query.subject || '').trim().toUpperCase();
      const filterSemester = String(req.query.semester || '').trim();
      const filterSchoolYear = String(req.query.schoolYear || '').trim();

      const baseQuery = { $or: orFilters };
      const allProfResponses = await EvaluationResponse.find(baseQuery)
        .select('-__v')
        .sort({ submittedAt: -1 })
        .lean();

      for (const resp of allProfResponses) {
        if (resp.schoolYear) schoolYearSet.add(resp.schoolYear);
        if (resp.semester) semesterSet.add(resp.semester);
        if (resp.subjectCode && !assignedSubjectsMap.has(resp.subjectCode)) {
          assignedSubjectsMap.set(resp.subjectCode, {
            subjectCode: resp.subjectCode,
            subjectTitle: resp.subjectTitle || resp.subjectCode
          });
        }
      }

      const filteredResponses = allProfResponses.filter((resp) => {
        if (filterSubject && filterSubject !== 'ALL' && String(resp.subjectCode).toUpperCase() !== filterSubject) {
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

      // Compute expected responses from assigned enrollments for completion percentage
      let expectedFromEnrollments = 0;
      for (const enr of assignedEnrollments) {
        if (filterSemester && filterSemester !== 'ALL' && enr.semester !== filterSemester) continue;
        if (filterSchoolYear && filterSchoolYear !== 'ALL' && enr.schoolYear !== filterSchoolYear) continue;
        for (const subj of enr.subjects || []) {
          const code = String(subj.code || '').trim().toUpperCase();
          if (filterSubject && filterSubject !== 'ALL' && code !== filterSubject) continue;
          const matchesProf = nameRegexes.some((rx) => rx.test(String(subj.instructor || '')));
          if (matchesProf) {
            expectedFromEnrollments += 1;
          }
        }
      }
      const totalExpectedResponses = Math.max(expectedFromEnrollments, totalResponses);
      const completionPercentage = totalExpectedResponses > 0
        ? Math.min(100, Math.round((totalResponses / totalExpectedResponses) * 100))
        : 0;
      const activeTermPeriod = await ensurePeriodForTerm(
        filterSemester && filterSemester !== 'ALL' ? filterSemester : activeTerm.semester,
        filterSchoolYear && filterSchoolYear !== 'ALL' ? filterSchoolYear : activeTerm.schoolYear,
        true
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
        const key = `${resp.subjectCode}|${resp.semester}|${resp.schoolYear}`;
        if (!subjectGroupMap.has(key)) {
          subjectGroupMap.set(key, {
            subjectCode: resp.subjectCode,
            subjectTitle: resp.subjectTitle,
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
          sectionCode: resp.sectionCode || '',
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
          totalExpectedResponses,
          completionPercentage,
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
      await ensurePeriodForTerm(activeTerm.semester, activeTerm.schoolYear, true);
      const rawPeriods = await EvaluationPeriod.find({})
        .sort({ schoolYear: -1, semester: 1, createdAt: -1 })
        .lean();

      const periods = [];
      for (const p of rawPeriods) {
        const synced = await syncPeriodEffectiveStatus(p);
        const [enrollments, completionsCount] = await Promise.all([
          Enrollment.find({
            semester: p.semester,
            schoolYear: p.schoolYear,
            status: { $ne: 'Dropped' }
          }).select('subjects').lean(),
          EvaluationCompletion.countDocuments({
            semester: p.semester,
            schoolYear: p.schoolYear
          })
        ]);

        const totalRequired = enrollments.reduce((sum, enr) => {
          const activeCount = (enr.subjects || []).filter(
            (s) => ['Enrolled', 'Incomplete', 'Completed'].includes(s.status || 'Enrolled')
          ).length;
          return sum + activeCount;
        }, 0);

        periods.push({
          ...synced,
          totalEnrolledStudents: enrollments.length,
          totalRequiredEvaluations: totalRequired,
          completedEvaluations: completionsCount,
          incompleteEvaluations: Math.max(0, totalRequired - completionsCount),
          completionRate: totalRequired > 0
            ? Math.min(100, Math.round((completionsCount / totalRequired) * 100))
            : 0
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

      return res.json({
        success: true,
        message: `Evaluation period ${action}ed successfully.`,
        data: synced
      });
    } catch (error) {
      console.error('Update evaluation period status error:', error);
      return res.status(500).json({ error: 'Failed to update evaluation period.' });
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
        true
      );

      const termQuery = {};
      if (semester && semester !== 'ALL') termQuery.semester = semester;
      if (schoolYear && schoolYear !== 'ALL') termQuery.schoolYear = schoolYear;

      const professorLookup = await loadProfessorLookup();

      const [enrollments, completions, responses, revealLogs] = await Promise.all([
        Enrollment.find({
          ...termQuery,
          status: { $ne: 'Dropped' }
        }).populate('studentId', 'studentNumber firstName middleName lastName suffix course yearLevel section').lean(),
        EvaluationCompletion.find(termQuery).lean(),
        EvaluationResponse.find(termQuery).sort({ submittedAt: -1 }).lean(),
        EvaluationIdentityRevealLog.find(termQuery).sort({ revealedAt: -1 }).lean()
      ]);

      const completionSet = new Set(
        completions.map((c) => `${String(c.studentId)}|${c.semester}|${c.schoolYear}|${String(c.subjectCode).toUpperCase()}`)
      );

      let totalRequiredEvaluations = 0;
      let totalSubmittedEvaluations = 0;
      let studentsFullyCompleted = 0;
      let studentsIncomplete = 0;
      const incompleteEvaluations = [];

      for (const enr of enrollments) {
        const studentDoc = enr.studentId && typeof enr.studentId === 'object' ? enr.studentId : null;
        const studentIdStr = studentDoc ? String(studentDoc._id) : String(enr.studentId || '');
        const studentNumber = studentDoc?.studentNumber || enr.studentNumber || 'N/A';
        const studentName = studentDoc
          ? [studentDoc.lastName, studentDoc.firstName, studentDoc.middleName, studentDoc.suffix].filter(Boolean).join(', ')
          : studentNumber;

        const activeSubjects = (enr.subjects || []).filter(
          (s) => ['Enrolled', 'Incomplete', 'Completed'].includes(s.status || 'Enrolled')
        );
        if (activeSubjects.length === 0) continue;

        const pendingSubjects = [];
        let completedForStudent = 0;

        for (const subj of activeSubjects) {
          const code = String(subj.code || '').trim().toUpperCase();
          if (!code) continue;
          totalRequiredEvaluations += 1;
          const prof = resolveSubjectProfessor(subj, studentDoc, professorLookup);
          const key = `${studentIdStr}|${enr.semester}|${enr.schoolYear}|${code}`;
          if (completionSet.has(key)) {
            completedForStudent += 1;
            totalSubmittedEvaluations += 1;
          } else {
            pendingSubjects.push({
              subjectCode: code,
              subjectTitle: subj.title || code,
              professorName: prof.professorName
            });
          }
        }

        if (pendingSubjects.length === 0) {
          studentsFullyCompleted += 1;
        } else {
          studentsIncomplete += 1;
          incompleteEvaluations.push({
            studentId: studentIdStr,
            studentNumber,
            studentName,
            course: enr.course || studentDoc?.course || '',
            yearLevel: enr.yearLevel || studentDoc?.yearLevel || null,
            semester: enr.semester,
            schoolYear: enr.schoolYear,
            requiredCount: activeSubjects.length,
            completedCount: completedForStudent,
            pendingCount: pendingSubjects.length,
            pendingSubjects
          });
        }
      }

      const revealCountByResponseId = new Map();
      for (const log of revealLogs) {
        const rId = String(log.responseId);
        revealCountByResponseId.set(rId, (revealCountByResponseId.get(rId) || 0) + 1);
      }

      const filteredResponses = responses.filter((resp) => {
        if (subjectFilter && subjectFilter !== 'ALL' && String(resp.subjectCode).toUpperCase() !== subjectFilter) {
          return false;
        }
        if (professorFilter && professorFilter !== 'all' && !String(resp.professorName || '').toLowerCase().includes(professorFilter)) {
          return false;
        }
        return true;
      });

      // Student identities are hidden by default until authorized Reveal Identity is executed
      const evaluations = filteredResponses.map((resp, idx) => {
        const emojiMeta = getEmojiForAverage(resp.averageRating);
        const rId = String(resp._id);
        const yearPrefix = String(resp.schoolYear || '2026').slice(0, 4);
        const seqNum = String(filteredResponses.length - idx).padStart(4, '0');
        return {
          id: rId,
          _id: rId,
          recordNumber: `EV-${yearPrefix}-${seqNum}`,
          submissionStatus: 'Completed',
          semester: resp.semester,
          schoolYear: resp.schoolYear,
          subjectCode: resp.subjectCode,
          subjectTitle: resp.subjectTitle,
          sectionCode: resp.sectionCode || '',
          course: resp.course || '',
          yearLevel: resp.yearLevel || null,
          professorId: resp.professorId ? String(resp.professorId) : null,
          professorName: resp.professorName,
          averageRating: resp.averageRating,
          emoji: emojiMeta.emoji,
          ratingLabel: emojiMeta.label,
          ratings: resp.ratings || [],
          comment: resp.comment || '',
          submittedAt: resp.submittedAt,
          revealCount: revealCountByResponseId.get(rId) || 0,
          studentIdentity: {
            isRevealed: false,
            maskedLabel: 'Anonymous Student (Protected)'
          }
        };
      });

      const profMap = new Map();
      for (const resp of responses) {
        const key = String(resp.professorName || 'Assigned Faculty');
        if (!profMap.has(key)) {
          profMap.set(key, {
            professorName: key,
            responseCount: 0,
            ratingSum: 0,
            subjects: new Set()
          });
        }
        const entry = profMap.get(key);
        entry.responseCount += 1;
        entry.ratingSum += Number(resp.averageRating || 0);
        if (resp.subjectCode) entry.subjects.add(resp.subjectCode);
      }

      const professorSummaries = Array.from(profMap.values()).map((p) => {
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

      const completionPercentage = totalRequiredEvaluations > 0
        ? Math.min(100, Math.round((totalSubmittedEvaluations / totalRequiredEvaluations) * 100))
        : 0;

      return res.json({
        success: true,
        data: {
          activePeriod,
          questions: EVALUATION_QUESTIONS,
          emojiScale: EMOJI_RATING_SCALE,
          progress: {
            totalStudentsEnrolled: studentsFullyCompleted + studentsIncomplete,
            studentsFullyCompleted,
            studentsIncomplete,
            totalRequiredEvaluations,
            totalSubmittedEvaluations,
            pendingEvaluations: Math.max(0, totalRequiredEvaluations - totalSubmittedEvaluations),
            completionPercentage
          },
          incompleteEvaluations,
          evaluations,
          professorSummaries,
          revealLogs: revealLogs.slice(0, 50)
        }
      });
    } catch (error) {
      console.error('Get registrar evaluation overview error:', error);
      return res.status(500).json({ error: 'Failed to load evaluation overview.' });
    }
  }

  // POST /api/registrar/evaluations/:responseId/reveal-identity
  static async revealStudentIdentity(req, res) {
    try {
      const { responseId } = req.params;
      const reason = String(req.body?.reason || '').trim();

      if (!mongoose.Types.ObjectId.isValid(responseId)) {
        return res.status(400).json({ error: 'Invalid evaluation response ID.' });
      }

      if (reason.length < 5) {
        return res.status(400).json({
          error: 'A valid authorization reason (at least 5 characters) is required to reveal a student identity.'
        });
      }

      const registrar = await Admin.findById(req.adminId)
        .select('_id username displayName accountType')
        .lean();

      if (!registrar || !['admin', 'registrar'].includes(String(registrar.accountType || '').toLowerCase())) {
        return res.status(403).json({
          error: 'Forbidden. Authorized Registrar or Admin access is required to reveal student identity.'
        });
      }

      const [responseDoc, completionDoc] = await Promise.all([
        EvaluationResponse.findById(responseId).lean(),
        EvaluationCompletion.findOne({ responseId: new mongoose.Types.ObjectId(responseId) })
          .select('+responseId')
          .lean()
      ]);

      if (!responseDoc || !completionDoc) {
        return res.status(404).json({
          error: 'Evaluation record or identity mapping not found.'
        });
      }

      const ipAddress = String(req.ip || req.headers['x-forwarded-for'] || 'unknown');
      const userAgent = String(req.headers['user-agent'] || 'unknown');

      const revealLog = await EvaluationIdentityRevealLog.create({
        responseId: responseDoc._id,
        completionId: completionDoc._id,
        periodId: responseDoc.periodId || completionDoc.periodId || null,
        semester: responseDoc.semester,
        schoolYear: responseDoc.schoolYear,
        subjectCode: responseDoc.subjectCode,
        subjectTitle: responseDoc.subjectTitle,
        professorName: responseDoc.professorName,
        revealedStudentId: completionDoc.studentId,
        revealedStudentNumber: completionDoc.studentNumber,
        revealedStudentName: completionDoc.studentName,
        registrarId: registrar._id,
        registrarUsername: registrar.username,
        registrarDisplayName: registrar.displayName || registrar.username,
        registrarRole: registrar.accountType,
        reason,
        ipAddress,
        userAgent,
        revealedAt: new Date()
      });

      await writeAuditEntry({
        action: 'READ',
        resourceType: 'EVALUATION_IDENTITY_REVEAL',
        resourceId: String(responseDoc._id),
        resourceName: `${responseDoc.subjectCode} - ${responseDoc.professorName}`,
        description: `Registrar ${registrar.displayName || registrar.username} revealed student identity (${completionDoc.studentNumber} - ${completionDoc.studentName}) for evaluation ${responseDoc._id}. Reason: ${reason}`,
        req,
        newValue: {
          evaluationResponseId: String(responseDoc._id),
          studentNumber: completionDoc.studentNumber,
          studentName: completionDoc.studentName,
          subjectCode: responseDoc.subjectCode,
          professorName: responseDoc.professorName,
          reason,
          revealedAt: revealLog.revealedAt
        },
        severity: 'HIGH'
      });

      return res.json({
        success: true,
        message: 'Student identity revealed and recorded in the audit log.',
        data: {
          responseId: String(responseDoc._id),
          studentIdentity: {
            isRevealed: true,
            studentId: String(completionDoc.studentId),
            studentNumber: completionDoc.studentNumber,
            studentName: completionDoc.studentName,
            course: completionDoc.course || '',
            yearLevel: completionDoc.yearLevel || null,
            sectionCode: completionDoc.sectionCode || '',
            completedAt: completionDoc.completedAt
          },
          auditRecord: {
            id: String(revealLog._id),
            registrarUsername: registrar.username,
            registrarDisplayName: registrar.displayName || registrar.username,
            reason,
            revealedAt: revealLog.revealedAt
          }
        }
      });
    } catch (error) {
      console.error('Reveal student identity error:', error);
      return res.status(500).json({ error: 'Failed to reveal student identity.' });
    }
  }

  // GET /api/registrar/evaluations/reveal-logs
  static async getIdentityRevealLogs(req, res) {
    try {
      const logs = await EvaluationIdentityRevealLog.find({})
        .sort({ revealedAt: -1 })
        .limit(200)
        .lean();

      return res.json({
        success: true,
        data: logs.map((log) => ({
          id: String(log._id),
          responseId: String(log.responseId),
          semester: log.semester,
          schoolYear: log.schoolYear,
          subjectCode: log.subjectCode,
          subjectTitle: log.subjectTitle,
          professorName: log.professorName,
          revealedStudentNumber: log.revealedStudentNumber,
          revealedStudentName: log.revealedStudentName,
          registrarUsername: log.registrarUsername,
          registrarDisplayName: log.registrarDisplayName || log.registrarUsername,
          registrarRole: log.registrarRole,
          reason: log.reason,
          ipAddress: log.ipAddress,
          revealedAt: log.revealedAt
        }))
      });
    } catch (error) {
      console.error('Get identity reveal logs error:', error);
      return res.status(500).json({ error: 'Failed to load identity reveal audit logs.' });
    }
  }
}

module.exports = EvaluationController;
