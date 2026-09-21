const mongoose = require('mongoose');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const Subject = require('../models/Subject');
const StudentBlockAssignment = require('../models/StudentBlockAssignment');
const SectionWaitlist = require('../models/SectionWaitlist');
const BlockGroup = require('../models/BlockGroup');
const BlockSection = require('../models/BlockSection');
const Admin = require('../models/Admin');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const securityMiddleware = require('../securityMiddleware');
const StudentNumberService = require('../services/studentNumberService');
const StudentPasswordService = require('../services/studentPasswordService');
const AuditLog = require('../models/AuditLog');
const Curriculum = require('../models/Curriculum');
const CurriculumSubject = require('../models/CurriculumSubject');
const CorPdfService = require('../services/corPdfService');
const { convertToSchoolYear, extractStartYear } = require('../services/dateUtils');
const enrollmentGuard = require('../services/enrollmentGuard');

const STUDENT_MUTABLE_FIELDS = [
  'firstName',
  'middleName',
  'lastName',
  'suffix',
  'course',
  'major',
  'yearLevel',
  'semester',
  'schoolYear',
  'studentStatus',
  'classification',
  'lifecycleStatus',
  'corStatus',
  'scholarship',
  'email',
  'contactNumber',
  'address',
  'permanentAddress',
  'birthDate',
  'birthPlace',
  'gender',
  'civilStatus',
  'nationality',
  'religion',
  'emergencyContact',
  'assignedProfessor',
  'schedule',
  'latestGrade',
  'gradeProfessor',
  'gradeDate',
  'isActive',
  // Family information (mirrors Applicant model)
  'fatherName',
  'motherName',
  'guardianName',
  'guardianRelationship',
  'guardianContactNumber',
  // Structured addresses (mirrors Applicant model)
  'currentLocation',
  'permanentLocation',
  // Academic history (mirrors Applicant model)
  'academicDetails',
  // Applicant type (for students converted from applicants)
  'applicantType'
];
const TRIMMED_STUDENT_STRING_FIELDS = new Set([
  'firstName',
  'middleName',
  'lastName',
  'suffix',
  'major',
  'semester',
  'schoolYear',
  'studentStatus',
  'classification',
  'lifecycleStatus',
  'corStatus',
  'scholarship',
  'email',
  'contactNumber',
  'address',
  'permanentAddress',
  'birthPlace',
  'gender',
  'civilStatus',
  'nationality',
  'religion',
  'assignedProfessor',
  'schedule',
  'gradeProfessor',
  'fatherName',
  'motherName',
  'guardianName',
  'guardianRelationship',
  'guardianContactNumber',
  'applicantType'
]);
const CLEARABLE_STUDENT_FIELDS = new Set([
  'middleName',
  'suffix',
  'major',
  'email',
  'permanentAddress',
  'birthDate',
  'birthPlace',
  'gender',
  'civilStatus',
  'nationality',
  'religion',
  'emergencyContact',
  'assignedProfessor',
  'schedule',
  'latestGrade',
  'gradeProfessor',
  'gradeDate',
  'fatherName',
  'motherName',
  'guardianName',
  'guardianRelationship',
  'guardianContactNumber',
  'currentLocation',
  'permanentLocation',
  'academicDetails',
  'applicantType'
]);

function normalizeEmergencyContact(emergencyContact) {
  if (!emergencyContact || typeof emergencyContact !== 'object' || Array.isArray(emergencyContact)) {
    return null;
  }

  const normalized = {
    name: String(emergencyContact.name || '').trim(),
    relationship: String(emergencyContact.relationship || '').trim(),
    contactNumber: String(emergencyContact.contactNumber || '').trim(),
    address: String(emergencyContact.address || '').trim()
  };

  const hasValue = Object.values(normalized).some(Boolean);
  return hasValue ? normalized : null;
}

class StudentController {
  static lifecycleStatuses = ['Pending', 'Enrolled', 'Not Enrolled', 'Dropped', 'Inactive', 'Graduated'];

  static deriveLifecycleStatus(student) {
    const explicit = String(student?.lifecycleStatus || '').trim();
    if (StudentController.lifecycleStatuses.includes(explicit)) {
      return explicit;
    }

    if (student?.isActive === false) return 'Inactive';

    const studentStatus = String(student?.studentStatus || '').trim();

    if (studentStatus === 'Dropped') return 'Dropped';
    // NOTE: a Verified COR alone never implies ENROLLED here. The official
    // ENROLLED state requires a valid block assignment (see
    // services/enrollmentGuard.js) and is granted only by block-assignment
    // finalization, which also persists lifecycleStatus='Enrolled' — so the
    // explicit branch above is the source of truth for enrolled students.

    return 'Pending';
  }

  static async getProfessorAccounts(req, res) {
    try {
      const professors = await Admin.find({
        accountType: 'professor',
        status: { $ne: 'inactive' }
      })
        .select('_id username displayName uid status')
        .sort({ displayName: 1, username: 1 })
        .lean();

      const data = professors.map((professor) => ({
        _id: String(professor._id),
        username: professor.username || '',
        displayName: professor.displayName || '',
        uid: professor.uid || '',
        status: professor.status || 'active',
        label: String(professor.displayName || '').trim() || String(professor.username || '').trim()
      }));

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching professor accounts:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch professor accounts'
      });
    }
  }

  static normalizeProfessorIdentifier(value) {
    return String(value || '').trim().toLowerCase();
  }

  static schoolYearFromStartYear(value) {
    // Deprecated: Use convertToSchoolYear from dateUtils instead
    return convertToSchoolYear(value);
  }

  /** Normalize any year representation to "YYYY-YYYY" without throwing.
   * Assignment/group year fields mix start years ("2026") and school
   * years ("2026-2027") across legacy and current records — joins must
   * accept both instead of missing (orphaned loads) or crashing reads. */
  static toSchoolYearSafe(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if (/^\d{4}-\d{4}$/.test(text)) return text;
    const startYear = Number(text);
    if (Number.isFinite(startYear) && startYear > 0) return `${startYear}-${startYear + 1}`;
    return text;
  }

  static courseCodeFromValue(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if (/^\d+$/.test(text)) return text;

    const normalized = text.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-');
    if (normalized.includes('BEED')) return '101';
    if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return '102';
    if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return '103';
    if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return '201';
    return '';
  }

  static extractBlockGroupMeta(groupName) {
    const normalized = String(groupName || '')
      .trim()
      .replace(/\u2013/g, '-')
      .toUpperCase();
    if (!normalized) {
      return {
        courseCode: undefined,
        courseShortLabel: '',
        courseLabel: '',
        yearLevel: undefined
      };
    }

    const parts = normalized.split('-').filter(Boolean);
    const courseCode = /^\d+$/.test(parts[0] || '') ? Number(parts[0]) : undefined;
    const yearLevel = /^\d+$/.test(parts[1] || '') ? Number(parts[1]) : undefined;

    return {
      courseCode,
      courseShortLabel: courseCode
        ? StudentController.courseCodeMap[courseCode] || String(courseCode)
        : parts[0] || normalized,
      courseLabel: courseCode
        ? StudentController.courseLabelMap[courseCode] || (StudentController.courseCodeMap[courseCode] || String(courseCode))
        : normalized,
      yearLevel
    };
  }

  static formatSectionBlockLabel(sectionCode, courseShortLabel) {
    const normalizedSection = String(sectionCode || '')
      .trim()
      .replace(/\u2013/g, '-')
      .toUpperCase();
    const course = String(courseShortLabel || '').trim().toUpperCase();
    if (!normalizedSection) return 'N/A';
    if (!course) return normalizedSection;

    const slotMatch = normalizedSection.match(/(?:^|[-\s])(\d+)-?([A-Z])$/);
    if (slotMatch) {
      return `${course}-${slotMatch[1]}${slotMatch[2]}`;
    }

    const parts = normalizedSection.split('-').filter(Boolean);
    if (parts.length === 1) return `${course}-${parts[0]}`;
    return `${course}-${parts.slice(1).join('')}`;
  }

  static async getProfessorCourseLoads(req, res) {
    try {
      const semesterFilter = String(req.query.semester || '').trim();
      // year is optional — a missing value means "all years", not an error.
      const yearFilter = req.query.year ? convertToSchoolYear(req.query.year) : '';
      const courseFilter = Number(req.query.course);

      const professorDocs = await Admin.find({
        accountType: 'professor',
        status: { $ne: 'inactive' }
      })
        .select('_id username displayName uid status')
        .sort({ displayName: 1, username: 1 })
        .lean();

      const professorIdentifierMap = new Map();
      const professorLoads = new Map(
        professorDocs.map((professor) => {
          const label = String(professor.displayName || '').trim() || String(professor.username || '').trim() || 'Professor';
          const professorEntry = {
            professorId: String(professor._id),
            username: professor.username || '',
            displayName: professor.displayName || '',
            label,
            uid: professor.uid || '',
            status: professor.status || 'active',
            assignments: []
          };

          [professor.username, professor.displayName, professor.uid, label]
            .map((value) => StudentController.normalizeProfessorIdentifier(value))
            .filter(Boolean)
            .forEach((identifier) => {
              professorIdentifierMap.set(identifier, professorEntry.professorId);
            });

          return [professorEntry.professorId, professorEntry];
        })
      );

      const buildEmptyResponse = () => ({
        success: true,
        data: {
          professors: Array.from(professorLoads.values()).map((professor) => ({
            ...professor,
            totals: { courses: 0, sections: 0, subjects: 0, students: 0 },
            courseSummaries: []
          })),
          stats: {
            professors: professorLoads.size,
            assignedSubjects: 0,
            sectionsCovered: 0,
            studentsCovered: 0,
            unassignedSubjects: 0,
            unmatchedInstructors: 0,
            orphanedSubjects: 0
          },
          unassignedSubjects: [],
          filterOptions: {
            semesters: [],
            years: [],
            courses: []
          }
        }
      });

      const blockGroupQuery = {};
      if (semesterFilter) blockGroupQuery.semester = semesterFilter;
      if (yearFilter) blockGroupQuery.year = yearFilter;

      const rawGroups = await BlockGroup.find(blockGroupQuery)
        .select('_id name semester year')
        .sort({ year: -1, semester: 1, name: 1 })
        .lean();

      const filterOptions = {
        semesters: Array.from(new Set(rawGroups.map((group) => String(group.semester || '').trim()).filter(Boolean))),
        years: Array.from(new Set(rawGroups.map((group) => String(group.year || '').trim()).filter(Boolean))).sort((a, b) => b.localeCompare(a)),
        courses: Array.from(
          new Map(
            rawGroups
              .map((group) => StudentController.extractBlockGroupMeta(group.name))
              .filter((meta) => meta.courseCode)
              .map((meta) => [
                String(meta.courseCode),
                {
                  value: Number(meta.courseCode),
                  label: meta.courseShortLabel,
                  fullLabel: meta.courseLabel
                }
              ])
          ).values()
        ).sort((a, b) => a.label.localeCompare(b.label))
      };

      if (rawGroups.length === 0) {
        const payload = buildEmptyResponse();
        payload.data.filterOptions = filterOptions;
        return res.json(payload);
      }

      const blockGroups = rawGroups
        .map((group) => ({
          ...group,
          meta: StudentController.extractBlockGroupMeta(group.name)
        }))
        .filter((group) => {
          if (!Number.isFinite(courseFilter) || courseFilter <= 0) return true;
          return Number(group.meta.courseCode) === courseFilter;
        });

      if (blockGroups.length === 0) {
        const payload = buildEmptyResponse();
        payload.data.filterOptions = filterOptions;
        return res.json(payload);
      }

      const groupIds = blockGroups.map((group) => group._id);
      const groupById = new Map(blockGroups.map((group) => [String(group._id), group]));
      const targetEnrollmentPairs = Array.from(
        new Set(
          blockGroups
            .map((group) => {
              const schoolYear = String(group.year || '').trim();
              const semester = String(group.semester || '').trim();
              return schoolYear && semester ? `${schoolYear}|${semester}` : '';
            })
            .filter(Boolean)
        )
      );
      const courseMetaByCode = new Map(
        filterOptions.courses.map((course) => [String(course.value), course])
      );
      const targetCourseCodes = new Set(
        blockGroups
          .map((group) => StudentController.courseCodeFromValue(group.meta.courseCode))
          .filter(Boolean)
      );

      const sections = await BlockSection.find({ blockGroupId: { $in: groupIds } })
        .select('_id blockGroupId sectionCode currentPopulation capacity')
        .lean();

      const sectionById = new Map(sections.map((section) => [String(section._id), section]));
      const studentAssignments = await StudentBlockAssignment.find({
        sectionId: { $in: sections.map((section) => section._id) },
        status: 'ASSIGNED'
      })
        .select('studentId sectionId semester year')
        .lean();

      const relevantAssignments = studentAssignments.filter((assignment) => {
        const section = sectionById.get(String(assignment.sectionId));
        if (!section) return false;
        const group = groupById.get(String(section.blockGroupId));
        if (!group) return false;
        return String(assignment.semester || '').trim() === String(group.semester || '').trim()
          && String(assignment.year || '').trim() === String(group.year || '').trim();
      });

      const assignmentsByStudentId = new Map();
      relevantAssignments.forEach((assignment) => {
        const studentId = String(assignment.studentId || '').trim();
        if (!studentId) return;
        const list = assignmentsByStudentId.get(studentId) || [];
        list.push(assignment);
        assignmentsByStudentId.set(studentId, list);
      });

      // All assignments (unfiltered by section/group match) — used only to
      // explain orphaned subjects: "no block at all" vs "block, wrong term".
      const allAssignmentsByStudentId = new Map();
      studentAssignments.forEach((assignment) => {
        const studentId = String(assignment.studentId || '').trim();
        if (!studentId) return;
        const list = allAssignmentsByStudentId.get(studentId) || [];
        list.push(assignment);
        allAssignmentsByStudentId.set(studentId, list);
      });
      const describeAssignmentTerms = (list) => {
        const terms = Array.from(
          new Set(
            list.map((assignment) => {
              const term = `${String(assignment.semester || '').trim()} ${String(assignment.schoolYear || assignment.year || '').trim()}`.trim();
              return term || 'unknown term';
            })
          )
        );
        return terms.join(', ');
      };

      const findAssignmentForEnrollment = (studentIdValue, semesterValue, schoolYearValue) => {
        const studentId = String(studentIdValue || '').trim();
        if (!studentId) return null;

        const list = assignmentsByStudentId.get(studentId) || [];
        if (list.length === 0) return null;

        const semester = String(semesterValue || '').trim();
        // schoolYearValue may be missing on legacy records — fall back to ''
        // (handled by the !schoolYear branch below) instead of throwing.
        const schoolYear = schoolYearValue ? convertToSchoolYear(schoolYearValue) : '';
        const strictMatch = list.find((entry) => {
          const semesterMatch = String(entry.semester || '').trim() === semester;
          const entryYear = String(entry.year || '').trim();
          const yearMatch =
            entryYear === schoolYear ||
            StudentController.toSchoolYearSafe(entryYear) === schoolYear;
          return semesterMatch && yearMatch;
        });
        if (strictMatch) return strictMatch;

        if (!schoolYear) {
          return list.find((entry) => String(entry.semester || '').trim() === semester) || null;
        }

        return null;
      };

      const studentObjectIds = Array.from(
        new Set(
          relevantAssignments
            .map((assignment) => String(assignment.studentId || '').trim())
            .filter((studentId) => mongoose.Types.ObjectId.isValid(studentId))
        )
      ).map((studentId) => new mongoose.Types.ObjectId(studentId));

      const enrollmentQuery = {
        // Enrolled AND Pending: since the lifecycle reform, every enrollment
        // starts as Pending and override-path assignments never flip it, yet
        // both represent real teaching work once students sit in sections.
        // Students without a block assignment never reach a professor card —
        // the join below (and the orphaned bucket) still requires one.
        status: { $in: ['Enrolled', 'Pending'] }
      };
      if (targetEnrollmentPairs.length > 0) {
        enrollmentQuery.$or = targetEnrollmentPairs.map((pair) => {
          const [schoolYear, semester] = pair.split('|');
          return { schoolYear, semester };
        });
      }

      const enrollmentDocs = await Enrollment.find(enrollmentQuery)
        .select('studentId schoolYear semester subjects isCurrent createdAt course')
        .sort({ isCurrent: -1, createdAt: -1 })
        .lean();

      // Collect subjectIds referenced by enrollments so we can filter out
      // entries whose Subject was archived (isActive:false) or hard-deleted.
      const enrollmentSubjectIds = Array.from(
        new Set(
          enrollmentDocs.flatMap((enrollment) => (Array.isArray(enrollment.subjects) ? enrollment.subjects : []))
            .map((entry) => entry?.subjectId)
            .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)))
            .map((id) => new mongoose.Types.ObjectId(String(id)))
        )
      );
      const activeSubjectDocs = enrollmentSubjectIds.length > 0
        ? await Subject.find({ _id: { $in: enrollmentSubjectIds }, isActive: { $ne: false } })
            .select('_id')
            .lean()
        : [];
      const activeSubjectIds = new Set(activeSubjectDocs.map((doc) => String(doc._id)));
      const isEnrollmentSubjectActive = (subjectEntry) => {
        const sid = String(subjectEntry?.subjectId || '').trim();
        if (!sid) return true; // no subjectId link — keep legacy code-only entries
        return activeSubjectIds.has(sid);
      };

      if (enrollmentDocs.length === 0) {
        const payload = buildEmptyResponse();
        payload.data.filterOptions = filterOptions;
        return res.json(payload);
      }

      const enrollmentStudentIds = Array.from(
        new Set(
          enrollmentDocs
            .map((enrollment) => String(enrollment.studentId || '').trim())
            .filter((studentId) => mongoose.Types.ObjectId.isValid(studentId))
        )
      );
      const enrollmentStudentObjectIds = enrollmentStudentIds.map((studentId) => new mongoose.Types.ObjectId(studentId));
      const students = enrollmentStudentObjectIds.length > 0
        ? await Student.find({ _id: { $in: enrollmentStudentObjectIds } }).select('_id course').lean()
        : [];
      const studentCourseCodeById = new Map(
        students.map((student) => [String(student._id), String(student.course || '').trim()])
      );

      const enrollmentByKey = new Map();
      enrollmentDocs.forEach((enrollment) => {
        const key = `${String(enrollment.studentId)}|${String(enrollment.schoolYear || '').trim()}|${String(enrollment.semester || '').trim()}`;
        if (!enrollmentByKey.has(key)) {
          enrollmentByKey.set(key, enrollment);
        }
      });

      const loadBuckets = new Map();
      const unassignedBuckets = new Map();
      const orphanedBuckets = new Map();

      relevantAssignments.forEach((assignment) => {
        const studentId = String(assignment.studentId || '').trim();
        const section = sectionById.get(String(assignment.sectionId));
        if (!section) return;
        const blockGroup = groupById.get(String(section.blockGroupId));
        if (!blockGroup) return;

        const schoolYear =
          String(assignment.schoolYear || '').trim() ||
          StudentController.toSchoolYearSafe(assignment.year);
        const semester = String(assignment.semester || '').trim();
        const enrollment = enrollmentByKey.get(`${studentId}|${schoolYear}|${semester}`);
        if (!enrollment || !Array.isArray(enrollment.subjects)) return;

        enrollment.subjects.forEach((subjectEntry) => {
          const subjectStatus = String(subjectEntry?.status || '').toLowerCase();
          if (subjectStatus === 'dropped' || subjectStatus === 'removed') return;
          if (!isEnrollmentSubjectActive(subjectEntry)) return;

          const instructorRaw = String(subjectEntry?.instructor || '').trim();
          const normalizedInstructor = StudentController.normalizeProfessorIdentifier(instructorRaw);
          const subjectId = String(subjectEntry?.subjectId || '').trim() || String(subjectEntry?.code || '').trim();
          const subjectCode = String(subjectEntry?.code || '').trim() || 'SUBJECT';
          const sectionSubjectKey = `${String(section._id)}|${subjectId}`;
          const basePayload = {
            subjectId,
            subjectCode,
            subjectTitle: String(subjectEntry?.title || '').trim() || 'Untitled subject',
            schedule: String(subjectEntry?.schedule || '').trim() || 'TBA',
            room: String(subjectEntry?.room || '').trim() || 'TBA',
            sectionId: String(section._id),
            sectionCode: String(section.sectionCode || '').trim() || 'N/A',
            sectionLabel: StudentController.formatSectionBlockLabel(section.sectionCode, blockGroup.meta.courseShortLabel),
            blockGroupId: String(blockGroup._id),
            blockGroupName: String(blockGroup.name || '').trim(),
            semester: String(blockGroup.semester || '').trim(),
            schoolYear: String(blockGroup.year || '').trim(),
            courseCode: blockGroup.meta.courseCode || null,
            courseShortLabel: blockGroup.meta.courseShortLabel || 'N/A',
            courseLabel: blockGroup.meta.courseLabel || 'N/A',
            yearLevel: blockGroup.meta.yearLevel || null,
            units: Number(subjectEntry?.units) || 0
          };

          const professorId = normalizedInstructor ? professorIdentifierMap.get(normalizedInstructor) : '';
          if (!professorId) {
            const bucketKey = `${sectionSubjectKey}|${normalizedInstructor || 'tba'}`;
            let bucket = unassignedBuckets.get(bucketKey);
            if (!bucket) {
              bucket = {
                ...basePayload,
                instructor: instructorRaw || 'TBA',
                studentIds: new Set()
              };
              unassignedBuckets.set(bucketKey, bucket);
            }
            bucket.studentIds.add(studentId);
            return;
          }

          let loadBucket = loadBuckets.get(`${professorId}|${sectionSubjectKey}`);
          if (!loadBucket) {
            loadBucket = {
              ...basePayload,
              professorId,
              studentIds: new Set()
            };
            loadBuckets.set(`${professorId}|${sectionSubjectKey}`, loadBucket);
          }
          loadBucket.studentIds.add(studentId);
        });
      });

      Array.from(enrollmentByKey.values()).forEach((enrollment) => {
        const studentId = String(enrollment.studentId || '').trim();
        if (!studentId || !Array.isArray(enrollment.subjects)) return;

        const schoolYear = String(enrollment.schoolYear || '').trim();
        const semester = String(enrollment.semester || '').trim();
        if (!targetEnrollmentPairs.includes(`${schoolYear}|${semester}`)) return;
        if (findAssignmentForEnrollment(studentId, semester, schoolYear)) return;

        const courseCode = StudentController.courseCodeFromValue(studentCourseCodeById.get(studentId) || enrollment.course);
        if (targetCourseCodes.size > 0 && !targetCourseCodes.has(courseCode)) return;

        const courseMeta = courseMetaByCode.get(String(courseCode));
        const courseShortLabel = courseMeta?.label || courseCode || 'N/A';

        enrollment.subjects.forEach((subjectEntry) => {
          const subjectStatus = String(subjectEntry?.status || '').toLowerCase();
          if (subjectStatus === 'dropped' || subjectStatus === 'removed') return;
          if (!isEnrollmentSubjectActive(subjectEntry)) return;

          const instructorRaw = String(subjectEntry?.instructor || '').trim();
          const normalizedInstructor = StudentController.normalizeProfessorIdentifier(instructorRaw);
          const professorId = normalizedInstructor ? professorIdentifierMap.get(normalizedInstructor) : '';
          if (!professorId) return;

          const subjectId = String(subjectEntry?.subjectId || '').trim() || String(subjectEntry?.code || '').trim();
          const subjectCode = String(subjectEntry?.code || '').trim() || 'SUBJECT';
          const bucketKey = `${courseShortLabel}|${schoolYear}|${semester}|${subjectId}|${professorId}`;
          let bucket = orphanedBuckets.get(bucketKey);
          if (!bucket) {
            const existingTerms = describeAssignmentTerms(allAssignmentsByStudentId.get(studentId) || []);
            bucket = {
              instructor: instructorRaw || 'Professor',
              subjectCode,
              subjectTitle: String(subjectEntry?.title || '').trim() || 'Untitled subject',
              sectionLabel: 'No live block assignment',
              courseShortLabel,
              issueType: 'orphaned',
              hint: existingTerms
                ? `Student has block assignment(s) for ${existingTerms} — none matches ${semester} ${schoolYear}. Assign a block for the enrollment term.`
                : `Student has no block assignment at all — assign one for ${semester} ${schoolYear}.`,
              studentIds: new Set()
            };
            orphanedBuckets.set(bucketKey, bucket);
          }
          bucket.studentIds.add(studentId);
        });
      });

      loadBuckets.forEach((bucket) => {
        const professorLoad = professorLoads.get(bucket.professorId);
        if (!professorLoad) return;
        professorLoad.assignments.push({
          subjectId: bucket.subjectId,
          subjectCode: bucket.subjectCode,
          subjectTitle: bucket.subjectTitle,
          schedule: bucket.schedule,
          room: bucket.room,
          sectionId: bucket.sectionId,
          sectionCode: bucket.sectionCode,
          sectionLabel: bucket.sectionLabel,
          blockGroupId: bucket.blockGroupId,
          blockGroupName: bucket.blockGroupName,
          semester: bucket.semester,
          schoolYear: bucket.schoolYear,
          courseCode: bucket.courseCode,
          courseShortLabel: bucket.courseShortLabel,
          courseLabel: bucket.courseLabel,
          yearLevel: bucket.yearLevel,
          units: bucket.units,
          studentCount: bucket.studentIds.size
        });
      });

      const professors = Array.from(professorLoads.values())
        .map((professor) => {
          const assignments = [...professor.assignments].sort((a, b) => {
            const courseCompare = String(a.courseShortLabel || '').localeCompare(String(b.courseShortLabel || ''));
            if (courseCompare !== 0) return courseCompare;
            const sectionCompare = String(a.sectionLabel || '').localeCompare(String(b.sectionLabel || ''));
            if (sectionCompare !== 0) return sectionCompare;
            return String(a.subjectCode || '').localeCompare(String(b.subjectCode || ''));
          });

          const courseSummaryMap = new Map();
          const sectionIds = new Set();
          assignments.forEach((assignment) => {
            sectionIds.add(assignment.sectionId);
            const courseKey = `${String(assignment.courseCode || '')}|${String(assignment.courseShortLabel || '')}`;
            const summary = courseSummaryMap.get(courseKey) || {
              courseCode: assignment.courseCode,
              label: assignment.courseShortLabel,
              fullLabel: assignment.courseLabel,
              sections: new Set(),
              subjectCount: 0,
              studentCount: 0
            };
            summary.sections.add(assignment.sectionId);
            summary.subjectCount += 1;
            summary.studentCount += Number(assignment.studentCount) || 0;
            courseSummaryMap.set(courseKey, summary);
          });

          return {
            ...professor,
            assignments,
            totals: {
              courses: courseSummaryMap.size,
              sections: sectionIds.size,
              subjects: assignments.length,
              students: assignments.reduce((sum, assignment) => sum + (Number(assignment.studentCount) || 0), 0)
            },
            courseSummaries: Array.from(courseSummaryMap.values())
              .map((summary) => ({
                courseCode: summary.courseCode,
                label: summary.label,
                fullLabel: summary.fullLabel,
                sections: summary.sections.size,
                subjectCount: summary.subjectCount,
                studentCount: summary.studentCount
              }))
              .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')))
          };
        })
        .sort((a, b) => {
          if (b.totals.subjects !== a.totals.subjects) return b.totals.subjects - a.totals.subjects;
          if (b.totals.students !== a.totals.students) return b.totals.students - a.totals.students;
          return a.label.localeCompare(b.label);
        });

      const unassignedSubjects = Array.from(unassignedBuckets.values()).map((bucket) => ({
        instructor: bucket.instructor,
        subjectCode: bucket.subjectCode,
        subjectTitle: bucket.subjectTitle,
        sectionLabel: bucket.sectionLabel,
        courseShortLabel: bucket.courseShortLabel,
        studentCount: bucket.studentIds.size,
        issueType: bucket.instructor === 'TBA' ? 'tba' : 'unmatched'
      }));
      const orphanedSubjects = Array.from(orphanedBuckets.values()).map((bucket) => ({
        instructor: bucket.instructor,
        subjectCode: bucket.subjectCode,
        subjectTitle: bucket.subjectTitle,
        sectionLabel: bucket.sectionLabel,
        courseShortLabel: bucket.courseShortLabel,
        hint: bucket.hint || '',
        studentCount: bucket.studentIds.size,
        issueType: 'orphaned'
      }));
      const attentionSubjects = [...unassignedSubjects, ...orphanedSubjects];

      const sectionsCovered = new Set();
      professors.forEach((professor) => {
        professor.assignments.forEach((assignment) => sectionsCovered.add(assignment.sectionId));
      });

      res.json({
        success: true,
        data: {
          professors,
          stats: {
            professors: professors.length,
            assignedSubjects: professors.reduce((sum, professor) => sum + professor.totals.subjects, 0),
            sectionsCovered: sectionsCovered.size,
            studentsCovered: professors.reduce((sum, professor) => sum + professor.totals.students, 0),
            unassignedSubjects: unassignedSubjects.filter((entry) => entry.instructor === 'TBA').length,
            unmatchedInstructors: unassignedSubjects.filter((entry) => entry.instructor !== 'TBA').length,
            orphanedSubjects: orphanedSubjects.length
          },
          unassignedSubjects: attentionSubjects,
          filterOptions
        }
      });
    } catch (error) {
      console.error('Error fetching professor course loads:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch professor course loads'
      });
    }
  }

  static async cleanupBlockMembershipForStudent(studentId) {
    const normalizedStudentId = String(studentId || '').trim();
    if (!normalizedStudentId) return;

    const assignments = await StudentBlockAssignment.find({ studentId: normalizedStudentId })
      .select('sectionId')
      .lean();
    const waitlists = await SectionWaitlist.find({ studentId: normalizedStudentId })
      .select('sectionId')
      .lean();

    const affectedSectionIds = Array.from(
      new Set(
        [...assignments, ...waitlists]
          .map((entry) => String(entry.sectionId || '').trim())
          .filter(Boolean)
      )
    );

    if (assignments.length > 0) {
      await StudentBlockAssignment.deleteMany({ studentId: normalizedStudentId });
    }
    if (waitlists.length > 0) {
      await SectionWaitlist.deleteMany({ studentId: normalizedStudentId });
    }

    if (affectedSectionIds.length === 0) return;

    const sectionObjectIds = affectedSectionIds
      .filter((sectionId) => mongoose.Types.ObjectId.isValid(sectionId))
      .map((sectionId) => new mongoose.Types.ObjectId(sectionId));

    const assignedCounts = await StudentBlockAssignment.aggregate([
      {
        $match: {
          sectionId: { $in: sectionObjectIds },
          status: 'ASSIGNED'
        }
      },
      {
        $group: {
          _id: '$sectionId',
          total: { $sum: 1 }
        }
      }
    ]);

    const countMap = new Map(
      assignedCounts.map((item) => [String(item._id), Number(item.total) || 0])
    );

    await Promise.all(
      sectionObjectIds.map((sectionId) =>
        BlockSection.findByIdAndUpdate(sectionId, {
          $set: { currentPopulation: countMap.get(String(sectionId)) || 0 }
        })
      )
    );
  }

  static async createStudentRecord(studentData) {
    const { set } = this.normalizeStudentMutationData(studentData);

    // A brand-new record can never satisfy the ENROLLED requirements yet
    // (no enrollment record, no block assignment), so reject it up front.
    if (String(set.lifecycleStatus || '').trim() === 'Enrolled') {
      const err = new Error(
        'A new student record cannot be created as Enrolled. Create it as Pending, enroll for the term, assign a block, then finalize enrollment.'
      );
      err.statusCode = 409;
      throw err;
    }

    // Enhanced course validation - convert string courses to numbers before Student creation
    const VALID_COURSES = [101, 102, 103, 201];
    const COURSE_MAPPING = {
      'BEED': 101,
      'BSED': 102,
      'BSED-ENGLISH': 102,
      'BSED-MATH': 103,
      'BSBA': 201,
      'BSBA-HRM': 201
    };
    
    if (!set.course || set.course === '' || set.course === null) {
      const err = new Error('Valid course is required (101, 102, 103, 201, or BEED, BSED, BSBA)');
      err.statusCode = 400;
      throw err;
    }
    
    // Convert string courses to numbers
    if (typeof set.course === 'string') {
      const upperCourse = set.course.toUpperCase().trim();
      if (COURSE_MAPPING[upperCourse]) {
        set.course = COURSE_MAPPING[upperCourse];
      } else {
        const err = new Error('Invalid course value. Must be 101, 102, 103, 201, or BEED, BSED, BSBA');
        err.statusCode = 400;
        throw err;
      }
    }
    
    // Validate it's a valid number
    if (!VALID_COURSES.includes(Number(set.course))) {
      const err = new Error('Invalid course value. Must be 101, 102, 103, 201, or BEED, BSED, BSBA');
      err.statusCode = 400;
      throw err;
    }

    if (set.email) {
      const existingStudent = await Student.findOne({ email: set.email });
      if (existingStudent) {
        const err = new Error('A student with this email already exists');
        err.statusCode = 409;
        throw err;
      }
    }

    if (studentData?.createdBy) {
      set.createdBy = studentData.createdBy;
    }

    const student = new Student(set);
    
    // Generate default password if not provided
    if (!student.password) {
      student.password = StudentPasswordService.generateDefaultPassword(student);
    }
    
    await student.save();
    return student;
  }

  static async getStudentsRecord(params = {}) {
    const query = {};

    if (params.course) query.course = params.course;
    if (params.yearLevel) query.yearLevel = Number(params.yearLevel);
    if (params.semester) query.semester = params.semester;
    if (params.schoolYear) query.schoolYear = params.schoolYear;
    if (params.studentStatus) query.studentStatus = params.studentStatus;
    // enrollmentStatus is deprecated - use Enrollment.status instead

    const students = await Student.find(query).sort({ createdAt: -1 }).lean();
    if (!students.length) return [];

    const studentIds = students
      .map((student) => String(student._id || '').trim())
      .filter(Boolean);

    // Get enrollment records for students to determine actual enrollment status
    const enrollmentQuery = { studentId: { $in: studentIds } };
    if (params.semester) enrollmentQuery.semester = params.semester;
    if (params.schoolYear) enrollmentQuery.schoolYear = params.schoolYear;
    
    const enrollments = await Enrollment.find(enrollmentQuery)
      .select('studentId status semester schoolYear isCurrent')
      .lean();

    const assignments = await StudentBlockAssignment.find({ studentId: { $in: studentIds } })
      .select('studentId sectionId semester year assignedAt')
      .lean();
    const waitlistEntries = await SectionWaitlist.find({ studentId: { $in: studentIds } })
      .select('studentId sectionId addedAt')
      .lean();

    const assignmentsByStudentId = new Map();
    assignments.forEach((assignment) => {
      const studentId = String(assignment.studentId || '').trim();
      if (!studentId) return;
      const list = assignmentsByStudentId.get(studentId) || [];
      list.push(assignment);
      assignmentsByStudentId.set(studentId, list);
    });

    assignmentsByStudentId.forEach((list) => {
      list.sort((left, right) => new Date(right.assignedAt).getTime() - new Date(left.assignedAt).getTime());
    });

    const enrollmentsByStudentId = new Map();
    enrollments.forEach((enrollment) => {
      const studentId = String(enrollment.studentId || '').trim();
      if (!studentId) return;
      const list = enrollmentsByStudentId.get(studentId) || [];
      list.push(enrollment);
      enrollmentsByStudentId.set(studentId, list);
    });

    const waitlistByStudentId = new Map();
    waitlistEntries.forEach((entry) => {
      const studentId = String(entry.studentId || '').trim();
      if (!studentId) return;
      const list = waitlistByStudentId.get(studentId) || [];
      list.push(entry);
      waitlistByStudentId.set(studentId, list);
    });
    waitlistByStudentId.forEach((list) => {
      list.sort((left, right) => new Date(right.addedAt).getTime() - new Date(left.addedAt).getTime());
    });

    const sectionIds = Array.from(
      new Set(
        assignments
          .map((assignment) => String(assignment.sectionId || '').trim())
          .concat(waitlistEntries.map((waitlist) => String(waitlist.sectionId || '').trim()))
          .filter((sectionId) => mongoose.Types.ObjectId.isValid(sectionId))
      )
    ).map((sectionId) => new mongoose.Types.ObjectId(sectionId));

    const sections = sectionIds.length > 0
      ? await BlockSection.find({ _id: { $in: sectionIds } }).select('_id sectionCode').lean()
      : [];

    const sectionCodeById = new Map(
      sections.map((section) => [String(section._id), String(section.sectionCode || '').trim()])
    );

    const normalizeText = (value) => String(value || '').trim().toLowerCase();
    const normalizeAssignmentStatus = (value) => String(value || 'ASSIGNED').trim().toUpperCase();
    const isAssignedStatus = (value) => normalizeAssignmentStatus(value) === 'ASSIGNED';
    const pickLatestAssignment = (studentAssignments, shouldMatch) => {
      const candidates = studentAssignments.filter(shouldMatch).filter((assignment) => assignment.sectionId);
      if (!candidates.length) return null;

      candidates.sort((left, right) => {
        const leftIsAssigned = isAssignedStatus(left.status);
        const rightIsAssigned = isAssignedStatus(right.status);
        if (leftIsAssigned !== rightIsAssigned) return leftIsAssigned ? -1 : 1;
        return new Date(right.assignedAt).getTime() - new Date(left.assignedAt).getTime();
      });

      return candidates[0];
    };

    const findMatchingAssignment = (studentAssignments, studentSemester, studentSchoolYear) => {
      if (!studentAssignments.length) return null;

      const semester = normalizeText(studentSemester);
      // Legacy student records may lack schoolYear — match loosely instead
      // of throwing and failing the entire registry read.
      const schoolYear = studentSchoolYear ? convertToSchoolYear(studentSchoolYear) : '';
      const strictMatch = pickLatestAssignment(
        studentAssignments,
        (assignment) => normalizeText(assignment.semester) === semester && String(assignment.year || '').trim() === schoolYear
      );
      if (strictMatch) return strictMatch;

      const semesterMatch = pickLatestAssignment(
        studentAssignments,
        (assignment) => normalizeText(assignment.semester) === semester
      );
      if (semesterMatch) return semesterMatch;

      const yearMatch = pickLatestAssignment(
        studentAssignments,
        (assignment) => String(assignment.year || '').trim() === schoolYear
      );
      if (yearMatch) return yearMatch;

      return pickLatestAssignment(studentAssignments, () => true);
    };

    const getEnrollmentStatus = (studentId, semester, schoolYear) => {
      const studentEnrollments = enrollmentsByStudentId.get(studentId) || [];
      if (!studentEnrollments.length) return 'Not Enrolled';

      const targetSemester = normalizeText(semester);
      // Same legacy-record tolerance as findMatchingAssignment above.
      const targetSchoolYear = schoolYear ? convertToSchoolYear(schoolYear) : '';

      // Look for matching enrollment
      const matchingEnrollment = studentEnrollments.find((enrollment) => {
        const semesterMatch = normalizeText(enrollment.semester) === targetSemester;
        const yearMatch = String(enrollment.schoolYear || '').trim() === targetSchoolYear;
        return semesterMatch && yearMatch;
      });

      if (matchingEnrollment) {
        return matchingEnrollment.status || 'Not Enrolled';
      }

      // Fallback to any current enrollment
      const currentEnrollment = studentEnrollments.find((enrollment) => enrollment.isCurrent);
      if (currentEnrollment) {
        return currentEnrollment.status || 'Not Enrolled';
      }

      // Fallback to latest enrollment
      const latestEnrollment = studentEnrollments[studentEnrollments.length - 1];
      return latestEnrollment?.status || 'Not Enrolled';
    };

    return students.map((student) => {
      const studentId = String(student._id || '').trim();
      const studentAssignments = studentId ? assignmentsByStudentId.get(studentId) || [] : [];
      const matchedAssignment = findMatchingAssignment(studentAssignments, student.semester, student.schoolYear);
      const matchedWaitlist = studentId ? waitlistByStudentId.get(studentId)?.[0] : null;
      const resolvedAssignment = matchedAssignment || matchedWaitlist;

      if (!resolvedAssignment?.sectionId) {
        return {
          ...student,
          section: '',
          enrollmentStatus: getEnrollmentStatus(String(student._id), student.semester, student.schoolYear),
          lifecycleStatus: StudentController.deriveLifecycleStatus(student)
        };
      }

      const sectionCode = sectionCodeById.get(String(resolvedAssignment.sectionId));
      if (!sectionCode) {
        return {
          ...student,
          section: '',
          enrollmentStatus: getEnrollmentStatus(String(student._id), student.semester, student.schoolYear),
          lifecycleStatus: StudentController.deriveLifecycleStatus(student)
        };
      }

      return {
        ...student,
        section: sectionCode,
        enrollmentStatus: getEnrollmentStatus(String(student._id), student.semester, student.schoolYear),
        lifecycleStatus: StudentController.deriveLifecycleStatus({
          ...student,
          section: sectionCode
        })
      };
    });
  }

  static async getStudentByIdRecord(id) {
    return Student.findById(id);
  }

  static async getStudentByNumberRecord(studentNumber) {
    return Student.findOne({ studentNumber });
  }

  static async updateStudentRecord(id, updateData) {
    const { set, unset } = this.normalizeStudentMutationData(updateData, { forUpdate: true });

    if (set.email) {
      const existingStudent = await Student.findOne({
        email: set.email,
        _id: { $ne: id }
      }).select('_id');
      if (existingStudent) {
        const err = new Error('A student with this email already exists');
        err.statusCode = 409;
        throw err;
      }
    }

    if (updateData?.updatedBy) {
      set.updatedBy = updateData.updatedBy;
    }
    set.lastUpdated = new Date();

    const updateOperations = {};
    if (Object.keys(set).length > 0) {
      updateOperations.$set = set;
    }
    if (unset.length > 0) {
      updateOperations.$unset = Object.fromEntries(unset.map((field) => [field, '']));
    }

    return Student.findByIdAndUpdate(id, updateOperations, {
      new: true,
      runValidators: true
    });
  }

  static normalizeStudentMutationData(studentData, options = {}) {
    const { forUpdate = false } = options;
    const source = studentData || {};
    const set = {};
    const unset = [];

    for (const field of STUDENT_MUTABLE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(source, field)) continue;

      let value = source[field];
      if (value === undefined) continue;

      if (field === 'emergencyContact') {
        const normalizedEmergencyContact = normalizeEmergencyContact(value);
        if (!normalizedEmergencyContact) {
          if (forUpdate) unset.push(field);
          continue;
        }
        set[field] = normalizedEmergencyContact;
        continue;
      }

      if (TRIMMED_STUDENT_STRING_FIELDS.has(field) && typeof value === 'string') {
        value = value.trim();
      }

      // Special handling for course field - allow string values that will be converted by controller
      if (field === 'course' && typeof value === 'string') {
        value = value.trim();
      }

      if (
        CLEARABLE_STUDENT_FIELDS.has(field) &&
        (value === '' || value === null)
      ) {
        if (forUpdate) unset.push(field);
        continue;
      }

      if (field === 'latestGrade' && value !== '') {
        value = Number(value);
      }

      set[field] = value;
    }

    if (!set.studentStatus) {
      delete set.studentStatus;
    }
    // Policy: a dropped student returns as Irregular (retaking lacking
    // requirements), never straight to Regular. Align the block-eligibility
    // classification when the registrar does not set it explicitly.
    if (set.studentStatus === 'Irregular' && !set.classification) {
      set.classification = 'Irregular';
    }
    if (!set.lifecycleStatus) {
      delete set.lifecycleStatus;
    }
    if (!set.corStatus && !forUpdate) {
      set.corStatus = 'Pending';
    }
    if (!set.studentStatus && !forUpdate) {
      set.studentStatus = 'Regular';
    }
    if (!set.lifecycleStatus && !forUpdate) {
      set.lifecycleStatus = 'Pending';
    }

    const requestedLifecycleStatus = String(set.lifecycleStatus || '').trim();
    if (requestedLifecycleStatus === 'Pending') {
      if (!set.enrollmentStatus) set.enrollmentStatus = 'Not Enrolled';
      if (!set.corStatus) set.corStatus = 'Pending';
      if (set.isActive === undefined) set.isActive = true;
    } else if (requestedLifecycleStatus === 'Enrolled') {
      // enrollmentStatus is deprecated - managed via Enrollment records
      if (set.isActive === undefined) set.isActive = true;
    } else if (requestedLifecycleStatus === 'Not Enrolled') {
      // enrollmentStatus is deprecated - managed via Enrollment records
      if (set.isActive === undefined) set.isActive = true;
    } else if (requestedLifecycleStatus === 'Dropped') {
      set.studentStatus = 'Dropped';
      // enrollmentStatus is deprecated - managed via Enrollment records
      if (set.isActive === undefined) set.isActive = true;
    } else if (requestedLifecycleStatus === 'Inactive') {
      set.isActive = false;
      // enrollmentStatus is deprecated - managed via Enrollment records
    } else if (requestedLifecycleStatus === 'Graduated') {
      set.isActive = false;
      // enrollmentStatus is deprecated - managed via Enrollment records
      if (!set.corStatus) set.corStatus = 'Verified';
    }

    if (String(set.corStatus || '').trim() === 'Verified') {
      if (requestedLifecycleStatus !== 'Dropped' && requestedLifecycleStatus !== 'Inactive' && requestedLifecycleStatus !== 'Graduated') {
        // enrollmentStatus is deprecated - managed via Enrollment records
      }
      if (!requestedLifecycleStatus) {
        set.lifecycleStatus = 'Enrolled';
      }
    }

    if (set.isActive === false && !requestedLifecycleStatus) {
      set.lifecycleStatus = 'Inactive';
    }

    return { set, unset: Array.from(new Set(unset)) };
  }

  static async deleteStudentRecord(id) {
    return Student.findByIdAndDelete(id);
  }

  static async getEnrollmentHistoryRecord(studentId) {
    return Enrollment.find({ studentId })
      .sort({ schoolYear: -1, semester: -1 })
      .populate('subjects.subjectId');
  }

  static courseLabelMap = {
    101: 'Bachelor of Elementary Education (BEED)',
    102: 'Bachelor of Secondary Education – Major in English',
    103: 'Bachelor of Secondary Education – Major in Mathematics',
    201: 'Bachelor of Science in Business Administration – Major in HRM'
  };

  static courseCodeMap = {
    101: 'BEED',
    102: 'BSEd-English',
    103: 'BSEd-Math',
    201: 'BSBA-HRM'
  };

  static async getCurrentEnrollmentRecord(studentId, schoolYear, semester) {
    return Enrollment.findOne({
      studentId,
      schoolYear,
      semester,
      status: { $ne: 'Dropped' },
      isCurrent: true
    }).populate('subjects.subjectId');
  }

  static async mapSubjectIdsToEnrollmentSubjects(subjectIds = []) {
    if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
      return [];
    }

    const normalizedIds = subjectIds
      .map((subjectId) => String(subjectId).trim())
      .filter((subjectId) => mongoose.Types.ObjectId.isValid(subjectId));

    const subjectsById = new Map();
    if (normalizedIds.length > 0) {
      const matchedSubjects = await Subject.find({ _id: { $in: normalizedIds } })
        .select('_id code title units')
        .lean();
      matchedSubjects.forEach((subject) => {
        subjectsById.set(String(subject._id), subject);
      });
    }

    return subjectIds.map((subjectId, index) => {
      const normalizedId = String(subjectId).trim();
      const matched = subjectsById.get(normalizedId);
      return {
        subjectId: mongoose.Types.ObjectId.isValid(normalizedId)
          ? normalizedId
          : new mongoose.Types.ObjectId(),
        code: matched?.code || `SUBJ-${index + 1}`,
        title: matched?.title || `Subject ${index + 1}`,
        units: matched?.units || 3,
        schedule: 'TBA',
        room: 'TBA',
        instructor: 'TBA',
        status: 'Enrolled'
      };
    });
  }

  static calculateTuitionFee(units) {
    return units * 1000;
  }

  static calculateMiscFee() {
    return 5000;
  }

  static calculateTotalFee(units) {
    return this.calculateTuitionFee(units) + this.calculateMiscFee();
  }

  static async createEnrollmentRecord({
    student,
    schoolYear,
    semester,
    subjectIds,
    createdBy
  }) {
    const enrollmentCourseMap = {
      101: 'BEED',
      102: 'BSED',
      103: 'BSED',
      201: 'BSBA'
    };
    const normalizedCourse = enrollmentCourseMap[Number(student.course)] || 'BEED';

    // Resolve curriculum for this program — populate curriculumId on new enrollments
    let curriculumId = null;
    if (student.curriculumVersion) {
      const matchedCurriculum = await Curriculum.findOne({
        programCode: Number(student.course),
        version: String(student.curriculumVersion).trim(),
      }).select('_id').lean();
      if (matchedCurriculum) {
        curriculumId = matchedCurriculum._id;
      }
    }
    // If no explicit version match, try active curriculum for the program
    if (!curriculumId) {
      const activeCurriculum = await Curriculum.findOne({
        programCode: Number(student.course),
        status: 'Active',
      }).select('_id').lean();
      if (activeCurriculum) {
        curriculumId = activeCurriculum._id;
      }
    }

    // If no manual subjectIds provided, auto-populate from CurriculumSubject
    let finalSubjectIds = subjectIds;
    if ((!Array.isArray(finalSubjectIds) || finalSubjectIds.length === 0) && curriculumId) {
      const curriculumSubjects = await CurriculumSubject.find({
        curriculumId,
        yearLevel: Number(student.yearLevel),
        semester,
      }).select('subjectId').lean();
      finalSubjectIds = curriculumSubjects.map((cs) => cs.subjectId);
    }

    const subjects = await this.mapSubjectIdsToEnrollmentSubjects(finalSubjectIds);
    const totalUnits = subjects.reduce((sum, subject) => sum + subject.units, 0);

    const enrollment = new Enrollment({
      studentId: student._id,
      studentNumber: student.studentNumber,
      schoolYear,
      semester,
      yearLevel: student.yearLevel,
      course: normalizedCourse,
      curriculumId,
      subjects,
      assessment: {
        tuitionFee: this.calculateTuitionFee(totalUnits),
        miscFee: this.calculateMiscFee(),
        totalAmount: this.calculateTotalFee(totalUnits)
      },
      status: 'Pending',
      createdBy
    });

    await enrollment.save();
    return enrollment;
  }

  static async createStudent(req, res) {
    try {
      const student = await StudentController.createStudentRecord({
        ...req.body,
        createdBy: req.adminId
      });
      await AuditLog.create({
        action: 'CREATE',
        resourceType: 'STUDENT',
        resourceId: String(student._id),
        resourceName: `${student.studentNumber} — ${student.lastName}, ${student.firstName}`,
        description: `Created student record: ${student.studentNumber} (${student.course})`,
        performedBy: req.adminId,
        performedByRole: String(req.accountType || 'registrar').toLowerCase() === 'admin' ? 'admin' : 'registrar',
        newValue: { studentNumber: student.studentNumber, course: student.course, yearLevel: student.yearLevel },
        status: 'SUCCESS',
        severity: 'MEDIUM',
      });

      res.status(201).json({
        success: true,
        data: student,
        message: 'Student account created successfully'
      });
    } catch (error) {
      console.error('Error creating student:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to create student account'
      });
    }
  }

  static async getNextStudentNumber(req, res) {
    try {
      const { course, schoolYear } = req.query;
      const studentNumber = await StudentNumberService.previewStudentNumber(course, schoolYear);

      res.json({
        success: true,
        data: { studentNumber }
      });
    } catch (error) {
      console.error('Error generating student number preview:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate student number preview'
      });
    }
  }

  static async getStudents(req, res) {
    try {
      const students = await StudentController.getStudentsRecord(req.query);
      res.json({
        success: true,
        data: students
      });
    } catch (error) {
      console.error('Error fetching students:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch students'
      });
    }
  }

  static async getStudentById(req, res) {
    try {
      const { id } = req.params;
      const student = await StudentController.getStudentByIdRecord(id);

      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      res.json({
        success: true,
        data: student
      });
    } catch (error) {
      console.error('Error fetching student:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch student'
      });
    }
  }

  static async getStudentByNumber(req, res) {
    try {
      const { studentNumber } = req.params;
      const student = await StudentController.getStudentByNumberRecord(studentNumber);

      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      res.json({
        success: true,
        data: student
      });
    } catch (error) {
      console.error('Error fetching student:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch student'
      });
    }
  }

  static async updateStudent(req, res) {
    try {
      const { id } = req.params;
      const previous = await StudentController.getStudentByIdRecord(id);
      if (!previous) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      const requestedCorStatus = String(req.body?.corStatus || '').trim();
      const previousCorStatus = String(previous.corStatus || '').trim();

      const hasAcademicChange =
        (req.body?.course !== undefined && Number(req.body.course) !== Number(previous.course)) ||
        (req.body?.yearLevel !== undefined && Number(req.body.yearLevel) !== Number(previous.yearLevel)) ||
        (req.body?.studentStatus !== undefined && String(req.body.studentStatus) !== String(previous.studentStatus));

      // ─── Enrollment guard: the backend is the sole authority for ENROLLED. ───
      // A direct transition to lifecycleStatus='Enrolled' (including the
      // corStatus=Verified auto-promotion) is only allowed when a valid block
      // assignment already exists for the student's academic period/context.
      const previousObject = previous.toObject ? previous.toObject() : { ...previous };
      const preCheck = StudentController.normalizeStudentMutationData(req.body, { forUpdate: true });
      const explicitlyRequestsEnrolled =
        String(preCheck.set.lifecycleStatus || '').trim() === 'Enrolled' &&
        String(previousObject.lifecycleStatus || '').trim() !== 'Enrolled';
      if (explicitlyRequestsEnrolled) {
        try {
          await enrollmentGuard.assertEnrolledRequirements({ ...previousObject, ...preCheck.set });
        } catch (guardError) {
          return res.status(guardError.statusCode || 409).json({
            success: false,
            message:
              'Cannot mark student as Enrolled: a valid block assignment for the same school year, semester, course, and year level is required. Assign a block first.',
            details: guardError.details || [guardError.message]
          });
        }
      }

      const student = await StudentController.updateStudentRecord(id, {
        ...req.body,
        updatedBy: req.adminId
      });

      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      let blockMembershipCleared = false;
      if (hasAcademicChange) {
        await StudentController.cleanupBlockMembershipForStudent(id);
        blockMembershipCleared = true;
      }

      // Post-mutation re-verification: academic changes wipe block membership,
      // so a student that still claims ENROLLED afterwards is demoted back to
      // the non-final Pending state instead of keeping an invalid status.
      let enrollmentDemoted = false;
      const finalCheck = await StudentController.getStudentByIdRecord(id);
      if (finalCheck && String(finalCheck.lifecycleStatus || '').trim() === 'Enrolled') {
        try {
          await enrollmentGuard.assertEnrolledRequirements(
            finalCheck.toObject ? finalCheck.toObject() : { ...finalCheck }
          );
        } catch (guardError) {
          await Student.findByIdAndUpdate(id, { $set: { lifecycleStatus: 'Pending' } });
          enrollmentDemoted = true;
        }
      }

      const gradeChanged = req.body?.latestGrade !== undefined && Number(req.body.latestGrade) !== Number(previous.latestGrade);

      let description = `Updated student record: ${student.studentNumber}`;
      if (gradeChanged) {
        description += ` — Grade updated from ${previous.latestGrade ?? 'none'} to ${student.latestGrade}`;
      }
      if (blockMembershipCleared) {
        description += ' (academic change — block membership cleared)';
      }
      if (enrollmentDemoted) {
        description += ' (lifecycle reverted Enrolled → Pending: no valid block assignment remains for the current academic period)';
      }

      const performedByRole = String(req.accountType || 'registrar').toLowerCase() === 'admin' ? 'admin' : 'registrar';
      const corVerifiedTransition = requestedCorStatus === 'Verified' && previousCorStatus !== 'Verified';

      await AuditLog.create({
        action: 'UPDATE',
        resourceType: 'STUDENT',
        resourceId: String(student._id),
        resourceName: `${student.studentNumber} — ${student.lastName}, ${student.firstName}`,
        description,
        performedBy: req.adminId,
        performedByRole,
        oldValue: { course: previous.course, yearLevel: previous.yearLevel, studentStatus: previous.studentStatus, latestGrade: previous.latestGrade, corStatus: previousCorStatus || 'Pending' },
        newValue: { course: student.course, yearLevel: student.yearLevel, studentStatus: student.studentStatus, latestGrade: student.latestGrade, corStatus: student.corStatus || 'Pending' },
        status: 'SUCCESS',
        severity: hasAcademicChange ? 'HIGH' : 'MEDIUM',
      });

      if (corVerifiedTransition) {
        await AuditLog.create({
          action: 'APPROVE',
          resourceType: 'STUDENT',
          resourceId: String(student._id),
          resourceName: `${student.studentNumber} — ${student.lastName}, ${student.firstName}`,
          description: `COR verified for ${student.studentNumber} (corStatus: ${previousCorStatus || 'Pending'} → Verified)`,
          performedBy: req.adminId,
          performedByRole,
          oldValue: { corStatus: previousCorStatus || 'Pending' },
          newValue: { corStatus: 'Verified' },
          status: 'SUCCESS',
          severity: 'HIGH',
        });
      }

      res.json({
        success: true,
        data: enrollmentDemoted ? { ...student.toObject(), lifecycleStatus: 'Pending' } : student,
        message: enrollmentDemoted
          ? 'Student information updated successfully. Lifecycle reverted to Pending because no valid block assignment remains — assign a block to finalize enrollment.'
          : blockMembershipCleared
            ? 'Student information updated successfully. Existing block assignment was cleared due to academic changes.'
            : 'Student information updated successfully'
      });
    } catch (error) {
      console.error('Error updating student:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to update student information'
      });
    }
  }

  static async deleteStudent(req, res) {
    try {
      const { id } = req.params;
      await StudentController.cleanupBlockMembershipForStudent(id);

      const student = await StudentController.deleteStudentRecord(id);

      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      await AuditLog.create({
        action: 'DELETE',
        resourceType: 'STUDENT',
        resourceId: String(student._id),
        resourceName: `${student.studentNumber} — ${student.lastName}, ${student.firstName}`,
        description: `Deleted student record: ${student.studentNumber}`,
        performedBy: req.adminId,
        performedByRole: String(req.accountType || 'registrar').toLowerCase() === 'admin' ? 'admin' : 'registrar',
        oldValue: { studentNumber: student.studentNumber, course: student.course, yearLevel: student.yearLevel },
        status: 'SUCCESS',
        severity: 'HIGH',
      });

      res.json({
        success: true,
        data: student,
        message: 'Student deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting student:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete student'
      });
    }
  }

  static async enrollStudent(req, res) {
    try {
      const { id } = req.params;
      const { schoolYear, semester, subjectIds } = req.body;

      if (!schoolYear || !semester || !Array.isArray(subjectIds)) {
        return res.status(400).json({
          success: false,
          message: 'School year, semester, and subject IDs are required'
        });
      }

      if (typeof schoolYear !== 'string' || typeof semester !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Invalid school year or semester'
        });
      }

      const student = await StudentController.getStudentByIdRecord(id);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }

      const existingEnrollment = await Enrollment.findOne({
        studentId: id,
        schoolYear,
        semester,
        status: { $ne: 'Dropped' }
      });

      if (existingEnrollment) {
        return res.status(400).json({
          success: false,
          message: 'Student is already enrolled for this semester'
        });
      }

      const enrollment = await StudentController.createEnrollmentRecord({
        student,
        schoolYear,
        semester,
        subjectIds,
        createdBy: req.adminId
      });

      await AuditLog.create({
        action: 'CREATE',
        resourceType: 'REGISTRATION',
        resourceId: String(enrollment._id),
        resourceName: `${student.studentNumber} — ${schoolYear} ${semester}`, 
        description: `Enrolled student: ${student.studentNumber} for ${schoolYear} ${semester} (${subjectIds.length} subjects)`,
        performedBy: req.adminId,
        performedByRole: String(req.accountType || 'registrar').toLowerCase() === 'admin' ? 'admin' : 'registrar',
        newValue: { studentId: String(student._id), studentNumber: student.studentNumber, schoolYear, semester, subjectCount: subjectIds.length },
        status: 'SUCCESS',
        severity: 'MEDIUM',
      });

      res.status(201).json({
        success: true,
        data: enrollment,
        message: 'Enrollment successful'
      });
    } catch (error) {
      console.error('Error processing enrollment:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to process enrollment'
      });
    }
  }

  static async getCurrentEnrollment(req, res) {
    try {
      const { id } = req.params;
      const { schoolYear, semester } = req.query;

      if (!schoolYear || !semester) {
        return res.status(400).json({
          success: false,
          message: 'School year and semester are required'
        });
      }

      const enrollment = await StudentController.getCurrentEnrollmentRecord(
        id,
        schoolYear,
        semester
      );

      if (!enrollment) {
        return res.status(404).json({
          success: false,
          message: 'No active enrollment found'
        });
      }

      res.json({
        success: true,
        data: enrollment
      });
    } catch (error) {
      console.error('Error fetching current enrollment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch current enrollment'
      });
    }
  }

  static async getEnrollmentHistory(req, res) {
    try {
      const { id } = req.params;
      const enrollments = await StudentController.getEnrollmentHistoryRecord(id);

      res.json({
        success: true,
        data: enrollments
      });
    } catch (error) {
      console.error('Error fetching enrollment history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch enrollment history'
      });
    }
  }

  static getDominantValue(valueMap, fallback = 'TBA') {
    if (!(valueMap instanceof Map) || valueMap.size === 0) return fallback;
    let topValue = fallback;
    let topCount = -1;
    valueMap.forEach((count, value) => {
      if (count > topCount) {
        topValue = value;
        topCount = count;
      }
    });
    return topValue || fallback;
  }

  static async getSectionEnrollmentContext(sectionId, options = {}) {
    const section = await BlockSection.findById(sectionId).select('_id sectionCode blockGroupId');
    if (!section) {
      const error = new Error('Section not found');
      error.statusCode = 404;
      throw error;
    }

    const blockGroup = section.blockGroupId
      ? await BlockGroup.findById(section.blockGroupId).select('_id name semester year').lean()
      : null;

    const resolvedSemester = String(options.semester || blockGroup?.semester || '').trim();
    const resolvedSchoolYear = String(
      options.schoolYear || String(blockGroup?.year || '').trim() || ''
    ).trim();

    const assignmentQuery = {
      sectionId: section._id,
      status: 'ASSIGNED'
    };
    if (resolvedSemester) assignmentQuery.semester = resolvedSemester;
    // Year conventions vary across records (bare "2026" vs "2026-2027"),
    // so match either form instead of finding zero students in sections
    // whose assignments were stored with the other convention.
    const yearVariants = new Set();
    if (resolvedSchoolYear) {
      yearVariants.add(resolvedSchoolYear);
      const startYear = Number(String(resolvedSchoolYear).split('-')[0]);
      if (Number.isFinite(startYear) && startYear > 0) {
        yearVariants.add(String(startYear));
      }
    } else if (blockGroup?.year) {
      yearVariants.add(String(blockGroup.year).trim());
      const startYear = Number(String(blockGroup.year).trim().split('-')[0]);
      if (Number.isFinite(startYear) && startYear > 0) {
        yearVariants.add(String(startYear));
        yearVariants.add(`${startYear}-${startYear + 1}`);
      }
    }
    if (yearVariants.size > 0) {
      assignmentQuery.year = { $in: Array.from(yearVariants).filter(Boolean) };
    }

    const assignments = await StudentBlockAssignment.find(assignmentQuery).select('studentId semester year').lean();
    const studentObjectIds = assignments
      .map((entry) => String(entry.studentId || '').trim())
      .filter((studentId) => mongoose.Types.ObjectId.isValid(studentId))
      .map((studentId) => new mongoose.Types.ObjectId(studentId));

    if (studentObjectIds.length === 0) {
      return {
        section,
        blockGroup,
        resolvedSemester,
        resolvedSchoolYear,
        studentObjectIds: [],
        enrollments: []
      };
    }

    const enrollmentQuery = {
      studentId: { $in: studentObjectIds },
      status: { $ne: 'Dropped' },
      isCurrent: true
    };
    if (resolvedSchoolYear) enrollmentQuery.schoolYear = resolvedSchoolYear;
    if (resolvedSemester) enrollmentQuery.semester = resolvedSemester;

    const enrollments = await Enrollment.find(enrollmentQuery).sort({ createdAt: -1 });
    return {
      section,
      blockGroup,
      resolvedSemester,
      resolvedSchoolYear,
      studentObjectIds,
      enrollments
    };
  }

  static async getSectionSubjectAssignments(req, res) {
    try {
      const { sectionId } = req.params;
      const { semester, schoolYear } = req.query;
      const context = await StudentController.getSectionEnrollmentContext(sectionId, { semester, schoolYear });
      const assignmentBuckets = new Map();

      context.enrollments.forEach((enrollment) => {
        const studentId = String(enrollment.studentId || '').trim();
        (Array.isArray(enrollment.subjects) ? enrollment.subjects : []).forEach((entry) => {
          if (String(entry?.status || '').toLowerCase() === 'dropped') return;

          const subjectId = String(entry?.subjectId || '').trim();
          const subjectCode = String(entry?.code || '').trim() || 'SUBJECT';
          const bucketKey = subjectId || subjectCode;
          let bucket = assignmentBuckets.get(bucketKey);
          if (!bucket) {
            bucket = {
              subjectId,
              subjectCode,
              subjectTitle: String(entry?.title || '').trim() || 'Untitled subject',
              instructorCounts: new Map(),
              scheduleCounts: new Map(),
              roomCounts: new Map(),
              studentIds: new Set()
            };
            assignmentBuckets.set(bucketKey, bucket);
          }

          const instructor = String(entry?.instructor || '').trim() || 'TBA';
          const scheduleValue = String(entry?.schedule || '').trim() || 'TBA';
          const roomValue = String(entry?.room || '').trim() || 'TBA';
          bucket.instructorCounts.set(instructor, (bucket.instructorCounts.get(instructor) || 0) + 1);
          bucket.scheduleCounts.set(scheduleValue, (bucket.scheduleCounts.get(scheduleValue) || 0) + 1);
          bucket.roomCounts.set(roomValue, (bucket.roomCounts.get(roomValue) || 0) + 1);
          bucket.studentIds.add(studentId);
        });
      });

      const assignments = Array.from(assignmentBuckets.values())
        .map((bucket) => ({
          subjectId: bucket.subjectId,
          subjectCode: bucket.subjectCode,
          subjectTitle: bucket.subjectTitle,
          instructor: StudentController.getDominantValue(bucket.instructorCounts, 'TBA'),
          schedule: StudentController.getDominantValue(bucket.scheduleCounts, 'TBA'),
          room: StudentController.getDominantValue(bucket.roomCounts, 'TBA'),
          studentCount: bucket.studentIds.size
        }))
        .sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));

      res.json({
        success: true,
        data: {
          sectionId: String(context.section._id),
          sectionCode: context.section.sectionCode,
          semester: context.resolvedSemester || '',
          schoolYear: context.resolvedSchoolYear || '',
          studentCount: context.studentObjectIds.length,
          assignments
        }
      });
    } catch (error) {
      console.error('Error fetching section subject assignments:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to fetch section subject assignments'
      });
    }
  }

  static async assignSubjectInstructorToSection(req, res) {
    try {
      const { sectionId } = req.params;
      const { subjectId, instructor, schedule, room, semester, schoolYear } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(sectionId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid section id'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(String(subjectId || '').trim())) {
        return res.status(400).json({
          success: false,
          message: 'Valid subject id is required'
        });
      }

      const normalizedInstructor = String(instructor || '').trim();
      if (!normalizedInstructor) {
        return res.status(400).json({
          success: false,
          message: 'Instructor name is required'
        });
      }

      const context = await StudentController.getSectionEnrollmentContext(sectionId, { semester, schoolYear });
      const section = context.section;

      const subject = await Subject.findById(securityMiddleware.safeObjectId(subjectId)).select('_id code title');
      if (!subject) {
        return res.status(404).json({
          success: false,
          message: 'Subject not found'
        });
      }

      if (context.studentObjectIds.length === 0) {
        const termLabel = `${context.resolvedSemester || '?'} ${context.resolvedSchoolYear || ''}`.trim();
        return res.status(400).json({
          success: false,
          message: `No assigned students found in this section${termLabel !== '?' ? ` for ${termLabel}` : ''}`
        });
      }

      if (context.enrollments.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No matching enrollments found for students in this section'
        });
      }

      const normalizedSubjectId = String(subject._id);
      const normalizedSchedule = String(schedule || '').trim();
      const normalizedRoom = String(room || '').trim();
      const updatedEnrollmentIds = [];
      let matchedSubjects = 0;

      for (const enrollment of context.enrollments) {
        let enrollmentChanged = false;
        enrollment.subjects.forEach((entry) => {
          if (String(entry?.subjectId || '') === normalizedSubjectId) {
            entry.instructor = normalizedInstructor;
            if (normalizedSchedule) entry.schedule = normalizedSchedule;
            if (normalizedRoom) entry.room = normalizedRoom;
            entry.dateModified = new Date();
            enrollmentChanged = true;
            matchedSubjects += 1;
          }
        });

        if (enrollmentChanged) {
          enrollment.markModified('subjects');
          await enrollment.save();
          updatedEnrollmentIds.push(String(enrollment._id));
        }
      }

      if (updatedEnrollmentIds.length === 0) {
        return res.status(404).json({
          success: false,
          message: `Subject ${subject.code} is not enrolled in the selected section's current enrollments`
        });
      }

      res.json({
        success: true,
        message: req.method === 'PUT' ? 'Instructor assignment updated successfully' : 'Instructor and schedule assigned successfully',
        data: {
          sectionId: String(section._id),
          sectionCode: section.sectionCode,
          subjectId: normalizedSubjectId,
          subjectCode: subject.code,
          subjectTitle: subject.title,
          instructor: normalizedInstructor,
          schedule: normalizedSchedule || 'TBA',
          room: normalizedRoom || 'TBA',
          updatedEnrollments: updatedEnrollmentIds.length,
          matchedSubjectEntries: matchedSubjects
        }
      });
    } catch (error) {
      console.error('Error assigning section subject instructor:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to assign instructor to section subject'
      });
    }
  }

  static async clearSubjectInstructorForSection(req, res) {
    try {
      const { sectionId, subjectId } = req.params;
      const context = await StudentController.getSectionEnrollmentContext(sectionId);
      const subject = await Subject.findById(securityMiddleware.safeObjectId(subjectId)).select('_id code title');

      if (!subject) {
        return res.status(404).json({
          success: false,
          message: 'Subject not found'
        });
      }

      if (context.enrollments.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No matching enrollments found for students in this section'
        });
      }

      const normalizedSubjectId = String(subject._id);
      let updatedEnrollments = 0;
      let matchedSubjects = 0;

      for (const enrollment of context.enrollments) {
        let changed = false;
        enrollment.subjects.forEach((entry) => {
          if (String(entry?.subjectId || '') === normalizedSubjectId) {
            entry.instructor = 'TBA';
            entry.schedule = 'TBA';
            entry.room = 'TBA';
            entry.dateModified = new Date();
            changed = true;
            matchedSubjects += 1;
          }
        });

        if (changed) {
          enrollment.markModified('subjects');
          await enrollment.save();
          updatedEnrollments += 1;
        }
      }

      if (updatedEnrollments === 0) {
        return res.status(404).json({
          success: false,
          message: `Subject ${subject.code} is not enrolled in the selected section's current enrollments`
        });
      }

      res.json({
        success: true,
        message: 'Instructor assignment removed successfully',
        data: {
          sectionId: String(context.section._id),
          sectionCode: context.section.sectionCode,
          subjectId: normalizedSubjectId,
          subjectCode: subject.code,
          subjectTitle: subject.title,
          updatedEnrollments,
          matchedSubjectEntries: matchedSubjects
        }
      });
    } catch (error) {
      console.error('Error clearing section subject instructor:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to clear instructor assignment from section subject'
      });
    }
  }

  static async resolveCorEnrollment(student) {
    const base = { studentId: student._id, status: { $ne: 'Dropped' } };
    const schoolYear = String(student.schoolYear || '').trim();
    const semester = String(student.semester || '').trim();

    // 1) enrollment matching the student's current term, 2) any current enrollment, 3) latest one
    const filters = [];
    if (schoolYear && semester) filters.push({ ...base, schoolYear, semester });
    filters.push({ ...base, isCurrent: true });
    filters.push(base);

    for (const filter of filters) {
      const enrollment = await Enrollment.findOne(filter)
        .sort({ isCurrent: -1, createdAt: -1 })
        .populate('curriculumId', 'name code version programName totalUnits');
      if (enrollment) return enrollment;
    }
    return null;
  }

  static async resolveCurriculumLabel(enrollment, student, courseCode) {
    const populated = enrollment?.curriculumId;
    if (populated && typeof populated === 'object') {
      const label = populated.name || populated.code || populated.programName;
      const text = [label, populated.version ? `v${populated.version}` : null].filter(Boolean).join(' ');
      return text || populated.programName || 'N/A';
    }

    if (student.curriculumVersion) return student.curriculumVersion;

    const active = await Curriculum.findActiveByProgram(Number(courseCode));
    if (active) {
      const label = active.name || active.code || active.programName;
      return `${label || 'Curriculum'} v${active.version}`;
    }
    return 'N/A';
  }

  /**
   * If a professor account was deleted but the enrollment still carries the old
   * instructor text, reset it to TBA so the COR never prints a stale name.
   */
  static async clearStaleInstructors(enrollment) {
    if (!enrollment || !Array.isArray(enrollment.subjects)) return;

    const normalize = (value) => String(value || '').trim().toLowerCase();
    const professors = await Admin.find({ accountType: 'professor', status: { $ne: 'inactive' } })
      .select('username displayName uid')
      .lean();
    const known = new Set(
      professors
        .flatMap((professor) => [professor.username, professor.displayName, professor.uid])
        .map(normalize)
        .filter(Boolean)
    );

    let changed = false;
    enrollment.subjects.forEach((subject) => {
      const instructor = String(subject?.instructor || '').trim();
      if (!instructor || /^TBA$/i.test(instructor)) return;
      if (!known.has(normalize(instructor))) {
        subject.instructor = 'TBA';
        subject.dateModified = new Date();
        changed = true;
      }
    });

    if (changed) {
      enrollment.markModified('subjects');
      await enrollment.save();
    }
  }

  static async resolveClassBlockLabel(student, courseAbbreviation) {
    const assignment = await StudentBlockAssignment.findOne({
      studentId: String(student._id),
      status: 'ASSIGNED'
    })
      .sort({ createdAt: -1 })
      .select('sectionId')
      .lean();
    if (!assignment?.sectionId) return 'N/A';

    const section = await BlockSection.findById(assignment.sectionId)
      .select('sectionCode blockCode name')
      .lean();

    return (
      CorPdfService.helpers.formatClassBlockLabel(section?.sectionCode, courseAbbreviation) ||
      section?.blockCode ||
      section?.name ||
      'N/A'
    );
  }

  static async ensureRegistrationNumber(student) {
    if (student.registrationNumber) return student.registrationNumber;
    const generated = `${new Date().getFullYear()}${Math.floor(100000 + Math.random() * 900000)}`;
    student.registrationNumber = generated;
    await student.save({ validateBeforeSave: false });
    return generated;
  }

  static async buildCorViewModel(student, { adminId, username } = {}) {
    const h = CorPdfService.helpers;

    // --- program / course ---
    const courseCode = StudentController.courseCodeFromValue(student.course) || '000';
    const courseAbbreviation =
      StudentController.courseCodeMap[Number(courseCode)] ||
      StudentController.courseCodeMap[student.course] ||
      String(student.course || '').trim();
    const courseLabel =
      StudentController.courseLabelMap[Number(courseCode)] ||
      StudentController.courseLabelMap[student.course] ||
      student.course ||
      'N/A';

    // --- enrollment + subjects ---
    const enrollment = await StudentController.resolveCorEnrollment(student);
    await StudentController.clearStaleInstructors(enrollment);

    const activeSubjects = (Array.isArray(enrollment?.subjects) ? enrollment.subjects : []).filter(
      (subject) => String(subject?.status || '').toLowerCase() !== 'dropped'
    );
    const classBlockLabel = await StudentController.resolveClassBlockLabel(student, courseAbbreviation);
    const unitBreakdown = h.computeUnitBreakdown(activeSubjects);
    const totalUnits = activeSubjects.reduce((sum, subject) => sum + (Number(subject?.units) || 0), 0);

    // --- registrar ---
    const registrar = adminId ? await Admin.findById(adminId).select('displayName') : null;
    const registrarName = registrar?.displayName || username || "Registrar's Office";

    // --- QR target ---
    const appBaseUrl = String(
      process.env.APP_DOWNLOAD_URL || 'https://west-coast-college-admin-production.up.railway.app'
    ).replace(/\/+$/, '');

    return {
      registrationNumber: await StudentController.ensureRegistrationNumber(student),
      issuedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      registrarName,
      qrUrl: `${appBaseUrl}/download-apk`,
      student: {
        number: h.formatStudentNumber(student.studentNumber, courseCode),
        name: [student.firstName, student.middleName, student.lastName, student.suffix]
          .map((part) => h.cleanText(part))
          .filter(Boolean)
          .join(' '),
        program: h.extractProgram(courseLabel),
        major: h.extractMajor(student.major) || h.extractMajor(courseLabel) || 'N/A',
        yearLevel: String(enrollment?.yearLevel || student.yearLevel || 'N/A'),
        semester: String(enrollment?.semester || student.semester || 'N/A'),
        schoolYear: String(enrollment?.schoolYear || student.schoolYear || 'N/A'),
        sex: h.cleanText(student.gender, 'N/A'),
        age: h.calculateAge(student.birthDate),
        college: 'Pio Duran',
        curriculum: await StudentController.resolveCurriculumLabel(enrollment, student, courseCode)
      },
      subjects:
        activeSubjects.length === 0
          ? [{ code: '-', title: 'No enrolled subjects found', units: '-', block: '-', days: '-', time: '-', room: '-', faculty: '-' }]
          : activeSubjects.map((subject) => h.buildSubjectRow(subject, classBlockLabel)),
      totals: {
        subjects: activeSubjects.length,
        units: totalUnits,
        lecture: unitBreakdown.lectureUnits,
        lab: unitBreakdown.labUnits
      }
    };
  }

  /**
   * Generate Certificate of Registration (COR) as PDF
   */
  static async generateCorPdf(req, res) {
    try {
      const student = await Student.findById(req.params.id);
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      const corData = await StudentController.buildCorViewModel(student, {
        adminId: req.adminId,
        username: req.username
      });

      const pdf = await CorPdfService.generate(corData);
      const safeName = String(student.studentNumber || student._id).replace(/[^\w.-]+/g, '_');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="COR-${safeName}.pdf"`);
      res.setHeader('Content-Length', pdf.length);
      return res.end(pdf);
    } catch (error) {
      console.error('Error generating COR PDF:', error);
      if (!res.headersSent) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to generate COR' });
      }
      res.end();
    }
  }
}

module.exports = StudentController;
