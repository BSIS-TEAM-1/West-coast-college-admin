/**
 * Migration: realign stored student passwords to the canonical format.
 *
 * The canonical format (services/studentPasswordService.js) is:
 *   first initial + full last name + last 5 digits of the student number
 *   Lorenze Nino F. Prepotente, 2024-101-28391  →  lprepotente28391
 *
 * An earlier build hashed a different format into the database:
 *   every name part's initial + last 5 digits
 *   Lorenze Nino F. Prepotente  →  lnfp28391   (two name parts → "lp12345")
 *
 * Stored hashes are never recomputed, so those students still authenticate
 * with the old initials password instead of the documented one. This
 * migration:
 *   - matches each stored hash against the canonical password first,
 *   - falls back to the legacy initials password,
 *   - re-hashes only the legacy matches, to the canonical password,
 *   - leaves custom/registrar-set passwords untouched (a hash that matches
 *     neither derivation is reported, never overwritten).
 *
 * It never creates passwords for students that have none — that is
 * addStudentPasswords / POST /api/admin/migrate-student-passwords.
 * Idempotent: safe to rerun.
 *
 * Usage:
 *   node migrations/realignStudentPasswordFormat.js           → DRY RUN
 *   node migrations/realignStudentPasswordFormat.js --apply   → APPLY
 */

const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const StudentPasswordService = require('../services/studentPasswordService');

const IS_APPLY = process.argv.includes('--apply');

// AuditLog.performedBy is an ObjectId reference. Migrations run without an
// Admin account, so use the deterministic "system" id.
const SYSTEM_ACTOR_ID = new mongoose.Types.ObjectId('000000000000000000000000');

/**
 * The password the previous build generated: one letter per name part, then
 * the last 5 digits of the student number.
 */
function legacyInitialsPassword(student) {
  const fullName = [student.firstName, student.middleName, student.lastName]
    .filter((part) => part !== null && part !== undefined)
    .join(' ')
    .trim();
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLowerCase())
    .join('');
  const studentNumber = String(student.studentNumber || '').trim();
  return `${initials}${studentNumber.slice(-5)}`;
}

/**
 * Classify a stored hash against the two derivations for one student.
 * Returns 'canonical', 'legacy' or 'custom'.
 */
async function classifyStoredPassword(hash, { canonical, legacy }) {
  if (!hash) return 'missing';
  // When both derivations agree (e.g. a one-word name) the hash is already
  // canonical and there is nothing to realign.
  if (legacy !== canonical && (await bcrypt.compare(legacy, hash))) return 'legacy';
  if (await bcrypt.compare(canonical, hash)) return 'canonical';
  return 'custom';
}

function describe(student) {
  return `${student.studentNumber} | ${[student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ')}`;
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI not set in environment');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');
  console.log(`Mode: ${IS_APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (read-only)'}\n`);

  // Ids and names only for the derivation; the stored hash is read from the
  // same query (the `password` path must be listed without the `+` prefix —
  // with it, this Mongoose version leaves the field unloaded and every
  // account would be misread as a custom password).
  const students = await Student.find({
    password: { $exists: true, $nin: [null, ''] },
  }).select('password studentNumber firstName middleName lastName isActive');

  const legacyMatches = [];
  const customPasswords = [];
  const missingHashes = [];
  let alreadyCanonical = 0;
  let skipped = 0;

  for (const student of students) {
    const canonical = StudentPasswordService.generateDefaultPassword(student);
    if (!canonical || !/^\d{12}$/.test(String(student.studentNumber || ''))) {
      skipped += 1;
      continue;
    }

    const legacy = legacyInitialsPassword(student);
    const kind = await classifyStoredPassword(String(student.password), { canonical, legacy });

    if (kind === 'legacy') {
      legacyMatches.push({ student, canonical, legacy });
    } else if (kind === 'custom') {
      customPasswords.push({ student, canonical, legacy });
    } else if (kind === 'canonical') {
      alreadyCanonical += 1;
    } else {
      // The query only returns students that have a hash; if one still comes
      // back unloaded, refuse to guess rather than treat it as legacy.
      missingHashes.push({ student });
    }
  }

  for (const { student, canonical, legacy } of legacyMatches) {
    console.log(`${describe(student)}: legacy "${legacy}" → "${canonical}"`);
  }
  for (const { student } of customPasswords) {
    console.log(`${describe(student)}: custom password (left untouched)`);
  }
  for (const { student } of missingHashes) {
    console.log(`${describe(student)}: stored hash could not be loaded (left untouched)`);
  }

  console.log(
    `\nChecked ${students.length} student(s): ${alreadyCanonical} canonical, ` +
    `${legacyMatches.length} legacy, ${customPasswords.length} custom, ` +
    `${missingHashes.length} unreadable hash, ${skipped} skipped (incomplete record).`
  );

  if (!IS_APPLY) {
    if (legacyMatches.length > 0) {
      console.log('\nTo apply, run: node migrations/realignStudentPasswordFormat.js --apply');
    }
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  let failed = 0;
  for (const { student, canonical } of legacyMatches) {
    try {
      // Write the hash directly: these documents are loaded with the few name
      // fields the derivation needs, so document validation would reject them
      // for unrelated missing paths (e.g. course). Same cost as the model's
      // pre-save hook (bcrypt, 10 rounds).
      const hashed = await bcrypt.hash(canonical, 10);
      const result = await Student.updateOne(
        { _id: student._id },
        { $set: { password: hashed } }
      );
      if (result.modifiedCount === 0) throw new Error('no document updated');
      updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`✗ ${describe(student)}: ${error.message}`);
    }
  }

  if (updated > 0) {
    try {
      await require('../models/AuditLog').create({
        action: 'UPDATE',
        resourceType: 'SYSTEM',
        resourceId: 'student-password-format',
        resourceName: 'Student password format',
        description:
          `Student password format realigned: ${updated} account(s) re-hashed from the legacy ` +
          'initials format to first initial + full last name + last 5 digits.',
        performedBy: SYSTEM_ACTOR_ID,
        performedByRole: 'registrar',
        newValue: { updated, failed, format: 'firstInitial + lastName + last5' },
        status: 'SUCCESS',
        severity: 'MEDIUM',
      });
    } catch (error) {
      console.error(`Audit log write failed: ${error.message}`);
    }
  }

  console.log(`\nAPPLY complete: ${updated} password(s) realigned, ${failed} failed.`);
  await mongoose.disconnect();
}

if (require.main === module) {
  run().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

module.exports = { legacyInitialsPassword, classifyStoredPassword };
