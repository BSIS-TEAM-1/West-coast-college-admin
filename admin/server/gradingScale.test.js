/**
 * Tests for the configurable grading scale.
 *
 * Covers the BU-style decimal grades WCC now accepts (1.0, 1.1, 1.2 …),
 * rejection of values that are not on the configured scale, legacy
 * quarter-point display, pass/fail boundaries and the configurable
 * percentage → grade conversion table.
 */

const SystemSetting = require('./models/SystemSetting');
const TransmutationTable = require('./models/TransmutationTable');

jest.mock('./models/SystemSetting', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

const {
  DEFAULT_GRADE_SCALE,
  roundGrade,
  isOnScale,
  parseGradeInput,
  formatGrade,
  isPassingGrade,
  validateScaleConfig,
  loadGradeScale,
  saveGradeScale,
  clearGradeScaleCache,
  describeScale,
  listAllowedGrades
} = require('./services/gradingScaleService');

const BU_STYLE = { ...DEFAULT_GRADE_SCALE };

function mockStoredScale(value) {
  SystemSetting.findOne.mockReturnValue({
    lean: async () => (value === undefined ? null : { key: 'gradeScale', value })
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  clearGradeScaleCache();
});

describe('decimal grade acceptance', () => {
  test.each(['1.0', '1.1', '1.2', '1.3', '1.4', '1.5', 2.0, 2.5, 3.0, 4.0, 5.0])(
    'accepts %p on the default scale',
    (raw) => {
      const parsed = parseGradeInput(raw, BU_STYLE);
      expect(parsed.error).toBeUndefined();
      expect(parsed.value).toBe(Number(raw));
    }
  );

  test('blank grades are stored as null', () => {
    expect(parseGradeInput('', BU_STYLE)).toEqual({ value: null });
    expect(parseGradeInput(null, BU_STYLE)).toEqual({ value: null });
  });

  test.each(['1.15', '1.25', '1.33', '2.75'])('rejects off-scale grade %p', (raw) => {
    const parsed = parseGradeInput(raw, BU_STYLE);
    expect(parsed.value).toBeUndefined();
    expect(parsed.error).toMatch(/not on the configured/);
  });

  test.each([['0.9'], [5.1], ['-1'], ['abc']])('rejects out-of-range grade %p', (raw) => {
    const parsed = parseGradeInput(raw, BU_STYLE);
    expect(parsed.value).toBeUndefined();
    expect(parsed.error).toBeTruthy();
  });

  test('a configured 0.25 step accepts quarter points and rejects 1.1', () => {
    const quarter = { min: 1, max: 5, step: 0.25, passingGrade: 3 };
    expect(parseGradeInput(1.25, quarter)).toEqual({ value: 1.25 });
    expect(parseGradeInput(1.1, quarter).error).toMatch(/not on the configured/);
  });

  test('roundGrade snaps to the nearest step without floating-point noise', () => {
    expect(roundGrade(1.14, BU_STYLE)).toBe(1.1);
    expect(roundGrade(1.15, BU_STYLE)).toBe(1.2);
    expect(roundGrade(4.96, BU_STYLE)).toBe(5);
    expect(isOnScale(1.1, BU_STYLE)).toBe(true);
    expect(isOnScale(1.25, BU_STYLE)).toBe(false);
  });
});

describe('grade display formatting', () => {
  test('renders BU-style grades with one decimal', () => {
    expect(formatGrade(1, BU_STYLE)).toBe('1.0');
    expect(formatGrade(1.1, BU_STYLE)).toBe('1.1');
    expect(formatGrade(1.2, BU_STYLE)).toBe('1.2');
    expect(formatGrade(2, BU_STYLE)).toBe('2.0');
    expect(formatGrade('3.5', BU_STYLE)).toBe('3.5');
  });

  test('keeps legacy quarter-point grades readable with two decimals', () => {
    expect(formatGrade(1.25, BU_STYLE)).toBe('1.25');
    expect(formatGrade(2.75, BU_STYLE)).toBe('2.75');
  });

  test('handles empty grades', () => {
    expect(formatGrade(null, BU_STYLE)).toBe('');
    expect(formatGrade(undefined, BU_STYLE)).toBe('');
    expect(formatGrade('', BU_STYLE)).toBe('');
  });
});

describe('passing grade', () => {
  test('uses the configured passing grade', () => {
    expect(isPassingGrade(1.0, BU_STYLE)).toBe(true);
    expect(isPassingGrade(3.0, BU_STYLE)).toBe(true);
    expect(isPassingGrade(3.1, BU_STYLE)).toBe(false);
    expect(isPassingGrade(2.5, { ...BU_STYLE, passingGrade: 2.5 })).toBe(true);
    expect(isPassingGrade(2.6, { ...BU_STYLE, passingGrade: 2.5 })).toBe(false);
  });
});

describe('scale configuration', () => {
  test('accepts the default policy', () => {
    expect(validateScaleConfig(DEFAULT_GRADE_SCALE).scale).toEqual(DEFAULT_GRADE_SCALE);
  });

  test('accepts a BU-style decimal policy', () => {
    const result = validateScaleConfig({ min: 1, max: 5, step: 0.1, passingGrade: 3 });
    expect(result.error).toBeUndefined();
    expect(result.scale).toEqual({ min: 1, max: 5, step: 0.1, passingGrade: 3 });
  });

  test.each([
    [{ min: 1, max: 1, step: 0.1, passingGrade: 1 }, /max must be greater/],
    [{ min: 1, max: 5, step: 0, passingGrade: 3 }, /step must be greater/],
    [{ min: 1, max: 5, step: 0.1, passingGrade: 6 }, /passingGrade must be within/],
    [{ min: 1, max: 5, step: 0.3, passingGrade: 3 }, /reachable/],
    [{ min: 1, max: 5, step: 0.1 }, /required/]
  ])('rejects invalid config %p', (config, matcher) => {
    expect(validateScaleConfig(config).error).toMatch(matcher);
  });

  test('describes the scale and lists allowed grades', () => {
    expect(describeScale(BU_STYLE)).toBe('1.0–5.0 in 0.1 increments');
    const grades = listAllowedGrades(BU_STYLE);
    expect(grades).toHaveLength(41);
    expect(grades[0]).toBe(1);
    expect(grades[1]).toBe(1.1);
    expect(grades[grades.length - 1]).toBe(5);
  });
});

describe('persistence', () => {
  test('loads a stored scale and falls back to defaults when unset', async () => {
    mockStoredScale({ min: 1, max: 5, step: 0.5, passingGrade: 3 });
    await expect(loadGradeScale()).resolves.toEqual({ min: 1, max: 5, step: 0.5, passingGrade: 3 });

    clearGradeScaleCache();
    mockStoredScale(undefined);
    await expect(loadGradeScale()).resolves.toEqual(DEFAULT_GRADE_SCALE);
  });

  test('saving a scale writes the setting and clears the cache', async () => {
    SystemSetting.findOneAndUpdate.mockResolvedValue({});
    mockStoredScale({ min: 1, max: 5, step: 0.5, passingGrade: 2.5 });
    await loadGradeScale();

    const saved = await saveGradeScale({ min: 1, max: 5, step: 0.1, passingGrade: 3 }, 'admin-1');
    expect(saved.error).toBeUndefined();
    expect(SystemSetting.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'gradeScale' },
      { $set: { key: 'gradeScale', value: { min: 1, max: 5, step: 0.1, passingGrade: 3 } } },
      { upsert: true, runValidators: true }
    );

    // The cache is updated immediately, so the next read sees the new scale.
    await expect(loadGradeScale()).resolves.toEqual({ min: 1, max: 5, step: 0.1, passingGrade: 3 });

    // A fresh read goes back to the database, which now holds the new value.
    mockStoredScale({ min: 1, max: 5, step: 0.1, passingGrade: 3 });
    await expect(loadGradeScale({ fresh: true })).resolves.toEqual({ min: 1, max: 5, step: 0.1, passingGrade: 3 });
  });

  test('saving an invalid scale does not write', async () => {
    SystemSetting.findOneAndUpdate.mockResolvedValue({});
    const saved = await saveGradeScale({ min: 1, max: 5, step: 0, passingGrade: 3 }, 'admin-1');
    expect(saved.error).toBeTruthy();
    expect(SystemSetting.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('percentage → decimal grade conversion', () => {
  // Only the reference rows supplied by WCC/BU; the rest of the scale is
  // institution-defined and loaded from the transmutation table.
  const referenceTable = new TransmutationTable({
    name: 'WCC reference',
    brackets: [
      { minRaw: 99, maxRaw: 100, grade: 1.0 },
      { minRaw: 98, maxRaw: 98, grade: 1.1 },
      { minRaw: 97, maxRaw: 97, grade: 1.2 },
      { minRaw: 96, maxRaw: 96, grade: 1.3 },
      { minRaw: 95, maxRaw: 95, grade: 1.4 },
      { minRaw: 94, maxRaw: 94, grade: 1.5 }
    ]
  });

  test.each([
    [100, 1.0],
    [99, 1.0],
    [98, 1.1],
    [97, 1.2],
    [96, 1.3],
    [95, 1.4],
    [94, 1.5]
  ])('maps %p%% to %p', (raw, expected) => {
    expect(referenceTable.transmute(raw)).toBe(expected);
  });

  test('mapped grades are valid grades on the configured scale', () => {
    for (const bracket of referenceTable.brackets) {
      expect(isOnScale(bracket.grade, BU_STYLE)).toBe(true);
      expect(parseGradeInput(bracket.grade, BU_STYLE).value).toBe(bracket.grade);
    }
  });

  test('unmapped percentages return null rather than an invented grade', () => {
    expect(referenceTable.transmute(93)).toBeNull();
    expect(referenceTable.transmute(80)).toBeNull();
  });
});
