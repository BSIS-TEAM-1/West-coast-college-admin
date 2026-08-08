/**
 * Domain Event Names — canonical list of all domain events.
 */
const DomainEvents = {
  // Student events
  STUDENT_ENROLLED: 'StudentEnrolled',
  ENROLLMENT_COMPLETED: 'EnrollmentCompleted',

  // Promotion events
  STUDENT_PROMOTED: 'StudentPromoted',
  STUDENT_RETAINED: 'StudentRetained',
  STUDENT_GRADUATED: 'StudentGraduated',

  // School year events
  SCHOOL_YEAR_OPENED: 'SchoolYearOpened',
  SCHOOL_YEAR_CLOSED: 'SchoolYearClosed',

  // Academic period events
  ACADEMIC_PERIOD_OPENED: 'AcademicPeriodOpened',
  ACADEMIC_PERIOD_CLOSED: 'AcademicPeriodClosed',

  // Block events
  BLOCK_CREATED: 'BlockCreated',
  BLOCK_ARCHIVED: 'BlockArchived',

  // Archive events
  SNAPSHOT_GENERATED: 'SnapshotGenerated',
  DOCUMENT_ARCHIVED: 'DocumentArchived',
  AUDIT_LOG_CREATED: 'AuditLogCreated',
};

module.exports = DomainEvents;
