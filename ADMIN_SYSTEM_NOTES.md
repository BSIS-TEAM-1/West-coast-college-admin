# West Coast College Admin System - Complete Documentation

## Last Updated: February 10, 2026

##  **System Overview**

The West Coast College Admin system is a comprehensive administrative platform built with React (TypeScript) frontend and Node.js/Express backend with MongoDB database. It provides complete control over college operations including user management, security monitoring, content management, and system health.


##  **Technical Architecture**

### **Frontend Stack**
- **Framework**: React 18 with TypeScript
- **Styling**: CSS with dark mode support
- **Icons**: Lucide React
- **State Management**: React Hooks
- **Authentication**: JWT-based with secure token storage

### **Backend Stack**
- **Runtime**: Node.js with Express
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT middleware
- **File Storage**: Local file system with organized structure
- **API**: RESTful endpoints with proper error handling



##  **Main Features Overview**

### **1. Dashboard**
- **Purpose**: Central hub for system overview
- **Features**:
  - System statistics at a glance
  - Quick navigation to all modules
  - User activity summaries
  - Recent announcements preview

### **2. System Health**
- **Purpose**: Real-time system monitoring and maintenance
- **Features**:
  - Live performance graphs with dynamic scaling
  - Server metrics (CPU, Memory, Disk usage)
  - Database connection monitoring
  - Comprehensive backup system:
    - Automated scheduled backups
    - Manual "Backup Now" functionality
    - Database metadata storage
    - Fallback to file-only backup
    - Backup history tracking
  - Terminal logs with reduced brightness for dark mode
  - System status indicators

### **3. Security**
- **Purpose**: Security monitoring and threat management
- **Features**:
  - Security metrics dashboard:
    - Failed Logins (24h)
    - Suspicious Activity count
    - Blocked IPs
    - Active Sessions
  - System Scan functionality (formerly Security Scan)
  - Threat detection and management
  - IP blocking/unblocking capabilities
  - Security audit logs
  - **Complete Dark Mode Support**:
    - Modal headers and content
    - Form elements and inputs
    - Table headers and cells
    - All text properly visible
    - High contrast for accessibility

### **4. Manage Announcements**
- **Purpose**: Content management and communication
- **Features**:
  - Create, edit, delete announcements
  - Target audience selection (All, Students, Faculty, Staff, Admins)
  - Announcement types (Info, Warning, Urgent, Maintenance)
  - Media file uploads (images, videos) with drag-and-drop
  - Pinning and scheduling capabilities
  - Advanced search and filtering
  - Bulk operations (archive, delete)
  - Engagement tracking (views, likes, comments, shares)

### **5. Document Management**
- **Purpose**: Centralized document repository
- **Features**:
  - Upload and organize institutional documents
  - File categorization
  - Access control
  - Version management

### **6. System Audit Logs**
- **Purpose**: Comprehensive activity tracking
- **Features**:
  - User activity monitoring
  - System event logging
  - Security event tracking
  - Searchable and filterable log history
  - Export capabilities

### **7. User Management**
- **Add Account**:
  - Create new user accounts
  - Role assignment (Admin, Faculty, Staff, Student)
  - Account type configuration
  - Initial password setup

- **Staff Registration Logs**:
  - Monitor staff account creation
  - Registration approval workflow
  - Staff onboarding tracking

### **8. Profile Management**
- **Purpose**: Personal account management
- **Features**:
  - Edit personal information
  - Change password with security validation
  - Update preferences
  - Profile picture management
  - Account settings

### **9. Settings**
- **Purpose**: System configuration
- **Features**:
  - System configuration options
  - Security settings management
  - Notification preferences
  - Theme settings (light/dark mode)
  - Backup configuration



##  **UI/UX Features**

### **Dark Mode Implementation**
- **Complete Coverage**: All modules support dark mode
- **Consistent Theming**: Uniform color scheme across the system
- **High Contrast**: Enhanced readability and accessibility
- **Recent Improvements**:
  - Fixed modal header backgrounds
  - Enhanced form element visibility
  - Improved text contrast in Security page
  - Fixed table styling in dark mode

### **Responsive Design**
- **Mobile-Friendly**: Optimized for all screen sizes
- **Modern Interface**: Clean, professional design
- **Smooth Animations**: Polished transitions and interactions
- **Intuitive Navigation**: Logical menu structure



##  **Security Features**

### **Authentication**
- **JWT-Based**: Secure token authentication
- **Role-Based Access**: Different permission levels
- **Session Management**: Secure session handling
- **Password Security**: Strong password requirements

### **Security Monitoring**
- **Real-time Threat Detection**: Active security scanning
- **IP Management**: Block/unblock suspicious IPs
- **Audit Trail**: Complete activity logging
- **System Scans**: Regular security assessments



##  **Data Management**

### **User Roles & Permissions**
- **Admin**: Full system access and configuration
- **Faculty**: Teaching-related features and student management
- **Staff**: Administrative support functions
- **Student**: Basic access to academic resources

### **Data Types Managed**
- User accounts and profiles
- Academic records and grades
- System logs and audit trails
- Announcements and communications
- Documents and media files
- Security events and incidents
- Backup data and system snapshots



##  **Recent Updates & Fixes**

### **February 10, 2026 - Dark Mode Enhancement**
- **Fixed Security Page Modal Issues**:
  - Modal header backgrounds now dark
  - Form elements properly themed
  - Text visibility enhanced with brighter colors
  - Table styling fixed for dark mode
  - Added `!important` declarations for override

- **TypeScript Error Resolution**:
  - Removed unused imports from Announcements.tsx
  - Fixed View type compatibility between Dashboard and Sidebar
  - Resolved unused parameter issues in Login.tsx
  - Fixed time range type inference in StatisticsCard.tsx

- **Code Quality Improvements**:
  - Cleaned up unused functions and variables
  - Enhanced type safety across components
  - Improved code maintainability

### **Previous Major Features**
- **Backup System Implementation**:
  - Database metadata storage
  - Fallback mechanisms
  - Automated scheduling
  - Manual backup creation

- **System Health Monitoring**:
  - Live graph updates
  - Dynamic scaling
  - Comprehensive metrics


## 📁 **File Structure**

### **Frontend Structure**

admin/src/
├── components/          # Reusable UI components
├── pages/              # Main application pages
├── lib/                # Utility functions and API calls
├── styles/             # Global styles and themes
└── assets/             # Static assets


### **Backend Structure**

admin/server/
├── models/             # MongoDB schemas
├── routes/             # API endpoints
├── middleware/         # Authentication and validation
├── backups/            # Backup storage (gitignored)
└── utils/              # Server utilities


##  **Deployment & Configuration**

### **Environment Variables**
- **Development**: `.env.development`
- **Production**: `.env.production`
- **Key Variables**: API URLs, JWT secrets, database connections

### **Git Configuration**
- **Repository**: West-coast-college-admin
- **Backup Files**: Excluded via .gitignore
- **Branch Strategy**: Main branch for production



##  **Maintenance & Support**

### **Regular Tasks**
- **Backup Monitoring**: Check backup success rates
- **Security Scans**: Run regular system scans
- **Log Review**: Monitor audit logs for anomalies
- **Performance Checks**: Monitor system health metrics

### **Troubleshooting**
- **Common Issues**: 
  - Database connection problems
  - Authentication token expiry
  - File upload limitations
  - Dark mode styling conflicts

### **Performance Optimization**
- **Database Indexing**: Optimized query performance
- **Caching Strategy**: Implemented where appropriate
- **Image Optimization**: Compressed media uploads
- **Bundle Optimization**: Minified production builds

---

##  **Support Information**

### **Technical Documentation**
- **Code Comments**: Comprehensive inline documentation
- **API Documentation**: RESTful endpoint specifications
- **Database Schema**: MongoDB model definitions

### **Future Enhancements**
- **Real-time Notifications**: WebSocket implementation
- **Advanced Analytics**: Enhanced reporting capabilities
- **Mobile App**: Native mobile application
- **Integration APIs**: Third-party system integration



##  **Notes for Developers**

### **Coding Standards**
- **TypeScript**: Strict type checking enabled
- **ESLint**: Code quality enforcement
- **Prettier**: Consistent code formatting
- **Git Hooks**: Pre-commit validation

### **Best Practices**
- **Component Structure**: Modular, reusable components
- **State Management**: Efficient React patterns
- **Error Handling**: Comprehensive error boundaries
- **Security**: Input validation and sanitization

### **Testing Strategy**
- **Unit Tests**: Component-level testing
- **Integration Tests**: API endpoint testing
- **E2E Tests**: User workflow testing
- **Security Tests**: Vulnerability scanning



*This document serves as a comprehensive guide for the West Coast College Admin system. Regular updates will be made as new features are added and improvements are implemented.*
