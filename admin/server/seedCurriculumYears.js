/**
 * Add mock curriculum content for Year 1 (2nd sem), 2, 3 and 4 across the four
 * active 2026 curricula, plus the catalog subjects they need.
 *
 * Rules this seed obeys (they are the point of the exercise):
 *   - Year 1, 1st semester carries NO prerequisites. Prerequisites only appear
 *     from Year 1, 2nd semester and above.
 *   - A subject is placed at most once per curriculum (unique index on
 *     curriculumId + subjectId), so shared General Education subjects are
 *     reused across programs rather than duplicated.
 *   - Existing catalog subjects and existing placements are reused, never
 *     overwritten. The script is idempotent.
 *
 * Run: node seedCurriculumYears.js
 */
require('dotenv').config({ path: '../.env' });
require('dotenv').config({ path: '../.env.credentail-details', override: true });
const mongoose = require('mongoose');
const Subject = require('./models/Subject');
const CurriculumSubject = require('./models/CurriculumSubject');
const Curriculum = require('./models/Curriculum');

const BEED = '6a78746754fb040586edb03c';
const BSED_EN = '6a78746854fb040586edb043';
const BSED_MATH = '6a78746854fb040586edb049';
const BSBA = '6a78746854fb040586edb04f';

/** Shared General Education subjects placed into every program. */
const SHARED_GE = (extra = []) => [
  { code: 'GE102', title: 'Mathematics in the Modern World', units: 3, subjectType: 'General Education', type: 'General' },
  { code: 'GE105', title: 'Science, Technology and Society', units: 3, subjectType: 'General Education', type: 'General' },
  { code: 'PE102', title: 'Wellness and Outdoor Recreation', units: 2, subjectType: 'General Education', type: 'General', isRequired: false },
  ...extra,
];

const PLAN = {
  [BEED]: [
    {
      yearLevel: 1, semester: '2nd',
      subjects: [
        // Year 1, 1st semester has no prerequisites — these may chain onto it.
        { code: 'ENG102', title: 'English Communication 2', units: 3, subjectType: 'Core', type: 'General', prereq: 'ENG101' },
        { code: 'BEED101', title: 'Foundations of Education', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'ENG101' },
        ...SHARED_GE(),
      ],
    },
    {
      yearLevel: 2, semester: '1st',
      subjects: [
        { code: 'BEED201', title: 'Foundations of Early Childhood Education', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'BEED101' },
        { code: 'ENG201', title: 'Structure of English', units: 3, subjectType: 'Major', type: 'Major', prereq: 'ENG102' },
        { code: 'MATH201', title: 'College Algebra and Trigonometry', units: 3, subjectType: 'Major', type: 'Major', prereq: 'MATH101' },
        { code: 'GE104', title: 'Readings in Philippine History', units: 3, subjectType: 'General Education', type: 'General' },
      ],
    },
    {
      yearLevel: 2, semester: '2nd',
      subjects: [
        { code: 'BEED202', title: 'Principles of Teaching', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'BEED101' },
        { code: 'BEED203', title: 'Child and Adolescent Development', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'BEED201' },
        { code: 'GE103', title: 'Understanding the Self', units: 3, subjectType: 'General Education', type: 'General' },
      ],
    },
    {
      yearLevel: 3, semester: '1st',
      subjects: [
        { code: 'BEED301', title: 'Technology for Teaching and Learning', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'BEED202' },
        { code: 'BEED302', title: 'Assessment of Student Learning', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'BEED202' },
        { code: 'BEED303', title: 'Content and Pedagogy: English', units: 3, subjectType: 'Major', type: 'Major', prereq: 'ENG201' },
      ],
    },
    {
      yearLevel: 3, semester: '2nd',
      subjects: [
        { code: 'BEED304', title: 'Content and Pedagogy: Mathematics', units: 3, subjectType: 'Major', type: 'Major', prereq: 'MATH201' },
        { code: 'BEED305', title: 'Classroom Discipline and Management', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'BEED203' },
        { code: 'BEED306', title: 'Teaching Multigrade Classes', units: 3, subjectType: 'Elective', type: 'Elective', isRequired: false },
      ],
    },
    {
      yearLevel: 4, semester: '1st',
      subjects: [
        { code: 'BEED401', title: 'Practice Teaching', units: 6, subjectType: 'Professional Education', type: 'Professional', prereq: 'BEED301', labPeriods: 3 },
        { code: 'BEED402', title: 'The Teaching Profession', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'BEED305' },
      ],
    },
    {
      yearLevel: 4, semester: '2nd',
      subjects: [
        { code: 'BEED403', title: 'Action Research in Education', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'BEED401' },
        { code: 'BEED404', title: 'Career and Life Planning', units: 3, subjectType: 'Elective', type: 'Elective', isRequired: false },
      ],
    },
  ],

  [BSED_EN]: [
    {
      yearLevel: 1, semester: '2nd',
      subjects: [
        { code: 'ENG104', title: 'English Communication 4', units: 3, subjectType: 'Core', type: 'General', prereq: 'ENG102' },
        ...SHARED_GE(),
      ],
    },
    {
      yearLevel: 2, semester: '1st',
      subjects: [
        { code: 'ENG201', title: 'Structure of English', units: 3, subjectType: 'Major', type: 'Major', prereq: 'ENG104' },
        { code: 'ENG202', title: 'The Life and Works of Rizal', units: 3, subjectType: 'Major', type: 'Major', prereq: 'ENG102' },
        { code: 'GE103', title: 'Understanding the Self', units: 3, subjectType: 'General Education', type: 'General' },
      ],
    },
    {
      yearLevel: 2, semester: '2nd',
      subjects: [
        { code: 'ENG203', title: 'Principles of Language Teaching', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'ENG201' },
        { code: 'ENG204', title: 'Literature and Society', units: 3, subjectType: 'Major', type: 'Major' },
      ],
    },
    {
      yearLevel: 3, semester: '1st',
      subjects: [
        { code: 'ENG301', title: 'Teaching of Writing', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'ENG203' },
        { code: 'ENG302', title: 'Philippine Literature', units: 3, subjectType: 'Major', type: 'Major', prereq: 'ENG204' },
      ],
    },
    {
      yearLevel: 3, semester: '2nd',
      subjects: [
        { code: 'ENG303', title: 'Teaching of Literature', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'ENG301' },
        { code: 'ENG304', title: 'Applied Linguistics', units: 3, subjectType: 'Major', type: 'Major', prereq: 'ENG201', isRequired: false },
      ],
    },
    {
      yearLevel: 4, semester: '1st',
      subjects: [
        { code: 'ENG401', title: 'Practice Teaching', units: 6, subjectType: 'Professional Education', type: 'Professional', prereq: 'ENG301', labPeriods: 3 },
        { code: 'ENG402', title: 'Research in English', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'ENG303' },
      ],
    },
    {
      yearLevel: 4, semester: '2nd',
      subjects: [
        { code: 'ENG403', title: 'Portfolio Development', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'ENG401' },
      ],
    },
  ],

  [BSED_MATH]: [
    {
      yearLevel: 1, semester: '2nd',
      subjects: [
        { code: 'MATH102', title: 'Geometry', units: 3, subjectType: 'Core', type: 'General', prereq: 'MATH101' },
        ...SHARED_GE(),
      ],
    },
    {
      yearLevel: 2, semester: '1st',
      subjects: [
        { code: 'MATH201', title: 'College Algebra and Trigonometry', units: 3, subjectType: 'Major', type: 'Major', prereq: 'MATH102' },
        { code: 'MATH202', title: 'Statistics and Probability', units: 3, subjectType: 'Major', type: 'Major' },
        { code: 'GE104', title: 'Readings in Philippine History', units: 3, subjectType: 'General Education', type: 'General' },
      ],
    },
    {
      yearLevel: 2, semester: '2nd',
      subjects: [
        { code: 'MATH203', title: 'Logic and Set Theory', units: 3, subjectType: 'Major', type: 'Major', prereq: 'MATH202' },
        { code: 'MATH204', title: 'History of Mathematics', units: 3, subjectType: 'Major', type: 'Major', isRequired: false },
      ],
    },
    {
      yearLevel: 3, semester: '1st',
      subjects: [
        { code: 'MATH301', title: 'Number Theory', units: 3, subjectType: 'Major', type: 'Major', prereq: 'MATH203' },
        { code: 'MATH302', title: 'Modern Geometry', units: 3, subjectType: 'Major', type: 'Major', prereq: 'MATH201' },
      ],
    },
    {
      yearLevel: 3, semester: '2nd',
      subjects: [
        { code: 'MATH303', title: 'Abstract Algebra', units: 3, subjectType: 'Major', type: 'Major', prereq: 'MATH301' },
        { code: 'MATH304', title: 'Differential Calculus', units: 3, subjectType: 'Major', type: 'Major', prereq: 'MATH201' },
      ],
    },
    {
      yearLevel: 4, semester: '1st',
      subjects: [
        { code: 'MATH401', title: 'Practice Teaching', units: 6, subjectType: 'Professional Education', type: 'Professional', prereq: 'MATH301', labPeriods: 3 },
        { code: 'MATH402', title: 'Research in Mathematics', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'MATH303' },
      ],
    },
    {
      yearLevel: 4, semester: '2nd',
      subjects: [
        { code: 'MATH403', title: 'Portfolio Development', units: 3, subjectType: 'Professional Education', type: 'Professional', prereq: 'MATH401' },
      ],
    },
  ],

  [BSBA]: [
    {
      yearLevel: 1, semester: '2nd',
      subjects: [
        { code: 'HRM102', title: 'Fundamentals of Accounting', units: 3, subjectType: 'Core', type: 'General', prereq: 'HRM1' },
        ...SHARED_GE(),
      ],
    },
    {
      yearLevel: 2, semester: '1st',
      subjects: [
        { code: 'HRM201', title: 'Principles of Management', units: 3, subjectType: 'Major', type: 'Major', prereq: 'HRM 2' },
        { code: 'HRM202', title: 'Business Ethics', units: 3, subjectType: 'Major', type: 'Major' },
        { code: 'GE104', title: 'Readings in Philippine History', units: 3, subjectType: 'General Education', type: 'General' },
      ],
    },
    {
      yearLevel: 2, semester: '2nd',
      subjects: [
        { code: 'HRM203', title: 'Human Resource Development', units: 3, subjectType: 'Major', type: 'Major', prereq: 'HRM201' },
        { code: 'HRM204', title: 'Recruitment and Selection', units: 3, subjectType: 'Major', type: 'Major', prereq: 'HRM202' },
      ],
    },
    {
      yearLevel: 3, semester: '1st',
      subjects: [
        { code: 'HRM301', title: 'Compensation Management', units: 3, subjectType: 'Major', type: 'Major', prereq: 'HRM203' },
        { code: 'HRM302', title: 'Labor Relations and Policy', units: 3, subjectType: 'Major', type: 'Major', prereq: 'HRM204' },
      ],
    },
    {
      yearLevel: 3, semester: '2nd',
      subjects: [
        { code: 'HRM303', title: 'Training and Development', units: 3, subjectType: 'Major', type: 'Major', prereq: 'HRM203' },
        { code: 'HRM304', title: 'Organizational Behavior', units: 3, subjectType: 'Major', type: 'Major', isRequired: false },
      ],
    },
    {
      yearLevel: 4, semester: '1st',
      subjects: [
        { code: 'HRM401', title: 'Practicum in Human Resource Management', units: 6, subjectType: 'Major', type: 'Major', prereq: 'HRM303', labPeriods: 3 },
        { code: 'HRM402', title: 'Strategic Human Resource Management', units: 3, subjectType: 'Major', type: 'Major', prereq: 'HRM301' },
      ],
    },
    {
      yearLevel: 4, semester: '2nd',
      subjects: [
        { code: 'HRM403', title: 'Human Resource Action Research', units: 3, subjectType: 'Major', type: 'Major', prereq: 'HRM401' },
      ],
    },
  ],
};

const PROGRAM_LABEL = { [BEED]: '101 BEED', [BSED_EN]: '102 BSED-English', [BSED_MATH]: '103 BSED-Math', [BSBA]: '201 BSBA-HRM' };

async function ensureSubject(code, spec) {
  const existing = await Subject.findOne({ code, version: 1 }).lean();
  if (existing) return { subject: existing, created: false };

  const created = await Subject.create({
    code,
    title: spec.title,
    units: spec.units,
    subjectType: spec.subjectType || 'General Education',
    lecturePeriods: spec.lecturePeriods ?? spec.units,
    labPeriods: spec.labPeriods ?? 0,
    status: 'Active',
    isActive: true,
    version: 1,
  });
  return { subject: created.toObject(), created: true };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const curriculumIds = Object.keys(PLAN);
  const curricula = await Curriculum.find({ _id: { $in: curriculumIds } }).lean();
  if (curricula.length !== curriculumIds.length) {
    throw new Error(`Expected ${curriculumIds.length} active curricula, found ${curricula.length}`);
  }

  const stats = { subjectsCreated: 0, subjectsReused: 0, placementsCreated: 0, placementsExisting: 0, prereqsCleared: 0 };
  const subjectIdByCode = new Map();

  // Every code referenced anywhere in the plan, so prerequisites can resolve.
  const allSpecs = new Map();
  for (const terms of Object.values(PLAN)) {
    for (const term of terms) {
      for (const spec of term.subjects) {
        if (!allSpecs.has(spec.code)) allSpecs.set(spec.code, spec);
      }
    }
  }
  // Existing catalog entries (including codes already in use, e.g. ENG101).
  for (const s of await Subject.find({ version: 1 }).lean()) {
    if (!subjectIdByCode.has(s.code)) subjectIdByCode.set(s.code, String(s._id));
  }

  for (const [code, spec] of allSpecs) {
    if (subjectIdByCode.has(code)) continue;
    const { subject, created } = await ensureSubject(code, spec);
    subjectIdByCode.set(code, String(subject._id));
    if (created) stats.subjectsCreated += 1;
    else stats.subjectsReused += 1;
  }

  for (const curriculumId of curriculumIds) {
    const terms = PLAN[curriculumId];
    let order = 0;

    for (const term of terms) {
      let orderInTerm = 0;
      for (const spec of term.subjects) {
        orderInTerm += 1;
        order += 1;

        const subjectId = subjectIdByCode.get(spec.code);
        if (!subjectId) throw new Error(`Subject ${spec.code} could not be resolved`);

        const existing = await CurriculumSubject.findOne({ curriculumId, subjectId }).lean();
        if (existing) {
          stats.placementsExisting += 1;
          continue;
        }

        const prereqIds = [];
        if (spec.prereq) {
          const prereqId = subjectIdByCode.get(spec.prereq);
          if (!prereqId) throw new Error(`Prerequisite ${spec.prereq} for ${spec.code} could not be resolved`);
          prereqIds.push(prereqId);
        }

        await CurriculumSubject.create({
          curriculumId,
          subjectId,
          yearLevel: term.yearLevel,
          semester: term.semester,
          type: spec.type || 'General',
          isRequired: spec.isRequired !== false,
          courseNo: spec.code,
          descriptiveTitle: spec.title,
          units: spec.units,
          lecturePeriods: spec.lecturePeriods ?? spec.units,
          labPeriods: spec.labPeriods ?? 0,
          prerequisiteSubjectIds: prereqIds,
          displayOrder: order,
        });
        stats.placementsCreated += 1;
      }
    }
  }

  // Year 1, 1st semester must never carry a prerequisite.
  const yearOneFirst = await CurriculumSubject.find({ curriculumId: { $in: curriculumIds }, yearLevel: 1, semester: '1st' }).lean();
  for (const placement of yearOneFirst) {
    if (!placement.prerequisiteSubjectIds || placement.prerequisiteSubjectIds.length === 0) continue;
    await CurriculumSubject.updateOne(
      { _id: placement._id },
      { $set: { prerequisiteSubjectIds: [] } }
    );
    stats.prereqsCleared += 1;
  }

  console.log('\n=== seed summary ===');
  console.log(`  subjects created : ${stats.subjectsCreated}`);
  console.log(`  subjects reused  : ${stats.subjectsReused}`);
  console.log(`  placements added : ${stats.placementsCreated}`);
  console.log(`  placements already present: ${stats.placementsExisting}`);
  console.log(`  Year 1 1st-sem prerequisites cleared: ${stats.prereqsCleared}`);

  console.log('\n=== result per curriculum ===');
  for (const curriculumId of curriculumIds) {
    const label = PROGRAM_LABEL[curriculumId];
    const placements = await CurriculumSubject.find({ curriculumId })
      .sort({ yearLevel: 1, semester: 1, displayOrder: 1 })
      .lean();
    console.log(`\n${label}  (${placements.length} placements)`);
    let current = '';
    for (const p of placements) {
      const key = `Y${p.yearLevel} ${p.semester}`;
      if (key !== current) { current = key; console.log(`  -- ${key} --`); }
      const prereq = (p.prerequisiteSubjectIds || []).length
        ? `  [prereq: ${(p.prerequisiteSubjectIds || []).length}]`
        : '';
      const elective = p.isRequired ? '' : '  (elective)';
      console.log(`    ${String(p.courseNo).padEnd(9)} ${String(p.descriptiveTitle).slice(0, 46).padEnd(47)} ${p.units}u${elective}${prereq}`);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
