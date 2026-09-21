const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');

// Course code maps (mirrors studentController for consistency)
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
    .filter((p) => p && String(p).trim())
    .map((p) => String(p).trim());
  return parts.join(' ');
}



/** Header with school name, office, and report title. */
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

function drawRule(doc, y) {
  doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor('#cccccc').lineWidth(1).stroke();
  doc.strokeColor('#000000');
}

/** GPA from subjects (only non-dropped, with grades). */
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

// ---------------------------------------------------------------------------
// GET /registrar/students/:id/report-card?schoolYear=&semester=
// ---------------------------------------------------------------------------
async function generateReportCard(req, res) {
  try {
    const { id } = req.params;
    const { schoolYear, semester } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid student id.' });
    }

    const student = await Student.findById(id).lean();
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    // Find the enrollment for the requested term (or the most recent if not specified)
    const filter = { studentId: student._id, status: { $nin: ['Dropped', 'Cancelled'] } };
    if (schoolYear) filter.schoolYear = String(schoolYear);
    if (semester) filter.semester = String(semester);

    let enrollment = await Enrollment.findOne(filter).sort({ isCurrent: -1, createdAt: -1 }).lean();
    if (!enrollment && (schoolYear || semester)) {
      // Fallback: any enrollment for this student
      enrollment = await Enrollment.findOne({
        studentId: student._id,
        status: { $nin: ['Dropped', 'Cancelled'] }
      }).sort({ isCurrent: -1, createdAt: -1 }).lean();
    }
    if (!enrollment) {
      return res.status(404).json({ error: 'No enrollment found for this student.' });
    }

    // Simple PDF generation for testing
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-card-${student.studentNumber || student._id}.pdf"`);
    
    doc.pipe(res);
    
    doc.fontSize(16).text('Report Card', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Student: ${student.firstName} ${student.lastName}`);
    doc.text(`Student Number: ${student.studentNumber || 'N/A'}`);
    doc.text(`Semester: ${enrollment.semester} ${enrollment.schoolYear}`);
    doc.moveDown();
    doc.text('Subjects:');
    
    if (enrollment.subjects && enrollment.subjects.length > 0) {
      enrollment.subjects.forEach((subject, index) => {
        doc.text(`${index + 1}. ${subject.code || 'N/A'} - ${subject.title || 'N/A'}: ${subject.grade !== null && subject.grade !== undefined ? subject.grade : 'N/A'}`);
      });
    } else {
      doc.text('No subjects found.');
    }
    
    doc.end();
  } catch (error) {
    console.error('Error generating report card:', error);
    if (!res.headersSent) return res.status(500).json({ error: 'Failed to generate report card.' });
    res.end();
  }
}

// ---------------------------------------------------------------------------
// GET /registrar/students/:id/transcript
// ---------------------------------------------------------------------------
async function generateTranscript(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid student id.' });
    }

    const student = await Student.findById(id).lean();
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const enrollments = await Enrollment.find({
      studentId: student._id,
      status: { $nin: ['Cancelled'] }
    }).sort({ schoolYear: 1, semester: 1, createdAt: 1 }).lean();

    if (enrollments.length === 0) {
      return res.status(404).json({ error: 'No enrollment records found for this student.' });
    }

    const pdf = createPdf({ size: 'LETTER', margin: 50 });
    const { doc } = pdf;

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
      doc.text(`${enrollment.schoolYear} - ${enrollment.semester} Semester (Year ${enrollment.yearLevel})`, 50, doc.y);
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
      for (const s of enrollment.subjects || []) {
        if (s.status === 'Removed') continue;
        if (doc.y > doc.page.height - 60) doc.addPage();
        const rowY = doc.y;
        textLine(doc, s.code, 50, rowY, 55);
        textLine(doc, s.title, 110, rowY, 205);
        textLine(doc, s.units, 320, rowY, 55);
        textLine(doc, formatGrade(s.grade, 'INC'), 380, rowY, 75);
        const remarks = s.status === 'Dropped' ? 'Dropped' : (s.remarks || (hasGrade(s.grade) ? '' : 'Incomplete'));
        textLine(doc, remarks, 460, rowY, 100);
        doc.y = rowY + 14;

        if (isCounted(s) && hasGrade(s.grade)) {
          const units = Number(s.units) || 0;
          cumulativePoints += units * Number(s.grade);
          cumulativeUnits += units;
        }
      }
      drawRule(doc, doc.y);

      // Term GPA
      const termGpa = computeGpa(enrollment.subjects || []);
      const termUnits = (enrollment.subjects || [])
        .filter((s) => isCounted(s) && hasGrade(s.grade))
        .reduce((sum, s) => sum + (Number(s.units) || 0), 0);
      doc.font('Helvetica').fontSize(8);
      doc.text(`Term Average: ${termGpa}    Units Earned: ${termUnits}`, 50, doc.y + 4);
      doc.y += 24;
    }

    // Cumulative summary
    if (doc.y > doc.page.height - 130) doc.addPage();
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

    return await sendPdf(res, pdf, `tor-${student.studentNumber || student._id}.pdf`);
  } catch (error) {
    console.error('Error generating transcript:', error);
    if (!res.headersSent) return res.status(500).json({ error: 'Failed to generate transcript.' });
    res.end();
  }
}

// ---------------------------------------------------------------------------
// GET /registrar/sections/:sectionId/subjects/:subjectId/grade-sheet?schoolYear=&semester=
// ---------------------------------------------------------------------------
async function generateClassGradeSheet(req, res) {
  try {
    const { subjectId } = req.params;
    const { schoolYear, semester } = req.query;

    if (!mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({ error: 'Invalid subject id.' });
    }

    // Find all enrollments that have this subject.
    // NOTE: `new` is required - calling ObjectId() without it throws on current Mongoose/bson.
    const matchStage = {
      status: { $nin: ['Dropped', 'Cancelled'] },
      'subjects.subjectId': new mongoose.Types.ObjectId(subjectId)
    };
    if (schoolYear) matchStage.schoolYear = String(schoolYear);
    if (semester) matchStage.semester = String(semester);

    const enrollments = await Enrollment.find(matchStage)
      .populate('studentId', 'studentNumber firstName lastName middleName suffix course yearLevel')
      .lean();

    // Sorting on a populated field ({'studentId.lastName': 1}) is ignored by MongoDB, so sort here.
    enrollments.sort((a, b) => {
      const byLast = String(a.studentId?.lastName || '').localeCompare(String(b.studentId?.lastName || ''));
      return byLast !== 0 ? byLast : String(a.studentId?.firstName || '').localeCompare(String(b.studentId?.firstName || ''));
    });

    if (enrollments.length === 0) {
      return res.status(404).json({ error: 'No students found for this class.' });
    }

    const isThisSubject = (s) => String(s.subjectId) === String(subjectId);
    const firstSubject = enrollments[0].subjects.find(isThisSubject);
    if (!firstSubject) {
      return res.status(404).json({ error: 'Subject not found in enrollments.' });
    }

    const pdf = createPdf({ size: 'LETTER', margin: 50, layout: 'landscape' });
    const { doc } = pdf;

    buildPdfHeader(doc, 'CLASS GRADE SHEET', `${firstSubject.code || ''} - ${firstSubject.title || ''}`);

    // Class info
    doc.fontSize(10).font('Helvetica');
    doc.text(`School Year: ${enrollments[0].schoolYear}    Semester: ${enrollments[0].semester}`, 50, doc.y);
    doc.text(`Instructor: ${firstSubject.instructor || 'N/A'}`, 50, doc.y);
    doc.text(`Units: ${firstSubject.units || 'N/A'}`, 50, doc.y);
    doc.moveDown(1);

    // Table header
    const tableTop = doc.y;
    const colX = [50, 90, 210, 480, 530, 610, 680];
    const colW = [35, 115, 265, 45, 75, 65, 62];
    const headerLabels = ['#', 'Student No.', 'Student Name', 'Year', 'Final Grade', 'Status', 'Remarks'];
    doc.font('Helvetica-Bold').fontSize(9);
    headerLabels.forEach((label, i) => textLine(doc, label, colX[i], tableTop, colW[i]));
    drawRule(doc, tableTop + 14);

    doc.font('Helvetica').fontSize(9);
    let y = tableTop + 22;
    let idx = 1;
    for (const enr of enrollments) {
      const subj = enr.subjects.find(isThisSubject);
      if (!subj || subj.status === 'Removed') continue;
      if (y > doc.page.height - 80) { doc.addPage(); y = 50; }

      const student = enr.studentId;
      const name = student ? formatStudentName(student) : enr.studentNumber || 'Unknown';

      textLine(doc, idx, colX[0], y, colW[0]);
      textLine(doc, student?.studentNumber || enr.studentNumber || '', colX[1], y, colW[1]);
      textLine(doc, name, colX[2], y, colW[2]);
      textLine(doc, student?.yearLevel || enr.yearLevel || '', colX[3], y, colW[3]);
      textLine(doc, formatGrade(subj.grade), colX[4], y, colW[4]);
      textLine(doc, subj.status, colX[5], y, colW[5]);
      textLine(doc, subj.remarks, colX[6], y, colW[6]);
      y += 16;
      idx += 1;
    }
    drawRule(doc, y);
    y += 16;

    // Summary
    const graded = enrollments.flatMap((e) =>
      e.subjects.filter((s) => isThisSubject(s) && hasGrade(s.grade) && isCounted(s))
    );
    const classAvg = graded.length > 0
      ? (graded.reduce((sum, s) => sum + Number(s.grade), 0) / graded.length).toFixed(2)
      : 'N/A';
    const passingCount = graded.filter((s) => Number(s.grade) <= 3.0).length;
    const failingCount = graded.filter((s) => Number(s.grade) > 3.0).length;

    if (y > doc.page.height - 110) { doc.addPage(); y = 50; }
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

    return await sendPdf(res, pdf, `grade-sheet-${firstSubject.code || subjectId}.pdf`);
  } catch (error) {
    console.error('Error generating class grade sheet:', error);
    if (!res.headersSent) return res.status(500).json({ error: 'Failed to generate class grade sheet.' });
    res.end();
  }
}

module.exports = {
  generateReportCard,
  generateTranscript,
  generateClassGradeSheet
};