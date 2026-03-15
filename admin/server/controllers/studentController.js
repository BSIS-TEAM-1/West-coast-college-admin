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
  'lifecycleStatus',
  'enrollmentStatus',
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
  'isActive'
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
  'lifecycleStatus',
  'enrollmentStatus',
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
  'gradeProfessor'
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
  'gradeDate'
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
    const enrollmentStatus = String(student?.enrollmentStatus || '').trim();
    const corStatus = String(student?.corStatus || '').trim();

    if (studentStatus === 'Dropped' || enrollmentStatus === 'Dropped') return 'Dropped';
    if (enrollmentStatus === 'Enrolled' || corStatus === 'Verified') return 'Enrolled';
    if (enrollmentStatus === 'Not Enrolled') {
      return corStatus === 'Pending' ? 'Pending' : 'Not Enrolled';
    }

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
    const year = Number(value);
    if (!Number.isFinite(year) || year < 1000) return '';
    return `${year}-${year + 1}`;
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
      const yearFilter = Number(req.query.year);
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
      if (Number.isFinite(yearFilter) && yearFilter > 0) blockGroupQuery.year = yearFilter;

      const rawGroups = await BlockGroup.find(blockGroupQuery)
        .select('_id name semester year')
        .sort({ year: -1, semester: 1, name: 1 })
        .lean();

      const filterOptions = {
        semesters: Array.from(new Set(rawGroups.map((group) => String(group.semester || '').trim()).filter(Boolean))),
        years: Array.from(new Set(rawGroups.map((group) => Number(group.year)).filter((value) => Number.isFinite(value)))).sort((a, b) => b - a),
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
              const schoolYear = StudentController.schoolYearFromStartYear(group.year);
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
          && Number(assignment.year) === Number(group.year);
      });

      const parseSchoolYearStart = (schoolYearValue) => {
        const match = String(schoolYearValue || '').trim().match(/^(\d{4})/);
        return match ? Number(match[1]) : NaN;
      };

      const assignmentsByStudentId = new Map();
      relevantAssignments.forEach((assignment) => {
        const studentId = String(assignment.studentId || '').trim();
        if (!studentId) return;
        const list = assignmentsByStudentId.get(studentId) || [];
        list.push(assignment);
        assignmentsByStudentId.set(studentId, list);
      });

      const findAssignmentForEnrollment = (studentIdValue, semesterValue, schoolYearValue) => {
        const studentId = String(studentIdValue || '').trim();
        if (!studentId) return null;

        const list = assignmentsByStudentId.get(studentId) || [];
        if (list.length === 0) return null;

        const semester = String(semesterValue || '').trim();
        const yearStart = parseSchoolYearStart(schoolYearValue);
        const strictMatch = list.find((entry) => {
          const semesterMatch = String(entry.semester || '').trim() === semester;
          const yearMatch = Number(entry.year || 0) === Number(yearStart || 0);
          return semesterMatch && yearMatch;
        });
        if (strictMatch) return strictMatch;

        if (!Number.isFinite(yearStart)) {
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
        status: { $ne: 'Dropped' }
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

        const schoolYear = StudentController.schoolYearFromStartYear(assignment.year);
        const semester = String(assignment.semester || '').trim();
        const enrollment = enrollmentByKey.get(`${studentId}|${schoolYear}|${semester}`);
        if (!enrollment || !Array.isArray(enrollment.subjects)) return;

        enrollment.subjects.forEach((subjectEntry) => {
          if (String(subjectEntry?.status || '').toLowerCase() === 'dropped') return;

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
            schoolYear: StudentController.schoolYearFromStartYear(blockGroup.year),
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
          if (String(subjectEntry?.status || '').toLowerCase() === 'dropped') return;

          const instructorRaw = String(subjectEntry?.instructor || '').trim();
          const normalizedInstructor = StudentController.normalizeProfessorIdentifier(instructorRaw);
          const professorId = normalizedInstructor ? professorIdentifierMap.get(normalizedInstructor) : '';
          if (!professorId) return;

          const subjectId = String(subjectEntry?.subjectId || '').trim() || String(subjectEntry?.code || '').trim();
          const subjectCode = String(subjectEntry?.code || '').trim() || 'SUBJECT';
          const bucketKey = `${courseShortLabel}|${schoolYear}|${semester}|${subjectId}|${professorId}`;
          let bucket = orphanedBuckets.get(bucketKey);
          if (!bucket) {
            bucket = {
              instructor: instructorRaw || 'Professor',
              subjectCode,
              subjectTitle: String(subjectEntry?.title || '').trim() || 'Untitled subject',
              sectionLabel: 'No live block assignment',
              courseShortLabel,
              issueType: 'orphaned',
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
    if (params.enrollmentStatus) query.enrollmentStatus = params.enrollmentStatus;

    const students = await Student.find(query).sort({ createdAt: -1 }).lean();
    if (!students.length) return [];

    const studentIds = students
      .map((student) => String(student._id || '').trim())
      .filter(Boolean);

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

    const parseSchoolYearStart = (schoolYearValue) => {
      const match = String(schoolYearValue || '').trim().match(/^(\d{4})\s*-\s*\d{4}$/);
      return match ? Number(match[1]) : 0;
    };

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
      const year = parseSchoolYearStart(studentSchoolYear);
      const strictMatch = pickLatestAssignment(
        studentAssignments,
        (assignment) => normalizeText(assignment.semester) === semester && Number(assignment.year || 0) === year
      );
      if (strictMatch) return strictMatch;

      const semesterMatch = pickLatestAssignment(
        studentAssignments,
        (assignment) => normalizeText(assignment.semester) === semester
      );
      if (semesterMatch) return semesterMatch;

      const yearMatch = pickLatestAssignment(
        studentAssignments,
        (assignment) => Number(assignment.year || 0) === year
      );
      if (yearMatch) return yearMatch;

      return pickLatestAssignment(studentAssignments, () => true);
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
          lifecycleStatus: StudentController.deriveLifecycleStatus(student)
        };
      }

      const sectionCode = sectionCodeById.get(String(resolvedAssignment.sectionId));
      if (!sectionCode) {
        return {
          ...student,
          section: '',
          lifecycleStatus: StudentController.deriveLifecycleStatus(student)
        };
      }

      return {
        ...student,
        section: sectionCode,
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
      set.enrollmentStatus = 'Enrolled';
      if (set.isActive === undefined) set.isActive = true;
    } else if (requestedLifecycleStatus === 'Not Enrolled') {
      set.enrollmentStatus = 'Not Enrolled';
      if (set.isActive === undefined) set.isActive = true;
    } else if (requestedLifecycleStatus === 'Dropped') {
      set.studentStatus = 'Dropped';
      set.enrollmentStatus = 'Dropped';
      if (set.isActive === undefined) set.isActive = true;
    } else if (requestedLifecycleStatus === 'Inactive') {
      set.isActive = false;
      if (!set.enrollmentStatus) set.enrollmentStatus = 'Not Enrolled';
    } else if (requestedLifecycleStatus === 'Graduated') {
      set.isActive = false;
      if (!set.enrollmentStatus) set.enrollmentStatus = 'Not Enrolled';
      if (!set.corStatus) set.corStatus = 'Verified';
    }

    if (String(set.corStatus || '').trim() === 'Verified') {
      if (requestedLifecycleStatus !== 'Dropped' && requestedLifecycleStatus !== 'Inactive' && requestedLifecycleStatus !== 'Graduated') {
        set.enrollmentStatus = 'Enrolled';
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
    const subjects = await this.mapSubjectIdsToEnrollmentSubjects(subjectIds);
    const totalUnits = subjects.reduce((sum, subject) => sum + subject.units, 0);
    const enrollmentCourseMap = {
      101: 'BEED',
      102: 'BSED',
      103: 'BSED',
      201: 'BSBA'
    };
    const normalizedCourse = enrollmentCourseMap[Number(student.course)] || 'BEED';

    const enrollment = new Enrollment({
      studentId: student._id,
      studentNumber: student.studentNumber,
      schoolYear,
      semester,
      yearLevel: student.yearLevel,
      course: normalizedCourse,
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
      const requesterRole = String(req.accountType || '').trim().toLowerCase();

      if (
        requesterRole === 'registrar' &&
        requestedCorStatus &&
        requestedCorStatus !== previousCorStatus &&
        requestedCorStatus === 'Verified'
      ) {
        return res.status(403).json({
          success: false,
          message: 'COR approval is only available on the admin side.'
        });
      }

      const hasAcademicChange =
        (req.body?.course !== undefined && Number(req.body.course) !== Number(previous.course)) ||
        (req.body?.yearLevel !== undefined && Number(req.body.yearLevel) !== Number(previous.yearLevel)) ||
        (req.body?.studentStatus !== undefined && String(req.body.studentStatus) !== String(previous.studentStatus));

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

      if (hasAcademicChange) {
        await StudentController.cleanupBlockMembershipForStudent(id);
      }

      res.json({
        success: true,
        data: student,
        message: hasAcademicChange
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
      options.schoolYear || StudentController.schoolYearFromStartYear(blockGroup?.year) || ''
    ).trim();

    const assignmentQuery = {
      sectionId: section._id,
      status: 'ASSIGNED'
    };
    if (resolvedSemester) assignmentQuery.semester = resolvedSemester;
    if (resolvedSchoolYear) {
      const startYear = Number(String(resolvedSchoolYear).split('-')[0]);
      if (Number.isFinite(startYear) && startYear > 0) assignmentQuery.year = startYear;
    } else if (blockGroup?.year) {
      assignmentQuery.year = Number(blockGroup.year);
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
        return res.status(400).json({
          success: false,
          message: 'No assigned students found in this section'
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

  /**
   * Generate Certificate of Registration (COR) as PDF
   */
  static async generateCorPdf(req, res) {
    let doc;
    try {
      const { id } = req.params;
      const student = await Student.findById(id);

      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      const courseCodeFromValue = (value) => {
        const text = String(value ?? '').trim();
        if (!text) return '';
        if (/^\d+$/.test(text)) return text;

        const normalized = text.toUpperCase().replace(/\s+/g, '').replace(/_/g, '-');
        if (normalized.includes('BEED')) return '101';
        if (normalized.includes('BSED-ENGLISH') || normalized === 'ENGLISH') return '102';
        if (normalized.includes('BSED-MATH') || normalized === 'MATH' || normalized === 'MATHEMATICS') return '103';
        if (normalized.includes('BSBA-HRM') || normalized === 'HRM') return '201';
        return '';
      };

      const courseCode = courseCodeFromValue(student.course) || '000';
      const courseAbbreviation =
        StudentController.courseCodeMap[Number(courseCode)] ||
        StudentController.courseCodeMap[student.course] ||
        String(student.course || '').trim();
      const courseLabel =
        StudentController.courseLabelMap[Number(courseCode)] ||
        StudentController.courseLabelMap[student.course] ||
        student.course ||
        'N/A';
      const extractProgram = (value) => {
        const text = String(value || '').trim();
        if (!text) return 'N/A';
        const normalized = text.replace(/\u2013/g, '-');
        return normalized.replace(/\s*-\s*major in\s+.+$/i, '').trim() || text;
      };
      const extractMajor = (value) => {
        const text = String(value || '').trim();
        if (!text) return '';
        const normalized = text.replace(/\u2013/g, '-');
        const match = normalized.match(/major in\s+(.+)$/i);
        return match ? match[1].trim() : '';
      };
      const programLabel = extractProgram(courseLabel);
      const majorLabel = extractMajor(student.major) || extractMajor(courseLabel) || 'N/A';
      const parts = String(student.studentNumber || '')
        .split('-')
        .map((part) => part.trim())
        .filter(Boolean);
      const yearPart = /^\d{4}$/.test(parts[0] || '') ? parts[0] : '0000';
      const seqRaw = [...parts].reverse().find((part) => /^\d+$/.test(part)) || '00000';
      const seqPart = seqRaw.slice(-5).padStart(5, '0');
      const studentNumber = `${yearPart}-${courseCode}-${seqPart}`;
      const studentName = `${student.firstName} ${student.middleName ?? ''} ${student.lastName} ${student.suffix ?? ''}`.trim();
      const registrationNumber = student.registrationNumber || `${new Date().getFullYear()}${Math.floor(100000 + Math.random() * 900000)}`;
      if (!student.registrationNumber) {
        student.registrationNumber = registrationNumber;
        await student.save({ validateBeforeSave: false });
      }

      const age = student.birthDate ? (new Date().getFullYear() - new Date(student.birthDate).getFullYear()) : 'N/A';
      const preferredSchoolYear = String(student.schoolYear || '').trim();
      const preferredSemester = String(student.semester || '').trim();

      let enrollment = null;
      if (preferredSchoolYear && preferredSemester) {
        enrollment = await Enrollment.findOne({
          studentId: student._id,
          schoolYear: preferredSchoolYear,
          semester: preferredSemester,
          status: { $ne: 'Dropped' }
        }).sort({ isCurrent: -1, createdAt: -1 });
      }
      if (!enrollment) {
        enrollment = await Enrollment.findOne({
          studentId: student._id,
          status: { $ne: 'Dropped' },
          isCurrent: true
        }).sort({ createdAt: -1 });
      }
      if (!enrollment) {
        enrollment = await Enrollment.findOne({
          studentId: student._id,
          status: { $ne: 'Dropped' }
        }).sort({ createdAt: -1 });
      }

      const normalizeIdentifier = (value) => String(value || '').trim().toLowerCase();
      const activeProfessors = await Admin.find({
        accountType: 'professor',
        status: { $ne: 'inactive' }
      })
        .select('username displayName uid')
        .lean();
      const professorIdentifierSet = new Set(
        activeProfessors
          .flatMap((professor) => [professor.username, professor.displayName, professor.uid])
          .map((value) => normalizeIdentifier(value))
          .filter(Boolean)
      );

      // Safety cleanup: if a professor account was deleted but old subject instructor
      // text remains in enrollment, force it back to TBA so COR doesn't show stale names.
      if (enrollment && Array.isArray(enrollment.subjects)) {
        let normalized = false;
        enrollment.subjects.forEach((subject) => {
          const currentInstructor = String(subject?.instructor || '').trim();
          if (!currentInstructor || /^TBA$/i.test(currentInstructor)) return;
          if (!professorIdentifierSet.has(normalizeIdentifier(currentInstructor))) {
            subject.instructor = 'TBA';
            subject.dateModified = new Date();
            normalized = true;
          }
        });
        if (normalized) {
          enrollment.markModified('subjects');
          await enrollment.save();
        }
      }

      const enrolledSubjects = Array.isArray(enrollment?.subjects)
        ? enrollment.subjects.filter((subject) => String(subject?.status || '').toLowerCase() !== 'dropped')
        : [];
      const corSemester = enrollment?.semester || student.semester || 'N/A';
      const corSchoolYear = enrollment?.schoolYear || student.schoolYear || 'N/A';
      const corYearLevel = enrollment?.yearLevel || student.yearLevel || 'N/A';
      const formatClassBlockLabel = (rawSectionCode, courseAbbreviation) => {
        const sectionCode = String(rawSectionCode || '').trim().replace(/\u2013/g, '-').toUpperCase();
        const course = String(courseAbbreviation || '').trim().toUpperCase();
        if (!sectionCode) return '';
        if (!course) return sectionCode;

        const blockSlotMatch = sectionCode.match(/(?:^|[-\s])(\d+)-?([A-Z])$/);
        if (blockSlotMatch) {
          return `${course}-${blockSlotMatch[1]}${blockSlotMatch[2]}`;
        }

        const parts = sectionCode.split('-').filter(Boolean);
        const firstPart = parts[0] || '';

        if (/^\d/.test(firstPart) || parts.length <= 1) {
          const suffix = parts.length > 1 ? parts.slice(1).join('-') : sectionCode;
          return suffix ? `${course}-${suffix}` : sectionCode;
        }

        return sectionCode;
      };
      let classBlockLabel = 'N/A';
      const latestBlockAssignment = await StudentBlockAssignment.findOne({
        studentId: String(student._id),
        status: 'ASSIGNED'
      })
        .sort({ createdAt: -1 })
        .select('sectionId')
        .lean();
      if (latestBlockAssignment?.sectionId) {
        const assignedSection = await BlockSection.findById(latestBlockAssignment.sectionId)
          .select('sectionCode blockCode name')
          .lean();
        classBlockLabel =
          formatClassBlockLabel(assignedSection?.sectionCode, courseAbbreviation) ||
          assignedSection?.blockCode ||
          assignedSection?.name ||
          'N/A';
      }
      const totalSubjects = enrolledSubjects.length;
      const totalUnits = enrolledSubjects.reduce((sum, subject) => sum + (Number(subject?.units) || 0), 0);

      /**
       * Calculates the breakdown of lecture vs lab units across all enrolled subjects.
       *
       * This algorithm handles two scenarios for unit categorization:
       *
       * 1. EXPLICIT UNIT BREAKDOWN: When subjects have explicit lectureUnits/labUnits fields
       *    - Uses the provided values directly if they exist and are valid (>= 0)
       *    - Calculates missing values: lecture = total - lab (or total if lab unknown)
       *    - Ensures no negative values through Math.max() guards
       *
       * 2. PATTERN-BASED DETECTION: When explicit breakdown is unavailable
       *    - Searches subject code and title for lab-related keywords
       *    - Keywords: 'LAB', 'LABORATORY', 'PRACTICUM' (case-insensitive)
       *    - Lab subjects get all units as lab units
       *    - Non-lab subjects get all units as lecture units
       *
       * Edge cases handled:
       * - Invalid or missing unit values default to 0
       * - Explicit units take precedence over pattern detection
       * - Math.max() prevents negative unit assignments
       * - Regex is case-insensitive for flexibility
       *
       * @param {Array} subjects - Array of enrolled subject objects
       * @returns {Object} { lectureUnits: number, labUnits: number }
       */
      const unitBreakdown = enrolledSubjects.reduce((acc, subject) => {
        const units = Number(subject?.units) || 0;
        const explicitLecture = Number(subject?.lectureUnits);
        const explicitLab = Number(subject?.labUnits);
        const hasExplicitLecture = Number.isFinite(explicitLecture) && explicitLecture >= 0;
        const hasExplicitLab = Number.isFinite(explicitLab) && explicitLab >= 0;

        // Scenario 1: Use explicit unit breakdown if available
        if (hasExplicitLecture || hasExplicitLab) {
          // Calculate lecture units: use explicit value, or derive from total - lab
          const lectureUnits = hasExplicitLecture
            ? explicitLecture
            : Math.max(units - (hasExplicitLab ? explicitLab : 0), 0);

          // Calculate lab units: use explicit value, or derive from total - lecture
          const labUnits = hasExplicitLab
            ? explicitLab
            : Math.max(units - lectureUnits, 0);

          acc.lectureUnits += lectureUnits;
          acc.labUnits += labUnits;
          return acc;
        }

        // Scenario 2: Use pattern-based detection
        const subjectText = `${String(subject?.code || '')} ${String(subject?.title || '')}`;
        const isLabSubject = /(LAB|LABORATORY|PRACTICUM)/i.test(subjectText);

        if (isLabSubject) {
          acc.labUnits += units;
        } else {
          acc.lectureUnits += units;
        }

        return acc;
      }, { lectureUnits: 0, labUnits: 0 });

      // Fetch current registrar's display name
      const currentRegistrar = await Admin.findById(req.adminId).select('displayName');
      const registrarDisplayName = currentRegistrar?.displayName || req.username || 'REGISTRAR';

      doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      // EDIT COR PDF LAYOUT HERE: adjust fonts, add logos/images, and change positioning as needed.

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=COR-${student.studentNumber}.pdf`);
      doc.pipe(res);

      // Header layout inspired by provided reference
      const headerY = 40;
      const logoX = 16;
      const logoSize = 48;
      const headerTextX = logoX + logoSize + 10;
      const headerLineHeight = 10;
      const headerLines = [
        'Republic of the Philippines',
        'West Coast College',
        'Pio Duran, Albay'
      ];
      const headerTextHeight = headerLines.length * headerLineHeight;
      const headerTextY = headerY + ((logoSize - headerTextHeight) / 2);

      // Logo image
      const logoPath = path.join(__dirname, '../../public/logo-header.jpg');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, logoX, headerY, { width: logoSize, height: logoSize });
      }
      doc.fontSize(6);
      headerLines.forEach((line, index) => {
        doc.text(line, headerTextX, headerTextY + (index * headerLineHeight));
      });

      const titleY = Math.max(headerY + logoSize, headerTextY + headerTextHeight) + 6;
      doc.font('Helvetica-Bold').fontSize(15).text('CERTIFICATE OF REGISTRATION', 0, titleY, {
        width: doc.page.width,
        align: 'center'
      });
      doc.font('Helvetica').fontSize(10).fillColor('red').text(`Registration No: ${registrationNumber}`, doc.page.width - 170, headerY + 4, { width: 120, align: 'right' });
      doc.fillColor('black');
      doc.y = titleY + 26;


      // Student info boxed section in 4x3 grid format
      const infoX = 40;
      const infoW = doc.page.width - 80;
      const infoY = doc.y + 6;
      const infoCols = 4;
      const infoRows = 3;
      const infoRowH = 17;
      const infoBoxH = infoRows * infoRowH;
      const infoColW = infoW / infoCols;
      const issuedDateValue = new Date().toLocaleDateString();
      const infoCells = [
        `Student No: ${studentNumber}`,
        `Age: ${age}`,
        `Program: ${programLabel}`,
        `School Year: ${corSchoolYear}`,
        `Name: ${studentName}`,
        `Semester: ${corSemester}`,
        `Major: ${majorLabel}`,
        `Curriculum: ${student.curriculum || 'N/A'}`,
        `Sex: ${student.gender || 'N/A'}`,
        'College: Pio Duran',
        `Year Level: ${corYearLevel}`,
        `Issued Date: ${issuedDateValue}`
      ];

      doc.fontSize(7).font('Helvetica');
      infoCells.forEach((cellText, index) => {
        const row = Math.floor(index / infoCols);
        const col = index % infoCols;
        const cellX = infoX + (col * infoColW);
        const cellY = infoY + (row * infoRowH) + 2;
        doc.text(cellText, cellX, cellY, {
          width: infoColW - 10,
          height: infoRowH,
          ellipsis: true
        });
      });

      // Add border around the student info section
      doc.rect(infoX, infoY - 2, infoW, infoBoxH + 4).stroke();

      doc.y = infoY + infoBoxH + 12;
      doc.moveDown(1);
      // Registrar signature moved to bottom

      // Schedule table column definitions aligned to info section width
      const infoWidth = infoW;

      /**
       * Calculates responsive column widths for the PDF schedule table.
       *
       * This scaling algorithm ensures the table fits within the available width:
       *
       * 1. BASE WIDTHS: Defines ideal column widths in points for 8 columns:
       *    [Code: 49, Subject: 138, Units: 32, Class: 40, Days: 40, Time: 89, Room: 49, Faculty: 73]
       *
       * 2. SCALING FACTOR: Calculates how much to scale base widths to fit container:
       *    scale = tableWidth / sum(baseWidths)
       *    Example: If base total = 510pt and container = 450pt, scale = 0.882
       *
       * 3. RESPONSIVE WIDTHS: Applies scaling to each column proportionally:
       *    scaledWidths = baseWidths.map(width => width * scale)
       *
       * 4. LAYOUT BENEFITS:
       *    - Maintains relative column proportions across different page sizes
       *    - Prevents content overflow or excessive whitespace
       *    - Keeps table readable and well-balanced
       *
       * @param {Array<number>} baseColWidths - Original column widths in points
       * @param {number} containerWidth - Available width for the table
       * @returns {Array<number>} Scaled column widths maintaining proportions
       */
      const baseColWidths = [49, 138, 32, 40, 40, 89, 49, 73];
      const baseTableWidth = baseColWidths.reduce((a, b) => a + b, 0);
      const widthScale = infoWidth / baseTableWidth;
      const colWidths = baseColWidths.map((value) => value * widthScale);

      /**
       * Calculates the total width of the schedule table.
       *
       * @returns {number} Total width of the schedule table
       */
      const scheduleTableWidth = colWidths.reduce((a, b) => a + b, 0);

      doc.font('Helvetica-Bold').fontSize(8).text('SCHEDULES', 40, doc.y + 5, { 
        width: scheduleTableWidth,
        align: 'center'
      });
      doc.moveDown(1);

      // Schedule table rows from current/latest enrollment subjects
      doc.moveDown(1);
      const tableStartY = doc.y;
      const headers = ['Code', 'Subject', 'Units', 'Class', 'Days', 'Time', 'Room', 'Faculty'];
      const tableX = 40;
      const totalTableWidth = colWidths.reduce((a, b) => a + b, 0);
      const headerHeight = 16;
      const cellPadX = 2;
      const cellPadY = 2;
      const baseRowHeight = 14;
      const minimumRows = 6;

      const parseScheduleForCor = (rawSchedule) => {
        const scheduleText = String(rawSchedule || '').trim();
        if (!scheduleText) return { days: 'TBA', time: 'TBA' };

        const compactMatch = scheduleText.match(/^([A-Za-z]{1,7})(\d{1,2}:\d{2}.*)$/);
        if (compactMatch) {
          return {
            days: compactMatch[1].toUpperCase(),
            time: compactMatch[2].trim() || 'TBA'
          };
        }

        const spacedMatch = scheduleText.match(/^([A-Za-z]{1,7})\s+(.+)$/);
        if (spacedMatch) {
          return {
            days: spacedMatch[1].toUpperCase(),
            time: spacedMatch[2].trim() || 'TBA'
          };
        }

        return { days: 'TBA', time: scheduleText };
      };

      const rows = totalSubjects === 0
        ? [['-', 'No enrolled subjects found', '-', '-', '-', '-', '-', '-']]
        : enrolledSubjects.map((subject) => {
            const parsedSchedule = parseScheduleForCor(subject?.schedule);
            return [
              subject?.code || '-',
              subject?.title || '-',
              Number(subject?.units) ? Number(subject.units).toFixed(1) : '-',
              classBlockLabel,
              parsedSchedule.days,
              parsedSchedule.time,
              subject?.room || 'TBA',
              subject?.instructor || 'TBA'
            ];
          });

      doc.fontSize(8).font('Helvetica-Bold');
      let x = tableX;
      headers.forEach((h, i) => {
        doc.text(h, x + cellPadX, tableStartY + cellPadY, {
          width: colWidths[i] - (cellPadX * 2),
          align: 'left',
          lineBreak: true
        });
        x += colWidths[i];
      });

      doc.font('Helvetica').fontSize(8);
      /**
       * Calculates dynamic row heights based on content to prevent text overflow.
       *
       * This algorithm ensures each table row has adequate height for its content:
       *
       * 1. CONTENT MEASUREMENT: For each cell in each row, measures the height needed
       *    using PDFDocument's heightOfString() method with column width constraints
       *
       * 2. ROW HEIGHT DETERMINATION: Takes the maximum height needed across all cells
       *    in the row to accommodate the tallest content
       *
       * 3. MINIMUM HEIGHT GUARD: Ensures rows meet a baseline height (baseRowHeight)
       *    for visual consistency, even with minimal content
       *
       * 4. PADDING COMPENSATION: Adds vertical padding (cellPadY * 2) to ensure
       *    text doesn't touch cell borders
       *
       * 5. BLANK ROW HANDLING: Adds minimum rows when data is sparse to maintain
       *    table structure and prevent empty-looking documents
       *
       * Benefits:
       * - Prevents text clipping and overflow
       * - Maintains professional table appearance
       * - Adapts to varying content lengths automatically
       * - Ensures minimum table size for consistency
       *
       * @param {Array<Array<string>>} rows - Array of table rows, each containing cell values
       * @param {Array<number>} colWidths - Width of each column in points
       * @param {number} cellPadY - Vertical padding inside cells
       * @param {number} baseRowHeight - Minimum row height
       * @param {number} minimumRows - Minimum number of rows to display
       * @returns {Array<number>} Array of calculated heights for each row
       */
      const rowHeights = rows.map((row) => {
        const tallestCell = row.reduce((maxHeight, val, i) => {
          const contentHeight = doc.heightOfString(String(val), {
            width: colWidths[i] - (cellPadX * 2),
            align: 'left'
          });
          return Math.max(maxHeight, contentHeight);
        }, 0);
        return Math.max(baseRowHeight, tallestCell + (cellPadY * 2));
      });

      const blankRows = Math.max(0, minimumRows - rows.length);
      const dataHeight = rowHeights.reduce((sum, h) => sum + h, 0) + (blankRows * baseRowHeight);
      const tableHeight = headerHeight + dataHeight;

      let rowY = tableStartY + headerHeight;
      rows.forEach((row, rowIndex) => {
        const currentRowHeight = rowHeights[rowIndex];
        let colX = tableX;
        row.forEach((val, colIndex) => {
          doc.text(String(val), colX + cellPadX, rowY + cellPadY, {
            width: colWidths[colIndex] - (cellPadX * 2),
            align: 'left',
            lineBreak: true
          });
          colX += colWidths[colIndex];
        });
        rowY += currentRowHeight;
      });

      rowY += blankRows * baseRowHeight;
      doc.rect(tableX, tableStartY - 2, totalTableWidth, tableHeight + 2).stroke();

      // Totals line on far left
      const totalsY = tableStartY + tableHeight + 6;
      doc.fontSize(6).text(
        `Totals: Subjects: ${totalSubjects}  Credit Units=${totalUnits.toFixed(1)}  Lecture Units=${unitBreakdown.lectureUnits.toFixed(1)}  Lab Units=${unitBreakdown.labUnits.toFixed(1)}`,
        40,
        totalsY
      );

      // Signature block
      const signatureY = doc.page.height - doc.page.margins.bottom - 26;
      const studentSigX = 50;
      const studentSigW = 220;
      const registrarSigX = doc.page.width - 270;
      const registrarSigW = 220;
      const registrarName = registrarDisplayName.toUpperCase();

      doc.font('Helvetica').fontSize(7).text(studentName.toUpperCase(), studentSigX, signatureY, {
        width: studentSigW,
        align: 'center',
        underline: true
      });
      doc.fontSize(6).text("Student's Signature", studentSigX, signatureY + 11, {
        width: studentSigW,
        align: 'center'
      });

      doc.font('Helvetica').fontSize(7).text(registrarName, registrarSigX, signatureY, {
        width: registrarSigW,
        align: 'center',
        underline: true
      });
      doc.fontSize(6).text('College Registrar', registrarSigX, signatureY + 11, {
        width: registrarSigW,
        align: 'center'
      });

      doc.end();
    } catch (error) {
      console.error('Error generating COR PDF:', error);
      if (!res.headersSent) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to generate COR' });
      }

      try {
        if (doc && !doc.destroyed) doc.end();
      } catch (endError) {
        console.error('Error finalizing COR PDF stream:', endError);
      }
    }
  }
}

module.exports = StudentController;
