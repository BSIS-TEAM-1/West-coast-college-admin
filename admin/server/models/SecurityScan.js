const mongoose = require('mongoose');

const securityScanSchema = new mongoose.Schema({
  scanId: {
    type: String,
    required: true,
    unique: true,
    default: () => `scan-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  },
  scanType: {
    type: String,
    enum: ['full', 'headers', 'quick'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  duration: {
    type: Number, // in milliseconds
    required: true
  },
  status: {
    type: String,
    enum: ['completed', 'in-progress', 'failed'],
    default: 'in-progress'
  },
  success: Boolean,
  summary: {
    score: Number,
    grade: String,
    total: Number,
    critical: Number,
    high: Number,
    medium: Number,
    low: Number,
    info: Number,
    criticalIssues: Number,
    warnings: Number,
    headersChecked: Number,
    headersPassed: Number
  },
  findings: [{
    severity: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'info'],
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: String,
    category: String,
    status: {
      type: String,
      enum: ['pass', 'fail'],
      default: 'fail' // Default to 'fail' if not provided
    },
    recommendation: String
  }],
  recommendations: [{
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      required: true
    },
    action: String,
    details: String
  }],
  securityHeaders: mongoose.Schema.Types.Mixed,
  serverUrl: String,
  error: String
}, { timestamps: true });

// Index for faster queries
securityScanSchema.index({ timestamp: -1 });
securityScanSchema.index({ scanType: 1 });
securityScanSchema.index({ status: 1 });

// Static method to get the latest scan
securityScanSchema.statics.getLatestScan = async function(scanType = 'full') {
  try {
    return await this.findOne({ scanType })
      .sort({ timestamp: -1 })
      .lean();
  } catch (error) {
    console.error('Error in getLatestScan:', error);
    throw error;
  }
};

// Add pre-save hook to validate data before saving
securityScanSchema.pre('save', function(next) {
  try {
    // Ensure findings have required fields
    if (this.findings && Array.isArray(this.findings)) {
      this.findings = this.findings.map(finding => ({
        severity: finding.severity || 'info', // Default to 'info' if not provided
        title: finding.title || 'Untitled Finding',
        description: finding.description || '',
        category: finding.category || 'General',
        status: finding.status || 'fail', // Default to 'fail' if not provided
        recommendation: finding.recommendation || ''
      }));
    }
    
    // Ensure summary has required fields
    if (this.summary) {
      this.summary = {
        score: this.summary.score || 0,
        grade: this.summary.grade || 'F',
        total: this.summary.total || 0,
        critical: this.summary.critical || 0,
        high: this.summary.high || 0,
        medium: this.summary.medium || 0,
        low: this.summary.low || 0,
        info: this.summary.info || 0,
        criticalIssues: this.summary.criticalIssues || 0,
        warnings: this.summary.warnings || 0,
        headersChecked: this.summary.headersChecked || 0,
        headersPassed: this.summary.headersPassed || 0
      };
    }
    
    next();
  } catch (error) {
    console.error('Error in pre-save hook:', error);
    next(error);
  }
});

module.exports = mongoose.model('SecurityScan', securityScanSchema);
