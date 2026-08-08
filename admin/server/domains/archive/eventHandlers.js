const eventBus = require('../shared/EventBus');
const DomainEvents = require('../shared/DomainEvents');
const ArchiveSnapshotRepository = require('./repositories/ArchiveSnapshotRepository');
const AuditLogRepository = require('./repositories/AuditLogRepository');

/**
 * Archive event handlers — react to domain events by generating
 * snapshots, audit logs, and archive entries.
 */

function registerArchiveEventHandlers() {
  // When a school year closes, generate enrollment snapshots
  eventBus.on(DomainEvents.SCHOOL_YEAR_CLOSED, async (event) => {
    const { schoolYear, rolloverBatchId, adminId } = event.payload;
    console.log(`[Archive] SchoolYearClosed event received for ${schoolYear}`);
    // Snapshot generation is handled by the rollover service itself,
    // but this handler could trigger additional report generation.
  });

  // When a student is promoted, write an audit log
  eventBus.on(DomainEvents.STUDENT_PROMOTED, async (event) => {
    const { studentId, studentNumber, fromYearLevel, toYearLevel, schoolYear, adminId } = event.payload;
    await AuditLogRepository.log({
      action: 'STUDENT_PROMOTED',
      resourceType: 'Student',
      resourceId: studentId,
      userId: adminId,
      newValues: { fromYearLevel, toYearLevel, schoolYear },
      status: 'success',
      severity: 'info',
      metadata: { studentNumber, rolloverBatchId: event.correlationId },
    });
  });

  // When a student is retained, write an audit log
  eventBus.on(DomainEvents.STUDENT_RETAINED, async (event) => {
    const { studentId, studentNumber, yearLevel, schoolYear, adminId } = event.payload;
    await AuditLogRepository.log({
      action: 'STUDENT_RETAINED',
      resourceType: 'Student',
      resourceId: studentId,
      userId: adminId,
      newValues: { yearLevel, schoolYear },
      status: 'success',
      severity: 'warning',
      metadata: { studentNumber, rolloverBatchId: event.correlationId },
    });
  });

  // When a student graduates, write an audit log
  eventBus.on(DomainEvents.STUDENT_GRADUATED, async (event) => {
    const { studentId, studentNumber, schoolYear, adminId } = event.payload;
    await AuditLogRepository.log({
      action: 'STUDENT_GRADUATED',
      resourceType: 'Student',
      resourceId: studentId,
      userId: adminId,
      newValues: { schoolYear },
      status: 'success',
      severity: 'info',
      metadata: { studentNumber, rolloverBatchId: event.correlationId },
    });
  });

  // When a snapshot is generated, log it
  eventBus.on(DomainEvents.SNAPSHOT_GENERATED, async (event) => {
    const { snapshotId, type, schoolYear, recordCount } = event.payload;
    console.log(`[Archive] Snapshot generated: ${type} for ${schoolYear} (${recordCount} records)`);
  });

  // When a student enrolls, write an audit log
  eventBus.on(DomainEvents.STUDENT_ENROLLED, async (event) => {
    const { studentId, studentNumber, schoolYear, semester, adminId } = event.payload;
    await AuditLogRepository.log({
      action: 'STUDENT_ENROLLED',
      resourceType: 'Enrollment',
      resourceId: studentId,
      userId: adminId,
      newValues: { schoolYear, semester },
      status: 'success',
      severity: 'info',
      metadata: { studentNumber },
    });
  });

  // When an enrollment is completed, write an audit log
  eventBus.on(DomainEvents.ENROLLMENT_COMPLETED, async (event) => {
    const { enrollmentId, studentId, schoolYear, adminId } = event.payload;
    await AuditLogRepository.log({
      action: 'ENROLLMENT_COMPLETED',
      resourceType: 'Enrollment',
      resourceId: enrollmentId,
      userId: adminId,
      newValues: { schoolYear, status: 'Completed' },
      status: 'success',
      severity: 'info',
      metadata: { studentId },
    });
  });

  // When a block is created, write an audit log
  eventBus.on(DomainEvents.BLOCK_CREATED, async (event) => {
    const { blockGroupId, blockName, schoolYear, adminId } = event.payload;
    await AuditLogRepository.log({
      action: 'BLOCK_CREATED',
      resourceType: 'BlockGroup',
      resourceId: blockGroupId,
      userId: adminId,
      newValues: { blockName, schoolYear },
      status: 'success',
      severity: 'info',
    });
  });

  console.log('[Archive] Event handlers registered');
}

module.exports = { registerArchiveEventHandlers };
