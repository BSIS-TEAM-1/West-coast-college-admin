const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const Subject = require('../models/Subject');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const SectionWaitlist = require('../models/SectionWaitlist');
const BlockSection = require('../models/BlockSection');
const Admin = require('../models/Admin');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

class StudentController {
  static async getProfessorAccounts(req, res) {
    try {
      const professors = await Admin.find({
        accountType: 'professor',
        status: { $ne: 'inactive' }
      })
        .select('_id username displayName uid status')
        .sort({ displayName: 1, username: 1 })
        .lean();

      const data = professors.map((professor) => ({
        _id: String(professor._id),
        username: professor.username || '',
        displayName: professor.displayName || '',
        uid: professor.uid || '',
        status: professor.status || 'active',
        label: String(professor.displayName || '').trim() || String(professor.username || '').trim()
      }));

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching professor accounts:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch professor accounts'
      });
    }
  }

  static async cleanupBlockMembershipForStudent(studentId) {
    const normalizedStudentId = String(studentId || '').trim();
    if (!normalizedStudentId) return;

    const assignments = await StudentBlockAssignment.find({ studentId: normalizedStudentId })
      .select('sectionId')
      .lean();
    const waitlists = await SectionWaitlist.find({ studentId: normalizedStudentId })
      .select('sectionId')
      .lean();

    const affectedSectionIds = Array.from(
      new Set(
        [...assignments, ...waitlists]
          .map((entry) => String(entry.sectionId || '').trim())
          .filter(Boolean)
      )
    );

    if (assignments.length > 0) {
      await StudentBlockAssignment.deleteMany({ studentId: normalizedStudentId });
    }
    if (waitlists.length > 0) {
      await SectionWaitlist.deleteMany({ studentId: normalizedStudentId });
    }

    if (affectedSectionIds.length === 0) return;

    const sectionObjectIds = affectedSectionIds
      .filter((sectionId) => mongoose.Types.ObjectId.isValid(sectionId))
      .map((sectionId) => new mongoose.Types.ObjectId(sectionId));

    const assignedCounts = await StudentBlockAssignment.aggregate([
      {
        $match: {
          sectionId: { $in: sectionObjectIds },
          status: 'ASSIGNED'
        }
      },
      {
        $group: {
          _id: '$sectionId',
          total: { $sum: 1 }
        }
      }
    ]);

    const countMap = new Map(
      assignedCounts.map((item) => [String(item._id), Number(item.total) || 0])
    );

    await Promise.all(
      sectionObjectIds.map((sectionId) =>
        BlockSection.findByIdAndUpdate(sectionId, {
          $set: { currentPopulation: countMap.get(String(sectionId)) || 0 }
        })
      )
    );
  }

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

  static async deleteStudentRecord(id) {
    return Student.findByIdAndDelete(id);
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

  static async mapSubjectIdsToEnrollmentSubjects(subjectIds = []) {
    if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
      return [];
    }

    const normalizedIds = subjectIds
      .map((subjectId) => String(subjectId).trim())
      .filter((subjectId) => mongoose.Types.ObjectId.isValid(subjectId));

    const subjectsById = new Map();
    if (normalizedIds.length > 0) {
      const matchedSubjects = await Subject.find({ _id: { $in: normalizedIds } })
        .select('_id code title units')
        .lean();
      matchedSubjects.forEach((subject) => {
        subjectsById.set(String(subject._id), subject);
      });
    }

    return subjectIds.map((subjectId, index) => {
      const normalizedId = String(subjectId).trim();
      const matched = subjectsById.get(normalizedId);
      return {
        subjectId: mongoose.Types.ObjectId.isValid(normalizedId)
          ? normalizedId
          : new mongoose.Types.ObjectId(),
        code: matched?.code || `SUBJ-${index + 1}`,
        title: matched?.title || `Subject ${index + 1}`,
        units: matched?.units || 3,
        schedule: 'TBA',
        room: 'TBA',
        instructor: 'TBA',
        status: 'Enrolled'
      };
    });
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
    const subjects = await this.mapSubjectIdsToEnrollmentSubjects(subjectIds);
    const totalUnits = subjects.reduce((sum, subject) => sum + subject.units, 0);
    const enrollmentCourseMap = {
      101: 'BEED',
      102: 'BSED',
      103: 'BSED',
      201: 'BSBA'
    };
    const normalizedCourse = enrollmentCourseMap[Number(student.course)] || 'BEED';

    const enrollment = new Enrollment({
      studentId: student._id,
      studentNumber: student.studentNumber,
      schoolYear,
      semester,
      yearLevel: student.yearLevel,
      course: normalizedCourse,
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
      const previous = await StudentController.getStudentByIdRecord(id);
      if (!previous) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      const hasAcademicChange =
        (req.body?.course !== undefined && Number(req.body.course) !== Number(previous.course)) ||
        (req.body?.yearLevel !== undefined && Number(req.body.yearLevel) !== Number(previous.yearLevel)) ||
        (req.body?.studentStatus !== undefined && String(req.body.studentStatus) !== String(previous.studentStatus));

      const student = await StudentController.updateStudentRecord(id, req.body);

      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      if (hasAcademicChange) {
        await StudentController.cleanupBlockMembershipForStudent(id);
      }

      res.json({
        success: true,
        data: student,
        message: hasAcademicChange
          ? 'Student information updated successfully. Existing block assignment was cleared due to academic changes.'
          : 'Student information updated successfully'
      });
    } catch (error) {
      console.error('Error updating student:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update student information'
      });
    }
  }

  static async deleteStudent(req, res) {
    try {
      const { id } = req.params;
      await StudentController.cleanupBlockMembershipForStudent(id);

      const student = await StudentController.deleteStudentRecord(id);

      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      res.json({
        success: true,
        data: student,
        message: 'Student deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting student:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete student'
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

  static async assignSubjectInstructorToSection(req, res) {
    try {
      const { sectionId } = req.params;
      const { subjectId, instructor, schedule, room, semester, schoolYear } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(sectionId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid section id'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(String(subjectId || '').trim())) {
        return res.status(400).json({
          success: false,
          message: 'Valid subject id is required'
        });
      }

      const normalizedInstructor = String(instructor || '').trim();
      if (!normalizedInstructor) {
        return res.status(400).json({
          success: false,
          message: 'Instructor name is required'
        });
      }

      const section = await BlockSection.findById(sectionId).select('_id sectionCode');
      if (!section) {
        return res.status(404).json({
          success: false,
          message: 'Section not found'
        });
      }

      const subject = await Subject.findById(subjectId).select('_id code title');
      if (!subject) {
        return res.status(404).json({
          success: false,
          message: 'Subject not found'
        });
      }

      const assignments = await StudentBlockAssignment.find({
        sectionId: section._id,
        status: 'ASSIGNED'
      }).select('studentId');

      const studentObjectIds = assignments
        .map((entry) => String(entry.studentId || '').trim())
        .filter((studentId) => mongoose.Types.ObjectId.isValid(studentId))
        .map((studentId) => new mongoose.Types.ObjectId(studentId));

      if (studentObjectIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No assigned students found in this section'
        });
      }

      const enrollmentQuery = {
        studentId: { $in: studentObjectIds },
        status: { $ne: 'Dropped' },
        isCurrent: true
      };
      if (schoolYear) enrollmentQuery.schoolYear = String(schoolYear).trim();
      if (semester) enrollmentQuery.semester = String(semester).trim();

      const enrollments = await Enrollment.find(enrollmentQuery).sort({ createdAt: -1 });
      if (enrollments.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No matching enrollments found for students in this section'
        });
      }

      const normalizedSubjectId = String(subject._id);
      const normalizedSchedule = String(schedule || '').trim();
      const normalizedRoom = String(room || '').trim();
      const updatedEnrollmentIds = [];
      let matchedSubjects = 0;

      for (const enrollment of enrollments) {
        let enrollmentChanged = false;
        enrollment.subjects.forEach((entry) => {
          if (String(entry?.subjectId || '') === normalizedSubjectId) {
            entry.instructor = normalizedInstructor;
            if (normalizedSchedule) entry.schedule = normalizedSchedule;
            if (normalizedRoom) entry.room = normalizedRoom;
            entry.dateModified = new Date();
            enrollmentChanged = true;
            matchedSubjects += 1;
          }
        });

        if (enrollmentChanged) {
          enrollment.markModified('subjects');
          await enrollment.save();
          updatedEnrollmentIds.push(String(enrollment._id));
        }
      }

      if (updatedEnrollmentIds.length === 0) {
        return res.status(404).json({
          success: false,
          message: `Subject ${subject.code} is not enrolled in the selected section's current enrollments`
        });
      }

      res.json({
        success: true,
        message: 'Instructor and schedule assigned successfully',
        data: {
          sectionId: String(section._id),
          sectionCode: section.sectionCode,
          subjectId: normalizedSubjectId,
          subjectCode: subject.code,
          subjectTitle: subject.title,
          instructor: normalizedInstructor,
          schedule: normalizedSchedule || 'TBA',
          room: normalizedRoom || 'TBA',
          updatedEnrollments: updatedEnrollmentIds.length,
          matchedSubjectEntries: matchedSubjects
        }
      });
    } catch (error) {
      console.error('Error assigning section subject instructor:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to assign instructor to section subject'
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
      const preferredSchoolYear = String(student.schoolYear || '').trim();
      const preferredSemester = String(student.semester || '').trim();

      let enrollment = null;
      if (preferredSchoolYear && preferredSemester) {
        enrollment = await Enrollment.findOne({
          studentId: student._id,
          schoolYear: preferredSchoolYear,
          semester: preferredSemester,
          status: { $ne: 'Dropped' }
        }).sort({ isCurrent: -1, createdAt: -1 });
      }
      if (!enrollment) {
        enrollment = await Enrollment.findOne({
          studentId: student._id,
          status: { $ne: 'Dropped' },
          isCurrent: true
        }).sort({ createdAt: -1 });
      }
      if (!enrollment) {
        enrollment = await Enrollment.findOne({
          studentId: student._id,
          status: { $ne: 'Dropped' }
        }).sort({ createdAt: -1 });
      }

      const enrolledSubjects = Array.isArray(enrollment?.subjects)
        ? enrollment.subjects.filter((subject) => String(subject?.status || '').toLowerCase() !== 'dropped')
        : [];
      const corSemester = enrollment?.semester || student.semester || 'N/A';
      const corSchoolYear = enrollment?.schoolYear || student.schoolYear || 'N/A';
      const corYearLevel = enrollment?.yearLevel || student.yearLevel || 'N/A';
      let classBlockLabel = 'N/A';
      const latestBlockAssignment = await StudentBlockAssignment.findOne({
        studentId: String(student._id),
        status: 'ASSIGNED'
      })
        .sort({ createdAt: -1 })
        .select('sectionId')
        .lean();
      if (latestBlockAssignment?.sectionId) {
        const assignedSection = await BlockSection.findById(latestBlockAssignment.sectionId)
          .select('sectionCode blockCode name')
          .lean();
        classBlockLabel = assignedSection?.sectionCode || assignedSection?.blockCode || assignedSection?.name || 'N/A';
      }
      const totalSubjects = enrolledSubjects.length;
      const totalUnits = enrolledSubjects.reduce((sum, subject) => sum + (Number(subject?.units) || 0), 0);

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
      doc.text(`Semester: ${corSemester}`, infoX + infoPad, currentY, { width: colWidth });
      // Column 2: College, Program, Major, Year Level, School Year
      currentY = infoY + infoPad;
      doc.text(`College: Polangui`, infoX + infoPad + colWidth + gap, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`Program: ${programLabel}`, infoX + infoPad + colWidth + gap, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`Major: ${majorLabel}`, infoX + infoPad + colWidth + gap, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`Year Level: ${corYearLevel}`, infoX + infoPad + colWidth + gap, currentY, { width: colWidth });
      currentY += rowHeight;
      doc.text(`School Year: ${corSchoolYear}`, infoX + infoPad + colWidth + gap, currentY, { width: colWidth });
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
      const scheduleTableWidth = colWidths.reduce((a, b) => a + b, 0);
      doc.font('Helvetica-Bold').fontSize(8).text('SCHEDULES', 40, doc.y + 5, { 
        width: scheduleTableWidth,
        align: 'center'
      });
      doc.moveDown(1);

      // Schedule table rows from current/latest enrollment subjects
      doc.moveDown(1);
      const tableStartY = doc.y;
      const headers = ['Code', 'Subject', 'Units', 'Class', 'Days', 'Time', 'Room', 'Faculty'];
      const tableX = 40;
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      const headerHeight = 16;
      const cellPadX = 2;
      const cellPadY = 2;
      const baseRowHeight = 14;
      const minimumRows = 6;

      const rows = totalSubjects === 0
        ? [['-', 'No enrolled subjects found', '-', '-', '-', '-', '-', '-']]
        : enrolledSubjects.map((subject) => {
            const scheduleText = String(subject?.schedule || '').trim();
            return [
              subject?.code || '-',
              subject?.title || '-',
              Number(subject?.units) ? Number(subject.units).toFixed(1) : '-',
              classBlockLabel,
              scheduleText || 'TBA',
              scheduleText || 'TBA',
              subject?.room || 'TBA',
              subject?.instructor || 'TBA'
            ];
          });

      doc.fontSize(8).font('Helvetica-Bold');
      let x = tableX;
      headers.forEach((h, i) => {
        doc.text(h, x + cellPadX, tableStartY + cellPadY, {
          width: colWidths[i] - (cellPadX * 2),
          align: 'left',
          lineBreak: true
        });
        x += colWidths[i];
      });

      doc.font('Helvetica').fontSize(8);
      const rowHeights = rows.map((row) => {
        const tallestCell = row.reduce((maxHeight, val, i) => {
          const contentHeight = doc.heightOfString(String(val), {
            width: colWidths[i] - (cellPadX * 2),
            align: 'left'
          });
          return Math.max(maxHeight, contentHeight);
        }, 0);
        return Math.max(baseRowHeight, tallestCell + (cellPadY * 2));
      });

      const blankRows = Math.max(0, minimumRows - rows.length);
      const dataHeight = rowHeights.reduce((sum, h) => sum + h, 0) + (blankRows * baseRowHeight);
      const tableHeight = headerHeight + dataHeight;

      let rowY = tableStartY + headerHeight;
      rows.forEach((row, rowIndex) => {
        const currentRowHeight = rowHeights[rowIndex];
        let colX = tableX;
        row.forEach((val, colIndex) => {
          doc.text(String(val), colX + cellPadX, rowY + cellPadY, {
            width: colWidths[colIndex] - (cellPadX * 2),
            align: 'left',
            lineBreak: true
          });
          colX += colWidths[colIndex];
        });
        rowY += currentRowHeight;
      });

      rowY += blankRows * baseRowHeight;
      doc.rect(tableX, tableStartY - 2, tableWidth, tableHeight + 2).stroke();

      // Totals line on far left
      const totalsY = tableStartY + tableHeight + 6;
      doc.fontSize(6).text(
        `Totals: Subjects: ${totalSubjects}  Credit Units=${totalUnits.toFixed(1)}  Lecture Units=${totalUnits.toFixed(1)}  Lab Units=0`,
        40,
        totalsY
      );

      // Assessed Fees section
      doc.y = totalsY + 18;
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
