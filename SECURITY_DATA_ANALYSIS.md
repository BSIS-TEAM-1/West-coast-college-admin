# Security Data Analysis - West Coast College Admin

## 📅 Date: February 11, 2026

---

## 🔍 **Security Data Analysis: Real vs Mock Data**

---

## 📊 **Current Implementation Status**

### **⚠️ ISSUE: Duplicate Security Metrics Endpoints**

There are **TWO** `/api/admin/security-metrics` endpoints in the codebase:

1. **Line 1583**: Uses **REAL data** from database
2. **Line 1977**: Uses **MOCK data** for demonstration

---

## 🔍 **Data Source Analysis**

### **✅ REAL Data Implementation (Line 1583)**

#### **Data Sources:**
```javascript
// REAL data from database
const [
  failedLogins,           // REAL: Count from AuditLog
  suspiciousActivity,     // REAL: Count from AuditLog  
  totalSessions,          // REAL: Count from AuditLog
  recentThreats           // REAL: Find from AuditLog
] = await Promise.all([
  AuditLog.countDocuments({ 
    action: 'LOGIN',
    status: 'FAILED',
    createdAt: { $gte: last24h }
  }),
  AuditLog.countDocuments({ 
    severity: { $in: ['HIGH', 'CRITICAL'] },
    createdAt: { $gte: last24h }
  }),
  AuditLog.distinct('performedBy', {
    action: 'LOGIN',
    status: 'SUCCESS',
    createdAt: { $gte: new Date(now.getTime() - 1 * 60 * 60 * 1000) }
  }).then(userIds => userIds.length),
  AuditLog.find({
    action: { $in: ['LOGIN', 'SECURITY_BREACH', 'UNAUTHORIZED_ACCESS'] },
    severity: { $in: ['HIGH', 'CRITICAL', 'MEDIUM'] },
    createdAt: { $gte: last24h }
  })
])
```

#### **Security Score Calculation:**
```javascript
// REAL calculation based on actual data
const securityScore = Math.max(0, Math.min(100, 
  100 - (failedLogins * 2) - (suspiciousActivity * 5) + (totalSessions * 1)
))
```

---

### **❌ MOCK Data Implementation (Line 1977)**

#### **Data Sources:**
```javascript
// MOCK data for demonstration
const [
  failedLogins,           // REAL: Count from AuditLog
  recentLogins,           // REAL: Count from AuditLog
  auditLogs,              // REAL: Find from AuditLog
  totalAdmins             // REAL: Count from Admin
] = await Promise.all([...])

// MOCK calculations
const blockedIPs = 0 // MOCK: Hardcoded value
const activeSessions = Math.floor(recentLogins * 0.7) // MOCK: Estimated
const securityScore = Math.max(0, Math.min(100, 100 - (failedLogins * 2) - (suspiciousActivity * 5)))

// MOCK threats generation
const recentThreats = [
  {
    id: '1',
    timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    type: 'Failed Login Attempt',
    severity: 'medium',
    description: 'Multiple failed login attempts from unknown IP',
    source: '192.168.1.100',
    status: 'active'
  }
  // ... more MOCK threats
]
```

---

## 🚨 **Issues Identified**

### **1. Duplicate Endpoints**
- **Problem**: Two endpoints with same route
- **Impact**: Only one will be executed (the first one defined)
- **Current**: Line 1583 endpoint will be used (REAL data)

### **2. Mixed Real/Mock Data**
- **Line 1583**: **100% REAL** data
- **Line 1977**: **Mixed REAL/MOCK** data
- **Problem**: Second endpoint has hardcoded mock values

### **3. Mock Data Elements**
```javascript
// MOCK values in second endpoint
const blockedIPs = 0 // Hardcoded mock value
const activeSessions = Math.floor(recentLogins * 0.7) // Estimated mock value
const recentThreats = [/* hardcoded mock threats */] // Completely mock
```

---

## 📊 **Data Breakdown**

### **✅ REAL Data Elements (Both Endpoints)**
- ✅ **Failed Logins**: Count from AuditLog (REAL)
- ✅ **Recent Logins**: Count from AuditLog (REAL)
- ✅ **Audit Logs**: Find from AuditLog (REAL)
- ✅ **Total Admins**: Count from Admin (REAL)
- ✅ **Security Score**: Calculated from real metrics (REAL)

### **❌ MOCK Data Elements (Second Endpoint Only)**
- ❌ **Blocked IPs**: Hardcoded `0` (MOCK)
- ❌ **Active Sessions**: Estimated calculation (MOCK)
- ❌ **Recent Threats**: Hardcoded array (MOCK)
- ❌ **Threat Details**: Mock timestamps and descriptions (MOCK)

---

## 🔧 **Recommendations**

### **1. Remove Duplicate Endpoint**
```javascript
// DELETE the second endpoint (lines 1977-2059)
// Keep only the first endpoint (lines 1583-1679)
```

### **2. Replace Mock Data with Real Data**
```javascript
// Replace blockedIPs with real data
const blockedIPs = await BlockedIP.countDocuments({ isActive: true })

// Replace activeSessions with real calculation
const activeSessions = await AuditLog.distinct('performedBy', {
  action: 'LOGIN',
  status: 'SUCCESS',
  createdAt: { $gte: new Date(now.getTime() - 1 * 60 * 60 * 1000) }
}).then(userIds => userIds.length)

// Replace recentThreats with real data
const recentThreats = await AuditLog.find({
  action: { $in: ['LOGIN', 'SECURITY_BREACH', 'UNAUTHORIZED_ACCESS'] },
  severity: { $in: ['HIGH', 'CRITICAL', 'MEDIUM'] },
  createdAt: { $gte: last24h }
})
```

### **3. Implement Real IP Blocking**
```javascript
// Add IP blocking functionality
const blockedIPs = await BlockedIP.countDocuments({ isActive: true })
```

---

## 📋 **Current Data Status**

### **Security Score: REAL**
- ✅ **Calculation**: Based on real failed logins and suspicious activity
- ✅ **Formula**: `100 - (failedLogins * 2) - (suspiciousActivity * 5) + (totalSessions * 1)`
- ✅ **Source**: Real AuditLog data

### **Security Metrics: REAL**
- ✅ **Failed Logins**: Real count from database
- ✅ **Suspicious Activity**: Real count from database
- ✅ **Total Sessions**: Real count from database
- ✅ **Recent Threats**: Real data from AuditLog

### **Security Metrics: MOCK**
- ❌ **Blocked IPs**: Hardcoded `0`
- ❌ **Active Sessions**: Estimated calculation
- ❌ **Threat Details**: Mock timestamps and descriptions

---

## 🎯 **Conclusion**

### **✅ Security Score is REAL**
The security score displayed in the admin panel is **100% REAL** and calculated from actual database data:
- Failed login attempts from AuditLog
- Suspicious activities from AuditLog  
- Active sessions from AuditLog
- Real-time calculations

### **⚠️ Some Metrics Use MOCK Data**
However, some security metrics use mock data:
- **Blocked IPs**: Currently hardcoded at `0`
- **Active Sessions**: Estimated calculation
- **Threat Details**: Some mock threat data

### **🔧 Fix Required**
The second security metrics endpoint should be removed and replaced with real data calculations to ensure all metrics are based on actual system activity.

---

## 📝 **Implementation Priority**

### **HIGH Priority**
- [ ] Remove duplicate security metrics endpoint
- [ ] Implement real blocked IP counting
- [ ] Replace mock threat data with real data

### **MEDIUM Priority**
- [ ] Improve active session calculation
- [ ] Add real-time threat detection
- [ ] Enhance security metrics accuracy

---

*This analysis shows that while the security score is real, some security metrics use mock data and should be replaced with real database calculations for complete accuracy.*
