const Applicant = require('../models/Applicant');
const { apiCache } = require('../services/apiCache');

const COURSE_OPTIONS = [
  { id: 101, code: 'BEED', name: 'Bachelor of Elementary Education' },
  { id: 102, code: 'BSEd-English', name: 'Bachelor of Secondary Education - Major in English' },
  { id: 103, code: 'BSEd-Math', name: 'Bachelor of Secondary Education - Major in Mathematics' },
  { id: 201, code: 'BSBA-HRM', name: 'Bachelor of Science in Business Administration - Major in HRM' }
];

const ALLOWED_STATUSES = new Set([
  'Submitted',
  'Incomplete Requirements',
  'For Evaluation',
  'Approved for Enrollment',
  'Enrolled',
  'Rejected',
  'Cancelled'
]);

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanSchoolRecord(value = {}) {
  return {
    schoolName: cleanString(value.schoolName),
    schoolAddress: cleanString(value.schoolAddress),
    yearGraduated: cleanString(value.yearGraduated),
    generalAverage: cleanString(value.generalAverage),
    gradesSummary: cleanString(value.gradesSummary),
    strandOrTrack: cleanString(value.strandOrTrack)
  };
}

function courseMap() {
  return new Map(COURSE_OPTIONS.map((course) => [course.id, course]));
}

function serializeApplicant(applicant) {
  const raw = typeof applicant.toObject === 'function' ? applicant.toObject({ virtuals: true }) : applicant;
  const course = courseMap().get(Number(raw.selectedCourse));

  return {
    ...raw,
    course
  };
}

class ApplicantController {
  static getCourses(req, res) {
    res.json({
      success: true,
      data: COURSE_OPTIONS
    });
  }

  static async submitApplicant(req, res) {
    try {
      const body = req.body || {};
      const selectedCourse = Number(body.selectedCourse);

      if (!courseMap().has(selectedCourse)) {
        return res.status(400).json({ success: false, message: 'Please select a valid course.' });
      }

      const applicant = await Applicant.create({
        applicantType: cleanString(body.applicantType) || 'New',
        status: 'Submitted',
        firstName: cleanString(body.firstName),
        middleName: cleanString(body.middleName),
        lastName: cleanString(body.lastName),
        suffix: cleanString(body.suffix),
        email: cleanString(body.email).toLowerCase(),
        phoneNumber: cleanString(body.phoneNumber),
        birthDate: body.birthDate,
        birthPlace: cleanString(body.birthPlace),
        gender: cleanString(body.gender),
        civilStatus: cleanString(body.civilStatus),
        nationality: cleanString(body.nationality),
        religion: cleanString(body.religion),
        currentAddress: cleanString(body.currentAddress),
        permanentAddress: cleanString(body.permanentAddress),
        fatherName: cleanString(body.fatherName),
        motherName: cleanString(body.motherName),
        guardianName: cleanString(body.guardianName),
        guardianRelationship: cleanString(body.guardianRelationship),
        guardianContactNumber: cleanString(body.guardianContactNumber),
        emergencyContact: {
          name: cleanString(body.emergencyContact?.name),
          relationship: cleanString(body.emergencyContact?.relationship),
          contactNumber: cleanString(body.emergencyContact?.contactNumber),
          address: cleanString(body.emergencyContact?.address)
        },
        academicDetails: {
          elementary: cleanSchoolRecord(body.academicDetails?.elementary),
          highSchool: cleanSchoolRecord(body.academicDetails?.highSchool)
        },
        selectedCourse,
        requestedYearLevel: Number(body.requestedYearLevel) || 1,
        semester: cleanString(body.semester) || '1st',
        schoolYear: cleanString(body.schoolYear)
      });

      apiCache.invalidatePrefix('/api/registrar/applicants');

      res.status(201).json({
        success: true,
        data: serializeApplicant(applicant),
        message: 'Application submitted successfully.'
      });
    } catch (error) {
      console.error('Applicant submission error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to submit application.'
      });
    }
  }

  static async getApplicants(req, res) {
    try {
      const status = cleanString(req.query.status);
      const q = cleanString(req.query.q);
      const query = {};

      if (status && status !== 'all') {
        query.status = status;
      }

      if (q) {
        query.$or = [
          { applicantNumber: new RegExp(q, 'i') },
          { firstName: new RegExp(q, 'i') },
          { lastName: new RegExp(q, 'i') },
          { email: new RegExp(q, 'i') },
          { phoneNumber: new RegExp(q, 'i') }
        ];
      }

      const applicants = await Applicant.find(query).sort({ createdAt: -1 }).limit(200);

      res.json({
        success: true,
        data: applicants.map(serializeApplicant)
      });
    } catch (error) {
      console.error('Applicant list error:', error);
      res.status(500).json({ success: false, message: 'Failed to load applicants.' });
    }
  }

  static async getApplicantById(req, res) {
    try {
      const applicant = await Applicant.findById(req.params.id);
      if (!applicant) {
        return res.status(404).json({ success: false, message: 'Applicant not found.' });
      }

      res.json({ success: true, data: serializeApplicant(applicant) });
    } catch (error) {
      console.error('Applicant detail error:', error);
      res.status(500).json({ success: false, message: 'Failed to load applicant.' });
    }
  }

  static async updateApplicantStatus(req, res) {
    try {
      const status = cleanString(req.body.status);
      const registrarRemarks = cleanString(req.body.registrarRemarks);

      if (!ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({ success: false, message: 'Invalid applicant status.' });
      }

      const applicant = await Applicant.findById(req.params.id);
      if (!applicant) {
        return res.status(404).json({ success: false, message: 'Applicant not found.' });
      }

      applicant.status = status;
      applicant.registrarRemarks = registrarRemarks;
      applicant.reviewedBy = req.adminId;
      applicant.reviewedAt = new Date();

      await applicant.save();

      apiCache.invalidatePrefix('/api/registrar/applicants');

      res.json({
        success: true,
        data: serializeApplicant(applicant),
        message: 'Applicant status updated.'
      });
    } catch (error) {
      console.error('Applicant status update error:', error);
      res.status(500).json({ success: false, message: 'Failed to update applicant status.' });
    }
  }
}

module.exports = ApplicantController;
module.exports.COURSE_OPTIONS = COURSE_OPTIONS;
