import { useEffect, useState } from 'react'
import { authorizedFetch } from './blockAssignmentShared'

/**
 * Grading scale (client mirror of server/services/gradingScaleService.js).
 *
 * WCC grades use a configurable decimal scale — 1.0, 1.1, 1.2 … 5.0 by
 * default — instead of the previous quarter-point steps. Both the step and
 * the passing grade come from the server so the UI never hardcodes policy.
 *
 * Historical quarter-point grades (e.g. 1.25) are still displayed exactly as
 * stored; only values that sit on the configured scale render with the
 * configured precision.
 */

export interface GradeScale {
  min: number
  max: number
  step: number
  passingGrade: number
}

export interface GradeScaleResponse extends GradeScale {
  allowedGrades?: number[]
  description?: string
}

export const DEFAULT_GRADE_SCALE: GradeScale = {
  min: 1,
  max: 5,
  step: 0.1,
  passingGrade: 3
}

const EPSILON = 1e-9

let currentScale: GradeScale = { ...DEFAULT_GRADE_SCALE }
let loadPromise: Promise<GradeScale> | null = null

export function getGradeScale(): GradeScale {
  return currentScale
}

export function setGradeScale(scale?: Partial<GradeScale> | null): GradeScale {
  if (!scale) {
    currentScale = { ...DEFAULT_GRADE_SCALE }
    return currentScale
  }

  const min = Number(scale.min)
  const max = Number(scale.max)
  const step = Number(scale.step)
  const passingGrade = Number(scale.passingGrade)

  currentScale = {
    min: Number.isFinite(min) && min >= 0 ? min : DEFAULT_GRADE_SCALE.min,
    max: Number.isFinite(max) && max > 0 ? max : DEFAULT_GRADE_SCALE.max,
    step: Number.isFinite(step) && step > 0 ? step : DEFAULT_GRADE_SCALE.step,
    passingGrade: Number.isFinite(passingGrade) && passingGrade > 0 ? passingGrade : DEFAULT_GRADE_SCALE.passingGrade
  }
  return currentScale
}

/**
 * Fetch the configured scale once per session. Failures fall back to the
 * default decimal scale so grade entry never breaks because the settings
 * endpoint is unavailable.
 */
export async function loadGradeScale(): Promise<GradeScale> {
  if (!loadPromise) {
    loadPromise = authorizedFetch<GradeScaleResponse>('/api/settings/grade-scale')
      .then((response) => setGradeScale(response))
      .catch(() => {
        // Allow a later call to retry (e.g. the bootstrap attempt runs before
        // the user has a token, so it must not cache the default forever).
        loadPromise = null
        return currentScale
      })
  }
  return loadPromise
}

export function resetGradeScale(): void {
  currentScale = { ...DEFAULT_GRADE_SCALE }
  loadPromise = null
}

export function decimalsForStep(step: number): number {
  const text = String(step)
  if (text.includes('e-')) return Math.min(6, Number(text.split('e-')[1]))
  const fraction = text.split('.')[1]
  return fraction ? fraction.length : 0
}

/** Round a numeric grade onto the configured scale (anchored at `min`). */
export function roundGrade(value: number, scale: GradeScale = currentScale): number | null {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  const steps = Math.round((num - scale.min) / scale.step + 1e-9)
  const rounded = scale.min + steps * scale.step
  return Number(rounded.toFixed(Math.max(1, decimalsForStep(scale.step))))
}

export function isOnGradeScale(value: number | string, scale: GradeScale = currentScale): boolean {
  const num = Number(value)
  if (!Number.isFinite(num)) return false
  if (num < scale.min - EPSILON || num > scale.max + EPSILON) return false
  const steps = (num - scale.min) / scale.step
  return Math.abs(steps - Math.round(steps)) < 1e-6
}

/**
 * Normalise a typed grade to the scale's display precision.
 * Invalid text is returned unchanged so the caller can flag it.
 */
export function formatGradeInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value).trim()
  if (!text) return ''
  const num = Number(text)
  if (!Number.isFinite(num)) return text
  if (num < currentScale.min || num > currentScale.max) return text
  const rounded = roundGrade(num, currentScale)
  if (rounded === null) return text
  return rounded.toFixed(Math.max(1, decimalsForStep(currentScale.step)))
}

/** True for text that is not a usable grade on the configured range. */
export function isInvalidGradeInput(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false
  const text = String(value).trim()
  if (!text) return false
  const num = Number(text)
  if (!Number.isFinite(num)) return true
  return num < currentScale.min || num > currentScale.max
}

/**
 * Display a stored grade.
 * Values on the configured scale use the step's precision (1.0, 1.1, 2.0);
 * legacy off-scale values keep two decimals (1.25) so history is unchanged.
 */
export function formatGrade(
  value: number | string | null | undefined,
  fallback = '',
  scale: GradeScale = currentScale
): string {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  if (!text) return fallback
  const num = Number(text)
  if (!Number.isFinite(num)) return text

  if (isOnGradeScale(num, scale)) {
    return num.toFixed(Math.max(1, decimalsForStep(scale.step)))
  }
  return num.toFixed(2)
}

export function isPassingGrade(value: number | string | null | undefined): boolean {
  if (value === null || value === undefined || String(value).trim() === '') return false
  const num = Number(value)
  if (!Number.isFinite(num)) return false
  return num >= currentScale.min - EPSILON && num <= currentScale.passingGrade + EPSILON
}

export function describeGradeScale(scale: GradeScale = currentScale): string {
  return `${formatGrade(scale.min)}–${formatGrade(scale.max)} in ${scale.step} increments`
}

/** All grades allowed by the scale, e.g. [1, 1.1, 1.2 … 5]. */
export function listAllowedGrades(scale: GradeScale = currentScale): number[] {
  const count = Math.round((scale.max - scale.min) / scale.step)
  if (!Number.isFinite(count) || count < 0 || count > 500) return []
  return Array.from({ length: count + 1 }, (_, index) => roundGrade(scale.min + index * scale.step, scale) ?? scale.min)
}

/**
 * Load the configured scale and re-render when it arrives, so labels such as
 * "Passed (1.0–3.0)" follow the institution's policy.
 */
export function useGradeScale(): GradeScale {
  const [scale, setLocalScale] = useState<GradeScale>(currentScale)

  useEffect(() => {
    let active = true
    loadGradeScale().then((loaded) => {
      if (active) setLocalScale(loaded)
    })
    return () => {
      active = false
    }
  }, [])

  return scale
}
