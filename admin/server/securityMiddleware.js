const mongoose = require('mongoose');
const Joi = require('joi');

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
  return (req, res, next) => {
    try {
      // Sanitize all inputs
      sanitizeInput(req.body, 'body');
      sanitizeInput(req.query, 'query');
      sanitizeInput(req.params, 'params');

      // If schemas are provided, validate against them
      if (options.bodySchema) {
        const { error } = options.bodySchema.validate(req.body);
        if (error) {
          return res.status(400).json({
            error: 'Invalid request body.',
            details: error.details.map(d => d.message)
          });
        }
      }

      if (options.querySchema) {
        const { error } = options.querySchema.validate(req.query);
        if (error) {
          return res.status(400).json({
            error: 'Invalid query parameters.',
            details: error.details.map(d => d.message)
          });
        }
      }

      if (options.paramsSchema) {
        const { error } = options.paramsSchema.validate(req.params);
        if (error) {
          return res.status(400).json({
            error: 'Invalid URL parameters.',
            details: error.details.map(d => d.message)
          });
        }
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
      captchaToken: Joi.string().min(1).required()
    })
  },

  // Admin creation schema
  createAdmin: {
    body: Joi.object({
      username: Joi.string().trim().lowercase().min(1).max(254).required(),
      displayName: Joi.string().trim().min(1).max(254).optional(),
      accountType: Joi.string().valid('admin', 'registrar', 'professor').required(),
      password: Joi.string().min(8).max(128).required(),
      uid: Joi.string().pattern(/^[0-9]{4}-[A-Z]{2,6}-[0-9]{5}$/).required()
    })
  },

  // Student number validation
  studentNumber: Joi.string().pattern(/^[0-9]{4}-[A-Z]{2,6}-[0-9]{5}$/),

  // ObjectId validation
  objectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),

  // Admin operations schemas
  admin: {
    updateProfile: {
      body: Joi.object({
        displayName: Joi.string().trim().max(254).optional(),
        email: Joi.string().email().lowercase().max(254).optional(),
        newUsername: Joi.string().trim().lowercase().min(1).max(254).optional(),
        currentPassword: Joi.string().min(1).max(128).optional(),
        newPassword: Joi.string().min(8).max(128).optional()
      })
    },
    createAccount: {
      body: Joi.object({
        username: Joi.string().trim().lowercase().min(1).max(254).required(),
        displayName: Joi.string().trim().min(1).max(254).optional(),
        accountType: Joi.string().valid('admin', 'registrar', 'professor').required(),
        password: Joi.string().min(8).max(128).required(),
        uid: Joi.string().pattern(/^[0-9]{4}-[A-Z]{2,6}-[0-9]{5}$/).required()
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
        title: Joi.string().trim().min(1).max(254).required(),
        message: Joi.string().trim().min(1).required(),
        type: Joi.string().valid('info', 'warning', 'success', 'error', 'urgent').optional(),
        targetAudience: Joi.string().valid('all', 'admin', 'registrar', 'professor').optional(),
        expiresAt: Joi.date().optional(),
        isPinned: Joi.boolean().optional(),
        media: Joi.array().items(Joi.object()).optional()
      })
    },
    update: {
      body: Joi.object({
        title: Joi.string().trim().min(1).max(254).optional(),
        message: Joi.string().trim().min(1).optional(),
        type: Joi.string().valid('info', 'warning', 'success', 'error', 'urgent').optional(),
        targetAudience: Joi.string().valid('all', 'admin', 'registrar', 'professor').optional(),
        expiresAt: Joi.date().optional(),
        isPinned: Joi.boolean().optional(),
        isActive: Joi.boolean().optional(),
        media: Joi.array().items(Joi.object()).optional()
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
        academicYear: Joi.string().pattern(/^\d{4}-\d{4}$/).required(),
        semester: Joi.string().valid('1st', '2nd').required(),
        department: Joi.string().trim().min(1).max(100).required(),
        program: Joi.string().trim().min(1).max(100).required(),
        yearLevel: Joi.string().valid('1st', '2nd', '3rd', '4th').required()
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
        name: Joi.string().trim().min(1).max(50).required(),
        capacity: Joi.number().integer().min(1).max(50).optional(),
        subjectIds: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).optional()
      })
    }
  },

  // Document schemas
  documents: {
    create: {
      body: Joi.object({
        title: Joi.string().trim().min(1).max(254).required(),
        description: Joi.string().trim().max(1000).optional(),
        category: Joi.string().trim().min(1).max(100).required(),
        subcategory: Joi.string().trim().max(100).optional(),
        fileName: Joi.string().trim().min(1).max(254).required(),
        originalFileName: Joi.string().trim().min(1).max(254).required(),
        mimeType: Joi.string().trim().min(1).max(100).required(),
        fileSize: Joi.number().integer().min(1).required(),
        fileData: Joi.string().required(),
        version: Joi.string().trim().max(50).optional(),
        isPublic: Joi.boolean().optional(),
        allowedRoles: Joi.array().items(Joi.string()).optional(),
        tags: Joi.array().items(Joi.string()).optional(),
        effectiveDate: Joi.date().optional(),
        expiryDate: Joi.date().optional()
      })
    },
    update: {
      body: Joi.object({
        title: Joi.string().trim().min(1).max(254).optional(),
        description: Joi.string().trim().max(1000).optional(),
        category: Joi.string().trim().min(1).max(100).optional(),
        subcategory: Joi.string().trim().max(100).optional(),
        isPublic: Joi.boolean().optional(),
        allowedRoles: Joi.array().items(Joi.string()).optional(),
        tags: Joi.array().items(Joi.string()).optional(),
        effectiveDate: Joi.date().optional(),
        expiryDate: Joi.date().optional(),
        status: Joi.string().valid('ACTIVE', 'INACTIVE', 'ARCHIVED').optional()
      })
    },
    query: {
      query: Joi.object({
        category: Joi.string().trim().max(100).optional(),
        status: Joi.string().valid('ACTIVE', 'INACTIVE', 'ARCHIVED').optional(),
        search: Joi.string().trim().max(100).optional(),
        page: Joi.number().integer().min(1).optional(),
        limit: Joi.number().integer().min(1).max(100).optional()
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
