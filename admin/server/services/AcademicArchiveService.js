/**
 * AcademicArchiveService
 *
 * Builds immutable, point-in-time archive snapshots for student records,
 * grade data, and rollover decisions during an Academic Year Rollover.
 *
 * All methods are pure builders: they accept already-loaded data and return
 * snapshot payloads ready to be inserted via ArchiveSnapshot.create().
 */
class AcademicArchiveService {
  /**
   * Build a STUDENT_ARCHIVE snapshot containing the closing-year student
   * records for every student touched by the rollover.
   */
  static buildStudentArchive(closingStudents, context) {
    const { fromSchoolYear, toSchoolYear, targetSemester } = context;
    return {
      type: 'STUDENT_ARCHIVE',
      title: `Student Archive - SY ${fromSchoolYear}`,
      data: {
        schoolYear: fromSchoolYear,
        newSchoolYear: toSchoolYear,
        semester: targetSemester,
        recordCount: closingStudents.length,
        students: closingStudents.map((student) => this.sanitizeStudent(student)),
      },
    };
  }

  /**
   * Build a GRADES_ARCHIVE snapshot containing the closing-year grade data
   * for every student touched by the rollover.
   */
  static buildGradesArchive(closingStudents, closingEnrollments, context) {
    const { fromSchoolYear, toSchoolYear, targetSemester } = context;
    const enrollmentByStudent = new Map();
    for (const enrollment of closingEnrollments) {
      const studentId = String(enrollment.studentId ?? enrollment.student?._id ?? enrollment.studentId);
      if (!enrollmentByStudent.has(studentId)) {
        enrollmentByStudent.set(studentId, enrollment);
      }
    }

    return {
      type: 'GRADES_ARCHIVE',
      title: `Grades Archive - SY ${fromSchoolYear}`,
      data: {
        schoolYear: fromSchoolYear,
        newSchoolYear: toSchoolYear,
        semester: targetSemester,
        recordCount: closingStudents.length,
        grades: closingStudents.map((student) => {
          const raw = this.sanitizeStudent(student);
          const enrollment = enrollmentByStudent.get(raw._id);
          return {
            studentId: raw._id,
            studentNumber: raw.studentNumber,
            name: `${raw.lastName || ''}, ${raw.firstName || ''}`.trim().replace(/^,\s*|,\s*$/g, ''),
            latestGrade: raw.latestGrade,
            gradeProfessor: raw.gradeProfessor,
            gradeDate: raw.gradeDate,
            course: raw.course,
            yearLevel: raw.yearLevel,
            enrollment: enrollment
              ? {
                  enrollmentId: String(enrollment._id),
                  yearLevel: enrollment.yearLevel,
                  status: enrollment.status,
                  subjects: enrollment.subjects || [],
                }
              : null,
          };
        }),
      },
    };
  }

  /**
   * Build a ROLLOVER_AUDIT snapshot containing the full decision log and
   * outcome counts.
   */
  static buildRolloverAudit(resolvedDecisions, counts, context) {
    const { fromSchoolYear, toSchoolYear, targetSemester, rolloverBatchId, adminId } = context;
    return {
      type: 'ROLLOVER_AUDIT',
      title: `Rollover Audit - SY ${fromSchoolYear} to SY ${toSchoolYear}`,
      data: {
        initiatedBy: String(adminId),
        executedAt: new Date().toISOString(),
        fromSchoolYear,
        toSchoolYear,
        semester: targetSemester,
        rolloverBatchId,
        decisions: resolvedDecisions.map((decision) => ({
          studentId: String(decision.studentId),
          action: decision.action,
        })),
        counts,
      },
    };
  }

  /**
   * Build the complete set of archive snapshots for a rollover run.
   */
  static createSnapshotsForRollover({
    closingStudents,
    closingEnrollments,
    resolvedDecisions,
    counts,
    blockSnapshotData,
    blocksCreated,
    context,
  }) {
    const { fromSchoolYear, toSchoolYear, targetSemester, adminId } = context;
    const baseSnapshots = [
      {
        type: 'ENROLLMENT_SNAPSHOT',
        title: `Enrollment Snapshot - SY ${fromSchoolYear} (closed)`,
        data: {
          schoolYear: fromSchoolYear,
          newSchoolYear: toSchoolYear,
          semester: targetSemester,
          counts,
        },
      },
      {
        type: 'PROMOTION_REPORT',
        title: `Promotion Report - SY ${fromSchoolYear} to SY ${toSchoolYear}`,
        data: {
          schoolYear: fromSchoolYear,
          newSchoolYear: toSchoolYear,
          students: counts.promoted,
        },
      },
      {
        type: 'RETENTION_REPORT',
        title: `Retention Report - SY ${fromSchoolYear}`,
        data: {
          schoolYear: fromSchoolYear,
          students: counts.retained,
        },
      },
      {
        type: 'GRADUATION_REPORT',
        title: `Graduation Report - SY ${fromSchoolYear}`,
        data: {
          schoolYear: fromSchoolYear,
          students: counts.graduated,
        },
      },
      {
        type: 'BLOCK_SNAPSHOT',
        title: `Block Snapshot - SY ${fromSchoolYear}`,
        data: {
          schoolYear: fromSchoolYear,
          newSchoolYear: toSchoolYear,
          semester: targetSemester,
          blocks: blockSnapshotData,
          blocksCreatedForNewYear: blocksCreated,
        },
      },
    ];

    return [
      ...baseSnapshots,
      this.buildStudentArchive(closingStudents, context),
      this.buildGradesArchive(closingStudents, closingEnrollments, context),
      this.buildRolloverAudit(resolvedDecisions, counts, context),
    ].map((snapshot) => ({
      ...snapshot,
      schoolYear: fromSchoolYear,
      newSchoolYear: toSchoolYear,
      semester: targetSemester,
      rolloverBatchId,
      counts,
      generatedBy: adminId,
    }));
  }

  /**
   * Strip Mongoose internals and select a stable, safe set of fields for
   * an archived student record.
   */
  static sanitizeStudent(student) {
    const raw = student && typeof student.toObject === 'function' ? student.toObject() : student;
    const pick = (obj, keys) => {
      const out = {};
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          out[key] = obj[key];
        }
      }
      return out;
    };

    const selected = pick(raw, [
      '_id',
      'studentNumber',
      'firstName',
      'lastName',
      'middleName',
      'email',
      'course',
      'yearLevel',
      'schoolYear',
      'semester',
      'section',
      'studentStatus',
      'enrollmentStatus',
      'latestGrade',
      'gradeProfessor',
      'gradeDate',
      'lifecycleStatus',
      'isActive',
      'gender',
      'birthDate',
      'createdAt',
      'updatedAt',
    ]);

    selected._id = String(selected._id);
    return selected;
  }
}

module.exports = AcademicArchiveService;
