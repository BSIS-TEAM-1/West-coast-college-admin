# Database Schema Updates for Student Portal

## Overview

This document outlines the database schema changes required to support the student mobile portal, including updates to the existing Student model and creation of new collections for enhanced functionality.

## Student Model Updates

### Existing Student Model Fields
The current Student model (`server/models/Student.js`) contains:
- Identity: studentNumber, firstName, middleName, lastName, suffix
- Academic: course, major, yearLevel, section, scholarship, semester, schoolYear
- Status: studentStatus, lifecycleStatus, enrollmentStatus, corStatus
- Contact: email, contactNumber, address, permanentAddress
- Personal: birthDate, birthPlace, gender, civilStatus, nationality, religion
- Emergency: emergencyContact (name, relationship, contactNumber, address)
- Academic Records: latestGrade, gradeProfessor, gradeDate
- Assignments: assignedProfessor, schedule
- System: isActive, lastLogin, lastUpdated, createdBy, updatedBy

### New Fields to Add

#### Authentication Fields
```javascript
password: {
  type: String,
  required: true,
  select: false, // Don't return password in queries by default
  minlength: 8,
  validate: {
    validator: function(v) {
      // Password complexity requirements
      return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(v);
    },
    message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
  }
}

passwordResetToken: {
  type: String,
  select: false
}

passwordResetExpires: {
  type: Date,
  select: false
}

lastPasswordChange: {
  type: Date,
  default: null
}
```

#### Session Management
```javascript
lastLogin: {
  type: Date,
  default: null
}

loginAttempts: {
  type: Number,
  default: 0
}

lockUntil: {
  type: Date,
  default: null
}
```

#### Push Notification Management
```javascript
deviceTokens: [{
  deviceToken: {
    type: String,
    required: true
  },
  platform: {
    type: String,
    enum: ['ios', 'android'],
    required: true
  },
  deviceId: {
    type: String,
    required: true
  },
  appVersion: {
    type: String,
    default: null
  },
  registeredAt: {
    type: Date,
    default: Date.now
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}]
```

#### Notification Preferences
```javascript
notificationPreferences: {
  announcements: {
    enabled: {
      type: Boolean,
      default: true
    },
    types: [{
      type: String,
      enum: ['info', 'warning', 'urgent', 'maintenance']
    }]
  },
  grades: {
    enabled: {
      type: Boolean,
      default: true
    },
    onPost: {
      type: Boolean,
      default: true
    },
    onChange: {
      type: Boolean,
      default: true
    }
  },
  schedule: {
    enabled: {
      type: Boolean,
      default: true
    },
    onChange: {
      type: Boolean,
      default: true
    },
    reminders: {
      type: Boolean,
      default: true
    }
  },
  documents: {
    enabled: {
      type: Boolean,
      default: true
    },
    onAvailable: {
      type: Boolean,
      default: true
    }
  },
  quietHours: {
    enabled: {
      type: Boolean,
      default: false
    },
    startTime: {
      type: String,
      default: '22:00'
    },
    endTime: {
      type: String,
      default: '08:00'
    }
  }
}
```

#### Mobile App Settings
```javascript
mobileAppSettings: {
  biometricEnabled: {
    type: Boolean,
    default: false
  },
  theme: {
    type: String,
    enum: ['light', 'dark', 'auto'],
    default: 'auto'
  },
  language: {
    type: String,
    default: 'en'
  },
  lastAppVersion: {
    type: String,
    default: null
  }
}
```

## New Collections

### StudentGrade Collection
Detailed grade records for better tracking and historical analysis.

```javascript
const studentGradeSchema = new Schema({
  studentId: {
    type: Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  subjectCode: {
    type: String,
    required: true,
    trim: true
  },
  subjectName: {
    type: String,
    required: true,
    trim: true
  },
  grade: {
    type: Number,
    required: true,
    min: 1.0,
    max: 5.0
  },
  units: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  semester: {
    type: String,
    required: true,
    enum: ['1st', '2nd', 'Summer']
  },
  schoolYear: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{4}$/, 'Please enter a valid school year format (YYYY-YYYY)']
  },
  professorId: {
    type: Schema.Types.ObjectId,
    ref: 'Admin'
  },
  professorName: {
    type: String,
    trim: true
  },
  gradeDate: {
    type: Date,
    default: Date.now
  },
  remarks: {
    type: String,
    enum: ['Passed', 'Failed', 'Incomplete', 'Dropped'],
    default: 'Passed'
  },
  isFinal: {
    type: Boolean,
    default: true
  },
  midtermGrade: {
    type: Number,
    min: 1.0,
    max: 5.0
  },
  finalGrade: {
    type: Number,
    min: 1.0,
    max: 5.0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
studentGradeSchema.index({ studentId: 1, semester: 1, schoolYear: 1 });
studentGradeSchema.index({ studentId: 1, subjectCode: 1 });
studentGradeSchema.index({ schoolYear: 1, semester: 1 });
studentGradeSchema.index({ gradeDate: -1 });

module.exports = mongoose.model('StudentGrade', studentGradeSchema);
```

### StudentDocument Collection
Track document requests and availability for students.

```javascript
const studentDocumentSchema = new Schema({
  studentId: {
    type: Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  documentType: {
    type: String,
    required: true,
    enum: ['COR', 'Transcript', 'Certificate', 'Diploma', 'GoodMoral', 'Other']
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  fileUrl: {
    type: String,
    trim: true
  },
  fileName: {
    type: String,
    trim: true
  },
  fileSize: {
    type: Number
  },
  mimeType: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['available', 'pending', 'processing', 'rejected', 'expired'],
    default: 'pending'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  issuedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  },
  issuedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin'
  },
  purpose: {
    type: String,
    trim: true
  },
  copies: {
    type: Number,
    default: 1
  },
  fee: {
    type: Number,
    default: 0
  },
  feePaid: {
    type: Boolean,
    default: false
  },
  remarks: {
    type: String,
    trim: true
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  lastDownloadedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
studentDocumentSchema.index({ studentId: 1, status: 1 });
studentDocumentSchema.index({ studentId: 1, documentType: 1 });
studentDocumentSchema.index({ status: 1, requestedAt: -1 });
studentDocumentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('StudentDocument', studentDocumentSchema);
```

### StudentNotification Collection
Track notification history and delivery status.

```javascript
const studentNotificationSchema = new Schema({
  studentId: {
    type: Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  announcementId: {
    type: Schema.Types.ObjectId,
    ref: 'Announcement'
  },
  type: {
    type: String,
    required: true,
    enum: ['announcement', 'grade', 'schedule', 'document', 'system']
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  data: {
    type: Schema.Types.Mixed,
    default: {}
  },
  deliveryStatus: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed'],
    default: 'pending'
  },
  sentAt: {
    type: Date,
    default: null
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  readAt: {
    type: Date,
    default: null
  },
  deviceId: {
    type: String,
    trim: true
  },
  error: {
    type: String,
    trim: true
  },
  expiresAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
studentNotificationSchema.index({ studentId: 1, createdAt: -1 });
studentNotificationSchema.index({ studentId: 1, readAt: 1 });
studentNotificationSchema.index({ deliveryStatus: 1, createdAt: -1 });
studentNotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('StudentNotification', studentNotificationSchema);
```

## Migration Script

### Migration File: `migrations/20250804_add_student_portal_fields.js`

```javascript
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Student = require('../models/Student');
const { logger } = require('../services/logger');

async function migrate() {
  try {
    logger.info('Starting student portal migration...');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Add new fields to existing Student documents
    const result = await Student.updateMany(
      {}, // Match all documents
      {
        $setOnInsert: {
          // Set default password for existing students
          // They will need to reset it on first login
          password: await bcrypt.hash('TempPassword123!', 10),
          passwordResetRequired: true,
          
          // Initialize session management fields
          lastLogin: null,
          loginAttempts: 0,
          lockUntil: null,
          
          // Initialize empty arrays and objects
          deviceTokens: [],
          notificationPreferences: {
            announcements: {
              enabled: true,
              types: ['info', 'warning', 'urgent', 'maintenance']
            },
            grades: {
              enabled: true,
              onPost: true,
              onChange: true
            },
            schedule: {
              enabled: true,
              onChange: true,
              reminders: true
            },
            documents: {
              enabled: true,
              onAvailable: true
            },
            quietHours: {
              enabled: false,
              startTime: '22:00',
              endTime: '08:00'
            }
          },
          mobileAppSettings: {
            biometricEnabled: false,
            theme: 'auto',
            language: 'en',
            lastAppVersion: null
          }
        }
      }
    );

    logger.info(`Updated ${result.modifiedCount} student documents`);

    // Create indexes for new collections
    logger.info('Creating indexes for new collections...');
    
    // StudentGrade indexes will be created automatically when model is loaded
    // StudentDocument indexes will be created automatically when model is loaded
    // StudentNotification indexes will be created automatically when model is loaded

    logger.info('Migration completed successfully');
    
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrate;
```

## Rollback Plan

### Rollback Script: `migrations/rollback_20250804_student_portal.js`

```javascript
const mongoose = require('mongoose');
const Student = require('../models/Student');
const StudentGrade = require('../models/StudentGrade');
const StudentDocument = require('../models/StudentDocument');
const StudentNotification = require('../models/StudentNotification');
const { logger } = require('../services/logger');

async function rollback() {
  try {
    logger.info('Starting student portal rollback...');

    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Remove new fields from Student documents
    const result = await Student.updateMany(
      {},
      {
        $unset: {
          password: 1,
          passwordResetToken: 1,
          passwordResetExpires: 1,
          lastPasswordChange: 1,
          loginAttempts: 1,
          lockUntil: 1,
          deviceTokens: 1,
          notificationPreferences: 1,
          mobileAppSettings: 1
        }
      }
    );

    logger.info(`Removed new fields from ${result.modifiedCount} student documents`);

    // Drop new collections
    await StudentGrade.deleteMany({});
    await StudentDocument.deleteMany({});
    await StudentNotification.deleteMany({});

    logger.info('Cleared data from new collections');

    logger.info('Rollback completed successfully');
    
  } catch (error) {
    logger.error('Rollback failed:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  rollback()
    .then(() => {
      console.log('Rollback completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Rollback failed:', error);
      process.exit(1);
    });
}

module.exports = rollback;
```

## Testing Strategy

### Unit Tests
- Test Student model validation with new fields
- Test password hashing and verification
- Test device token array operations
- Test notification preferences validation

### Integration Tests
- Test student authentication with new password field
- Test device registration and unregistration
- Test notification delivery with new preferences
- Test document tracking with new collection

### Migration Tests
- Test migration on sample data
- Test rollback functionality
- Test data integrity after migration
- Test performance impact of new indexes

## Performance Considerations

### Index Impact
- New indexes on Student model may slow down write operations
- Monitor insert/update performance after migration
- Consider compound indexes for common query patterns

### Array Field Performance
- `deviceTokens` array may grow large; consider limiting size
- Implement cleanup for inactive device tokens
- Add index on `deviceTokens.isActive` for efficient queries

### TTL Indexes
- Use TTL indexes for `StudentNotification.expiresAt` to auto-expire old notifications
- Monitor TTL index performance and storage impact

## Security Considerations

### Password Security
- All passwords hashed with bcrypt (cost factor: 10)
- Password reset tokens have expiration
- Account lockout after failed attempts
- Password complexity requirements enforced

### Data Privacy
- Device tokens stored securely with encryption at rest
- Notification preferences respect user privacy settings
- Audit trail for document access and downloads

### Access Control
- Students can only access their own data
- Device tokens tied to specific student accounts
- Notification delivery respects user preferences

## Monitoring

### Database Metrics
- Monitor Student collection size and growth
- Track device token registration/unregistration rates
- Monitor notification delivery success rates
- Track document request and processing times

### Performance Metrics
- Monitor query performance with new indexes
- Track migration execution time
- Monitor storage impact of new collections
- Track backup/restore performance with new schema

### Security Metrics
- Monitor failed authentication attempts
- Track password reset requests
- Monitor unusual device registration patterns
- Track data access patterns for anomalies