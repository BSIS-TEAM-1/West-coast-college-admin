/**
 * Migration test: backfillAcademicStanding.
 *
 * The migration must work against the REAL database collection, so the tests use
 * a fake native-driver collection (documents + indexes) rather than a Mongoose
 * model. That is deliberate: relying on the model would hide exactly the bug
 * this migration fixes — Mongoose defaults do not reach existing documents.
 */

const {
  backfillAcademicStanding,
  formatBackfillReport,
  DEFAULT_ACADEMIC_STANDING,
  MISSING_STANDING_FILTER,
  MISSING_TIMESTAMP_FILTER
} = require('./migrations/backfillAcademicStanding');

function matches(document, filter) {
  return Object.entries(filter || {}).every(([key, condition]) => {
    if (key === '$or') return condition.some((clause) => matches(document, clause));

    const value = document[key];
    if (condition === null) return value === null || value === undefined;

    if (condition && typeof condition === 'object') {
      if ('$exists' in condition) return Boolean(condition.$exists) === (value !== undefined);
      if ('$nin' in condition) return !condition.$nin.includes(value);
      throw new Error(`Unsupported filter condition on ${key}: ${JSON.stringify(condition)}`);
    }

    return value === condition;
  });
}

/** Minimal native-driver collection with the operations the migration uses. */
function createFakeCollection(documents, { indexes = [{ name: '_id_', key: { _id: 1 } }] } = {}) {
  const state = {
    docs: documents.map((doc) => ({ ...doc })),
    indexes: indexes.map((index) => ({ ...index })),
    createIndexCalls: 0
  };

  const collection = {
    collectionName: 'students',
    async countDocuments(filter = {}) {
      return state.docs.filter((doc) => matches(doc, filter)).length;
    },
    find(filter = {}, options = {}) {
      const projection = options.projection || {};
      const selected = state.docs.filter((doc) => matches(doc, filter)).map((doc) => {
        if (!projection || Object.keys(projection).length === 0) return { ...doc };
        const out = {};
        for (const [field, include] of Object.entries(projection)) {
          if (include && Object.prototype.hasOwnProperty.call(doc, field)) out[field] = doc[field];
        }
        return out;
      });
      return {
        limit(count) {
          return { toArray: async () => selected.slice(0, count) };
        },
        toArray: async () => selected
      };
    },
    async updateMany(filter, update) {
      const affected = state.docs.filter((doc) => matches(doc, filter));
      for (const doc of affected) Object.assign(doc, update.$set || {});
      return { matchedCount: affected.length, modifiedCount: affected.length };
    },
    async indexes() {
      return state.indexes.map((index) => ({ ...index }));
    },
    async createIndex(key, options = {}) {
      state.createIndexCalls += 1;
      const name = options.name || Object.entries(key).map(([field, dir]) => `${field}_${dir}`).join('_');
      state.indexes.push({ name, key });
      return name;
    }
  };

  return { collection, state };
}

describe('backfillAcademicStanding', () => {
  function legacyDocuments() {
    return [
      // Legacy student: neither field exists (created before the lifecycle fix).
      { _id: 's1', studentNumber: '2024-0001', firstName: 'Legacy', lastName: 'Student' },
      // Already evaluated: values must survive untouched.
      {
        _id: 's2',
        studentNumber: '2024-0002',
        academicStanding: 'DISMISSED',
        academicStandingUpdatedAt: new Date('2026-01-10')
      },
      // Corrupt value outside the model enum.
      { _id: 's3', studentNumber: '2024-0003', academicStanding: '', academicStandingUpdatedAt: null },
      // Standing present but the timestamp never materialized.
      { _id: 's4', studentNumber: '2024-0004', academicStanding: 'ACADEMIC_PROBATION' }
    ];
  }

  test('dry run inspects the real collection and writes nothing', async () => {
    const { collection, state } = createFakeCollection(legacyDocuments());

    const report = await backfillAcademicStanding({ collection, apply: false });

    expect(report.apply).toBe(false);
    expect(report.before.totalDocuments).toBe(4);
    expect(report.before.missingAcademicStanding).toBe(2); // s1 (absent) + s3 (invalid)
    expect(report.before.missingAcademicStandingUpdatedAt).toBe(2); // s1 + s4
    expect(report.before.academicStandingIndex).toBeNull();
    expect(report.before.sampleFindings[0]).toEqual({
      academicStanding: '(absent)',
      academicStandingUpdatedAt: '(absent)'
    });
    expect(report.actions.academicStandingBackfilled).toBe(0);
    expect(report.actions.indexCreated).toBe(false);
    expect(state.indexes).toHaveLength(1);
    expect(state.docs.find((doc) => doc._id === 's1').academicStanding).toBeUndefined();
  });

  test('apply backfills safe defaults, preserves real values and creates the index', async () => {
    const { collection, state } = createFakeCollection(legacyDocuments());

    const report = await backfillAcademicStanding({ collection, apply: true });

    const byId = Object.fromEntries(state.docs.map((doc) => [doc._id, doc]));

    // Legacy and corrupt rows receive the safe default.
    expect(byId.s1.academicStanding).toBe(DEFAULT_ACADEMIC_STANDING);
    expect(byId.s3.academicStanding).toBe(DEFAULT_ACADEMIC_STANDING);

    // A recorded deficiency standing is never reset.
    expect(byId.s2.academicStanding).toBe('DISMISSED');
    expect(byId.s2.academicStandingUpdatedAt).toEqual(new Date('2026-01-10'));
    expect(byId.s4.academicStanding).toBe('ACADEMIC_PROBATION');

    // Both fields exist on every document afterwards.
    for (const doc of state.docs) {
      expect(Object.prototype.hasOwnProperty.call(doc, 'academicStanding')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(doc, 'academicStandingUpdatedAt')).toBe(true);
    }

    expect(report.actions.academicStandingBackfilled).toBe(2);
    expect(report.actions.academicStandingUpdatedAtMaterialized).toBe(2);
    expect(report.actions.indexCreated).toBe(true);
    expect(report.after.academicStandingIndex).toEqual({
      name: 'academicStanding_1',
      key: { academicStanding: 1 }
    });
    expect(report.after.missingAcademicStanding).toBe(0);
    expect(report.after.missingAcademicStandingUpdatedAt).toBe(0);
  });

  test('is idempotent: a second apply changes nothing and creates no index twice', async () => {
    const { collection, state } = createFakeCollection(legacyDocuments());

    await backfillAcademicStanding({ collection, apply: true });
    const createIndexCallsAfterFirstRun = state.createIndexCalls;
    const second = await backfillAcademicStanding({ collection, apply: true });

    expect(second.actions.academicStandingBackfilled).toBe(0);
    expect(second.actions.academicStandingUpdatedAtMaterialized).toBe(0);
    expect(second.actions.indexCreated).toBe(false);
    expect(state.createIndexCalls).toBe(createIndexCallsAfterFirstRun);
    expect(second.before.missingAcademicStanding).toBe(0);
    expect(second.before.missingAcademicStandingUpdatedAt).toBe(0);
  });

  test('handles an empty collection without errors', async () => {
    const { collection } = createFakeCollection([]);

    const report = await backfillAcademicStanding({ collection, apply: true });

    expect(report.before.totalDocuments).toBe(0);
    expect(report.after.missingAcademicStanding).toBe(0);
    expect(report.actions.indexCreated).toBe(true);
  });

  test('formats a report an operator can read before applying', async () => {
    const { collection } = createFakeCollection(legacyDocuments());
    const report = await backfillAcademicStanding({ collection, apply: false });

    const text = formatBackfillReport(report);

    expect(text).toContain('DRY RUN (read-only)');
    expect(text).toContain('missing academicStanding: 2');
    expect(text).toContain('academicStanding index: MISSING');
    expect(text).toContain('--apply');
  });

  test('the filters used by the migration are real Mongo filters', () => {
    expect(MISSING_STANDING_FILTER.$or).toEqual(expect.arrayContaining([
      { academicStanding: { $exists: false } },
      { academicStanding: null },
      { academicStanding: { $nin: ['GOOD_STANDING', 'ACADEMIC_PROBATION', 'DISMISSED'] } }
    ]));
    expect(MISSING_TIMESTAMP_FILTER).toEqual({ academicStandingUpdatedAt: { $exists: false } });
  });
});
