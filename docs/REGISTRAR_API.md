# Registrar Module API Documentation

This document outlines the API endpoints for the Registrar Module of the WCConnect Enrollment System.

## Base URL
All API endpoints are prefixed with `/api/registrar`.

## Authentication
All endpoints require authentication. Include a valid JWT token in the `Authorization` header:
```
Authorization: Bearer <your-jwt-token>
```

## Student Management

### Create Student Account
```
POST /api/registrar/students
```

**Request Body:**
```json
{
  "firstName": "John",
  "middleName": "Middle",
  "lastName": "Doe",
  "suffix": "Jr",
  "course": "BSIT",
  "yearLevel": 1,
  "semester": "1st",
  "schoolYear": "2024-2025",
  "email": "john.doe@example.com",
  "contactNumber": "09123456789",
  "address": "123 Main St, City",
  "status": "New"
}
```

**Response (Success - 201):**
```json
{
  "success": true,
  "data": {
    "_id": "5f8d0d55b54764421b4396e1",
    "studentNumber": "2024-BSIT-00001",
    "firstName": "John",
    "middleName": "Middle",
    "lastName": "Doe",
    "suffix": "Jr",
    "course": "BSIT",
    "yearLevel": 1,
    "semester": "1st",
    "schoolYear": "2024-2025",
    "email": "john.doe@example.com",
    "contactNumber": "09123456789",
    "address": "123 Main St, City",
    "status": "New",
    "isActive": true,
    "createdAt": "2024-02-13T09:00:00.000Z"
  },
  "message": "Student account created successfully"
}
```

### Get Student by ID
```
GET /api/registrar/students/:id
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "_id": "5f8d0d55b54764421b4396e1",
    "studentNumber": "2024-BSIT-00001",
    "firstName": "John",
    "middleName": "Middle",
    "lastName": "Doe",
    "suffix": "Jr",
    "course": "BSIT",
    "yearLevel": 1,
    "semester": "1st",
    "schoolYear": "2024-2025",
    "email": "john.doe@example.com",
    "contactNumber": "09123456789",
    "address": "123 Main St, City",
    "status": "New",
    "isActive": true,
    "createdAt": "2024-02-13T09:00:00.000Z"
  }
}
```

### Get Student by Student Number
```
GET /api/registrar/students/number/:studentNumber
```

**Response (Success - 200):**
Same as Get Student by ID

### Update Student Information
```
PUT /api/registrar/students/:id
```

**Request Body:**
```json
{
  "contactNumber": "09187654321",
  "address": "456 New St, City"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "_id": "5f8d0d55b54764421b4396e1",
    "studentNumber": "2024-BSIT-00001",
    "contactNumber": "09187654321",
    "address": "456 New St, City"
    // ... other fields
  },
  "message": "Student information updated successfully"
}
```

## Enrollment Management

### Enroll Student in Courses
```
POST /api/registrar/students/:id/enroll
```

**Request Body:**
```json
{
  "schoolYear": "2024-2025",
  "semester": "1st",
  "subjectIds": ["subj1", "subj2", "subj3"]
}
```

**Response (Success - 201):**
```json
{
  "success": true,
  "data": {
    "_id": "5f8d0d55b54764421b4396f1",
    "studentId": "5f8d0d55b54764421b4396e1",
    "schoolYear": "2024-2025",
    "semester": "1st",
    "subjects": [
      {
        "subjectId": "subj1",
        "code": "CS101",
        "title": "Introduction to Programming",
        "units": 3,
        "schedule": "MWF 8:00-9:30 AM",
        "room": "CS101",
        "instructor": "Prof. Smith",
        "status": "Enrolled"
      }
    ],
    "totalUnits": 15,
    "assessment": {
      "tuitionFee": 15000,
      "miscFee": 5000,
      "otherFees": 0,
      "totalAmount": 20000,
      "paymentStatus": "Unpaid"
    },
    "status": "Pending",
    "createdAt": "2024-02-13T09:15:00.000Z",
    "updatedAt": "2024-02-13T09:15:00.000Z"
  },
  "message": "Enrollment successful"
}
```

### Get Student's Current Enrollment
```
GET /api/registrar/students/:id/current-enrollment?schoolYear=2024-2025&semester=1st
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "_id": "5f8d0d55b54764421b4396f1",
    "studentId": "5f8d0d55b54764421b4396e1",
    "schoolYear": "2024-2025",
    "semester": "1st",
    "subjects": [
      {
        "subjectId": "subj1",
        "code": "CS101",
        "title": "Introduction to Programming",
        "units": 3,
        "schedule": "MWF 8:00-9:30 AM",
        "room": "CS101",
        "instructor": "Prof. Smith",
        "status": "Enrolled"
      }
    ],
    "totalUnits": 15,
    "assessment": {
      "tuitionFee": 15000,
      "miscFee": 5000,
      "otherFees": 0,
      "totalAmount": 20000,
      "paymentStatus": "Unpaid"
    },
    "status": "Enrolled",
    "createdAt": "2024-02-13T09:15:00.000Z",
    "updatedAt": "2024-02-13T09:20:00.000Z"
  }
}
```

### Get Student's Enrollment History
```
GET /api/registrar/students/:id/enrollments
```

**Response (Success - 200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "5f8d0d55b54764421b4396f1",
      "schoolYear": "2024-2025",
      "semester": "1st",
      "status": "Enrolled",
      "totalUnits": 15,
      "createdAt": "2024-02-13T09:15:00.000Z"
    },
    {
      "_id": "5f8d0d55b54764421b4397f1",
      "schoolYear": "2023-2024",
      "semester": "2nd",
      "status": "Completed",
      "totalUnits": 18,
      "createdAt": "2023-10-15T08:00:00.000Z"
    }
  ]
}
```

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation error message"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Student not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

## Data Validation

### Student Status
- `New` - New student
- `Old` - Continuing student
- `Transferee` - Student transferring from another school

### Semester
- `1st` - First Semester
- `2nd` - Second Semester
- `Summer` - Summer Term

### Enrollment Status
- `Pending` - Enrollment is being processed
- `Enrolled` - Successfully enrolled
- `Dropped` - Student has dropped the enrollment
- `Completed` - Enrollment is completed

### Payment Status
- `Unpaid` - No payment received
- `Partially Paid` - Partial payment received
- `Fully Paid` - Full payment received

## Rate Limiting
API requests are limited to 100 requests per 15 minutes per IP address.
