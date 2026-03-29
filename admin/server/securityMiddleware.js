const mongoose = require('mongoose');
const Joi = require('joi');

const { ANNOUNCEMENT_AUDIENCES, validateAnnouncementAudience } = require('./announcementAudience');

const ACCOUNT_TYPES = ['admin', 'registrar', 'professor'];
const DOCUMENT_CATEGORIES = [
  'POLICY',
  'HANDBOOK',
  'ACCREDITATION',
  'FORM',
  'GUIDELINE',
  'PROCEDURE',
  'REPORT',
  'OTHER'
];
const DOCUMENT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED', 'SUPERSEDED'];
const DOCUMENT_ALLOWED_ROLES = ['admin', 'registrar', 'faculty', 'staff', 'student'];
const DOCUMENT_FOLDER_SEGMENT_TYPES = ['DOCUMENT_TYPE', 'DEPARTMENT', 'DATE', 'CUSTOM'];
const STUDENT_COURSES = [101, 102, 103, 201];
const STUDENT_SEMESTERS = ['1st', '2nd', 'Summer'];
const STUDENT_STATUSES = ['Regular', 'Dropped', 'Returnee', 'Transferee'];
const STUDENT_LIFECYCLE_STATUSES = ['Pending', 'Enrolled', 'Not Enrolled', 'Dropped', 'Inactive', 'Graduated'];
const ENROLLMENT_STATUSES = ['Enrolled', 'Not Enrolled', 'On Leave', 'Dropped'];
const STUDENT_COR_STATUSES = ['Pending', 'Received', 'Verified'];
const SCHOLARSHIP_OPTIONS = [
  'N/A',
  'CHED Scholarship Programs',
  'OWWA Scholarship Programs',
  'DOST-SEI Undergraduate Scholarships',
  'Tertiary Education Subsidy',
  'GrabScholar College Scholarship',
  'SM College Scholarship (SM Foundation)',
  'Foundation Scholarships'
];
const STUDENT_GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const STUDENT_CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];
const subjectIdSchema = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);
const studentNumberSchema = Joi.string().pattern(/^[0-9]{4}-(?:[0-9]{3}|[A-Z][A-Z0-9-]{1,20})-[0-9]{5}$/);
const accountUidSchema = Joi.string().trim().pattern(/^1\d{11,12}$/);
const schoolYearSchema = Joi.string().pattern(/^\d{4}-\d{4}$/);
const nonEmptyTrimmedString = (max = 254) => Joi.string().trim().min(1).max(max);
const optionalTrimmedString = (max = 254) => Joi.string().trim().max(max).allow('');
const announcementAudienceSchema = Joi.alternatives().try(
  Joi.string().valid(...ANNOUNCEMENT_AUDIENCES),
  Joi.array().min(1).max(ANNOUNCEMENT_AUDIENCES.length).items(
    Joi.string().valid(...ANNOUNCEMENT_AUDIENCES)
  ).unique()
).custom((value, helpers) => {
  const validationError = validateAnnouncementAudience(value);
  if (validationError) {
    return helpers.message(validationError);
  }
  return value;
});
const studentEmergencyContactSchema = Joi.object({
  name: optionalTrimmedString(254).optional(),
  relationship: optionalTrimmedString(254).optional(),
  contactNumber: optionalTrimmedString(30).optional(),
  address: optionalTrimmedString(500).optional()
});
const studentMutationFields = {
  firstName: nonEmptyTrimmedString(120),
  middleName: optionalTrimmedString(120),
  lastName: nonEmptyTrimmedString(120),
  suffix: optionalTrimmedString(50),
  course: Joi.number().integer().valid(...STUDENT_COURSES),
  major: optionalTrimmedString(120),
  yearLevel: Joi.number().integer().min(1).max(5),
  semester: Joi.string().valid(...STUDENT_SEMESTERS),
  schoolYear: schoolYearSchema,
  studentStatus: Joi.string().valid(...STUDENT_STATUSES),
  lifecycleStatus: Joi.string().valid(...STUDENT_LIFECYCLE_STATUSES),
  enrollmentStatus: Joi.string().valid(...ENROLLMENT_STATUSES),
  corStatus: Joi.string().valid(...STUDENT_COR_STATUSES),
  scholarship: Joi.string().valid(...SCHOLARSHIP_OPTIONS),
  email: Joi.string().email().lowercase().max(254).allow(''),
  contactNumber: nonEmptyTrimmedString(30),
  address: nonEmptyTrimmedString(500),
  permanentAddress: optionalTrimmedString(500),
  birthDate: Joi.alternatives().try(Joi.date(), Joi.string().allow('')),
  birthPlace: optionalTrimmedString(200),
  gender: Joi.string().valid(...STUDENT_GENDERS).allow(''),
  civilStatus: Joi.string().valid(...STUDENT_CIVIL_STATUSES).allow(''),
  nationality: optionalTrimmedString(100),
  religion: optionalTrimmedString(100),
  emergencyContact: studentEmergencyContactSchema.optional(),
  assignedProfessor: optionalTrimmedString(254),
  schedule: optionalTrimmedString(254),
  latestGrade: Joi.alternatives().try(Joi.number().min(1).max(5), Joi.string().allow('')),
  gradeProfessor: optionalTrimmedString(254),
  gradeDate: Joi.alternatives().try(Joi.date(), Joi.string().allow('')),
  isActive: Joi.boolean().optional()
};
const subjectMutationFields = {
  code: nonEmptyTrimmedString(30),
  title: nonEmptyTrimmedString(254),
  units: Joi.number().min(0.5).max(6),
  course: Joi.number().integer().valid(...STUDENT_COURSES),
  yearLevel: Joi.number().integer().min(1).max(5),
  semester: Joi.string().valid(...STUDENT_SEMESTERS),
  isActive: Joi.boolean()
};

/**
 * Deep sanitization function that rejects any MongoDB operators ($ keys) and dot notation keys
 * in nested objects. Scans all input recursively.
 * @param {any} obj - The object to sanitize
 * @param {string} path - Current path for error reporting
 * @throws {Error} If MongoDB operators or forbidden keys are found
 */
function sanitizeInput(obj, path = 'root') {
  if (obj === null || obj === undefined) {
    return;
  }

  if (typeof obj !== 'object') {
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => sanitizeInput(item, `${path}[${index}]`));
    return;
  }

  for (const key in obj) {
    if (key.startsWith('$')) {
      throw new Error(`Forbidden MongoDB operator detected in ${path}: ${key}`);
    }

    if (key.includes('.')) {
      throw new Error(`Forbidden dot notation key detected in ${path}: ${key}`);
    }

    sanitizeInput(obj[key], `${path}.${key}`);
  }
}

/**
 * Input validation middleware that sanitizes request body, query, params
 * @param {Object} options - Validation options
 * @param {Object} options.bodySchema - Joi schema for body validation
 * @param {Object} options.querySchema - Joi schema for query validation
 * @param {Object} options.paramsSchema - Joi schema for params validation
 */
function inputValidationMiddleware(options = {}) {
  // Backward compatibility:
  // existing routes pass { body/query/params }, while newer callers may pass
  // { bodySchema/querySchema/paramsSchema }.
  const bodySchema = options.bodySchema || options.body;
  const querySchema = options.querySchema || options.query;
  const paramsSchema = options.paramsSchema || options.params;

  return (req, res, next) => {
    try {
      // Sanitize all inputs
      sanitizeInput(req.body, 'body');
      sanitizeInput(req.query, 'query');
      sanitizeInput(req.params, 'params');

      // If schemas are provided, validate against them
      if (bodySchema) {
        const { error, value } = bodySchema.validate(req.body, { abortEarly: false });
        if (error) {
          return res.status(400).json({
            error: 'Invalid request body.',
            details: error.details.map(d => d.message)
          });
        }
        req.body = value;
      }

      if (querySchema) {
        const { error, value } = querySchema.validate(req.query, { abortEarly: false });
        if (error) {
          return res.status(400).json({
            error: 'Invalid query parameters.',
            details: error.details.map(d => d.message)
          });
        }
        req.query = value;
      }

      if (paramsSchema) {
        const { error, value } = paramsSchema.validate(req.params, { abortEarly: false });
        if (error) {
          return res.status(400).json({
            error: 'Invalid URL parameters.',
            details: error.details.map(d => d.message)
          });
        }
        req.params = value;
      }

      next();
    } catch (error) {
      console.error('Input validation error:', error.message);
      return res.status(400).json({
        error: 'Invalid input detected. Request rejected for security reasons.'
      });
    }
  };
}

/**
 * Safe query builder that only accepts validated primitive values
 * @param {Object} conditions - Query conditions object
 * @returns {Object} Sanitized query object
 */
function buildSafeQuery(conditions) {
  const safeQuery = {};

  for (const [key, value] of Object.entries(conditions)) {
    // Reject any non-primitive values that could be operators
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        // Allow arrays but check each element
        value.forEach(item => {
          if (typeof item === 'object' && item !== null) {
            throw new Error(`Complex objects not allowed in query arrays: ${key}`);
          }
        });
        safeQuery[key] = value;
      } else {
        throw new Error(`Complex objects not allowed in queries: ${key}`);
      }
    } else {
      // Only allow primitive values with explicit $eq
      safeQuery[key] = { $eq: value };
    }
  }

  return safeQuery;
}

/**
 * Convert string ID to ObjectId safely
 * @param {string} id - String ID to convert
 * @returns {ObjectId} MongoDB ObjectId
 * @throws {Error} If ID is invalid
 */
function safeObjectId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new Error('Invalid ObjectId format');
  }
  return new mongoose.Types.ObjectId(id);
}

// Common validation schemas
const schemas = {
  // Login schema
  login: {
    body: Joi.object({
      username: Joi.string().trim().min(1).max(254).required(),
      password: Joi.string().min(1).max(128).required(),
      captchaToken: Joi.string().min(1).optional()
    })
  },

  // Admin creation schema
  createAdmin: {
    body: Joi.object({
      username: Joi.string().trim().lowercase().min(1).max(254).required(),
      displayName: Joi.string().trim().min(1).max(254).optional(),
      accountType: Joi.string().valid(...ACCOUNT_TYPES).required(),
      password: Joi.string().min(8).max(128).required(),
      uid: accountUidSchema.required()
    })
  },

  // Student number validation
  studentNumber: studentNumberSchema,

  // ObjectId validation
  objectId: subjectIdSchema.required(),

  // Admin operations schemas
  admin: {
    updateProfile: {
      body: Joi.object({
        displayName: Joi.string().trim().max(254).optional(),
        email: Joi.string().email().lowercase().max(254).optional(),
        phone: Joi.string().trim().max(30).allow('').optional(),
        primaryLoginMethod: Joi.string().valid('username', 'email').optional(),
        loginEmailVerificationEnabled: Joi.boolean().optional(),
        newUsername: Joi.string().trim().lowercase().min(1).max(254).optional(),
        currentPassword: Joi.string().min(1).max(128).optional(),
        newPassword: Joi.string().min(8).max(128).optional(),
        additionalInfo: Joi.object({
          bio: Joi.string().trim().max(1000).allow('').optional(),
          secondPhone: Joi.string().trim().max(30).allow('').optional(),
          address: Joi.string().trim().max(500).allow('').optional(),
          emergencyContact: Joi.string().trim().max(254).allow('').optional(),
          emergencyRelationship: Joi.string().trim().max(254).allow('').optional(),
          emergencyPhone: Joi.string().trim().max(30).allow('').optional(),
          bloodType: Joi.string().trim().max(20).allow('').optional(),
          allergies: Joi.string().trim().max(500).allow('').optional(),
          medicalConditions: Joi.string().trim().max(1000).allow('').optional(),
          skills: Joi.string().trim().max(1000).allow('').optional()
        }).optional()
      })
    },
    sendEmailVerificationCode: {
      body: Joi.object({
        email: Joi.string().email().lowercase().max(254).required()
      })
    },
    verifyEmailVerificationCode: {
      body: Joi.object({
        code: Joi.string().trim().pattern(/^\d{6}$/).required()
      })
    },
    requestEmailChangeVerification: {
      body: Joi.object({
        email: Joi.string().email().lowercase().max(254).required()
      })
    },
    verifyEmailChangeVerification: {
      body: Joi.object({
        code: Joi.string().trim().pattern(/^\d{6}$/).required()
      })
    },
    verifyLoginEmailVerification: {
      body: Joi.object({
        challengeToken: Joi.string().trim().min(32).max(128).required(),
        code: Joi.string().trim().pattern(/^\d{6}$/).required()
      })
    },
    sendPhoneVerificationCode: {
      body: Joi.object({
        phone: Joi.string().trim().max(30).required()
      })
    },
    verifyPhoneVerificationCode: {
      body: Joi.object({
        code: Joi.string().trim().pattern(/^\d{6}$/).required()
      })
    },
    googleLogin: {
      body: Joi.object({
        credential: Joi.string().trim().min(1).required()
      })
    },
    createAccount: {
      body: Joi.object({
        username: Joi.string().trim().lowercase().min(1).max(254).required(),
        displayName: Joi.string().trim().min(1).max(254).optional(),
        accountType: Joi.string().valid(...ACCOUNT_TYPES).required(),
        password: Joi.string().min(8).max(128).required(),
        uid: accountUidSchema.required()
      })
    },
    updateAvatar: {
      body: Joi.object({
        avatarData: Joi.string().required(),
        mimeType: Joi.string().valid('image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp').required()
      })
    },
    accountsQuery: {
      query: Joi.object({
        type: Joi.string().valid('admin', 'registrar', 'professor').optional()
      })
    }
  },

  // Announcement schemas
  announcements: {
    create: {
      body: Joi.object({
        title: Joi.string().trim().min(1).max(200).required(),
        message: Joi.string().trim().min(1).max(500).required(),
        type: Joi.string().valid('info', 'warning', 'urgent', 'maintenance').optional(),
        targetAudience: announcementAudienceSchema.optional(),
        expiresAt: Joi.date().optional(),
        isPinned: Joi.boolean().optional(),
        media: Joi.array().max(6).items(
          Joi.object({
            type: Joi.string().valid('image', 'video').required(),
            url: Joi.string().trim().min(1).required(),
            fileName: Joi.string().trim().min(1).max(260).required(),
            originalFileName: Joi.string().trim().min(1).max(260).required(),
            mimeType: Joi.string().trim().min(1).max(120).required(),
            fileSize: Joi.number().integer().min(1).max(20 * 1024 * 1024).required(),
            caption: Joi.string().trim().max(500).allow('').optional()
          })
        ).optional()
      })
    },
    update: {
      body: Joi.object({
        title: Joi.string().trim().min(1).max(200).optional(),
        message: Joi.string().trim().min(1).max(500).optional(),
        type: Joi.string().valid('info', 'warning', 'urgent', 'maintenance').optional(),
        targetAudience: announcementAudienceSchema.optional(),
        expiresAt: Joi.date().optional(),
        isPinned: Joi.boolean().optional(),
        isArchived: Joi.boolean().optional(),
        isActive: Joi.boolean().optional(),
        media: Joi.array().max(6).items(
          Joi.object({
            type: Joi.string().valid('image', 'video').required(),
            url: Joi.string().trim().min(1).required(),
            fileName: Joi.string().trim().min(1).max(260).required(),
            originalFileName: Joi.string().trim().min(1).max(260).required(),
            mimeType: Joi.string().trim().min(1).max(120).required(),
            fileSize: Joi.number().integer().min(1).max(20 * 1024 * 1024).required(),
            caption: Joi.string().trim().max(500).allow('').optional()
          })
        ).optional()
      })
    },
    query: {
      query: Joi.object({
        page: Joi.number().integer().min(1).optional(),
        limit: Joi.number().integer().min(1).max(100).optional(),
        type: Joi.string().optional(),
        targetAudience: Joi.string().optional(),
        status: Joi.string().valid('active', 'inactive').optional(),
        search: Joi.string().trim().max(100).optional()
      })
    }
  },

  // Block schemas
  block: {
    assignableStudents: {
      query: Joi.object({
        subjectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
        blockId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
        page: Joi.number().integer().min(1).optional(),
        limit: Joi.number().integer().min(1).max(100).optional()
      })
    },
    createBlockGroup: {
      body: Joi.object({
        name: Joi.string().trim().min(1).max(100).required(),
        semester: Joi.string().valid('1st', '2nd', 'Summer').required(),
        year: Joi.number().integer().min(2000).max(3000).optional(),
        academicYear: Joi.string().pattern(/^\d{4}-\d{4}$/).optional(),
        department: Joi.string().trim().min(1).max(100).optional(),
        program: Joi.string().trim().min(1).max(100).optional(),
        yearLevel: Joi.string().valid('1st', '2nd', '3rd', '4th').optional(),
        policies: Joi.object({
          overcapPolicy: Joi.string().valid('allow', 'deny', 'waitlist').optional(),
          maxOvercap: Joi.number().integer().min(0).optional(),
          allowCapacityIncrease: Joi.boolean().optional(),
          allowAutoSectionCreation: Joi.boolean().optional()
        }).optional()
      })
        .or('year', 'academicYear')
        .custom((value) => {
          if (value.year === undefined && value.academicYear) {
            value.year = Number(String(value.academicYear).split('-')[0]);
          }
          return value;
        })
    },
    objectIdParam: {
      params: Joi.object({
        groupId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
        sectionId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional()
      })
    },
    createSection: {
      body: Joi.object({
        sectionCode: Joi.string().trim().min(1).max(50).optional(),
        name: Joi.string().trim().min(1).max(50).optional(),
        capacity: Joi.number().integer().min(1).max(50).required(),
        schedule: Joi.string().trim().max(255).allow('').optional(),
        subjectIds: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).optional()
      })
        .or('sectionCode', 'name')
        .custom((value) => {
          if (!value.sectionCode && value.name) {
            value.sectionCode = value.name;
          }
          return value;
        })
    }
  },

  // Document schemas
  documents: {
    create: {
      body: Joi.object({
        title: Joi.string().trim().min(1).max(254).required(),
        description: Joi.string().trim().max(1000).optional(),
        category: Joi.string().uppercase().valid(...DOCUMENT_CATEGORIES).required(),
        subcategory: Joi.string().trim().max(100).allow('').optional(),
        folderId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
        fileName: Joi.string().trim().min(1).max(254).required(),
        originalFileName: Joi.string().trim().min(1).max(254).required(),
        mimeType: Joi.string().trim().min(1).max(100).required(),
        fileSize: Joi.number().integer().min(1).required(),
        fileData: Joi.string().required(),
        version: Joi.string().trim().max(50).optional(),
        isPublic: Joi.boolean().optional(),
        allowedRoles: Joi.array().items(Joi.string().valid(...DOCUMENT_ALLOWED_ROLES)).optional(),
        tags: Joi.array().items(Joi.string().trim().max(50)).optional(),
        effectiveDate: Joi.date().optional(),
        expiryDate: Joi.date().optional(),
        status: Joi.string().valid(...DOCUMENT_STATUSES).optional()
      })
    },
    update: {
      body: Joi.object({
        title: Joi.string().trim().min(1).max(254).optional(),
        description: Joi.string().trim().max(1000).optional(),
        category: Joi.string().uppercase().valid(...DOCUMENT_CATEGORIES).optional(),
        subcategory: Joi.string().trim().max(100).allow('').optional(),
        folderId: Joi.alternatives().try(
          Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
          Joi.valid(null)
        ).optional(),
        isPublic: Joi.boolean().optional(),
        allowedRoles: Joi.array().items(Joi.string().valid(...DOCUMENT_ALLOWED_ROLES)).optional(),
        tags: Joi.array().items(Joi.string().trim().max(50)).optional(),
        effectiveDate: Joi.date().optional(),
        expiryDate: Joi.date().optional(),
        status: Joi.string().valid(...DOCUMENT_STATUSES).optional()
      }).min(1)
    },
    query: {
      query: Joi.object({
        category: Joi.string().uppercase().valid(...DOCUMENT_CATEGORIES).optional(),
        status: Joi.string().valid(...DOCUMENT_STATUSES).optional(),
        folderId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
        includeUnfoldered: Joi.boolean().optional(),
        trashed: Joi.string().valid('exclude', 'only', 'include').optional(),
        trashRootOnly: Joi.boolean().optional(),
        visibility: Joi.string().valid('all', 'public', 'restricted').optional(),
        search: Joi.string().trim().max(100).optional(),
        page: Joi.number().integer().min(1).optional(),
        limit: Joi.number().integer().min(1).max(100).optional(),
        sortBy: Joi.string().valid('updatedAt', 'createdAt', 'title', 'fileSize', 'category').optional(),
        sortOrder: Joi.string().valid('asc', 'desc').optional()
      })
    }
  },

  documentFolders: {
    create: {
      body: Joi.object({
        name: Joi.string().trim().min(1).max(120).required(),
        segmentType: Joi.string().valid(...DOCUMENT_FOLDER_SEGMENT_TYPES).optional(),
        segmentValue: Joi.string().trim().max(120).allow('').optional(),
        description: Joi.string().trim().max(300).allow('').optional(),
        parentFolderId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).allow(null).optional()
      })
    },
    update: {
      body: Joi.object({
        name: Joi.string().trim().min(1).max(120).optional(),
        segmentType: Joi.string().valid(...DOCUMENT_FOLDER_SEGMENT_TYPES).optional(),
        segmentValue: Joi.string().trim().max(120).allow('').optional(),
        description: Joi.string().trim().max(300).allow('').optional(),
        parentFolderId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).allow(null).optional()
      }).min(1)
    },
    query: {
      query: Joi.object({
        parentId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
        search: Joi.string().trim().max(120).optional(),
        trashed: Joi.string().valid('exclude', 'only', 'include').optional(),
        includeCounts: Joi.boolean().optional(),
        force: Joi.boolean().optional()
      })
    }
  },

  // Registrar student schemas
  student: {
    create: {
      body: Joi.object({
        ...studentMutationFields
      }).keys({
        firstName: studentMutationFields.firstName.required(),
        lastName: studentMutationFields.lastName.required(),
        course: studentMutationFields.course.required(),
        yearLevel: studentMutationFields.yearLevel.required(),
        semester: studentMutationFields.semester.required(),
        schoolYear: studentMutationFields.schoolYear.required(),
        contactNumber: studentMutationFields.contactNumber.required(),
        address: studentMutationFields.address.required()
      })
    },
    update: {
      body: Joi.object(studentMutationFields).min(1)
    },
    query: {
      query: Joi.object({
        course: Joi.number().integer().valid(...STUDENT_COURSES).optional(),
        yearLevel: Joi.number().integer().min(1).max(5).optional(),
        semester: Joi.string().valid(...STUDENT_SEMESTERS).optional(),
        schoolYear: schoolYearSchema.optional(),
        studentStatus: Joi.string().valid(...STUDENT_STATUSES).optional(),
        lifecycleStatus: Joi.string().valid(...STUDENT_LIFECYCLE_STATUSES).optional(),
        enrollmentStatus: Joi.string().valid(...ENROLLMENT_STATUSES).optional()
      })
    },
    nextStudentNumber: {
      query: Joi.object({
        course: Joi.number().integer().valid(...STUDENT_COURSES).required(),
        schoolYear: schoolYearSchema.required()
      })
    },
    idParam: {
      params: Joi.object({
        id: subjectIdSchema.required()
      })
    },
    studentNumberParam: {
      params: Joi.object({
        studentNumber: studentNumberSchema.required()
      })
    },
    enroll: {
      params: Joi.object({
        id: subjectIdSchema.required()
      }),
      body: Joi.object({
        schoolYear: schoolYearSchema.required(),
        semester: Joi.string().valid(...STUDENT_SEMESTERS).required(),
        subjectIds: Joi.array().items(subjectIdSchema.required()).min(1).required()
      })
    },
    currentEnrollment: {
      params: Joi.object({
        id: subjectIdSchema.required()
      }),
      query: Joi.object({
        schoolYear: schoolYearSchema.required(),
        semester: Joi.string().valid(...STUDENT_SEMESTERS).required()
      })
    },
    assignSubjectInstructor: {
      params: Joi.object({
        sectionId: subjectIdSchema.required()
      }),
      body: Joi.object({
        subjectId: subjectIdSchema.required(),
        instructor: nonEmptyTrimmedString(254).required(),
        schedule: optionalTrimmedString(254).optional(),
        room: optionalTrimmedString(100).optional(),
        semester: Joi.string().valid(...STUDENT_SEMESTERS).allow('').optional(),
        schoolYear: schoolYearSchema.allow('').optional()
      })
    },
    sectionAssignments: {
      params: Joi.object({
        sectionId: subjectIdSchema.required()
      })
    },
    sectionAssignmentTarget: {
      params: Joi.object({
        sectionId: subjectIdSchema.required(),
        subjectId: subjectIdSchema.required()
      })
    }
  },

  // Registrar subject schemas
  subject: {
    query: {
      query: Joi.object({
        course: Joi.number().integer().valid(...STUDENT_COURSES).optional(),
        yearLevel: Joi.number().integer().min(1).max(5).optional(),
        semester: Joi.string().valid(...STUDENT_SEMESTERS).optional(),
        q: Joi.string().trim().max(100).optional()
      })
    },
    create: {
      body: Joi.object({
        ...subjectMutationFields
      }).keys({
        code: subjectMutationFields.code.required(),
        title: subjectMutationFields.title.required(),
        units: subjectMutationFields.units.required()
      })
    },
    update: {
      body: Joi.object(subjectMutationFields).min(1)
    },
    idParam: {
      params: Joi.object({
        id: subjectIdSchema.required()
      })
    }
  }
};

module.exports = {
  sanitizeInput,
  inputValidationMiddleware,
  buildSafeQuery,
  safeObjectId,
  schemas
};
