/**
 * Grading Scale
 *
 * The single source of truth for the numeric grade format used across the
 * system. Historically WCC grades were entered in quarter-point steps
 * (1.00, 1.25, 1.50 … 5.00). The institution now uses a decimal scale
 * (1.0, 1.1, 1.2 … 5.0), and BOTH the step and the passing grade are
 * configurable so the policy is not hardcoded in the UI or the API.
 *
 * Stored in SystemSetting under the key `gradeScale`:
 *
 *   { min: 1, max: 5, step: 0.1, passingGrade: 3.0 }
 *
 * Design notes:
 * - Grades remain stored as IEEE-754 doubles in MongoDB (`Number`), which is
 *   what every existing record uses. Values are normalised onto the configured
 *   step before being written, so no floating-point drift accumulates.
 * - Existing quarter-point records (e.g. 1.25) are NEVER rewritten or
 *   reinterpreted. `formatGrade` keeps them readable with two decimals while
 *   new values render with the configured precision (1.0, 1.1 …).
 */

const SystemSetting = require('../models/SystemSetting');

const GRADE_SCALE_KEY = 'gradeScale';
const CACHE_TTL_MS = 30 * 1000;
const EPSILON = 1e-9;

const DEFAULT_GRADE_SCALE = Object.freeze({
  min: 1,
  max: 5,
  step: 0.1,
  passingGrade: 3
});

let cachedScale = null;
let cachedAt = 0;

function toFiniteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function decimalsForStep(step) {
  const text = String(step);
  if (text.includes('e-')) return Math.min(6, Number(text.split('e-')[1]));
  const fraction = text.split('.')[1];
  return fraction ? fraction.length : 0;
}

function normalizeScale(candidate) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const min = toFiniteNumber(source.min);
  const max = toFiniteNumber(source.max);
  const step = toFiniteNumber(source.step);
  const passingGrade = toFiniteNumber(source.passingGrade);

  const scale = {
    min: min !== null && min >= 0 ? min : DEFAULT_GRADE_SCALE.min,
    max: max !== null && max > 0 ? max : DEFAULT_GRADE_SCALE.max,
    step: step !== null && step > 0 ? step : DEFAULT_GRADE_SCALE.step,
    passingGrade: passingGrade !== null && passingGrade > 0 ? passingGrade : DEFAULT_GRADE_SCALE.passingGrade
  };

  if (scale.max <= scale.min) scale.max = scale.min + scale.step;
  if (scale.passingGrade < scale.min) scale.passingGrade = scale.min;
  if (scale.passingGrade > scale.max) scale.passingGrade = scale.max;

  return scale;
}

/**
 * Round a numeric grade onto the configured scale (anchored at `min`).
 * e.g. min 1, step 0.1 → 1.15 becomes 1.2 (round half up).
 */
function roundGrade(value, scale = DEFAULT_GRADE_SCALE) {
  const num = toFiniteNumber(value);
  if (num === null) return null;
  // The epsilon absorbs binary floating-point noise (0.15 / 0.1 = 1.4999…) so
  // half-way values round the way a human expects (1.15 → 1.2).
  const steps = Math.round((num - scale.min) / scale.step + 1e-9);
  const rounded = scale.min + steps * scale.step;
  return Number(rounded.toFixed(Math.max(1, decimalsForStep(scale.step))));
}

/**
 * True when the value sits exactly on a step of the configured scale.
 */
function isOnScale(value, scale = DEFAULT_GRADE_SCALE) {
  const num = toFiniteNumber(value);
  if (num === null) return false;
  if (num < scale.min - EPSILON || num > scale.max + EPSILON) return false;
  const steps = (num - scale.min) / scale.step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

/**
 * Validate + normalise a grade coming from an API request.
 * Returns { value } (null for a blank grade) or { error }.
 */
function parseGradeInput(raw, scale = DEFAULT_GRADE_SCALE) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { value: null };
  }

  const num = toFiniteNumber(raw);
  if (num === null) {
    return { error: `Grade must be a number from ${formatGrade(scale.min, scale)} to ${formatGrade(scale.max, scale)}, or blank.` };
  }
  if (num < scale.min - EPSILON || num > scale.max + EPSILON) {
    return { error: `Grade must be from ${formatGrade(scale.min, scale)} to ${formatGrade(scale.max, scale)}.` };
  }
  if (!isOnScale(num, scale)) {
    return {
      error: `Grade ${num} is not on the configured ${scale.min}–${scale.max} scale (${scale.step} increments). `
        + 'Existing quarter-point grades stay readable, but new grades must follow the configured scale.'
    };
  }
  return { value: roundGrade(num, scale) };
}

/**
 * Display a grade consistently.
 * - Values on the configured scale use the step's precision (1.0, 1.1, 2.0).
 * - Legacy values off the scale (e.g. 1.25) keep two decimals so historical
 *   records are never silently rounded.
 */
function formatGrade(value, scale = DEFAULT_GRADE_SCALE) {
  const num = toFiniteNumber(value);
  if (num === null) return '';
  if (isOnScale(num, scale)) {
    return num.toFixed(Math.max(1, decimalsForStep(scale.step)));
  }
  return num.toFixed(2);
}

function isPassingGrade(value, scale = DEFAULT_GRADE_SCALE) {
  const num = toFiniteNumber(value);
  if (num === null) return false;
  return num >= scale.min - EPSILON && num <= scale.passingGrade + EPSILON;
}

/**
 * Validate a candidate scale configuration coming from the settings UI/API.
 * Returns { scale } or { error }.
 */
function validateScaleConfig(input) {
  const min = toFiniteNumber(input?.min);
  const max = toFiniteNumber(input?.max);
  const step = toFiniteNumber(input?.step);
  const passingGrade = toFiniteNumber(input?.passingGrade);

  if (min === null || max === null || step === null || passingGrade === null) {
    return { error: 'min, max, step and passingGrade are required numbers.' };
  }
  if (min < 0 || min >= 5) return { error: 'min must be between 0 and 5.' };
  if (max <= min || max > 5) return { error: 'max must be greater than min and at most 5.' };
  if (step <= 0 || step > 1) return { error: 'step must be greater than 0 and at most 1.' };
  if (passingGrade < min || passingGrade > max) {
    return { error: 'passingGrade must be within the grade range.' };
  }

  const span = (max - min) / step;
  if (Math.abs(span - Math.round(span)) > 1e-6) {
    return { error: 'max must be reachable from min using whole steps.' };
  }
  if (!isOnScale(passingGrade, { min, max, step, passingGrade })) {
    return { error: 'passingGrade must sit on a grade step.' };
  }

  return { scale: normalizeScale({ min, max, step, passingGrade }) };
}

/**
 * Read the configured scale (cached briefly — changed rarely, read often).
 */
async function loadGradeScale(options = {}) {
  const now = Date.now();
  if (!options.fresh && cachedScale && now - cachedAt < CACHE_TTL_MS) {
    return cachedScale;
  }

  try {
    const setting = await SystemSetting.findOne({ key: GRADE_SCALE_KEY }).lean();
    const stored = setting?.value;
    const scale = stored ? normalizeScale(stored) : { ...DEFAULT_GRADE_SCALE };
    if (stored && !isOnScale(scale.passingGrade, scale)) {
      scale.passingGrade = roundGrade(scale.passingGrade, scale);
    }
    cachedScale = scale;
    cachedAt = now;
    return scale;
  } catch (error) {
    console.error('Load grade scale error:', error);
    return { ...DEFAULT_GRADE_SCALE };
  }
}

async function saveGradeScale(config, adminId) {
  const validation = validateScaleConfig(config);
  if (validation.error) return validation;

  const scale = validation.scale;
  await SystemSetting.findOneAndUpdate(
    { key: GRADE_SCALE_KEY },
    { $set: { key: GRADE_SCALE_KEY, value: scale } },
    { upsert: true, runValidators: true }
  );
  clearGradeScaleCache();
  cachedScale = scale;
  cachedAt = Date.now();
  return { scale };
}

function clearGradeScaleCache() {
  cachedScale = null;
  cachedAt = 0;
}

/** Human-readable description used in validation messages and UI hints. */
function describeScale(scale = DEFAULT_GRADE_SCALE) {
  return `${formatGrade(scale.min, scale)}–${formatGrade(scale.max, scale)} in ${scale.step} increments`;
}

/** The full list of grades allowed by the scale (bounded to a sane size). */
function listAllowedGrades(scale = DEFAULT_GRADE_SCALE) {
  const count = Math.round((scale.max - scale.min) / scale.step);
  if (!Number.isFinite(count) || count < 0 || count > 500) return [];
  return Array.from({ length: count + 1 }, (_, index) => roundGrade(scale.min + index * scale.step, scale));
}

module.exports = {
  GRADE_SCALE_KEY,
  DEFAULT_GRADE_SCALE,
  decimalsForStep,
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
};
