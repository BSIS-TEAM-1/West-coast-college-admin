/**
 * Promotion Policy Engine
 *
 * Evaluates student eligibility for promotion, retention, or graduation
 * based on configurable rules stored in SystemSetting.
 *
 * Rules are stored as JSON in SystemSetting under key 'promotionPolicy'.
 * Default rules are used if no configuration exists.
 */

const SystemSetting = require('../models/SystemSetting');

const DEFAULT_POLICY = {
  passingGrade: 3.0,
  requireAllGradesSubmitted: true,
  allowIncSubjects: false,
  requireRegistrarApproval: true,
  requireDeanApproval: false,
  finalYearLevel: 4,
  checkDisciplinaryHold: true,
};

const POLICY_KEY = 'promotionPolicy';

const PolicyActions = {
  PROMOTE: 'promote',
  RETAIN: 'retain',
  GRADUATE: 'graduate',
  REJECT: 'reject',
  SKIP: 'skip',
};

class PromotionPolicyEngine {
  /**
   * Load the active promotion policy from SystemSetting,
   * falling back to defaults.
   */
  static async loadPolicy() {
    const doc = await SystemSetting.findOne({ key: POLICY_KEY }).lean();
    return { ...DEFAULT_POLICY, ...(doc?.value || {}) };
  }

  /**
   * Save a new promotion policy configuration.
   */
  static async savePolicy(policyConfig, adminId) {
    return SystemSetting.findOneAndUpdate(
      { key: POLICY_KEY },
      { $set: { key: POLICY_KEY, value: policyConfig } },
      { upsert: true, new: true }
    );
  }

  /**
   * Evaluate a single student against the promotion policy.
   *
   * @param {Object} student - Student document with enrollment data
   * @param {Object} options - Override options (e.g., { registrarApproved, deanApproved })
   * @returns {Object} { action, reason, details }
   */
  static async evaluate(student, options = {}) {
    const policy = await PromotionPolicyEngine.loadPolicy();
    return PromotionPolicyEngine.evaluateWithPolicy(student, policy, options);
  }

  /**
   * Evaluate using an explicit policy object (avoids repeated DB lookups for batch evaluation).
   */
  static evaluateWithPolicy(student, policy, options = {}) {
    const details = {
      yearLevel: student.yearLevel,
      hasGrades: false,
      hasInc: false,
      hasFailingGrade: false,
      isFinalYear: false,
      registrarApproved: options.registrarApproved || false,
      deanApproved: options.deanApproved || false,
      hasDisciplinaryHold: options.hasDisciplinaryHold || false,
    };

    // Check grades from latest enrollment subjects
    const subjects = student.latestEnrollment?.subjects || student.subjects || [];
    if (subjects.length > 0) {
      const gradedSubjects = subjects.filter((s) => s.grade !== null && s.grade !== undefined);
      details.hasGrades = gradedSubjects.length === subjects.length;

      const incSubjects = subjects.filter((s) => s.status === 'Incomplete' || s.grade === null);
      details.hasInc = incSubjects.length > 0;

      const failingSubjects = gradedSubjects.filter((s) => s.grade > policy.passingGrade);
      details.hasFailingGrade = failingSubjects.length > 0;
    }

    details.isFinalYear = Number(student.yearLevel) >= policy.finalYearLevel;

    // Check disciplinary hold
    if (policy.checkDisciplinaryHold && details.hasDisciplinaryHold) {
      return {
        action: PolicyActions.REJECT,
        reason: 'Student has a pending disciplinary hold.',
        details,
      };
    }

    // Check INC subjects
    if (!policy.allowIncSubjects && details.hasInc) {
      return {
        action: PolicyActions.RETAIN,
        reason: 'Student has incomplete (INC) subjects.',
        details,
      };
    }

    // Check all grades submitted
    if (policy.requireAllGradesSubmitted && !details.hasGrades && subjects.length > 0) {
      return {
        action: PolicyActions.RETAIN,
        reason: 'Not all grades have been submitted.',
        details,
      };
    }

    // Check failing grades
    if (details.hasFailingGrade) {
      return {
        action: PolicyActions.RETAIN,
        reason: 'Student has failing grade(s).',
        details,
      };
    }

    // Check final year → graduation
    if (details.isFinalYear) {
      // Require registrar approval for graduation
      if (policy.requireRegistrarApproval && !details.registrarApproved) {
        return {
          action: PolicyActions.PROMOTE,
          reason: 'Final year student eligible for graduation pending registrar approval.',
          details,
        };
      }
      return {
        action: PolicyActions.GRADUATE,
        reason: 'Student has completed all requirements for graduation.',
        details,
      };
    }

    // Check registrar approval for promotion
    if (policy.requireRegistrarApproval && !details.registrarApproved) {
      return {
        action: PolicyActions.PROMOTE,
        reason: 'Student eligible for promotion pending registrar approval.',
        details,
      };
    }

    // Check dean approval if required
    if (policy.requireDeanApproval && !details.deanApproved) {
      return {
        action: PolicyActions.PROMOTE,
        reason: 'Student eligible for promotion pending dean approval.',
        details,
      };
    }

    // All checks passed → promote
    return {
      action: PolicyActions.PROMOTE,
      reason: 'Student meets all promotion requirements.',
      details,
    };
  }

  /**
   * Batch evaluate multiple students using a single loaded policy.
   */
  static async batchEvaluate(students, options = {}) {
    const policy = await PromotionPolicyEngine.loadPolicy();
    return students.map((student) => ({
      studentId: String(student._id),
      studentNumber: student.studentNumber,
      name: [student.firstName, student.lastName].filter(Boolean).join(' '),
      ...PromotionPolicyEngine.evaluateWithPolicy(student, policy, options),
    }));
  }
}

module.exports = PromotionPolicyEngine;
module.exports.PolicyActions = PolicyActions;
module.exports.DEFAULT_POLICY = DEFAULT_POLICY;
