const PDFDocument = require('pdfkit');
const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');

// Course code maps (mirrors studentController for consistency)
const COURSE_CODE_MAP = {
  101: 'BEED',
  102: 'BSEd-English',
  103: 'BSEd-Math',
  201: 'BSBA-HRM'
};

const COURSE_LABEL_MAP = {
  101: 'Bachelor of Elementary Education',
  102: 'Bachelor of Secondary Education - Major in English',
  103: 'Bachelor of Secondary Education - Major in Mathematics',
  201: 'Bachelor of Science in Business Administration - Major in HRM'
};

function courseCodeFromValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d+$/.test(text)) return text;
  const normalized = text.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-');
  if (normalized.includes('BEED')) return '101';
  if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return '102';
  if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return '103';
  if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return '201';
  return '';
}

function getCourseLabel(course) {
  const code = courseCodeFromValue(course);
  return COURSE_LABEL_MAP[code] || COURSE_LABEL_MAP[course] || String(course || 'N/A');
}

function formatStudentName(student) {
  const parts = [student?.firstName, student?.middleName, student?.lastName, student?.suffix]
    .filter(p => p && String(p).trim())
    .map(p => String(p).trim());
  return parts.join(' ');
}

/**
 * Helper: build a PDF header with school logo placeholder, name, and report title.
 */
function buildPdfHeader(doc, title, subtitle = '') {
  doc.fontSize(16).font('Helvetica-Bold').text('West Coast College', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text('Registrar Office', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
  if (subtitle) {
    doc.fontSize(10).font('Helvetica').text(subtitle, { align: 'center' });
  }
  doc.moveDown(1);
}

/**
 * Helper: draw a horizontal rule.
 */
function drawRule(doc, y) {
  doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor('#cccccc').lineWidth(1).stroke();
}

/**
 * Helper: compute GPA from subjects (only non-dropped, with grades).
 */
function computeGpa(subjects) {
  let totalPoints = 0;
  let totalUnits = 0;
  for (const s of subjects) {
    if (s.status === 'Dropped' || s.status === 'Removed') continue;
    if (s.grade === null || s.grade === undefined) continue;
    totalPoints += (s.units * s.grade);
    totalUnits += s.units;
  }
  return totalUnits > 0 ? (totalPoints / totalUnits).toFixed(2) : 'N/A';
}

/**
 * GET /registrar/students/:id/report-card?schoolYear=&semester=
 * Generate a printable report card for one semester.
 */
async function generateReportCard(req, res) {
  try {
    const { id } = req.params;
    const { schoolYear, semester } = req.query;

    const student = await Student.findById(id).lean();
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    // Find the enrollment for the requested term (or the most recent if not specified)
    const filter = { studentId: student._id, status: { $nin: ['Dropped', 'Cancelled'] } };
    if (schoolYear) filter.schoolYear = String(schoolYear);
    if (semester) filter.semester = String(semester);

    let enrollment = await Enrollment.findOne(filter).sort({ isCurrent: -1, createdAt: -1 }).lean();
    if (!enrollment && (schoolYear || semester)) {
      // Fallback: any enrollment for this student
      enrollment = await Enrollment.findOne({ studentId: student._id, status: { $nin: ['Dropped', 'Cancelled'] } }).sort({ isCurrent: -1, createdAt: -1 }).lean();
    }
    if (!enrollment) return res.status(404).json({ error: 'No enrollment found for this student.' });

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-card-${student.studentNumber || student._id}.pdf"`);

    buildPdfHeader(doc, 'REPORT CARD', `${enrollment.semester} Semester, AY ${enrollment.schoolYear}`);

    // Student info
    doc.fontSize(10).font('Helvetica');
    doc.text(`Student Name: ${formatStudentName(student)}`, { continued: false });
    doc.text(`Student Number: ${student.studentNumber || 'N/A'}`);
    doc.text(`Course: ${getCourseLabel(student.course)}`);
    doc.text(`Year Level: ${enrollment.yearLevel || student.yearLevel || 'N/A'}`);
    doc.moveDown(1);

    // Subjects table
    const tableTop = doc.y;
    const colX = [50, 130, 320, 400, 460, 520];
    const colWidths = [80, 190, 80, 60, 60, 60];

    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Code', colX[0], tableTop);
    doc.text('Title', colX[1], tableTop);
    doc.text('Units', colX[2], tableTop);
    doc.text('Grade', colX[3], tableTop);
    doc.text('Status', colX[4], tableTop);
    doc.text('Remarks', colX[5], tableTop);
    drawRule(doc, tableTop + 14);

    doc.font('Helvetica').fontSize(9);
    let y = tableTop + 22;
    for (const s of enrollment.subjects) {
      if (s.status === 'Removed') continue;
      doc.text(s.code || '', colX[0], y);
      doc.text(s.title || '', colX[1], y, { width: colWidths[1], ellipsis: true });
      doc.text(String(s.units ?? ''), colX[2], y);
      doc.text(s.grade !== null && s.grade !== undefined ? s.grade.toFixed(2) : '—', colX[3], y);
      doc.text(s.status || '', colX[4], y);
      doc.text(s.remarks || '', colX[5], y, { width: colWidths[5], ellipsis: true });
      y += 16;
      if (y > doc.page.height - 100) { doc.addPage(); y = 50; }
    }
    drawRule(doc, y);
    y += 16;

    // Summary
    const gpa = computeGpa(enrollment.subjects);
    const totalUnits = enrollment.subjects
      .filter(s => s.status !== 'Dropped' && s.status !== 'Removed')
      .reduce((sum, s) => sum + (s.units || 0), 0);
    const gradedCount = enrollment.subjects.filter(s => s.status !== 'Dropped' && s.status !== 'Removed' && s.grade !== null && s.grade !== undefined).length;

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(`Total Units Enrolled: ${totalUnits}`, 50, y);
    doc.text(`General Average: ${gpa}`, 300, y);
    y += 16;
    doc.text(`Subjects Graded: ${gradedCount}`, 50, y);
    doc.text(`Submission Status: ${enrollment.gradeSubmission?.status || 'Draft'}`, 300, y);
    y += 30;

    // Signatures
    doc.font('Helvetica').fontSize(9);
    doc.text('_____________________________', 50, y);
    doc.text('_____________________________', 350, y);
    y += 14;
    doc.text('Class Instructor', 80, y);
    doc.text('Registrar', 380, y);

    doc.end();
    res.status(200);
  } catch (error) {
    console.error('Error generating report card:', error);
    return res.status(500).json({ error: 'Failed to generate report card.' });
  }
}

/**
 * GET /registrar/students/:id/transcript
 * Generate a Transcript of Records (TOR) covering all enrollments.
 */
async function generateTranscript(req, res) {
  try {
    const { id } = req.params;
    const student = await Student.findById(id).lean();
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const enrollments = await Enrollment.find({
      studentId: student._id,
      status: { $nin: ['Cancelled'] }
    }).sort({ schoolYear: 1, semester: 1, createdAt: 1 }).lean();

    if (enrollments.length === 0) {
      return res.status(404).json({ error: 'No enrollment records found for this student.' });
    }

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tor-${student.studentNumber || student._id}.pdf"`);

    buildPdfHeader(doc, 'TRANSCRIPT OF RECORDS');

    // Student info
    doc.fontSize(10).font('Helvetica');
    doc.text(`Student Name: ${formatStudentName(student)}`, 50, doc.y);
    doc.text(`Student Number: ${student.studentNumber || 'N/A'}`);
    doc.text(`Course: ${getCourseLabel(student.course)}`);
    doc.moveDown(1);

    let cumulativePoints = 0;
    let cumulativeUnits = 0;

    for (const enrollment of enrollments) {
      // Term header
      if (doc.y > doc.page.height - 150) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text(`${enrollment.schoolYear} — ${enrollment.semester} Semester (Year ${enrollment.yearLevel})`, 50, doc.y);
      drawRule(doc, doc.y + 4);
      doc.y += 14;

      // Column headers
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Code', 50, headerY);
      doc.text('Descriptive Title', 110, headerY);
      doc.text('Units', 320, headerY);
      doc.text('Final Grade', 380, headerY);
      doc.text('Remarks', 460, headerY);
      doc.y = headerY + 14;
      drawRule(doc, doc.y);
      doc.y += 8;

      doc.font('Helvetica').fontSize(8);
      for (const s of enrollment.subjects) {
        if (s.status === 'Removed') continue;
        if (doc.y > doc.page.height - 60) { doc.addPage(); }
        const rowY = doc.y;
        doc.text(s.code || '', 50, rowY);
        doc.text(s.title || '', 110, rowY, { width: 200, ellipsis: true });
        doc.text(String(s.units ?? ''), 320, rowY);
        doc.text(s.grade !== null && s.grade !== undefined ? s.grade.toFixed(2) : 'INC', 380, rowY);
        const remarks = s.status === 'Dropped' ? 'Dropped' : (s.remarks || (s.grade === null || s.grade === undefined ? 'Incomplete' : ''));
        doc.text(remarks, 460, rowY, { width: 80, ellipsis: true });
        doc.y = rowY + 14;

        // Accumulate
        if (s.status !== 'Dropped' && s.status !== 'Removed' && s.grade !== null && s.grade !== undefined) {
          cumulativePoints += (s.units * s.grade);
          cumulativeUnits += s.units;
        }
      }
      drawRule(doc, doc.y);

      // Term GPA
      const termGpa = computeGpa(enrollment.subjects);
      const termUnits = enrollment.subjects
        .filter(s => s.status !== 'Dropped' && s.status !== 'Removed' && s.grade !== null && s.grade !== undefined)
        .reduce((sum, s) => sum + (s.units || 0), 0);
      doc.font('Helvetica-Oblique').fontSize(8);
      doc.text(`Term Average: ${termGpa}    Units Earned: ${termUnits}`, 50, doc.y + 4);
      doc.y += 24;
    }

    // Cumulative summary
    if (doc.y > doc.page.height - 100) doc.addPage();
    doc.moveDown(1);
    drawRule(doc, doc.y);
    doc.y += 10;
    doc.font('Helvetica-Bold').fontSize(10);
    const cumulativeGpa = cumulativeUnits > 0 ? (cumulativePoints / cumulativeUnits).toFixed(2) : 'N/A';
    doc.text(`Total Units Earned: ${cumulativeUnits}`, 50, doc.y);
    doc.text(`Cumulative GWA: ${cumulativeGpa}`, 300, doc.y);
    doc.y += 30;

    // Authentication block
    doc.font('Helvetica').fontSize(9);
    doc.text('This is a system-generated transcript. Validity requires the official seal and signature of the Registrar.', 50, doc.y, { align: 'center', width: doc.page.width - 100 });
    doc.y += 30;
    doc.text('_____________________________', 200, doc.y);
    doc.y += 14;
    doc.text('Registrar', 240, doc.y);

    doc.end();
    res.status(200);
  } catch (error) {
    console.error('Error generating transcript:', error);
    return res.status(500).json({ error: 'Failed to generate transcript.' });
  }
}

/**
 * GET /registrar/sections/:sectionId/subjects/:subjectId/grade-sheet?schoolYear=&semester=
 * Generate a printable class grade sheet for a professor's class.
 */
async function generateClassGradeSheet(req, res) {
  try {
    const { sectionId, subjectId } = req.params;
    const { schoolYear, semester } = req.query;

    // Find all enrollments that have this subject in this section
    const matchStage = {
      status: { $nin: ['Dropped', 'Cancelled'] },
      'subjects.subjectId': require('mongoose').Types.ObjectId(subjectId)
    };
    if (schoolYear) matchStage.schoolYear = String(schoolYear);
    if (semester) matchStage.semester = String(semester);

    const enrollments = await Enrollment.find(matchStage)
      .populate('studentId', 'studentNumber firstName lastName middleName suffix course yearLevel')
      .sort({ 'studentId.lastName': 1, 'studentId.firstName': 1 })
      .lean();

    if (enrollments.length === 0) {
      return res.status(404).json({ error: 'No students found for this class.' });
    }

    // Extract the subject entry from the first enrollment (they should all be the same subject)
    const firstSubject = enrollments[0].subjects.find(s => String(s.subjectId) === String(subjectId));
    if (!firstSubject) {
      return res.status(404).json({ error: 'Subject not found in enrollments.' });
    }

    const doc = new PDFDocument({ size: 'LETTER', margin: 50, layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="grade-sheet-${firstSubject.code || subjectId}.pdf"`);

    buildPdfHeader(doc, 'CLASS GRADE SHEET', `${firstSubject.code || ''} — ${firstSubject.title || ''}`);

    // Class info
    doc.fontSize(10).font('Helvetica');
    doc.text(`School Year: ${enrollments[0].schoolYear}    Semester: ${enrollments[0].semester}`, 50, doc.y);
    doc.text(`Instructor: ${firstSubject.instructor || 'N/A'}`, 50, doc.y);
    doc.text(`Units: ${firstSubject.units || 'N/A'}`, 50, doc.y);
    doc.moveDown(1);

    // Table header
    const tableTop = doc.y;
    const colX = [50, 110, 290, 380, 440, 510, 580];
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('#', colX[0], tableTop);
    doc.text('Student No.', colX[1], tableTop);
    doc.text('Student Name', colX[2], tableTop);
    doc.text('Year', colX[3], tableTop);
    doc.text('Final Grade', colX[4], tableTop);
    doc.text('Status', colX[5], tableTop);
    doc.text('Remarks', colX[6], tableTop);
    drawRule(doc, tableTop + 14);

    doc.font('Helvetica').fontSize(9);
    let y = tableTop + 22;
    let idx = 1;
    for (const enr of enrollments) {
      const subj = enr.subjects.find(s => String(s.subjectId) === String(subjectId));
      if (!subj || subj.status === 'Removed') continue;
      if (y > doc.page.height - 80) { doc.addPage(); y = 50; }

      const student = enr.studentId;
      const name = student ? formatStudentName(student) : enr.studentNumber || 'Unknown';

      doc.text(String(idx), colX[0], y);
      doc.text(student?.studentNumber || enr.studentNumber || '', colX[1], y);
      doc.text(name, colX[2], y, { width: 170, ellipsis: true });
      doc.text(String(student?.yearLevel || enr.yearLevel || ''), colX[3], y);
      doc.text(subj.grade !== null && subj.grade !== undefined ? subj.grade.toFixed(2) : '—', colX[4], y);
      doc.text(subj.status || '', colX[5], y);
      doc.text(subj.remarks || '', colX[6], y, { width: 90, ellipsis: true });
      y += 16;
      idx++;
    }
    drawRule(doc, y);
    y += 16;

    // Summary
    const graded = enrollments.flatMap(e => e.subjects.filter(s => String(s.subjectId) === String(subjectId) && s.grade !== null && s.grade !== undefined && s.status !== 'Dropped' && s.status !== 'Removed'));
    const classAvg = graded.length > 0 ? (graded.reduce((sum, s) => sum + s.grade, 0) / graded.length).toFixed(2) : 'N/A';
    const passingCount = graded.filter(s => s.grade <= 3.0).length;
    const failingCount = graded.filter(s => s.grade > 3.0).length;

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(`Total Students: ${idx - 1}`, 50, y);
    doc.text(`Class Average: ${classAvg}`, 200, y);
    doc.text(`Passing: ${passingCount}`, 350, y);
    doc.text(`Failing: ${failingCount}`, 450, y);
    y += 40;

    // Signatures
    doc.font('Helvetica').fontSize(9);
    doc.text('_____________________________', 200, y);
    doc.text('_____________________________', 450, y);
    y += 14;
    doc.text('Instructor', 240, y);
    doc.text('Registrar', 490, y);

    doc.end();
    res.status(200);
  } catch (error) {
    console.error('Error generating class grade sheet:', error);
    return res.status(500).json({ error: 'Failed to generate class grade sheet.' });
  }
}

module.exports = {
  generateReportCard,
  generateTranscript,
  generateClassGradeSheet
};
