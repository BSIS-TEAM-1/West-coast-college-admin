const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const EvaluationCompletion = require('../models/EvaluationCompletion');
const { resolveSubjectProfessor, loadProfessorLookup } = require('../services/evaluationService');

const MONGODB_URI = 'mongodb+srv://WestCoastCollegeAdmin:WCC26@cluster0.sm99qsu.mongodb.net/wcc-admin?retryWrites=true&w=majority';

async function backfillAdviserCompletions() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB');

  const professorLookup = await loadProfessorLookup();
  const allCompletions = await EvaluationCompletion.find().lean();
  console.log(`Found ${allCompletions.length} existing completions`);

  for (const comp of allCompletions) {
    const student = await Student.findById(comp.studentId);
    if (!student) continue;

    const enrollment = await Enrollment.findOne({
      studentId: student._id,
      semester: comp.semester,
      schoolYear: comp.schoolYear,
      status: { $ne: 'Dropped' }
    });
    if (!enrollment) continue;

    const activeSubjects = (enrollment.subjects || []).filter(
      (subj) => ['Enrolled', 'Incomplete', 'Completed'].includes(subj.status || 'Enrolled')
    );

    const targetProfName = String(comp.professorName || '').trim().toLowerCase();
    const targetProfId = comp.professorId ? String(comp.professorId) : null;

    for (const subj of activeSubjects) {
      const prof = resolveSubjectProfessor(subj, student, professorLookup);
      const profId = prof.professorId ? String(prof.professorId) : null;
      const profName = String(prof.professorName || '').trim().toLowerCase();

      const matchesProf = (targetProfId && profId === targetProfId) ||
        (targetProfName && profName === targetProfName);

      if (matchesProf) {
        const code = String(subj.code || '').trim().toUpperCase();
        const existing = await EvaluationCompletion.findOne({
          studentId: student._id,
          semester: comp.semester,
          schoolYear: comp.schoolYear,
          subjectCode: code
        });

        if (!existing) {
          console.log(`Backfilling completion for student ${student.studentNumber}, subject ${code}, professor ${prof.professorName}`);
          await EvaluationCompletion.create({
            studentId: student._id,
            studentNumber: String(student.studentNumber || ''),
            studentName: student.fullName,
            course: String(enrollment.course || student.course || ''),
            yearLevel: enrollment.yearLevel || student.yearLevel || null,
            sectionCode: student.section || '',
            enrollmentId: enrollment._id,
            periodId: comp.periodId || null,
            semester: comp.semester,
            schoolYear: comp.schoolYear,
            subjectId: subj.subjectId || null,
            subjectCode: code,
            subjectTitle: subj.title || code,
            professorId: prof.professorId || null,
            professorName: prof.professorName,
            completedAt: comp.completedAt || new Date()
          });
        }
      }
    }
  }

  const finalCompletions = await EvaluationCompletion.find({ studentNumber: '202610198053' }).lean();
  console.log('Final completions for 202610198053:', finalCompletions.map(c => c.subjectCode));

  await mongoose.disconnect();
}

backfillAdviserCompletions().catch(console.error);
