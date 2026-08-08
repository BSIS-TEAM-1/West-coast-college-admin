const Applicant = require('../models/Applicant');
const { apiCache } = require('../services/apiCache');
const ApplicantEmailService = require('../services/applicantEmailService');

const applicantEmailService = new ApplicantEmailService();

const EMAIL_STATUS_TRIGGERS = new Set([
  'Submitted',
  'For Evaluation',
  'Incomplete Requirements',
  'Approved for Enrollment',
  'Rejected',
  'Cancelled'
]);

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(09|\+639)\d{9}$/;
const SCHOOL_NAME_RE = /^[a-zA-Z0-9\s,.'\-()]+$/;
const YEAR_RE = /^\d{4}$/;
const GPA_MIN = 60;
const GPA_MAX = 100;

function validatePhone(value) {
  const v = cleanString(value);
  const digits = v.replace(/[^0-9]/g, '');
  if (PHONE_RE.test(v)) return true;
  if (digits.length === 11 && digits.startsWith('09')) return true;
  if (digits.length === 13 && digits.startsWith('639')) return true;
  return false;
}

function validateGpa(value) {
  const v = cleanString(value);
  if (!v) return true;
  const num = parseFloat(v);
  return !isNaN(num) && num >= GPA_MIN && num <= GPA_MAX;
}

function validateSchoolName(value) {
  const v = cleanString(value);
  if (!v) return false;
  if (v.length > 150) return false;
  return SCHOOL_NAME_RE.test(v);
}

function collectValidationErrors(body) {
  const errors = [];

  if (!cleanString(body.firstName)) errors.push('First name is required.');
  if (!cleanString(body.lastName)) errors.push('Last name is required.');

  const email = cleanString(body.email).toLowerCase();
  if (!email) {
    errors.push('Email address is required.');
  } else if (!EMAIL_RE.test(email)) {
    errors.push('Email address is invalid.');
  }

  const phone = cleanString(body.phoneNumber);
  if (!phone) {
    errors.push('Phone number is required.');
  } else if (!validatePhone(phone)) {
    errors.push('Phone number must be a valid Philippine mobile number (e.g. 09171234567 or +639171234567).');
  }

  if (!body.birthDate) errors.push('Birth date is required.');

  const currentLocation = body.currentLocation || {};
  if (!cleanString(currentLocation.cityCode)) errors.push('Please select a city/municipality for your current address.');
  if (!cleanString(currentLocation.streetAddress)) errors.push('Street address is required.');

  const guardianContact = cleanString(body.guardianContactNumber);
  if (!guardianContact) {
    errors.push('Parent/guardian contact number is required.');
  } else if (!validatePhone(guardianContact)) {
    errors.push('Guardian contact number must be a valid Philippine mobile number.');
  }

  const ec = body.emergencyContact || {};
  if (!cleanString(ec.name)) errors.push('Emergency contact name is required.');
  if (!cleanString(ec.relationship)) errors.push('Emergency contact relationship is required.');
  const ecPhone = cleanString(ec.contactNumber);
  if (!ecPhone) {
    errors.push('Emergency contact number is required.');
  } else if (!validatePhone(ecPhone)) {
    errors.push('Emergency contact number must be a valid Philippine mobile number.');
  }

  const acad = body.academicDetails || {};
  const elem = acad.elementary || {};
  if (!validateSchoolName(elem.schoolName)) {
    errors.push('Please enter a valid elementary school name (letters, numbers, spaces, and basic punctuation only, max 150 characters).');
  }
  if (!YEAR_RE.test(cleanString(elem.yearGraduated))) {
    errors.push('Elementary year graduated must be a 4-digit year.');
  }
  if (cleanString(elem.generalAverage) && !validateGpa(elem.generalAverage)) {
    errors.push(`Elementary general average must be a number between ${GPA_MIN} and ${GPA_MAX}.`);
  }

  const hs = acad.highSchool || {};
  if (!validateSchoolName(hs.schoolName)) {
    errors.push('Please enter a valid high school name (letters, numbers, spaces, and basic punctuation only, max 150 characters).');
  }
  if (!YEAR_RE.test(cleanString(hs.yearGraduated))) {
    errors.push('High school year graduated must be a 4-digit year.');
  }
  if (cleanString(hs.generalAverage) && !validateGpa(hs.generalAverage)) {
    errors.push(`High school general average must be a number between ${GPA_MIN} and ${GPA_MAX}.`);
  }

  const shs = acad.seniorHighSchool;
  if (shs && cleanString(shs.schoolName)) {
    if (!validateSchoolName(shs.schoolName)) {
      errors.push('Please enter a valid senior high school name.');
    }
    if (cleanString(shs.yearGraduated) && !YEAR_RE.test(cleanString(shs.yearGraduated))) {
      errors.push('Senior high school year graduated must be a 4-digit year.');
    }
    if (cleanString(shs.generalAverage) && !validateGpa(shs.generalAverage)) {
      errors.push(`Senior high school general average must be a number between ${GPA_MIN} and ${GPA_MAX}.`);
    }
  }

  const college = acad.college;
  if (college && cleanString(college.schoolName)) {
    if (!validateSchoolName(college.schoolName)) {
      errors.push('Please enter a valid college/university name.');
    }
    if (cleanString(college.yearGraduated) && !YEAR_RE.test(cleanString(college.yearGraduated))) {
      errors.push('College year graduated must be a 4-digit year.');
    }
    if (cleanString(college.generalAverage) && !validateGpa(college.generalAverage)) {
      errors.push(`College general average must be a number between ${GPA_MIN} and ${GPA_MAX}.`);
    }
  }

  const schoolYear = cleanString(body.schoolYear);
  if (!schoolYear) {
    errors.push('School year is required.');
  } else if (!/^\d{4}-\d{4}$/.test(schoolYear)) {
    errors.push('School year must be in YYYY-YYYY format.');
  }

  return errors;
}

function cleanLocation(value = {}) {
  return {
    regionCode: cleanString(value.regionCode),
    regionName: cleanString(value.regionName),
    provinceCode: cleanString(value.provinceCode),
    provinceName: cleanString(value.provinceName),
    cityCode: cleanString(value.cityCode),
    cityName: cleanString(value.cityName),
    barangayCode: cleanString(value.barangayCode),
    barangayName: cleanString(value.barangayName),
    streetAddress: cleanString(value.streetAddress)
  }
}

function cleanSchoolRecord(value = {}) {
  return {
    schoolName: cleanString(value.schoolName),
    schoolAddress: cleanString(value.schoolAddress),
    yearGraduated: cleanString(value.yearGraduated),
    generalAverage: cleanString(value.generalAverage),
    gradesSummary: cleanString(value.gradesSummary),
    strandOrTrack: cleanString(value.strandOrTrack)
  }
}

function formatAddress(location, fallback) {
  const loc = cleanLocation(location)
  const parts = [
    loc.streetAddress,
    loc.barangayName,
    loc.cityName,
    loc.provinceName,
    loc.regionName
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : cleanString(fallback)
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

      const validationErrors = collectValidationErrors(body);
      if (validationErrors.length > 0) {
        return res.status(400).json({ success: false, message: validationErrors.join(' ') });
      }

      const acad = body.academicDetails || {};
      const academicDetails = {
        elementary: cleanSchoolRecord(acad.elementary),
        highSchool: cleanSchoolRecord(acad.highSchool)
      };
      if (acad.seniorHighSchool && cleanString(acad.seniorHighSchool.schoolName)) {
        academicDetails.seniorHighSchool = cleanSchoolRecord(acad.seniorHighSchool);
      }
      if (acad.college && cleanString(acad.college.schoolName)) {
        academicDetails.college = cleanSchoolRecord(acad.college);
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
        currentAddress: formatAddress(body.currentLocation, body.currentAddress),
        permanentAddress: formatAddress(body.permanentLocation, body.permanentAddress),
        currentLocation: cleanLocation(body.currentLocation),
        permanentLocation: cleanLocation(body.permanentLocation),
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
        academicDetails,
        selectedCourse,
        requestedYearLevel: Number(body.requestedYearLevel) || 1,
        semester: cleanString(body.semester) || '1st',
        schoolYear: cleanString(body.schoolYear)
      });

      apiCache.invalidatePrefix('/api/registrar/applicants');

      const courseEntry = courseMap().get(selectedCourse);
      const courseName = courseEntry ? courseEntry.name : '';
      const applicantName = [applicant.firstName, applicant.lastName].filter(Boolean).join(' ');

      let emailNotification = null;
      try {
        emailNotification = await applicantEmailService.sendStatusUpdate({
          to: applicant.email,
          applicantName,
          applicantNumber: applicant.applicantNumber,
          status: 'Submitted',
          remarks: '',
          courseName
        });
      } catch (emailError) {
        console.error('Applicant submission email failed:', emailError?.message || emailError);
        emailNotification = { sent: false, provider: null, error: emailError?.message || 'Email delivery failed.' };
      }

      res.status(201).json({
        success: true,
        data: serializeApplicant(applicant),
        message: 'Application submitted successfully.',
        emailNotification
      });
    } catch (error) {
      console.error('Applicant submission error:', error);
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(e => e.message);
        return res.status(400).json({ success: false, message: messages.join(' ') });
      }
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

      let emailNotification = null;
      if (EMAIL_STATUS_TRIGGERS.has(status)) {
        const courseEntry = COURSE_OPTIONS.find((c) => c.id === applicant.selectedCourse || c.code === applicant.selectedCourse);
        const courseName = courseEntry ? courseEntry.name : '';
        const applicantName = [applicant.firstName, applicant.lastName].filter(Boolean).join(' ');

        try {
          emailNotification = await applicantEmailService.sendStatusUpdate({
            to: applicant.email,
            applicantName,
            applicantNumber: applicant.applicantNumber,
            status,
            remarks: registrarRemarks,
            courseName
          });
        } catch (emailError) {
          console.error('Applicant status email failed:', emailError?.message || emailError);
          emailNotification = { sent: false, provider: null, error: emailError?.message || 'Email delivery failed.' };
        }
      }

      res.json({
        success: true,
        data: serializeApplicant(applicant),
        message: 'Applicant status updated.',
        emailNotification
      });
    } catch (error) {
      console.error('Applicant status update error:', error);
      res.status(500).json({ success: false, message: 'Failed to update applicant status.' });
    }
  }
}

module.exports = ApplicantController;
module.exports.COURSE_OPTIONS = COURSE_OPTIONS;
