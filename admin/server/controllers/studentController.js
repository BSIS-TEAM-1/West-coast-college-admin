const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const Admin = require('../models/Admin');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

class StudentController {
  static async createStudentRecord(studentData) {
    if (studentData.email) {
      const existingStudent = await Student.findOne({ email: studentData.email });
      if (existingStudent) {
        const err = new Error('A student with this email already exists');
        err.statusCode = 409;
        throw err;
      }
    }

    // Normalize optional enums and strip empty strings
    const cleanData = { ...studentData };
    if (!cleanData.civilStatus) delete cleanData.civilStatus;
    if (!cleanData.gender) delete cleanData.gender;
    if (!cleanData.religion) delete cleanData.religion;
    if (!cleanData.nationality) delete cleanData.nationality;
    if (!cleanData.permanentAddress) delete cleanData.permanentAddress;
    if (!cleanData.birthDate) delete cleanData.birthDate;
    if (!cleanData.assignedProfessor) delete cleanData.assignedProfessor;
    if (!cleanData.schedule) delete cleanData.schedule;
    if (!cleanData.gradeProfessor) delete cleanData.gradeProfessor;
    if (!cleanData.gradeDate) delete cleanData.gradeDate;
    if (cleanData.latestGrade === '' || cleanData.latestGrade === null) delete cleanData.latestGrade;
    const allowedStatuses = ['Regular', 'Dropped', 'Returnee', 'Transferee'];
    cleanData.studentStatus = allowedStatuses.includes(cleanData.studentStatus)
      ? cleanData.studentStatus
      : 'Regular';
    if (!cleanData.corStatus) cleanData.corStatus = 'Pending';

    const student = new Student(cleanData);
    await student.save();
    return student;
  }

  static async getStudentsRecord(params = {}) {
    const query = {};

    if (params.course) query.course = params.course;
    if (params.yearLevel) query.yearLevel = Number(params.yearLevel);
    if (params.semester) query.semester = params.semester;
    if (params.schoolYear) query.schoolYear = params.schoolYear;
    if (params.studentStatus) query.studentStatus = params.studentStatus;
    if (params.enrollmentStatus) query.enrollmentStatus = params.enrollmentStatus;

    return Student.find(query).sort({ createdAt: -1 });
  }

  static async getStudentByIdRecord(id) {
    return Student.findById(id);
  }

  static async getStudentByNumberRecord(studentNumber) {
    return Student.findOne({ studentNumber });
  }

  static async updateStudentRecord(id, updateData) {
    return Student.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });
  }

  static async getEnrollmentHistoryRecord(studentId) {
    return Enrollment.find({ studentId })
      .sort({ schoolYear: -1, semester: -1 })
      .populate('subjects.subjectId');
  }

  static courseLabelMap = {
    101: 'Bachelor of Elementary Education (BEED)',
    102: 'Bachelor of Secondary Education – Major in English',
    103: 'Bachelor of Secondary Education – Major in Mathematics',
    201: 'Bachelor of Science in Business Administration – Major in HRM'
  };

  static courseCodeMap = {
    101: 'BEED',
    102: 'BSEd-English',
    103: 'BSEd-Math',
    201: 'BSBA-HRM'
  };

  static async getCurrentEnrollmentRecord(studentId, schoolYear, semester) {
    return Enrollment.findOne({
      studentId,
      schoolYear,
      semester,
      status: { $ne: 'Dropped' },
      isCurrent: true
    }).populate('subjects.subjectId');
  }

  static mapSubjectIdsToEnrollmentSubjects(subjectIds = []) {
    if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
      return [];
    }

    return subjectIds.map((subjectId, index) => ({
      subjectId: mongoose.Types.ObjectId.isValid(subjectId)
        ? subjectId
        : new mongoose.Types.ObjectId(),
      code: `SUBJ-${index + 1}`,
      title: `Subject ${index + 1}`,
      units: 3,
      schedule: 'TBA',
      room: 'TBA',
      instructor: 'TBA',
      status: 'Enrolled'
    }));
  }

  static calculateTuitionFee(units) {
    return units * 1000;
  }

  static calculateMiscFee() {
    return 5000;
  }

  static calculateTotalFee(units) {
    return this.calculateTuitionFee(units) + this.calculateMiscFee();
  }

  static async createEnrollmentRecord({
    student,
    schoolYear,
    semester,
    subjectIds,
    createdBy
  }) {
    const subjects = this.mapSubjectIdsToEnrollmentSubjects(subjectIds);
    const totalUnits = subjects.reduce((sum, subject) => sum + subject.units, 0);

    const enrollment = new Enrollment({
      studentId: student._id,
      studentNumber: student.studentNumber,
      schoolYear,
      semester,
      yearLevel: student.yearLevel,
      course: student.course,
      subjects,
      assessment: {
        tuitionFee: this.calculateTuitionFee(totalUnits),
        miscFee: this.calculateMiscFee(),
        totalAmount: this.calculateTotalFee(totalUnits)
      },
      status: 'Pending',
      createdBy
    });

    await enrollment.save();
    return enrollment;
  }

  static async createStudent(req, res) {
    try {
      const student = await StudentController.createStudentRecord(req.body);
      res.status(201).json({
        success: true,
        data: student,
        message: 'Student account created successfully'
      });
    } catch (error) {
      console.error('Error creating student:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to create student account'
      });
    }
  }

  static async getStudents(req, res) {
    try {
      const students = await StudentController.getStudentsRecord(req.query);
      res.json({
        success: true,
        data: students
      });
    } catch (error) {
      console.error('Error fetching students:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch students'
      });
    }
  }

  static async getStudentById(req, res) {
    try {
      const { id } = req.params;
      const student = await StudentController.getStudentByIdRecord(id);

      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      res.json({
        success: true,
        data: student
      });
    } catch (error) {
      console.error('Error fetching student:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch student'
      });
    }
  }

  static async getStudentByNumber(req, res) {
    try {
      const { studentNumber } = req.params;
      const student = await StudentController.getStudentByNumberRecord(studentNumber);

      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      res.json({
        success: true,
        data: student
      });
    } catch (error) {
      console.error('Error fetching student:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch student'
      });
    }
  }

  static async updateStudent(req, res) {
    try {
      const { id } = req.params;
      const student = await StudentController.updateStudentRecord(id, req.body);

      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      res.json({
        success: true,
        data: student,
        message: 'Student information updated successfully'
      });
    } catch (error) {
      console.error('Error updating student:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update student information'
      });
    }
  }

  static async enrollStudent(req, res) {
    try {
      const { id } = req.params;
      const { schoolYear, semester, subjectIds } = req.body;

      if (!schoolYear || !semester || !Array.isArray(subjectIds)) {
        return res.status(400).json({
          success: false,
          message: 'School year, semester, and subject IDs are required'
        });
      }

      const student = await StudentController.getStudentByIdRecord(id);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      const existingEnrollment = await Enrollment.findOne({
        studentId: id,
        schoolYear,
        semester,
        status: { $ne: 'Dropped' }
      });

      if (existingEnrollment) {
        return res.status(400).json({
          success: false,
          message: 'Student is already enrolled for this semester'
        });
      }

      const enrollment = await StudentController.createEnrollmentRecord({
        student,
        schoolYear,
        semester,
        subjectIds,
        createdBy: req.adminId
      });

      res.status(201).json({
        success: true,
        data: enrollment,
        message: 'Enrollment successful'
      });
    } catch (error) {
      console.error('Error processing enrollment:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to process enrollment'
      });
    }
  }

  static async getCurrentEnrollment(req, res) {
    try {
      const { id } = req.params;
      const { schoolYear, semester } = req.query;

      if (!schoolYear || !semester) {
        return res.status(400).json({
          success: false,
          message: 'School year and semester are required'
        });
      }

      const enrollment = await StudentController.getCurrentEnrollmentRecord(
        id,
        schoolYear,
        semester
      );

      if (!enrollment) {
        return res.status(404).json({
          success: false,
          message: 'No active enrollment found'
        });
      }

      res.json({
        success: true,
        data: enrollment
      });
    } catch (error) {
      console.error('Error fetching current enrollment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch current enrollment'
      });
    }
  }

  static async getEnrollmentHistory(req, res) {
    try {
      const { id } = req.params;
      const enrollments = await StudentController.getEnrollmentHistoryRecord(id);

      res.json({
        success: true,
        data: enrollments
      });
    } catch (error) {
      console.error('Error fetching enrollment history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch enrollment history'
      });
    }
  }

  /**
   * Generate Certificate of Registration (COR) as PDF
   */
  static async generateCorPdf(req, res) {
    let doc;
    try {
      const { id } = req.params;
      const student = await Student.findById(id);

      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      const courseCode = String(student.course || '').toUpperCase();
      const courseLabel = StudentController.courseLabelMap[student.course] || student.course || 'N/A';
      const extractProgram = (value) => {
        const text = String(value || '').trim();
        if (!text) return 'N/A';
        const normalized = text.replace(/\u2013/g, '-');
        return normalized.replace(/\s*-\s*major in\s+.+$/i, '').trim() || text;
      };
      const extractMajor = (value) => {
        const text = String(value || '').trim();
        if (!text) return '';
        const normalized = text.replace(/\u2013/g, '-');
        const match = normalized.match(/major in\s+(.+)$/i);
        return match ? match[1].trim() : '';
      };
      const programLabel = extractProgram(courseLabel);
      const majorLabel = extractMajor(student.major) || extractMajor(courseLabel) || 'N/A';
      const corStatus = student.corStatus || 'Pending';
      const parts = (student.studentNumber || '').split('-');
      const yearPart = parts[0] || '0000';
      const seqPart = parts[2] || parts[1] || '00000';
      const studentNumber = `${yearPart}-${courseCode || '0000'}-${seqPart}`.replace(/--+/g, '-');
      const studentName = `${student.firstName} ${student.middleName ?? ''} ${student.lastName} ${student.suffix ?? ''}`.trim();
      const registrationNumber = student.registrationNumber || `${new Date().getFullYear()}${Math.floor(100000 + Math.random() * 900000)}`;
      if (!student.registrationNumber) {
        student.registrationNumber = registrationNumber;
        await student.save({ validateBeforeSave: false });
      }

      const age = student.birthDate ? (new Date().getFullYear() - new Date(student.birthDate).getFullYear()) : 'N/A';

      // Fetch current registrar's display name
      const currentRegistrar = await Admin.findById(req.adminId).select('displayName');
      const registrarDisplayName = currentRegistrar?.displayName || req.username || 'REGISTRAR';

      doc = new PDFDocument({ size: 'A4', margin: 50 });
      // EDIT COR PDF LAYOUT HERE: adjust fonts, add logos/images, and change positioning as needed.

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=COR-${student.studentNumber}.pdf`);
      doc.pipe(res);

      // Header layout inspired by provided reference
      const headerY = 40;
      const logoX = 16;
      const logoSize = 48;
      const headerTextX = logoX + logoSize + 10;
      const headerLineHeight = 10;
      const headerLines = [
        'Republic of the Philippines',
        'West Coast College',
        'Pio Duran, Albay'
      ];
      const headerTextHeight = headerLines.length * headerLineHeight;
      const headerTextY = headerY + ((logoSize - headerTextHeight) / 2);

      // Logo image
      const logoPath = path.join(__dirname, '../../public/logo-header.jpg');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, logoX, headerY, { width: logoSize, height: logoSize });
      }
      doc.fontSize(6);
      headerLines.forEach((line, index) => {
        doc.text(line, headerTextX, headerTextY + (index * headerLineHeight));
      });

      const titleY = Math.max(headerY + logoSize, headerTextY + headerTextHeight) + 6;
      doc.font('Helvetica-Bold').fontSize(15).text('CERTIFICATE OF REGISTRATION', 0, titleY, {
        width: doc.page.width,
        align: 'center'
      });
      doc.font('Helvetica').fontSize(10).fillColor('red').text(`Registration No: ${registrationNumber}`, doc.page.width - 170, headerY + 4, { width: 120, align: 'right' });
      doc.fillColor('black');
      doc.y = titleY + 26;


      // Student info boxed section with padding
      const infoX = 40;
      const infoW = doc.page.width - 80;
      const infoPad = 8;
      const rowHeight = 15;
      const infoY = doc.y + 6;
      const gap = 10; // Gap between columns
      const colWidth = (infoW - 2 * gap) / 3;
      const boxRows = 5; // rows we render below
      doc.rect(infoX, infoY, infoW, rowHeight * boxRows + infoPad * 2).stroke();
      let currentY = infoY + infoPad;
      doc.fontSize(7);
      // Column 1: Student No, Name, Sex, Age, Semester
      doc.text(`Student No: ${studentNumber}`, infoX + infoPad, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`Name: ${studentName}`, infoX + infoPad, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`Sex: ${student.gender || 'N/A'}`, infoX + infoPad, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`Age: ${age}`, infoX + infoPad, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`Semester: ${student.semester || 'N/A'}`, infoX + infoPad, currentY, { width: colWidth });
      // Column 2: College, Program, Major, Year Level, School Year
      currentY = infoY + infoPad;
      doc.text(`College: Polangui`, infoX + infoPad + colWidth + gap, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`Program: ${programLabel}`, infoX + infoPad + colWidth + gap, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`Major: ${majorLabel}`, infoX + infoPad + colWidth + gap, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`Year Level: ${student.yearLevel || 'N/A'}`, infoX + infoPad + colWidth + gap, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`School Year: ${student.schoolYear || 'N/A'}`, infoX + infoPad + colWidth + gap, currentY, { width: colWidth });
      // Column 3: Curriculum, Scholarship, COR Status, Enrollment Status, Issued Date
      currentY = infoY + infoPad;
      doc.text(`Curriculum: ${student.curriculum || 'N/A'}`, infoX + infoPad + 2 * colWidth + 2 * gap, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`Scholarship: ${student.scholarship || 'N/A'}`, infoX + infoPad + 2 * colWidth + 2 * gap, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`COR Status: ${corStatus}`, infoX + infoPad + 2 * colWidth + 2 * gap, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`Enrollment Status: ${student.enrollmentStatus || 'N/A'}`, infoX + infoPad + 2 * colWidth + 2 * gap, currentY, { width: colWidth });

      // Place Issued Date at bottom right of student info section
      const issuedDateY = infoY + rowHeight * boxRows + infoPad * 2 - rowHeight + 2;
      const issuedDateX = infoX + infoW - infoPad - colWidth;
      doc.text(`Issued Date: ${new Date().toLocaleDateString()}`, issuedDateX, issuedDateY, { width: colWidth, align: 'right' });

      doc.y = infoY + rowHeight * boxRows + infoPad * 2 + 12;
      doc.moveDown(1);
      // Registrar signature moved to bottom

      // Schedule table column definitions
      const colWidths = [49, 138, 32, 40, 40, 89, 49, 73];
      
      // Add SCHEDULES title - centered
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      doc.font('Helvetica-Bold').fontSize(8).text('SCHEDULES', 40, doc.y + 5, { 
        width: tableWidth,
        align: 'center'
      });
      doc.moveDown(1);

      // Schedule table (placeholder rows using current student data)
      doc.moveDown(1);
      const tableStartY = doc.y;
      const headers = ['Code', 'Subject', 'Units', 'Class', 'Days', 'Time', 'Room', 'Faculty'];
      let x = 40;
      doc.fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(h, x + 2, tableStartY, { width: colWidths[i] - 4, align: 'left' });
        x += colWidths[i];
      });
      doc.font('Helvetica');
      const rowHeightTbl = 14;
      const rowY = tableStartY + rowHeightTbl;
      x = 40;
      const placeholderRow = [
        courseCode || 'CODE',
        courseLabel || 'Subject Title',
        '3.0',
        'N/A',
        student.schedule?.split(' ')[0] || 'N/A',
        student.schedule || 'TBD',
        'Room',
        student.assignedProfessor || 'Faculty'
      ];
      placeholderRow.forEach((val, i) => {
        doc.text(val, x + 2, rowY, { width: colWidths[i] - 4, align: 'left' });
        x += colWidths[i];
      });
      // Reserve space for future rows
      doc.rect(40, tableStartY - 2, colWidths.reduce((a, b) => a + b, 0), rowHeightTbl * 6).stroke();

      // Totals line on far left
      doc.fontSize(6).text('Totals: Subjects: 8  Credit Units=22  Lecture Units=22  Lab Units=0', 40, tableStartY + rowHeightTbl * 6 + 6);

      // Assessed Fees section
      doc.moveDown(3);
      doc.fontSize(9).font('Helvetica-Bold').text('ASSESSED FEES', 40);
      doc.moveDown(0.5);
      doc.fontSize(7).font('Helvetica');
      const feeStartY = doc.y;
      const labelX = 50;
      const amtX = 280;
      const feeRowH = 10;
      const feeItems = [
        ['Tuition Fee - UG/CP/ETEEAP', '3,850.00'],
        ['Res./Feas./Thesis - UG/CP/ETEEAP', '2,200.00'],
        ['Internet Fee - UG/CP/ETEEAP', '175.00'],
        ['Library Fee - UG/CP/ETEEAP', '50.00'],
        ['Guidance Fee - UG/CP/ETEEAP', '50.00'],
        ['SCUAA Fee - UG/CP/ETEEAP', '50.00'],
        ['Athletic Fee - UG/CP/ETEEAP', '40.00'],
        ['Med. & Den. Fee - UG/CP/ETEEAP', '20.00'],
        ['Cultural Fee - UG/CP/ETEEAP', '20.00'],
        ['Universitarian Fee', '12.00'],
        ['Matriculation Fee - UG/CP/ETEEAP', '10.00'],
      ];
      let feeY = feeStartY;
      feeItems.forEach(([label, amt]) => {
        doc.text(label, labelX, feeY, { width: 200 });
        doc.text(amt, amtX, feeY, { width: 80, align: 'right' });
        feeY += feeRowH;
      });
      feeY += 4;
      doc.font('Helvetica-Bold');
      doc.text('Total Assessment:', labelX, feeY, { width: 200 });
      doc.text('6,477.00', amtX, feeY, { width: 80, align: 'right' });
      feeY += feeRowH;
      doc.font('Helvetica');
      doc.text('Less: Financial Aid:', labelX, feeY, { width: 200 });
      doc.text('', amtX, feeY, { width: 80, align: 'right' });
      feeY += feeRowH;
      doc.text('Net Assessed:', labelX, feeY, { width: 200 });
      doc.text('6,477.00', amtX, feeY, { width: 80, align: 'right' });
      feeY += feeRowH;
      doc.text('Total Payment:', labelX, feeY, { width: 200 });
      doc.text('0.00', amtX, feeY, { width: 80, align: 'right' });
      feeY += feeRowH;
      doc.text('Outstanding Balance:', labelX, feeY, { width: 200 });
      doc.text('6,477.00', amtX, feeY, { width: 80, align: 'right' });
      feeY += feeRowH;
      doc.text("Addt'l Previous Balance:", labelX, feeY, { width: 200 });
      doc.text('0.00', amtX, feeY, { width: 80, align: 'right' });

      // Signature block
      const signatureY = doc.page.height - doc.page.margins.bottom - 26;
      const studentSigX = 50;
      const studentSigW = 220;
      const registrarSigX = doc.page.width - 270;
      const registrarSigW = 220;
      const registrarName = registrarDisplayName.toUpperCase();

      doc.font('Helvetica').fontSize(7).text(studentName.toUpperCase(), studentSigX, signatureY, {
        width: studentSigW,
        align: 'center',
        underline: true
      });
      doc.fontSize(6).text("Student's Signature(6)", studentSigX, signatureY + 11, {
        width: studentSigW,
        align: 'center'
      });

      doc.font('Helvetica').fontSize(7).text(registrarName, registrarSigX, signatureY, {
        width: registrarSigW,
        align: 'center',
        underline: true
      });
      doc.fontSize(6).text('College Registrar', registrarSigX, signatureY + 11, {
        width: registrarSigW,
        align: 'center'
      });

      doc.end();
    } catch (error) {
      console.error('Error generating COR PDF:', error);
      if (!res.headersSent) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to generate COR' });
      }

      try {
        if (doc && !doc.destroyed) doc.end();
      } catch (endError) {
        console.error('Error finalizing COR PDF stream:', endError);
      }
    }
  }
}

module.exports = StudentController;
