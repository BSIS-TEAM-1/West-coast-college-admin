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
const { autoAssignCurriculumSubjects, verifyRetakeReferences } = require('../services/subjectEnrollmentService');

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
  static lifecycleStatuses = ['Pending', 'Enrolled', 'Not Enrolled', 'Irregular', 'Inactive', 'Graduated'];

  static deriveLifecycleStatus(student) {
    const explicit = String(student?.lifecycleStatus || '').trim();
    if (StudentController.lifecycleStatuses.includes(explicit)) {
      return explicit;
    }
    if (explicit === 'Dropped') return 'Irregular';

    if (student?.isActive === false) return 'Inactive';

    const studentStatus = String(student?.studentStatus || '').trim();

    if (studentStatus === 'Dropped' || studentStatus === 'Irregular') return 'Irregular';
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
      if (yearFilter) blockGroupQuery.$or = [{ schoolYear: yearFilter }, { year: yearFilter }];

      const rawGroups = await BlockGroup.find(blockGroupQuery)
        .select('_id name semester schoolYear year curriculumId yearLevel')
        .sort({ schoolYear: -1, year: -1, semester: 1, name: 1 })
        .lean();

      // Fetch curriculum details for all block groups
      const curriculumIds = Array.from(new Set(
        rawGroups.map((group) => String(group.curriculumId || '').trim()).filter(Boolean)
      ));
      const curriculumMap = new Map();
      if (curriculumIds.length > 0) {
        const curriculums = await Curriculum.find({ _id: { $in: curriculumIds } })
          .select('_id programCode programName')
          .lean();
        curriculums.forEach((curriculum) => {
          curriculumMap.set(String(curriculum._id), curriculum);
        });
      }

      const filterOptions = {
        semesters: Array.from(new Set(rawGroups.map((group) => String(group.semester || '').trim()).filter(Boolean))),
        years: Array.from(new Set(rawGroups.map((group) => String(group.schoolYear || group.year || '').trim()).filter(Boolean))).sort((a, b) => b.localeCompare(a)),
        courses: Array.from(
          new Map(
            rawGroups
              .map((group) => {
                // Use curriculum programCode if available, otherwise fall back to legacy parsing
                if (group.curriculumId && curriculumMap.has(String(group.curriculumId))) {
                  const curriculum = curriculumMap.get(String(group.curriculumId));
                  const programCode = curriculum.programCode;
                  return {
                    courseCode: programCode,
                    courseShortLabel: StudentController.courseCodeMap[programCode] || String(programCode),
                    courseLabel: StudentController.courseLabelMap[programCode] || curriculum.programName || String(programCode)
                  };
                }
                return StudentController.extractBlockGroupMeta(group.name);
              })
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
        .map((group) => {
          // Use curriculum programCode if available, otherwise fall back to legacy parsing
          let meta;
          if (group.curriculumId && curriculumMap.has(String(group.curriculumId))) {
            const curriculum = curriculumMap.get(String(group.curriculumId));
            const programCode = curriculum.programCode;
            meta = {
              courseCode: programCode,
              courseShortLabel: StudentController.courseCodeMap[programCode] || String(programCode),
              courseLabel: StudentController.courseLabelMap[programCode] || curriculum.programName || String(programCode),
              yearLevel: group.yearLevel
            };
          } else {
            meta = StudentController.extractBlockGroupMeta(group.name);
          }
          return {
            ...group,
            meta
          };
        })
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
      const curriculumPlacements = curriculumIds.length > 0
        ? await CurriculumSubject.find({ curriculumId: { $in: curriculumIds } })
            .select('curriculumId subjectId yearLevel semester')
            .lean()
        : [];
      const placementIdsByTerm = new Map();
      curriculumPlacements.forEach((placement) => {
        const key = `${String(placement.curriculumId)}|${Number(placement.yearLevel)}|${String(placement.semester || '').trim()}`;
        const ids = placementIdsByTerm.get(key) || new Set();
        ids.add(String(placement.subjectId));
        placementIdsByTerm.set(key, ids);
      });
      const curriculumSubjectIdsByGroup = new Map(
        blockGroups.map((group) => {
          const yearLevel = Number(group.yearLevel) || group.meta.yearLevel;
          const key = `${String(group.curriculumId || '')}|${yearLevel}|${String(group.semester || '').trim()}`;
          return [String(group._id), placementIdsByTerm.get(key) || new Set()];
        })
      );
      const targetEnrollmentPairs = Array.from(
        new Set(
          blockGroups
            .map((group) => {
              const schoolYear = String(group.schoolYear || group.year || '').trim();
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
        .select('studentId sectionId semester schoolYear year')
        .lean();

      const relevantAssignments = studentAssignments.filter((assignment) => {
        const section = sectionById.get(String(assignment.sectionId));
        if (!section) return false;
        const group = groupById.get(String(section.blockGroupId));
        if (!group) return false;
        const assignmentSchoolYear = StudentController.toSchoolYearSafe(assignment.schoolYear || assignment.year);
        const groupSchoolYear = StudentController.toSchoolYearSafe(group.schoolYear || group.year);
        return String(assignment.semester || '').trim() === String(group.semester || '').trim()
          && assignmentSchoolYear === groupSchoolYear;
      });

      const studentIdsBySection = new Map();
      relevantAssignments.forEach((assignment) => {
        const sectionId = String(assignment.sectionId);
        const ids = studentIdsBySection.get(sectionId) || new Set();
        ids.add(String(assignment.studentId));
        studentIdsBySection.set(sectionId, ids);
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
          const entryYear = String(entry.schoolYear || entry.year || '').trim();
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

      const loadEnrollmentDocs = () => Enrollment.find(enrollmentQuery)
        .select('_id studentId schoolYear semester subjects isCurrent createdAt course')
        .sort({ isCurrent: -1, createdAt: -1 })
        .lean();
      const enrollmentDocs = await loadEnrollmentDocs();

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
          const curriculumSubjectIds = curriculumSubjectIdsByGroup.get(String(blockGroup._id)) || new Set();
          if (!curriculumSubjectIds.has(subjectId)) return;
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
            schoolYear: String(blockGroup.schoolYear || blockGroup.year || '').trim(),
            courseCode: blockGroup.meta.courseCode || null,
            courseShortLabel: blockGroup.meta.courseShortLabel || 'N/A',
            courseLabel: blockGroup.meta.courseLabel || blockGroup.meta.courseShortLabel || 'N/A',
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
                studentIds: new Set(studentIdsBySection.get(String(section._id)) || [])
              };
              unassignedBuckets.set(bucketKey, bucket);
            }
            return;
          }

          let loadBucket = loadBuckets.get(`${professorId}|${sectionSubjectKey}`);
          if (!loadBucket) {
            loadBucket = {
              ...basePayload,
              professorId,
              studentIds: new Set(studentIdsBySection.get(String(section._id)) || [])
            };
            loadBuckets.set(`${professorId}|${sectionSubjectKey}`, loadBucket);
          }
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
        const courseShortLabel = courseMeta?.label || courseMeta?.fullLabel || courseCode || 'N/A';

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

  static async cleanupBlockMembershipForStudent(studentId, { session = null } = {}) {
    const normalizedStudentId = String(studentId || '').trim();
    if (!normalizedStudentId) return;

    const scoped = (query) => (session ? query.session(session) : query);

    const assignments = await scoped(
      StudentBlockAssignment.find({ studentId: normalizedStudentId }).select('sectionId')
    ).lean();
    const waitlists = await scoped(
      SectionWaitlist.find({ studentId: normalizedStudentId }).select('sectionId')
    ).lean();

    const affectedSectionIds = Array.from(
      new Set(
        [...assignments, ...waitlists]
          .map((entry) => String(entry.sectionId || '').trim())
          .filter(Boolean)
      )
    );

    if (assignments.length > 0) {
      await scoped(StudentBlockAssignment.deleteMany({ studentId: normalizedStudentId }));
    }
    if (waitlists.length > 0) {
      await scoped(SectionWaitlist.deleteMany({ studentId: normalizedStudentId }));
    }

    if (affectedSectionIds.length === 0) return;

    const sectionObjectIds = affectedSectionIds
      .filter((sectionId) => mongoose.Types.ObjectId.isValid(sectionId))
      .map((sectionId) => new mongoose.Types.ObjectId(sectionId));

    let countAggregate = StudentBlockAssignment.aggregate([
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
    if (session) countAggregate = countAggregate.session(session);
    const assignedCounts = await countAggregate;

    const countMap = new Map(
      assignedCounts.map((item) => [String(item._id), Number(item.total) || 0])
    );

    await Promise.all(
      sectionObjectIds.map((sectionId) =>
        scoped(
          BlockSection.findByIdAndUpdate(sectionId, {
            $set: { currentPopulation: countMap.get(String(sectionId)) || 0 }
          })
        )
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

    // Imported records may carry the registrar's existing student number.
    // When it is omitted the model generates one on validate, as before.
    const requestedStudentNumber = String(studentData?.studentNumber ?? '').trim();
    if (requestedStudentNumber) {
      if (!/^\d{12}$/.test(requestedStudentNumber)) {
        const err = new Error('Student number must be a 12-digit value (YYYY + course code + sequence)');
        err.statusCode = 400;
        throw err;
      }
      const existingNumber = await Student.findOne({ studentNumber: requestedStudentNumber });
      if (existingNumber) {
        const err = new Error('A student with this student number already exists');
        err.statusCode = 409;
        throw err;
      }
      set.studentNumber = requestedStudentNumber;
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

  /**
   * Block groups for the requested program, by courseId or (legacy) by the
   * program code derived from courseCode/name. Shared by the strict and
   * fallback term passes of resolveShiftSection.
   */
  static filterShiftGroupsForProgram(groups, programCode) {
    return groups.filter((group) => {
      const structuredCourse = Number(group.courseId);
      if (Number.isFinite(structuredCourse) && structuredCourse > 0) {
        return structuredCourse === programCode;
      }
      const derivedCourse = Number(
        StudentController.courseCodeFromValue(group.courseCode || group.name)
      );
      return Number.isFinite(derivedCourse) && derivedCourse === programCode;
    });
  }

  /**
   * Term stamp start year of a block group ("2026-2027" -> 2026) from either
   * schoolYear or year, whichever shape the record carries.
   */
  static blockGroupTermStart(group) {
    for (const value of [group.schoolYear, group.year]) {
      const match = String(value ?? '').match(/(\d{4})/);
      if (match) return Number(match[1]);
    }
    return 0;
  }

  /**
   * Tiered label matching for the shift form, shared by resolveShiftSection
   * (kept as a pure, synchronous helper so it can be unit-tested offline).
   *
   * Depending on the school's block naming convention, the shift form may
   * submit any of these shapes:
   *   - the real section code            ("102-1-A", "BSIT-1A")
   *   - a trailing fragment of it        ("1-A", "A")
   *   - the block group's display name   ("BSED-ENG-1-A") or its tail ("ENG-1-A")
   *
   * Tiers run in order and the first tier that matches wins, so a full
   * section code always beats a group-name guess, and a group-name guess
   * beats a bare-letter guess. Sections are deduped by id; an empty list
   * means nothing matched.
   */
  static pickShiftSectionCandidates(token, sections, groupById) {
    const normalize = StudentController.normalizeSectionLabel;
    const unique = (list) =>
      Array.from(new Map(list.map((section) => [String(section._id), section])).values());

    const tiers = [
      // 1) Exact section code.
      () => sections.filter((section) => normalize(section.sectionCode) === token),
      // 2) Section code ending with "-{token}" ("1-A" matching "102-1-A").
      () => sections.filter((section) => normalize(section.sectionCode).endsWith(`-${token}`)),
      // 3) Group display name equality / dash-boundary tail ("ENG-1-A" or
      //    "BSED-ENG-1-A"), the label shape the shift form derives from
      //    BlockGroup.name when real section codes are not listed yet.
      () => sections.filter((section) => {
        const groupName = normalize(groupById.get(String(section.blockGroupId))?.name);
        return groupName === token || groupName.endsWith(`-${token}`);
      }),
    ];

    // 4) Bare letter ("A") matched against the group's section letter — only
    //    meaningful when the token itself is dash-free.
    if (!token.includes('-')) {
      tiers.push(() => sections.filter((section) => {
        const group = groupById.get(String(section.blockGroupId));
        return normalize(group?.section) === token;
      }));
    }

    for (const tier of tiers) {
      const found = unique(tier());
      if (found.length > 0) return found;
    }
    return [];
  }

  /**
   * Resolve a block label chosen in the shift form ("1-A", "BEED-1-A", a
   * full section code such as "101-1-A", or a block-group display name such
   * as "BSED-ENG-1-A") to one open BlockSection belonging to the requested
   * program and term.
   *
   * Returns { section: null, reason } when nothing matches, so the caller can
   * reject the shift instead of inventing an assignment.
   */
  static async resolveShiftSection({ course, semester, schoolYear, selection }) {
    const token = StudentController.normalizeSectionLabel(selection);
    const programCode = Number(course);
    if (!token) return { section: null, reason: 'No section selected.' };

    const groups = await BlockGroup.find({
      semester,
      $or: [{ schoolYear }, { year: schoolYear }],
    }).lean();

    let candidateGroups = StudentController.filterShiftGroupsForProgram(groups, programCode);

    // Fallback for the term-stamp mismatch: freshly created students carry
    // the current-date school year, while the school's block groups can be
    // stamped with the term they were created under (e.g. all groups on
    // "2021-2022"). The assignment pipeline itself — performAssignment, its
    // eligibility check and the auto-created enrollment — keys everything to
    // the BLOCK group's term and imposes no student school-year restriction,
    // so the real blocks remain assignable. Offer the most recent matching
    // term among the semester's groups instead of failing the whole shift.
    if (candidateGroups.length === 0) {
      const looseGroups = StudentController.filterShiftGroupsForProgram(
        await BlockGroup.find({ semester }).lean(),
        programCode
      );
      if (looseGroups.length > 0) {
        const latestTermStart = Math.max(
          ...looseGroups.map((group) => StudentController.blockGroupTermStart(group))
        );
        candidateGroups =
          latestTermStart > 0
            ? looseGroups.filter(
                (group) => StudentController.blockGroupTermStart(group) === latestTermStart
              )
            : looseGroups;
      }
    }

    if (candidateGroups.length === 0) {
      return {
        section: null,
        reason: `No ${semester} block exists for the selected course. Create the block first, or shift the student without a block.`,
      };
    }

    const sections = await BlockSection.find({
      blockGroupId: { $in: candidateGroups.map((group) => group._id) },
      status: 'OPEN',
    }).lean();

    if (sections.length === 0) {
      return {
        section: null,
        reason: `The ${semester} blocks for the selected course have no open section. Open one, or shift the student without a block.`,
      };
    }

    const groupById = new Map(candidateGroups.map((group) => [String(group._id), group]));

    const candidates = StudentController.pickShiftSectionCandidates(token, sections, groupById);

    if (candidates.length === 0) {
      const openCodes = sections
        .map((section) => String(section.sectionCode || '').trim())
        .filter(Boolean)
        .sort();
      return {
        section: null,
        reason:
          `No open section matches "${selection}" for the selected course and term.` +
          (openCodes.length > 0 ? ` Open sections: ${openCodes.join(', ')}.` : ''),
      };
    }

    // Deterministic pick: a slot-bearing section first, then the emptiest.
    // Capacity is still enforced by performAssignment.
    candidates.sort((left, right) => {
      const leftFree = (Number(left.capacity) || 0) - (Number(left.currentPopulation) || 0);
      const rightFree = (Number(right.capacity) || 0) - (Number(right.currentPopulation) || 0);
      if ((leftFree > 0) !== (rightFree > 0)) return leftFree > 0 ? -1 : 1;
      if (rightFree !== leftFree) return rightFree - leftFree;
      return String(left.sectionCode).localeCompare(String(right.sectionCode));
    });

    return { section: candidates[0], candidates };
  }

  static normalizeSectionLabel(value) {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/\u2013/g, '-')
      .replace(/\s+/g, '');
  }

  /**
   * Shift a student to a different program.
   *
   * Rules this enforces:
   *  - Only 1st-year students may shift (registrar policy).
   *  - The new program needs an Active curriculum; otherwise the shift cannot
   *    be represented academically and is rejected before any write.
   *  - The old enrollment is CLOSED, never deleted: it is marked Dropped,
   *    taken out of `isCurrent`, and stamped with `shiftedTo`. Subjects,
   *    grades and drop history stay readable, and dropping it is what stops
   *    blockEligibilityService from pinning the student to the old program
   *    (that service treats a live enrollment as authoritative).
   *  - The block assignment, when a section is chosen, goes through
   *    BlockController.performAssignment — the same capacity / program /
   *    enrollment checks as POST /api/blocks/assign-student — inside this
   *    transaction, so a rejected block rolls the entire shift back.
   */
  static async shiftStudent(req, res) {
    const { id: studentId } = req.params;
    const { course, section, semester, overrideReason, effectiveTerm } = req.body;
    const actorId = req.adminId;
    const actorRole = req.accountType === 'admin' ? 'admin' : 'registrar';

    const newCourse = Number(course);
    if (!course || !Number.isFinite(newCourse)) {
      return res.status(400).json({ success: false, message: 'Course is required' });
    }
    if (![101, 102, 103, 201].includes(newCourse)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course value. Must be 101, 102, 103, or 201.',
      });
    }

    const session = await mongoose.startSession();

    try {
      // ── Pre-flight: every rejection below happens before the first write. ──
      const student = await Student.findById(studentId).lean();
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
      if (student.yearLevel && Number(student.yearLevel) > 1) {
        return res.status(409).json({
          success: false,
          message: `Course shift is only allowed for 1st year students. This student is currently in Year ${student.yearLevel}.`,
        });
      }

      const newCurriculum = await Curriculum.findOne({
        programCode: newCourse,
        status: 'Active',
      }).sort({ version: -1 }).lean();
      if (!newCurriculum) {
        return res.status(409).json({
          success: false,
          message: 'No active curriculum found for the selected course. Please create a curriculum for this program first.',
        });
      }

      const targetSemester = String(semester || student.semester || '').trim();
      const targetSchoolYear = convertToSchoolYear(student.schoolYear || '');
      if (!targetSemester || !targetSchoolYear) {
        return res.status(409).json({
          success: false,
          message: 'The student has no valid school year/semester on record. Set the academic term before shifting.',
        });
      }

      // Resolve the picked block to a real section of the NEW program before
      // any write, so an invalid selection cannot half-apply the shift.
      let targetSection = null;
      if (String(section || '').trim()) {
        const resolution = await StudentController.resolveShiftSection({
          course: newCourse,
          semester: targetSemester,
          schoolYear: targetSchoolYear,
          selection: section,
        });
        if (!resolution.section) {
          return res.status(400).json({
            success: false,
            message: resolution.reason,
            reasons: [resolution.reason],
          });
        }
        targetSection = resolution.section;
      }

      const previousCourse = Number(student.course);
      const previousSection = student.section || null;
      const previousCurriculumVersion = student.curriculumVersion || null;
      const programChanged = previousCourse !== newCourse;
      const previousProgramLabel = StudentController.courseLabelMap[previousCourse] || String(previousCourse);
      const newProgramLabel = StudentController.courseLabelMap[newCourse] || String(newCourse);

      // Snapshot of the enrollment eligibility trusts — taken before anything
      // is touched, so the audit trail keeps the old subjects and grades.
      const previousEnrollment = await Enrollment.findOne({
        studentId,
        isCurrent: true,
        status: { $in: ['Enrolled', 'Pending'] },
      }).lean();
      const previousSubjects = (previousEnrollment?.subjects || []).map((entry) => ({
        code: entry.code || null,
        title: entry.title || null,
        units: entry.units ?? null,
        status: entry.status || null,
        grade: typeof entry.grade === 'number' ? entry.grade : null,
        gradeMark: entry.gradeMark || null,
      }));

      const priorAssignmentCount = await StudentBlockAssignment.countDocuments({ studentId });
      const priorEnrollmentCount = await Enrollment.countDocuments({ studentId });

      // ── All-or-nothing from here. ──
      session.startTransaction();

      // 1. Close the old enrollment (no deletes): it stops being the
      //    authoritative program source, but every record survives.
      let retiredEnrollmentId = null;
      if (programChanged) {
        const liveEnrollment = await Enrollment.findOne({
          studentId,
          isCurrent: true,
          status: { $in: ['Enrolled', 'Pending'] },
        }).session(session);

        if (liveEnrollment) {
          liveEnrollment.status = 'Dropped';
          liveEnrollment.isCurrent = false;
          liveEnrollment.shiftedTo = {
            course: newCourse,
            programLabel: newProgramLabel,
            shiftedAt: new Date(),
            reason: overrideReason
              ? String(overrideReason).trim()
              : `Program shift to ${newProgramLabel}`,
          };
          liveEnrollment.remarks = [
            liveEnrollment.remarks,
            `Closed by program shift: ${previousProgramLabel} → ${newProgramLabel} (${targetSemester} ${targetSchoolYear})`,
          ].filter(Boolean).join(' | ');
          if (actorId) liveEnrollment.updatedBy = actorId;
          await liveEnrollment.save({ session });
          retiredEnrollmentId = liveEnrollment._id;
        }
      }

      // 2. The previous program's block membership cannot survive the shift.
      const clearedBlockAssignment = programChanged && priorAssignmentCount > 0;
      if (clearedBlockAssignment) {
        await StudentController.cleanupBlockMembershipForStudent(studentId, { session });
      }

      // 3. Move the student record itself.
      const updates = {
        course: newCourse,
        curriculumVersion: newCurriculum.version,
        semester: targetSemester,
        schoolYear: targetSchoolYear,
      };
      if (programChanged) {
        updates.section = null;
        // ENROLLED requires a live enrollment plus a valid block; both were
        // just closed, so the lifecycle has to follow.
        if (String(student.lifecycleStatus || '') === 'Enrolled') {
          updates.lifecycleStatus = 'Pending';
        }
      }
      if (actorId) updates.updatedBy = actorId;

      await Student.findByIdAndUpdate(
        studentId,
        { $set: updates },
        { session, new: true, runValidators: false }
      );

      // 4. Optional block assignment, through the shared assignment core.
      let blockResult = null;
      if (targetSection) {
        // blockController exports a ready instance, not the class.
        const blockController = require('./blockController');
        blockResult = await blockController.performAssignment({
          studentId,
          sectionId: String(targetSection._id),
          semester: targetSemester,
          year: targetSchoolYear,
          actorId,
          session,
        });

        if (!blockResult.ok) {
          await session.abortTransaction();
          return res.status(blockResult.httpStatus || 400).json({
            success: false,
            message: blockResult.error || 'Could not assign the selected block',
            reasons: blockResult.reasons || [],
            ...(blockResult.checks ? { checks: blockResult.checks } : {}),
          });
        }
      }

      const finalStudent = await Student.findById(studentId).session(session).lean();
      const newSectionCode = blockResult?.data?.sectionCode || finalStudent?.section || null;

      // 5. Audit trail (oldValue carries the old subjects snapshot).
      if (actorId && mongoose.Types.ObjectId.isValid(String(actorId))) {
        await AuditLog.create([{
          action: 'SHIFT',
          resourceType: 'STUDENT',
          resourceId: String(studentId),
          resourceName: `${student.studentNumber || ''} — ${student.lastName || ''}, ${student.firstName || ''}`
            .trim()
            .slice(0, 200) || 'Student',
          description: `Program shift: ${previousCourse} → ${newCourse} (${targetSemester} ${targetSchoolYear}) | block: ${clearedBlockAssignment ? 'cleared' : 'unchanged'}${newSectionCode ? ` → ${newSectionCode}` : ''} | enrollment: ${retiredEnrollmentId ? 'closed as Dropped' : 'none open'}${overrideReason ? ` | Override: ${overrideReason}` : ''}`
            .slice(0, 500),
          performedBy: actorId,
          performedByRole: actorRole,
          status: 'SUCCESS',
          severity: 'HIGH',
          oldValue: {
            course: previousCourse,
            section: previousSection,
            curriculumVersion: previousCurriculumVersion,
            enrollmentId: previousEnrollment ? String(previousEnrollment._id) : null,
            enrollmentStatus: previousEnrollment?.status || null,
            subjects: previousSubjects,
          },
          newValue: {
            course: newCourse,
            section: newSectionCode,
            semester: targetSemester,
            schoolYear: targetSchoolYear,
            curriculumVersion: newCurriculum.version,
            effectiveTerm: effectiveTerm || 'Immediate',
            blockAssigned: Boolean(blockResult?.data?.sectionCode),
          },
        }], { session });
      }

      await session.commitTransaction();

      return res.json({
        success: true,
        message: 'Student shifted successfully',
        data: {
          student: finalStudent,
          previousCourse,
          newCourse,
          previousSection,
          newSection: newSectionCode,
          semester: targetSemester,
          previousCurriculumVersion,
          newCurriculumVersion: newCurriculum.version,
          clearedBlockAssignment,
          blockAssigned: Boolean(blockResult?.data?.sectionCode),
          block: blockResult?.data || null,
          previousSubjects,
          previousEnrollment: previousEnrollment
            ? {
                _id: String(previousEnrollment._id),
                status: 'Dropped',
                course: previousEnrollment.course,
                schoolYear: previousEnrollment.schoolYear,
                semester: previousEnrollment.semester,
                subjectCount: previousSubjects.length,
              }
            : null,
          totals: {
            enrollmentsBefore: priorEnrollmentCount,
            enrollmentsAfter: await Enrollment.countDocuments({ studentId }),
          },
        },
      });
    } catch (error) {
      try {
        if (session.inTransaction()) await session.abortTransaction();
      } catch (abortError) {
        console.error('Shift rollback error:', abortError);
      }
      console.error('Error shifting student:', error);
      const status = Number(error?.statusCode) || 500;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to shift student',
      });
    } finally {
      session.endSession();
    }
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

    if (String(set.lifecycleStatus || '').trim() === 'Dropped') {
      set.lifecycleStatus = 'Irregular';
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
    } else if (requestedLifecycleStatus === 'Irregular') {
      set.studentStatus = 'Irregular';
      if (!set.classification) set.classification = 'Irregular';
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
      if (requestedLifecycleStatus !== 'Inactive' && requestedLifecycleStatus !== 'Graduated') {
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
    const enrollments = await Enrollment.find({ studentId })
      .sort({ schoolYear: -1, semester: -1 })
      .populate('subjects.subjectId');
    // A "Retake of …" note may only reach the UI when the retakeOf snapshot
    // resolves to a real, earlier attempt of the same subject in this
    // student's history. Stale/partial snapshots are dropped from the served
    // view; nothing is persisted and no reference is fabricated.
    verifyRetakeReferences(enrollments);
    return enrollments;
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
    const enrollment = await Enrollment.findOne({
      studentId,
      schoolYear,
      semester,
      status: { $ne: 'Dropped' },
      isCurrent: true
    });
    if (!enrollment || enrollment.lockedAt || (enrollment.subjects || []).length > 0) {
      return enrollment ? enrollment.populate('subjects.subjectId') : null;
    }

    // Repair pre-existing empty enrollments the first time they are opened.
    // New assignments populate subjects during block assignment; this branch
    // is only for records created before that behavior existed.
    const assignment = await StudentBlockAssignment.findOne({
      studentId: String(studentId),
      schoolYear,
      semester,
      status: 'ASSIGNED',
    }).select('sectionId').lean();
    const section = assignment?.sectionId
      ? await BlockSection.findById(assignment.sectionId).select('blockGroupId').lean()
      : null;
    const group = section?.blockGroupId
      ? await BlockGroup.findById(section.blockGroupId).select('curriculumId').lean()
      : null;

    await autoAssignCurriculumSubjects({
      enrollmentId: enrollment._id,
      curriculumId: group?.curriculumId || enrollment.curriculumId,
    });

    return Enrollment.findById(enrollment._id).populate('subjects.subjectId');
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
      ? await BlockGroup.findById(section.blockGroupId).select('_id name semester year curriculumId').lean()
      : null;

    const resolvedSemester = String(options.semester || blockGroup?.semester || '').trim();
    // Normalize to "YYYY-YYYY": group.year is frequently a bare start-year
    // (2026, sometimes stored as a BSON Number) while Enrollment.schoolYear
    // is "2026-2027". Comparing raw values misses and makes populated
    // sections report zero students.
    const resolvedSchoolYear = StudentController.toSchoolYearSafe(
      String(options.schoolYear || String(blockGroup?.year ?? '').trim() || '').trim()
    );

    const assignmentQuery = {
      sectionId: section._id,
      status: 'ASSIGNED'
    };
    if (resolvedSemester) assignmentQuery.semester = resolvedSemester;

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

      for (const currentEnrollment of context.enrollments) {
        // A curriculum can gain a subject after students have already been
        // enrolled in the section. Bring this enrollment up to date before
        // assigning the instructor so the new subject is immediately usable.
        let enrollment = currentEnrollment;
        const hasSubject = (enrollment.subjects || []).some(
          (entry) => String(entry?.subjectId || '') === normalizedSubjectId
        );
        if (!hasSubject) {
          await autoAssignCurriculumSubjects({
            enrollmentId: enrollment._id,
            curriculumId: context.blockGroup?.curriculumId || enrollment.curriculumId,
            actorId: req.adminId
          });
          enrollment = await Enrollment.findById(enrollment._id);
          if (!enrollment) continue;
        }

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

  static async buildCorViewModel(student, { adminId, username, baseUrl } = {}) {
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
    // Priority: explicit baseUrl (e.g. derived from the generating request)
    // -> APP_DOWNLOAD_URL env -> legacy fallback. Deriving from the request
    // keeps scanned codes working on any host (local, LAN, production)
    // without configuration.
    const appBaseUrl = String(
      baseUrl || process.env.APP_DOWNLOAD_URL || 'https://west-coast-college-admin-production.up.railway.app'
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

      const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
      const forwardedHost = String(req.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
      const requestBaseUrl = forwardedHost
        ? `${forwardedProto || req.protocol || 'http'}://${forwardedHost}`
        : null;

      const corData = await StudentController.buildCorViewModel(student, {
        adminId: req.adminId,
        username: req.username,
        baseUrl: requestBaseUrl
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

  static async syncCurriculumSubjects(req, res) {
    try {
      const { id: studentId } = req.params;
      const { enrollmentId } = req.body;

      // Find the enrollment
      const enrollment = await Enrollment.findById(enrollmentId);
      if (!enrollment) {
        return res.status(404).json({ error: 'Enrollment not found.' });
      }

      // Verify enrollment belongs to this student
      if (String(enrollment.studentId) !== String(studentId)) {
        return res.status(403).json({ error: 'Enrollment does not belong to this student.' });
      }

      // Sync curriculum subjects
      const result = await autoAssignCurriculumSubjects({
        enrollmentId: enrollment._id,
        curriculumId: enrollment.curriculumId,
        actorId: req.adminId
      });

      return res.json({
        success: true,
        message: `Synced ${result.added.length} new subject(s) from curriculum. ${result.skipped.length} skipped.`,
        data: result
      });
    } catch (error) {
      console.error('Error syncing curriculum subjects:', error);
      return res.status(500).json({ error: error.message || 'Failed to sync curriculum subjects.' });
    }
  }
}

module.exports = StudentController;
