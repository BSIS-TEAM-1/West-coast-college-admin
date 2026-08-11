const mongoose = require('mongoose');
const Applicant = require('../models/Applicant');
const Student = require('../models/Student');
const { apiCache } = require('../services/apiCache');
const ApplicantEmailService = require('../services/applicantEmailService');
const { createOrReactivateEnrollment } = require('../services/enrollmentService');
const { getCourseOptions, normalizeCourseCode } = require('../lib/programMapping');

const applicantEmailService = new ApplicantEmailService();

const EMAIL_STATUS_TRIGGERS = new Set([
  'Submitted',
  'For Evaluation',
  'Incomplete Requirements',
  'Approved for Enrollment',
  'Rejected',
  'Cancelled'
]);

// Use centralized program mapping (single source of truth)
const COURSE_OPTIONS = getCourseOptions();

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
    if (!cleanString(shs.strandOrTrack)) {
      errors.push('Senior high school strand / track is required.');
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

      // Fetch the applicant first (without updating) so we can use it
      // inside the transaction for enrollment creation.
      const applicant = await Applicant.findById(req.params.id);
      if (!applicant) {
        return res.status(404).json({ success: false, message: 'Applicant not found.' });
      }

      let studentNotification = null;

      // For enrollment transitions, use a transaction so that
      // Applicant + Student + Enrollment are all atomic.
      // For non-enrollment statuses (Rejected, Cancelled, etc.),
      // a simple update is sufficient.
      if (status === 'Approved for Enrollment' || status === 'Enrolled') {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            const lifecycleStatus = status === 'Enrolled' ? 'Enrolled' : 'Pending';
            const enrollmentStatus = status === 'Enrolled' ? 'Enrolled' : 'Not Enrolled';

            // ─── 1. Update Applicant status (inside transaction) ───
            applicant.status = status;
            applicant.registrarRemarks = registrarRemarks;
            applicant.reviewedBy = req.adminId;
            applicant.reviewedAt = new Date();
            await applicant.save({ session });

            // ─── 2. Create or update Student ───
            let studentRecord = null;
            const existingStudent = await Student.findOne({ email: applicant.email }).session(session);
            if (existingStudent) {
              const wasEnrolled = existingStudent.lifecycleStatus === 'Enrolled';
              if (!wasEnrolled) {
                existingStudent.lifecycleStatus = lifecycleStatus;
                existingStudent.enrollmentStatus = enrollmentStatus;
                existingStudent.updatedBy = req.adminId;
                await existingStudent.save({ session });
              }
              studentRecord = existingStudent;
              studentNotification = {
                upserted: true,
                updated: true,
                created: false,
                alreadyEnrolled: wasEnrolled,
                studentNumber: existingStudent.studentNumber || '',
                lifecycleStatus: existingStudent.lifecycleStatus,
                fullName: `${existingStudent.firstName || ''} ${existingStudent.lastName || ''}`.trim()
              };
            } else {
              const studentStatus =
                applicant.applicantType === 'Transferee' ? 'Transferee' :
                applicant.applicantType === 'Returnee' ? 'Returnee' : 'Regular';

              const newStudents = await Student.create([{
                firstName: applicant.firstName,
                middleName: applicant.middleName,
                lastName: applicant.lastName,
                suffix: applicant.suffix,
                email: applicant.email,
                contactNumber: applicant.phoneNumber,
                address: applicant.currentAddress,
                permanentAddress: applicant.permanentAddress,
                currentLocation: applicant.currentLocation,
                permanentLocation: applicant.permanentLocation,
                birthDate: applicant.birthDate,
                birthPlace: applicant.birthPlace,
                gender: applicant.gender,
                civilStatus: applicant.civilStatus,
                nationality: applicant.nationality,
                religion: applicant.religion,
                fatherName: applicant.fatherName,
                motherName: applicant.motherName,
                guardianName: applicant.guardianName,
                guardianRelationship: applicant.guardianRelationship,
                guardianContactNumber: applicant.guardianContactNumber,
                emergencyContact: applicant.emergencyContact,
                academicDetails: applicant.academicDetails,
                course: applicant.selectedCourse,
                yearLevel: applicant.requestedYearLevel || 1,
                semester: applicant.semester || '1st',
                schoolYear: applicant.schoolYear,
                studentStatus,
                lifecycleStatus,
                enrollmentStatus,
                corStatus: 'Pending',
                createdBy: req.adminId,
                updatedBy: req.adminId
              }], { session });
              studentRecord = newStudents[0];
              studentNotification = {
                upserted: true,
                updated: false,
                created: true,
                alreadyEnrolled: false,
                studentNumber: studentRecord.studentNumber || '',
                lifecycleStatus: studentRecord.lifecycleStatus,
                fullName: `${studentRecord.firstName || ''} ${studentRecord.lastName || ''}`.trim()
              };
            }

            // ─── 3. Create Enrollment (only for "Enrolled" status) ───
            // Enrollment is the authoritative academic-period record.
            // Student.enrollmentStatus is a denormalized display field.
            // If this fails, the transaction rolls back — no partial state.
            if (status === 'Enrolled' && studentRecord) {
              await createOrReactivateEnrollment({
                studentId: studentRecord._id,
                studentNumber: studentRecord.studentNumber || '',
                programCode: Number(applicant.selectedCourse),
                yearLevel: Number(applicant.requestedYearLevel || studentRecord.yearLevel || 1),
                semester: applicant.semester || studentRecord.semester || '1st',
                schoolYear: applicant.schoolYear || studentRecord.schoolYear,
                curriculumVersion: studentRecord.curriculumVersion,
                session,
              });
            }
          });
        } catch (txError) {
          // Transaction failed — Applicant, Student, and Enrollment are
          // all rolled back. Do NOT silently swallow this.
          const message = txError?.message || 'Unknown enrollment transaction error';
          console.error('Enrollment transaction failed for applicant:', message);
          throw txError;
        } finally {
          session.endSession();
        }
      } else {
        // Non-enrollment status — simple update without transaction
        applicant.status = status;
        applicant.registrarRemarks = registrarRemarks;
        applicant.reviewedBy = req.adminId;
        applicant.reviewedAt = new Date();
        await applicant.save();
      }

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
        emailNotification,
        studentNotification
      });
    } catch (error) {
      console.error('Applicant status update error:', error);

      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((e) => e.message);
        return res.status(400).json({ success: false, message: `Unable to update status: ${messages.join(' ')}` });
      }

      if (error.name === 'MongoError' && error.code === 11000) {
        const field = Object.keys(error.keyValue || {}).join(', ') || 'a unique field';
        return res.status(409).json({ success: false, message: `Unable to update status: duplicate value for ${field}.` });
      }

      res.status(500).json({
        success: false,
        message: 'Unable to save the status update. The record may have changed or the server is busy. Please refresh and try again.'
      });
    }
  }
}

module.exports = ApplicantController;
module.exports.COURSE_OPTIONS = COURSE_OPTIONS;
