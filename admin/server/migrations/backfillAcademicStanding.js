/**
 * Migration: materialize the academic-standing fields on existing students.
 *
 * The lifecycle fix added two Student fields:
 *   - academicStanding          GOOD_STANDING | ACADEMIC_PROBATION | DISMISSED
 *   - academicStandingUpdatedAt Date | null
 *
 * Mongoose applies schema defaults when it CREATES a document. It does not add
 * a missing path to documents that already exist, so on a database that
 * predates the lifecycle fix those fields are absent — and a query like
 * `{ academicStandingUpdatedAt: { $lt: someDate } }` would not match them.
 * This migration inspects the REAL collection through the native driver and
 * backfills safe defaults:
 *   academicStanding          → GOOD_STANDING (a legacy student has no recorded
 *                               deficiency standing; the next evaluation
 *                               recalculates it from the grade history)
 *   academicStandingUpdatedAt → null (never evaluated; no false freshness)
 *
 * It also ensures the `academicStanding` index declared by the model exists,
 * because production runs commonly disable Mongoose autoIndex.
 *
 * Safe: additive only, no deletes, no document is otherwise modified.
 * Idempotent: a second run matches nothing and creates no new index.
 *
 * Verification never relies on the ORM definition: it reads the collection's
 * own documents and indexes with the native MongoDB driver.
 *
 * Usage:
 *   node migrations/backfillAcademicStanding.js            → DRY RUN (read-only)
 *   node migrations/backfillAcademicStanding.js --apply    → APPLY (writes)
 */

const mongoose = require('mongoose');

const COLLECTION_NAME = 'students';
const ACADEMIC_STANDINGS = ['GOOD_STANDING', 'ACADEMIC_PROBATION', 'DISMISSED'];
const DEFAULT_ACADEMIC_STANDING = 'GOOD_STANDING';
const INDEX_KEY = { academicStanding: 1 };
const INDEX_NAME = 'academicStanding_1';

/** Every existing document that does not carry a valid academicStanding value. */
const MISSING_STANDING_FILTER = {
  $or: [
    { academicStanding: { $exists: false } },
    { academicStanding: null },
    { academicStanding: { $nin: ACADEMIC_STANDINGS } }
  ]
};

const MISSING_TIMESTAMP_FILTER = { academicStandingUpdatedAt: { $exists: false } };

/**
 * Read the real schema state of the collection (documents + indexes).
 *
 * @param {Object} collection - native driver collection (db.collection('students'))
 * @param {number} [sampleSize=5]
 * @returns {Promise<Object>}
 */
async function inspectAcademicStandingSchema(collection, sampleSize = 5) {
  const total = await collection.countDocuments({});
  const samples = await collection
    .find({}, { projection: { _id: 0, academicStanding: 1, academicStandingUpdatedAt: 1 } })
    .limit(sampleSize)
    .toArray();

  const indexes = await collection.indexes();
  const standingIndex = indexes.find(
    (index) => index.key && Number(index.key.academicStanding) === 1
  ) || null;

  return {
    totalDocuments: total,
    missingAcademicStanding: await collection.countDocuments(MISSING_STANDING_FILTER),
    missingAcademicStandingUpdatedAt: await collection.countDocuments(MISSING_TIMESTAMP_FILTER),
    sampleFindings: samples.map((doc) => ({
      academicStanding: Object.prototype.hasOwnProperty.call(doc, 'academicStanding')
        ? doc.academicStanding
        : '(absent)',
      academicStandingUpdatedAt: Object.prototype.hasOwnProperty.call(doc, 'academicStandingUpdatedAt')
        ? doc.academicStandingUpdatedAt
        : '(absent)'
    })),
    academicStandingIndex: standingIndex ? { name: standingIndex.name, key: standingIndex.key } : null
  };
}

/**
 * Backfill the academic-standing fields and ensure their index.
 *
 * @param {Object} options
 * @param {Object} options.collection - native driver collection
 * @param {boolean} [options.apply=false]
 * @returns {Promise<Object>} before/after report
 */
async function backfillAcademicStanding({ collection, apply = false } = {}) {
  if (!collection || typeof collection.countDocuments !== 'function') {
    throw new Error('backfillAcademicStanding requires a native MongoDB collection');
  }

  const before = await inspectAcademicStandingSchema(collection);
  const report = {
    collection: collection.collectionName || COLLECTION_NAME,
    apply: Boolean(apply),
    before,
    actions: {
      academicStandingBackfilled: 0,
      academicStandingUpdatedAtMaterialized: 0,
      indexCreated: false
    },
    after: null
  };

  if (!apply) {
    report.after = before;
    return report;
  }

  if (before.missingAcademicStanding > 0) {
    const result = await collection.updateMany(MISSING_STANDING_FILTER, {
      $set: { academicStanding: DEFAULT_ACADEMIC_STANDING }
    });
    report.actions.academicStandingBackfilled = result.modifiedCount ?? result.matchedCount ?? 0;
  }

  if (before.missingAcademicStandingUpdatedAt > 0) {
    const result = await collection.updateMany(MISSING_TIMESTAMP_FILTER, {
      $set: { academicStandingUpdatedAt: null }
    });
    report.actions.academicStandingUpdatedAtMaterialized = result.modifiedCount ?? result.matchedCount ?? 0;
  }

  if (!before.academicStandingIndex) {
    await collection.createIndex(INDEX_KEY, { name: INDEX_NAME, background: true });
    report.actions.indexCreated = true;
  }

  report.after = await inspectAcademicStandingSchema(collection);
  return report;
}

function formatBackfillReport(report) {
  const lines = [];
  lines.push(`Academic standing schema backfill — ${report.apply ? 'APPLY (writes enabled)' : 'DRY RUN (read-only)'}`);
  lines.push(`Collection: ${report.collection}`);
  lines.push('');
  lines.push('BEFORE (native driver)');
  lines.push(`  documents: ${report.before.totalDocuments}`);
  lines.push(`  missing academicStanding: ${report.before.missingAcademicStanding}`);
  lines.push(`  missing academicStandingUpdatedAt: ${report.before.missingAcademicStandingUpdatedAt}`);
  lines.push(`  academicStanding index: ${report.before.academicStandingIndex ? report.before.academicStandingIndex.name : 'MISSING'}`);
  for (const sample of report.before.sampleFindings) {
    lines.push(`  sample: academicStanding=${sample.academicStanding}, academicStandingUpdatedAt=${sample.academicStandingUpdatedAt === null ? 'null' : sample.academicStandingUpdatedAt}`);
  }

  if (report.apply) {
    lines.push('');
    lines.push('ACTIONS');
    lines.push(`  academicStanding set to ${DEFAULT_ACADEMIC_STANDING}: ${report.actions.academicStandingBackfilled}`);
    lines.push(`  academicStandingUpdatedAt materialized as null: ${report.actions.academicStandingUpdatedAtMaterialized}`);
    lines.push(`  academicStanding index created: ${report.actions.indexCreated ? 'yes' : 'no (already present)'}`);
  }

  lines.push('');
  lines.push(`AFTER (native driver)`);
  lines.push(`  missing academicStanding: ${report.after.missingAcademicStanding}`);
  lines.push(`  missing academicStandingUpdatedAt: ${report.after.missingAcademicStandingUpdatedAt}`);
  lines.push(`  academicStanding index: ${report.after.academicStandingIndex ? report.after.academicStandingIndex.name : 'MISSING'}`);

  if (!report.apply) {
    lines.push('');
    lines.push('Re-run with --apply to write these changes.');
  }

  return lines.join('\n');
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI is not set in the environment.');
    process.exit(1);
  }

  const apply = process.argv.includes('--apply');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  try {
    const collection = mongoose.connection.db.collection(COLLECTION_NAME);
    const report = await backfillAcademicStanding({ collection, apply });
    console.log(formatBackfillReport(report));
    if (report.apply) {
      const pending = report.after.missingAcademicStanding
        + report.after.missingAcademicStandingUpdatedAt
        + (report.after.academicStandingIndex ? 0 : 1);
      if (pending > 0) process.exitCode = 1;
    }
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  // Loaded only for the CLI so requiring this module (tests, ops tooling) has
  // no environment side effects.
  require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
  run().catch(async (error) => {
    console.error('Migration failed:', error);
    try {
      await mongoose.connection.close();
    } catch (_error) {
      // The connection may never have opened.
    }
    process.exit(1);
  });
}

module.exports = {
  COLLECTION_NAME,
  ACADEMIC_STANDINGS,
  DEFAULT_ACADEMIC_STANDING,
  MISSING_STANDING_FILTER,
  MISSING_TIMESTAMP_FILTER,
  inspectAcademicStandingSchema,
  backfillAcademicStanding,
  formatBackfillReport
};
