/**
 * Tests for migrations/realignStudentPasswordFormat.js.
 *
 * Covers the two password derivations and the classification that decides
 * whether a stored hash is legacy (re-hash), canonical (leave alone) or a
 * registrar-set custom password (never overwrite).
 */

const bcrypt = require('bcryptjs');
const {
  legacyInitialsPassword,
  classifyStoredPassword
} = require('./migrations/realignStudentPasswordFormat');

const PREPOTENTE = {
  firstName: 'Lorenze',
  middleName: 'Nino',
  lastName: 'Prepotente',
  studentNumber: '202410128391'
};

// Cheap hashes — these tests only care about which plaintext matches.
const hash = (plaintext) => bcrypt.hashSync(plaintext, 4);

describe('legacyInitialsPassword', () => {
  test('uses every name part initial plus the last 5 digits of the student number', () => {
    expect(legacyInitialsPassword(PREPOTENTE)).toBe('lnp28391');
  });

  test('splits a middle name that carries an initial into its own part', () => {
    expect(legacyInitialsPassword({ ...PREPOTENTE, middleName: 'Nino F.' })).toBe('lnfp28391');
  });

  test('two name parts collapse to two letters, e.g. lp12345', () => {
    expect(
      legacyInitialsPassword({ firstName: 'Lea', lastName: 'Perez', studentNumber: '202410112345' })
    ).toBe('lp12345');
  });

  test('ignores missing name parts', () => {
    expect(
      legacyInitialsPassword({ firstName: 'John', middleName: '', lastName: 'Doe', studentNumber: '202410112345' })
    ).toBe('jd12345');
  });

  test('ignores a missing middle name instead of spelling "undefined"', () => {
    expect(
      legacyInitialsPassword({ firstName: 'Lorenze', lastName: 'Prepotente', studentNumber: '202610155906' })
    ).toBe('lp55906');
  });
});

describe('classifyStoredPassword', () => {
  const canonical = 'lprepotente28391';
  const legacy = 'lnfp28391';

  test('canonical format from the current service is recognised', () => {
    expect(canonical).toBe(
      require('./services/studentPasswordService').generateDefaultPassword(PREPOTENTE)
    );
  });

  test('a hash of the legacy initials format is flagged for realignment', async () => {
    await expect(
      classifyStoredPassword(hash(legacy), { canonical, legacy })
    ).resolves.toBe('legacy');
  });

  test('a hash of the canonical password needs no change', async () => {
    await expect(
      classifyStoredPassword(hash(canonical), { canonical, legacy })
    ).resolves.toBe('canonical');
  });

  test('a registrar-set custom password is reported, never treated as legacy', async () => {
    await expect(
      classifyStoredPassword(hash('MyOwnPassw0rd'), { canonical, legacy })
    ).resolves.toBe('custom');
  });

  test('a missing hash is not re-hashed', async () => {
    await expect(classifyStoredPassword('', { canonical, legacy })).resolves.toBe('missing');
  });

  test('a one-word name whose derivations agree stays canonical', async () => {
    // firstName "L", lastName "p" → both derivations produce lp12345.
    const student = { firstName: 'L', lastName: 'p', studentNumber: '202410112345' };
    const same = 'lp12345';
    expect(legacyInitialsPassword(student)).toBe(same);
    await expect(
      classifyStoredPassword(hash(same), { canonical: same, legacy: same })
    ).resolves.toBe('canonical');
  });
});
