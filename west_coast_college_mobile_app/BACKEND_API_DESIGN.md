# West Coast College Student Portal - Backend API Design

## Overview

This document outlines the backend API design for the student mobile portal, including student authentication, student-specific endpoints, and integration with the existing WCC-Admin system.

## Authentication System

### Student Authentication Flow

1. **Login Request**
   - Endpoint: `POST /api/student/login`
   - Input: Student number + password
   - Process: Validate credentials, generate JWT tokens
   - Output: Access token, refresh token, student profile

2. **Token Validation**
   - Middleware validates JWT on protected routes
   - Checks token expiration and student role
   - Automatically refresh expired tokens using refresh token

3. **Logout**
   - Endpoint: `POST /api/student/logout`
   - Invalidates current session tokens
   - Removes device from push notification registry

### JWT Token Structure

#### Access Token
```json
{
  "sub": "student_id",
  "studentNumber": "2025-101001",
  "role": "student",
  "iat": 1234567890,
  "exp": 1234571490
}
```

#### Refresh Token
```json
{
  "sub": "student_id",
  "studentNumber": "2025-101001",
  "type": "refresh",
  "iat": 1234567890,
  "exp": 1237161890
}
```

## Student-Specific API Endpoints

### Authentication Endpoints

#### POST /api/student/login
Authenticate student with credentials.

**Request:**
```json
{
  "studentNumber": "2025-101001",
  "password": "securePassword123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "student": {
      "id": "507f1f77bcf86cd799439011",
      "studentNumber": "2025-101001",
      "firstName": "John",
      "lastName": "Doe",
      "course": 101,
      "yearLevel": 1,
      "section": "A",
      "lifecycleStatus": "Enrolled"
    }
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Invalid student number or password"
}
```

#### POST /api/student/logout
Logout current student session.

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### POST /api/student/refresh-token
Refresh access token using refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}
```

### Student Data Endpoints

#### GET /api/student/me
Get current student's profile information.

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "studentNumber": "2025-101001",
    "firstName": "John",
    "middleName": "Marie",
    "lastName": "Doe",
    "suffix": null,
    "course": 101,
    "major": null,
    "yearLevel": 1,
    "section": "A",
    "scholarship": "N/A",
    "semester": "1st",
    "schoolYear": "2025-2026",
    "studentStatus": "Regular",
    "lifecycleStatus": "Enrolled",
    "enrollmentStatus": "Enrolled",
    "corStatus": "Verified",
    "email": "john.doe@email.com",
    "contactNumber": "+639123456789",
    "address": "123 Main St, City",
    "permanentAddress": null,
    "birthDate": "2000-01-15",
    "birthPlace": "City Hospital",
    "gender": "Male",
    "civilStatus": "Single",
    "nationality": "Filipino",
    "religion": "Catholic",
    "emergencyContact": {
      "name": "Jane Doe",
      "relationship": "Mother",
      "contactNumber": "+639987654321",
      "address": "123 Main St, City"
    },
    "assignedProfessor": null,
    "schedule": null,
    "latestGrade": 1.75,
    "gradeProfessor": "Prof. Smith",
    "gradeDate": "2025-06-15",
    "isActive": true,
    "lastLogin": "2025-08-04T10:30:00Z"
  }
}
```

#### GET /api/student/schedule
Get student's class schedule.

**Headers:**
```
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `semester` (optional): Filter by semester (1st, 2nd, Summer)
- `schoolYear` (optional): Filter by school year (YYYY-YYYY)

**Response:**
```json
{
  "success": true,
  "data": {
    "semester": "1st",
    "schoolYear": "2025-2026",
    "schedule": [
      {
        "id": "schedule_001",
        "subjectCode": "MATH101",
        "subjectName": "College Algebra",
        "professorName": "Prof. John Smith",
        "professorId": "prof_001",
        "room": "Room 101",
        "dayOfWeek": "Monday",
        "startTime": "08:00",
        "endTime": "10:00",
        "section": "101-1A",
        "course": 101,
        "yearLevel": 1,
        "units": 3
      },
      {
        "id": "schedule_002",
        "subjectCode": "ENG101",
        "subjectName": "English Communication",
        "professorName": "Prof. Mary Johnson",
        "professorId": "prof_002",
        "room": "Room 102",
        "dayOfWeek": "Monday",
        "startTime": "10:00",
        "endTime": "12:00",
        "section": "101-1A",
        "course": 101,
        "yearLevel": 1,
        "units": 3
      }
    ]
  }
}
```

#### GET /api/student/grades
Get student's grades by semester.

**Headers:**
```
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `semester` (optional): Filter by semester
- `schoolYear` (optional): Filter by school year

**Response:**
```json
{
  "success": true,
  "data": {
    "currentSemester": {
      "semester": "1st",
      "schoolYear": "2025-2026",
      "gpa": 1.75,
      "unitsCompleted": 18,
      "grades": [
        {
          "id": "grade_001",
          "subjectCode": "MATH101",
          "subjectName": "College Algebra",
          "grade": 1.5,
          "units": 3,
          "professor": "Prof. John Smith",
          "gradeDate": "2025-06-15",
          "remarks": "Passed"
        },
        {
          "id": "grade_002",
          "subjectCode": "ENG101",
          "subjectName": "English Communication",
          "grade": 2.0,
          "units": 3,
          "professor": "Prof. Mary Johnson",
          "gradeDate": "2025-06-15",
          "remarks": "Passed"
        }
      ]
    },
    "history": [
      {
        "semester": "2nd",
        "schoolYear": "2024-2025",
        "gpa": 1.85,
        "unitsCompleted": 21
      }
    ]
  }
}
```

#### GET /api/student/documents
Get available documents for student.

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "doc_001",
        "documentType": "COR",
        "title": "Certificate of Registration",
        "description": "Official enrollment certificate for current semester",
        "fileUrl": "https://api.wcc.edu/documents/cor_2025-101001.pdf",
        "issuedDate": "2025-06-01",
        "status": "available",
        "expiryDate": null
      },
      {
        "id": "doc_002",
        "documentType": "Transcript",
        "title": "Official Transcript of Records",
        "description": "Complete academic record",
        "fileUrl": null,
        "issuedDate": null,
        "status": "pending",
        "expiryDate": null
      }
    ]
  }
}
```

#### GET /api/student/announcements
Get announcements targeted to students.

**Headers:**
```
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `limit` (optional): Number of announcements to return (default: 20)
- `offset` (optional): Pagination offset (default: 0)
- `type` (optional): Filter by type (info, warning, urgent, maintenance)

**Response:**
```json
{
  "success": true,
  "data": {
    "announcements": [
      {
        "id": "ann_001",
        "title": "Midterm Examination Schedule",
        "message": "Midterm examinations will start on October 15, 2025. Please check your individual schedules.",
        "type": "info",
        "priority": "normal",
        "createdAt": "2025-08-01T10:00:00Z",
        "expiresAt": "2025-10-20T23:59:59Z",
        "isActive": true,
        "isPinned": true,
        "tags": ["academic", "exams"],
        "createdBy": {
          "username": "registrar",
          "displayName": "Registrar Office"
        },
        "media": []
      },
      {
        "id": "ann_002",
        "title": "Holiday Announcement",
        "message": "The college will be closed on August 30, 2025 in observance of National Heroes Day.",
        "type": "urgent",
        "priority": "high",
        "createdAt": "2025-08-03T14:00:00Z",
        "expiresAt": "2025-08-31T23:59:59Z",
        "isActive": true,
        "isPinned": true,
        "tags": ["holiday", "closure"],
        "createdBy": {
          "username": "admin",
          "displayName": "Administration"
        },
        "media": []
      }
    ],
    "total": 45,
    "limit": 20,
    "offset": 0
  }
}
```

### Push Notification Endpoints

#### POST /api/student/notifications/register
Register device for push notifications.

**Headers:**
```
Authorization: Bearer {access_token}
```

**Request:**
```json
{
  "deviceToken": "firebase_device_token_here",
  "platform": "ios", // or "android"
  "deviceId": "unique_device_identifier"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device registered successfully"
}
```

#### DELETE /api/student/notifications/unregister
Unregister device from push notifications.

**Headers:**
```
Authorization: Bearer {access_token}
```

**Request:**
```json
{
  "deviceToken": "firebase_device_token_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device unregistered successfully"
}
```

## Error Response Format

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "message": "Error message describing what went wrong",
  "errorCode": "ERROR_CODE",
  "details": {
    "field": "Additional error details"
  }
}
```

### Common Error Codes

- `AUTH_INVALID_CREDENTIALS`: Invalid student number or password
- `AUTH_TOKEN_EXPIRED`: Access token has expired
- `AUTH_TOKEN_INVALID`: Invalid or malformed token
- `AUTH_UNAUTHORIZED`: User not authorized for this resource
- `STUDENT_NOT_FOUND`: Student record not found
- `STUDENT_NOT_ENROLLED`: Student is not currently enrolled
- `VALIDATION_ERROR`: Input validation failed
- `SERVER_ERROR`: Internal server error
- `RATE_LIMIT_EXCEEDED`: Too many requests

## Rate Limiting

### Student Endpoints
- **Window**: 15 minutes
- **Limit**: 100 requests per window per student
- **Burst**: 20 requests per minute

### Authentication Endpoints
- **Window**: 1 hour
- **Limit**: 10 login attempts per IP
- **Lockout**: 15 minutes after 5 failed attempts

## Security Headers

All API responses include security headers:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

## Integration with Existing System

### Student Model Updates
The existing Student model will be extended with:
- `password` field (hashed using bcrypt)
- `lastLogin` timestamp
- `deviceTokens` array for push notification registration
- `notificationPreferences` object

### Authorization Middleware
New student role will be added to the existing authorization system:
- `requireStudentRole()` middleware for student-only endpoints
- `requireAnyRole('admin', 'registrar', 'student')` for shared endpoints
- Student role has read-only access to their own data

### Existing Endpoint Reuse
Some existing registrar endpoints will be adapted for student access:
- Student profile data (read-only)
- Schedule information (filtered by student)
- Grade information (filtered by student)
- Document access (filtered by student availability)

### Announcement System Integration
Student announcements will leverage the existing announcement system:
- Filter announcements by `targetAudience` including students
- Use existing announcement types and priorities
- Leverage existing announcement media support

## Database Schema Updates

### Student Model Additions
```javascript
{
  // ... existing fields
  
  // New authentication fields
  password: {
    type: String,
    required: true,
    select: false // Don't return in queries by default
  },
  
  // Session management
  lastLogin: {
    type: Date,
    default: null
  },
  
  // Push notification management
  deviceTokens: [{
    deviceToken: String,
    platform: String,
    deviceId: String,
    registeredAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // Notification preferences
  notificationPreferences: {
    announcements: {
      type: Boolean,
      default: true
    },
    grades: {
      type: Boolean,
      default: true
    },
    schedule: {
      type: Boolean,
      default: true
    },
    documents: {
      type: Boolean,
      default: true
    }
  }
}
```

## Migration Strategy

### Phase 1: Database Schema Update
1. Add new fields to Student model
2. Create migration script for existing students
3. Set temporary passwords for existing students
4. Test migration on staging environment

### Phase 2: Authentication System
1. Implement student authentication controller
2. Add JWT token generation/validation
3. Create student-specific middleware
4. Test authentication flow

### Phase 3: Student Endpoints
1. Implement student-specific endpoints
2. Adapt existing endpoints for student access
3. Add proper error handling
4. Test all endpoints with student role

### Phase 4: Push Notifications
1. Set up Firebase project
2. Implement push notification service
3. Add device registration endpoints
4. Test notification delivery

## Monitoring and Logging

### API Logging
- Log all authentication attempts
- Log API access with student identification
- Log errors with detailed context
- Monitor rate limiting violations

### Performance Monitoring
- Track API response times
- Monitor database query performance
- Track token refresh rates
- Monitor push notification delivery rates

### Security Monitoring
- Monitor failed authentication attempts
- Track unusual activity patterns
- Monitor token expiration patterns
- Log all authorization failures