/**
 * Pre-Rollover Validation Service
 *
 * Read-only checks executed against a LOCKED school year before a rollover is
 * confirmed. Results are classified as:
 *
 *   blocking — must be resolved before rollover can proceed
 *   warning  — requires registrar review; may be authorized with a recorded
 *              justification when school policy permits
 *   passed   — no action required
 *
 * The checks deliberately do NOT assume every student completed every subject:
 * failing students are legitimately RETAINED by the established progression
 * rules (see academicYearRolloverService.recommendAction), so a failing grade
 * is never a blocking error — only workflow-level problems (unsubmitted grade
 * sheets, duplicate target enrollments, invalid targets, duplicate rollovers)
 * block the rollover.
 */

const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const BlockGroup = require('../models/BlockGroup');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const RolloverBatch = require('../models/RolloverBatch');
const Backup = require('../models/Backup');
const SystemSetting = require('../models/SystemSetting');

const ACADEMIC_TERM_KEY = 'academicTerm';
const ROLLOVER_ELIGIBLE_LIFECYCLE = ['Enrolled', 'Pending', 'Not Enrolled'];

function isValidSchoolYear(value) {
  return /^\d{4}-\d{4}$/.test(String(value || '').trim());
}

function schoolYearStart(schoolYear) {
  return Number(String(schoolYear || '').split('-')[0]);
}

function sameValue(left, right) {
  return String(left ?? '') === String(right ?? '');
}

function check(key, title, status, { count = 0, message, actionable = null, details = undefined } = {}) {
  return {
    key,
    title,
    status, // 'passed' | 'warning' | 'blocking'
    count,
    message,
    actionable,
    details: details || [],
  };
}

function summarize(results) {
  const summary = { blockingErrors: 0, warnings: 0, passedChecks: 0 };
  for (const result of results) {
    if (result.status === 'blocking') summary.blockingErrors += 1;
    else if (result.status === 'warning') summary.warnings += 1;
    else summary.passedChecks += 1;
  }
  return summary;
}

function runStatus(summary) {
  if (summary.blockingErrors > 0) return 'failed';
  if (summary.warnings > 0) return 'warnings';
  return 'passed';
}

// ---------------------------------------------------------------------------
// Individual checks (each returns a classified result)
// ---------------------------------------------------------------------------

/**
 * Run all mandatory pre-rollover checks for one locked school year.
 *
 * @param {Object} params
 * @param {string} params.fromSchoolYear  the locked year being closed
 * @param {string} params.toSchoolYear    the target school year (may equal from for semester rollovers)
 * @param {string} params.semester        the opening semester of the target term
 */
async function runChecks({ fromSchoolYear, toSchoolYear, semester }) {
  const results = [];

  const semesterRollover = sameValue(fromSchoolYear, toSchoolYear);
  const openingSemester = ['1st', '2nd', 'Summer'].includes(semester) ? semester : null;
  // The closing cohort is processed under the term it currently occupies.
  const closingSemester = semesterRollover
    ? (openingSemester === '2nd' ? '1st' : '2nd')
    : openingSemester;

  // ---- 1. School year / term format validity (blocking) ----
  const formatProblems = [];
  if (!isValidSchoolYear(fromSchoolYear)) formatProblems.push(`Closing school year "${fromSchoolYear}" is not in YYYY-YYYY format.`);
  if (!isValidSchoolYear(toSchoolYear)) formatProblems.push(`Target school year "${toSchoolYear}" is not in YYYY-YYYY format.`);
  if (!openingSemester) formatProblems.push(`Opening semester "${semester}" is invalid. Use 1st, 2nd, or Summer.`);
  if (semesterRollover && openingSemester && openingSemester === '1st') {
    formatProblems.push('A semester rollover (same school year) must open 2nd or Summer. Use a different target school year to promote year levels.');
  }
  if (!semesterRollover && isValidSchoolYear(fromSchoolYear) && isValidSchoolYear(toSchoolYear)
    && schoolYearStart(toSchoolYear) !== schoolYearStart(fromSchoolYear) + 1) {
    formatProblems.push(`Year rollover must move to the immediate next school year (${fromSchoolYear} → ${Number(fromSchoolYear.split('-')[0]) + 1}-${Number(fromSchoolYear.split('-')[0]) + 2}).`);
  }
  results.push(check(
    'target_validity',
    'Target school year validity',
    formatProblems.length > 0 ? 'blocking' : 'passed',
    {
      count: formatProblems.length,
      message: formatProblems.length > 0
        ? 'The rollover target is not valid.'
        : `Target SY ${toSchoolYear} (${openingSemester} semester) is valid.`,
      actionable: formatProblems.length > 0
        ? 'Fix the rollover setup before validating again.'
        : null,
      details: formatProblems,
    }
  ));

  // ---- 2. Active academic term alignment (blocking) ----
  const termSetting = await SystemSetting.findOne({ key: ACADEMIC_TERM_KEY }).lean();
  const activeTerm = termSetting?.value || null;
  const alignmentProblems = [];
  let alignmentNote = null;
  if (activeTerm && sameValue(activeTerm.schoolYear, fromSchoolYear)) {
    if (activeTerm.semester === '1st' && (!semesterRollover || openingSemester !== '2nd')) {
      alignmentProblems.push(
        `It is still the 1st semester of SY ${fromSchoolYear}, so the school year cannot be closed yet. Close the semester instead: keep the same school year and open the 2nd semester.`
      );
    }
    if (activeTerm.semester !== '1st' && semesterRollover) {
      alignmentProblems.push(
        `SY ${fromSchoolYear} is past the 1st semester, so it cannot be advanced to another semester. Close the school year instead by rolling over to the next school year.`
      );
    }
  } else if (activeTerm) {
    alignmentNote = `The active academic term is SY ${activeTerm.schoolYear} (${activeTerm.semester}), so SY ${fromSchoolYear} is being closed retrospectively (correction workflow).`;
  }
  results.push(check(
    'term_alignment',
    'Active academic term alignment',
    alignmentProblems.length > 0 ? 'blocking' : 'passed',
    {
      message: alignmentProblems.length > 0
        ? 'The rollover does not match where the academic term currently is.'
        : (alignmentNote || 'The rollover matches the active academic term.'),
      actionable: alignmentProblems.length > 0
        ? 'Run the semester rollover first, or wait until the current semester has been closed.'
        : null,
      details: alignmentProblems,
    }
  ));

  // ---- 3. Grade submission workflow still open (blocking) ----
  const gradeQuery = { schoolYear: fromSchoolYear, 'subjects.submissionStatus': 'Submitted' };
  if (closingSemester) {
    gradeQuery.semester = closingSemester;
  }
  const pendingSubmissions = await Enrollment.countDocuments(gradeQuery);
  const returnedGrades = await Enrollment.countDocuments({
    schoolYear: fromSchoolYear,
    'subjects.submissionStatus': 'Returned',
  });
  if (pendingSubmissions > 0 || returnedGrades > 0) {
    const problems = [];
    if (pendingSubmissions > 0) {
      problems.push(`${pendingSubmissions} enrollment record(s) still have subject grade submissions awaiting registrar approval.`);
    }
    if (returnedGrades > 0) {
      problems.push(`${returnedGrades} enrollment record(s) have returned grades that professors have not resolved.`);
    }
    results.push(check(
      'grade_workflow_open',
      'Grade submissions awaiting approval',
      'blocking',
      {
        count: pendingSubmissions + returnedGrades,
        message: 'Grade sheets in the closing year are still inside the submission workflow.',
        actionable: 'Have professors finalize grades or approve/reject the outstanding submissions before rolling over.',
        details: problems,
      }
    ));
  } else {
    results.push(check(
      'grade_workflow_open',
      'Grade submissions awaiting approval',
      'passed',
      { message: 'No grade submission is awaiting approval in the closing year.' }
    ));
  }

  // ---- 4. Students with no recorded grade (warning) ----
  const eligibleStudents = await Student.find({
    schoolYear: fromSchoolYear,
    lifecycleStatus: { $in: ROLLOVER_ELIGIBLE_LIFECYCLE },
  })
    .select('_id studentNumber course yearLevel section latestGrade lifecycleStatus')
    .lean();
  const noGrade = eligibleStudents.filter((student) => typeof student.latestGrade !== 'number');
  results.push(check(
    'missing_grades',
    'Students without a recorded grade',
    noGrade.length > 0 ? 'warning' : 'passed',
    {
      count: noGrade.length,
      message: noGrade.length > 0
        ? `${noGrade.length} student record(s) have no grade recorded, so the rollover would default them to "retained".`
        : 'Every active student has a recorded grade.',
      actionable: noGrade.length > 0
        ? 'Review these students: complete their grades, or authorize the rollover with a recorded justification to retain them.'
        : null,
      details: noGrade.slice(0, 25).map((student) => `${student.studentNumber || student._id} (Year ${student.yearLevel}, ${student.section || 'no section'})`),
    }
  ));

  // ---- 5. Duplicate target-term enrollments (blocking) ----
  if (openingSemester) {
    const conflicting = await Enrollment.countDocuments({
      schoolYear: toSchoolYear,
      semester: openingSemester,
      isCurrent: true,
      status: { $in: ['Enrolled', 'Pending'] },
    });
    results.push(check(
      'duplicate_target_enrollment',
      'Duplicate enrollment in the target term',
      conflicting > 0 ? 'blocking' : 'passed',
      {
        count: conflicting,
        message: conflicting > 0
          ? `${conflicting} student(s) already have an active enrollment for SY ${toSchoolYear} ${openingSemester} — the rollover would duplicate them.`
          : 'No student has an existing enrollment for the target term.',
        actionable: conflicting > 0
          ? 'The target term already contains enrollments. This usually means the rollover already ran — retrying is blocked to prevent duplicates.'
          : null,
      }
    ));
  }

  // ---- 6. Duplicate rollover (blocking) ----
  const duplicateBatch = await RolloverBatch.findOne({
    fromSchoolYear,
    toSchoolYear,
    semester: openingSemester || '1st',
    status: 'applied',
  })
    .select('batchId executedAt')
    .lean();
  results.push(check(
    'duplicate_rollover',
    'Duplicate rollover prevention',
    duplicateBatch ? 'blocking' : 'passed',
    {
      count: duplicateBatch ? 1 : 0,
      message: duplicateBatch
        ? `Rollover batch ${duplicateBatch.batchId} already applied this exact rollover on ${new Date(duplicateBatch.executedAt).toLocaleString()}.`
        : 'No rollover with this source, target, and semester has been applied yet.',
      actionable: duplicateBatch
        ? 'This rollover already ran. Use the recovery procedure if a genuine error needs correction.'
        : null,
    }
  ));

  // ---- 7. Block assignment / curriculum integrity (warning) ----
  const enrolledIds = eligibleStudents.map((student) => String(student._id));
  const assignedIds = enrolledIds.length > 0
    ? (await StudentBlockAssignment.find({
        status: 'ASSIGNED',
        $or: [
          { schoolYear: fromSchoolYear },
          { year: fromSchoolYear },
          { year: schoolYearStart(fromSchoolYear) },
          { year: String(schoolYearStart(fromSchoolYear)) },
        ],
        ...(closingSemester ? { semester: closingSemester } : {}),
      }).select('studentId').lean()).map((row) => String(row.studentId))
    : [];
  const assignedIdSet = new Set(assignedIds);
  const unassigned = enrolledIds.filter((id) => !assignedIdSet.has(id));

  const sourceGroups = await BlockGroup.find({
    $or: [
      { schoolYear: fromSchoolYear },
      { year: fromSchoolYear },
      { year: schoolYearStart(fromSchoolYear) },
      { year: String(schoolYearStart(fromSchoolYear)) },
    ],
  })
    .select('name curriculumId')
    .lean();
  const groupsWithoutCurriculum = sourceGroups.filter((group) => !group.curriculumId);

  const blockProblems = [];
  if (unassigned.length > 0) {
    blockProblems.push(`${unassigned.length} student(s) in the closing year have no active block assignment; their cohort cannot be resolved automatically.`);
  }
  if (groupsWithoutCurriculum.length > 0) {
    blockProblems.push(`${groupsWithoutCurriculum.length} block group(s) have no linked curriculum (${groupsWithoutCurriculum.slice(0, 10).map((g) => g.name).join(', ')}); rolled-over sections would show "no curriculum".`);
  }
  results.push(check(
    'block_integrity',
    'Block assignments and curriculum integrity',
    blockProblems.length > 0 ? 'warning' : 'passed',
    {
      count: blockProblems.length,
      message: blockProblems.length > 0
        ? 'Some block/curriculum references in the closing year are incomplete.'
        : 'Block assignments and curriculum links in the closing year are intact.',
      actionable: blockProblems.length > 0
        ? 'Assign the affected students to blocks or link the block groups to their curriculum, or authorize the rollover with a justification.'
        : null,
      details: blockProblems,
    }
  ));

  // ---- 8. Backup / recovery safeguard (warning) ----
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentBackup = await Backup.findOne({
    status: 'completed',
    createdAt: { $gte: sevenDaysAgo },
  })
    .sort({ createdAt: -1 })
    .select('fileName verificationStatus createdAt')
    .lean();
  results.push(check(
    'backup_safety',
    'Recent verified backup',
    recentBackup ? 'passed' : 'warning',
    {
      message: recentBackup
        ? `A completed backup from ${new Date(recentBackup.createdAt).toLocaleString()} (${recentBackup.fileName}) exists.`
        : 'No backup has completed in the last 7 days. A backup is the recovery safeguard for the rollover.',
      actionable: recentBackup
        ? null
        : 'Create and verify a backup from the Backup dashboard before rolling over.',
      details: recentBackup && recentBackup.verificationStatus !== 'verified'
        ? [`The most recent backup is "${recentBackup.verificationStatus}" (not verified). Consider verifying it.`]
        : [],
    }
  ));

  const summary = summarize(results);
  return { results, summary, status: runStatus(summary) };
}

/**
 * Execution-time recheck of the cheap, race-sensitive conditions immediately
 * before a rollover runs. Throws a 409 error when a condition no longer holds
 * (e.g. a concurrent change appeared after validation).
 */
async function assertExecutionTimeGates({ fromSchoolYear, toSchoolYear, semester }) {
  const semesterRollover = sameValue(fromSchoolYear, toSchoolYear);
  const openingSemester = ['1st', '2nd', 'Summer'].includes(semester) ? semester : null;
  if (!openingSemester) {
    throw Object.assign(new Error(`Opening semester "${semester}" is invalid.`), { statusCode: 400 });
  }

  const termSetting = await SystemSetting.findOne({ key: ACADEMIC_TERM_KEY }).lean();
  const activeTerm = termSetting?.value || null;
  if (activeTerm && sameValue(activeTerm.schoolYear, fromSchoolYear)) {
    if (activeTerm.semester === '1st' && (!semesterRollover || openingSemester !== '2nd')) {
      throw Object.assign(
        new Error(`It is still the 1st semester of SY ${fromSchoolYear}; the school year cannot be closed yet.`),
        { statusCode: 409 }
      );
    }
    if (activeTerm.semester !== '1st' && semesterRollover) {
      throw Object.assign(
        new Error(`SY ${fromSchoolYear} is past the 1st semester; a semester rollover is no longer valid for it.`),
        { statusCode: 409 }
      );
    }
  }

  const conflicting = await Enrollment.countDocuments({
    schoolYear: toSchoolYear,
    semester: openingSemester,
    isCurrent: true,
    status: { $in: ['Enrolled', 'Pending'] },
  });
  if (conflicting > 0) {
    throw Object.assign(
      new Error(`${conflicting} enrollment(s) already exist for SY ${toSchoolYear} ${openingSemester}. The rollover cannot run again without duplicating records.`),
      { statusCode: 409, reasonCode: 'ROLL_OVER_DUPLICATE' }
    );
  }

  const duplicateBatch = await RolloverBatch.findOne({
    fromSchoolYear,
    toSchoolYear,
    semester: openingSemester,
    status: 'applied',
  })
    .select('batchId')
    .lean();
  if (duplicateBatch) {
    throw Object.assign(
      new Error(`Rollover batch ${duplicateBatch.batchId} already applied this rollover.`),
      { statusCode: 409, reasonCode: 'ROLL_OVER_DUPLICATE' }
    );
  }
}

module.exports = {
  runChecks,
  assertExecutionTimeGates,
  isValidSchoolYear,
};
