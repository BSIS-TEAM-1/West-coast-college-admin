const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const EvaluationCompletion = require('../models/EvaluationCompletion');
const { groupEvaluationSubjectsByAdviser, loadProfessorLookup, resolveSubjectProfessor, adviserKeyFor, ensurePeriodForTerm } = require('../services/evaluationService');
const gradingScaleService = require('../services/gradingScaleService');

const MONGODB_URI = 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority';

async function testProposedStatus() {
  await mongoose.connect(MONGODB_URI);
  const student = await Student.findOne({ studentNumber: '202610198053' });
  const enrollment = await Enrollment.findOne({ studentId: student._id, isCurrent: true });

  const activeSubjects = (enrollment.subjects || []).filter(
    (subj) => ['Enrolled', 'Incomplete', 'Completed'].includes(subj.status || 'Enrolled')
  );

  const completions = await EvaluationCompletion.find({
    studentId: student._id,
    semester: enrollment.semester,
    schoolYear: enrollment.schoolYear
  }).lean();

  const period = await ensurePeriodForTerm(
    enrollment.semester,
    enrollment.schoolYear,
    Boolean(enrollment.isCurrent)
  );

  const professorLookup = await loadProfessorLookup();

  // PROPOSED LOGIC:
  const completionByCode = new Map();
  const completedProfIds = new Set();
  const completedProfNames = new Set();
  const completionByProf = new Map();

  for (const comp of completions) {
    const code = String(comp.subjectCode || '').trim().toUpperCase();
    if (code) completionByCode.set(code, comp);
    if (comp.professorId) {
      const pid = String(comp.professorId);
      completedProfIds.add(pid);
      completionByProf.set(`id:${pid}`, comp);
    }
    if (comp.professorName) {
      const pname = String(comp.professorName).trim().toLowerCase();
      completedProfNames.add(pname);
      completionByProf.set(`name:${pname}`, comp);
    }
  }

  const subjectsByCode = new Map();
  const subjectsList = [];

  for (const subj of activeSubjects) {
    const code = String(subj.code || '').trim().toUpperCase();
    if (!code) continue;

    const prof = resolveSubjectProfessor(subj, student, professorLookup);
    const profIdStr = prof.professorId ? String(prof.professorId) : null;
    const profNameLower = String(prof.professorName || '').trim().toLowerCase();

    const isProfCompleted = (profIdStr && completedProfIds.has(profIdStr))
      || (profNameLower && completedProfNames.has(profNameLower));

    const completion = completionByCode.get(code)
      || (profIdStr ? completionByProf.get(`id:${profIdStr}`) : null)
      || (profNameLower ? completionByProf.get(`name:${profNameLower}`) : null)
      || null;

    const isCompleted = Boolean(completion) || isProfCompleted;
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

  const advisers = groupEvaluationSubjectsByAdviser(subjectsList, period);
  const completedAdvisers = advisers.filter((item) => item.evaluationCompleted).length;
  const pendingAdvisers = Math.max(0, advisers.length - completedAdvisers);

  const gradeScale = await gradingScaleService.loadGradeScale();
  const latestGrades = activeSubjects
    .filter((subject) =>
      (subject.submissionStatus || 'Draft') === 'Published'
      && subject.grade !== null
      && subject.grade !== undefined
    )
    .map((subject) => {
      const code = String(subject.code || '').trim().toUpperCase();
      const evaluationCompleted = Boolean(subjectsByCode.get(code)?.evaluationCompleted);
      return {
        subjectCode: subject.code,
        subjectTitle: subject.title,
        grade: evaluationCompleted ? subject.grade : 0,
        remarks: evaluationCompleted
          ? (subject.remarks || (gradingScaleService.isPassingGrade(subject.grade, gradeScale) ? 'PASSED' : 'FAILED'))
          : '',
        canShowGrade: evaluationCompleted
      };
    });

  console.log('subjectsList:', subjectsList.map(s => ({ code: s.subjectCode, completed: s.evaluationCompleted })));
  console.log('advisers:', advisers.map(a => ({
    name: a.professorName,
    completed: a.evaluationCompleted,
    completedCount: a.completedCount,
    subjectCount: a.subjectCount
  })));
  console.log('latestGrades:', latestGrades);

  await mongoose.disconnect();
}

testProposedStatus().catch(console.error);
