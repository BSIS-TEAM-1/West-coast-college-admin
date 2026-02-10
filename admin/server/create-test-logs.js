const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const AuditLog = require('./models/AuditLog');
const Admin = require('./models/Admin');

async function createTestLogs() {
  try {
    // Get an admin user for the logs
    const admin = await Admin.findOne();
    if (!admin) {
      console.log('No admin found, skipping test log creation');
      return;
    }

    const testLogs = [
      {
        action: 'LOGIN',
        resourceType: 'ADMIN',
        resourceId: admin._id.toString(),
        resourceName: admin.username,
        description: 'Failed login attempt - invalid password',
        performedBy: admin._id,
        performedByRole: admin.accountType,
        status: 'FAILED',
        severity: 'HIGH'
      },
      {
        action: 'DELETE',
        resourceType: 'DOCUMENT',
        resourceId: 'doc123',
        resourceName: 'Important Document',
        description: 'Failed to delete document - permissions error',
        performedBy: admin._id,
        performedByRole: admin.accountType,
        status: 'FAILED',
        severity: 'CRITICAL'
      },
      {
        action: 'CREATE',
        resourceType: 'ADMIN',
        resourceId: 'admin456',
        resourceName: 'New Admin Account',
        description: 'Admin account creation failed - duplicate username',
        performedBy: admin._id,
        performedByRole: admin.accountType,
        status: 'FAILED',
        severity: 'MEDIUM'
      }
    ];

    // Insert test logs
    await AuditLog.insertMany(testLogs);
    console.log('Test error logs created successfully');
  } catch (error) {
    console.error('Error creating test logs:', error);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wcc-admin')
    .then(() => {
      console.log('Connected to MongoDB');
      return createTestLogs();
    })
    .then(() => {
      console.log('Test logs creation completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = { createTestLogs };
