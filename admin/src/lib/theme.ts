export type ThemePreference = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'
export type ThemeAccentColor = string
export type ThemeAccentPreset = {
  id: string
  label: string
  color: ThemeAccentColor
  description: string
}

type RgbColor = {
  r: number
  g: number
  b: number
}

const THEME_STORAGE_PREFIX = 'theme'
const ACCENT_STORAGE_PREFIX = 'theme-accent'
const LEGACY_THEME_STORAGE_KEY = 'theme'
const LEGACY_ACCENT_STORAGE_KEY = 'theme_accent'
const THEME_SCOPE_STORAGE_KEY = 'theme_scope'
const GUEST_THEME_SCOPE = 'guest'
const THEME_TRANSITION_CLASS = 'theme-transitioning'
const THEME_TRANSITION_MS = 320
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const LIGHT_ON_ACCENT_COLOR = '#ffffff'
const DARK_ON_ACCENT_COLOR = '#111827'
const WHITE_RGB: RgbColor = { r: 255, g: 255, b: 255 }
const BLACK_RGB: RgbColor = { r: 0, g: 0, b: 0 }
const DARK_RGB: RgbColor = { r: 17, g: 24, b: 39 }
const DARK_SURFACE_RGB: RgbColor = { r: 18, g: 18, b: 18 }

export const DEFAULT_THEME_ACCENT_COLOR = '#4f46e5'
export const THEME_ACCENT_PRESETS: ThemeAccentPreset[] = [
  {
    id: 'indigo',
    label: 'Indigo',
    color: '#4f46e5',
    description: 'Matches the current admin palette.',
  },
  {
    id: 'discord',
    label: 'Discord',
    color: '#5865f2',
    description: 'Blurple-inspired accent like Discord themes.',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    color: '#10b981',
    description: 'Fresh green with a softer UI glow.',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    color: '#0ea5e9',
    description: 'Bright blue for a crisp dashboard feel.',
  },
  {
    id: 'rose',
    label: 'Rose',
    color: '#f43f5e',
    description: 'Warmer pink-red for stronger contrast.',
  },
  {
    id: 'amber',
    label: 'Amber',
    color: '#f59e0b',
    description: 'Golden accent with high visibility.',
  },
  {
    id: 'grape',
    label: 'Grape',
    color: '#8b5cf6',
    description: 'Deep violet for a more playful palette.',
  },
]

let themeTransitionTimeout: number | null = null

const normalizeTheme = (value: string | null): ThemePreference | null => {
  if (value === 'light' || value === 'dark' || value === 'auto') return value
  return null
}

const normalizeScope = (scope: string): string => {
  const trimmed = scope.trim()
  return trimmed || GUEST_THEME_SCOPE
}

const resolveThemeScope = (scope?: string | null): string => {
  if (scope === null) return GUEST_THEME_SCOPE
  if (typeof scope === 'string') return normalizeScope(scope)

  const storedScope = localStorage.getItem(THEME_SCOPE_STORAGE_KEY)
  return storedScope ? normalizeScope(storedScope) : GUEST_THEME_SCOPE
}

const getThemeStorageKey = (scope: string): string => `${THEME_STORAGE_PREFIX}:${scope}`
const getAccentStorageKey = (scope: string): string => `${ACCENT_STORAGE_PREFIX}:${scope}`

const normalizeAccentColor = (value: string | null): ThemeAccentColor | null => {
  if (!value) return null

  const trimmed = value.trim()
  if (!HEX_COLOR_PATTERN.test(trimmed)) return null

  if (trimmed.length === 4) {
    const [r, g, b] = trimmed.slice(1).split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }

  return trimmed.toLowerCase()
}

const hexToRgb = (hexColor: ThemeAccentColor): RgbColor => ({
  r: Number.parseInt(hexColor.slice(1, 3), 16),
  g: Number.parseInt(hexColor.slice(3, 5), 16),
  b: Number.parseInt(hexColor.slice(5, 7), 16),
})

const mixRgbColors = (foreground: RgbColor, background: RgbColor, foregroundWeight: number): RgbColor => {
  const backgroundWeight = 1 - foregroundWeight

  return {
    r: Math.round((foreground.r * foregroundWeight) + (background.r * backgroundWeight)),
    g: Math.round((foreground.g * foregroundWeight) + (background.g * backgroundWeight)),
    b: Math.round((foreground.b * foregroundWeight) + (background.b * backgroundWeight)),
  }
}

const getRelativeLuminance = ({ r, g, b }: RgbColor): number => {
  const toLinear = (channel: number): number => {
    const normalizedChannel = channel / 255
    return normalizedChannel <= 0.03928
      ? normalizedChannel / 12.92
      : ((normalizedChannel + 0.055) / 1.055) ** 2.4
  }

  return (0.2126 * toLinear(r)) + (0.7152 * toLinear(g)) + (0.0722 * toLinear(b))
}

const getContrastRatio = (left: RgbColor, right: RgbColor): number => {
  const leftLuminance = getRelativeLuminance(left)
  const rightLuminance = getRelativeLuminance(right)
  const lighter = Math.max(leftLuminance, rightLuminance)
  const darker = Math.min(leftLuminance, rightLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

const getVisibleAccentRgb = (
  accentColor: ThemeAccentColor,
  resolvedTheme: ResolvedTheme
): RgbColor => {
  const accentRgb = hexToRgb(accentColor)
  return resolvedTheme === 'dark'
    ? mixRgbColors(accentRgb, WHITE_RGB, 0.88)
    : accentRgb
}

const getReadableOnAccentColor = (
  accentColor: ThemeAccentColor,
  resolvedTheme: ResolvedTheme
): typeof LIGHT_ON_ACCENT_COLOR | typeof DARK_ON_ACCENT_COLOR => {
  const visibleAccentRgb = getVisibleAccentRgb(accentColor, resolvedTheme)

  const lightContrast = getContrastRatio(visibleAccentRgb, WHITE_RGB)
  const darkContrast = getContrastRatio(visibleAccentRgb, DARK_RGB)

  return darkContrast >= lightContrast ? DARK_ON_ACCENT_COLOR : LIGHT_ON_ACCENT_COLOR
}

const rgbToHex = ({ r, g, b }: RgbColor): ThemeAccentColor =>
  `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`

const getReadableAccentForDarkSurface = (
  accentColor: ThemeAccentColor,
  resolvedTheme: ResolvedTheme
): ThemeAccentColor => {
  const visibleAccentRgb = getVisibleAccentRgb(accentColor, resolvedTheme)

  if (getContrastRatio(visibleAccentRgb, DARK_SURFACE_RGB) >= 4.5) {
    return rgbToHex(visibleAccentRgb)
  }

  let accentWeight = 0.92
  let candidate = visibleAccentRgb

  while (accentWeight >= 0.18) {
    candidate = mixRgbColors(visibleAccentRgb, WHITE_RGB, accentWeight)
    if (getContrastRatio(candidate, DARK_SURFACE_RGB) >= 4.5) {
      return rgbToHex(candidate)
    }
    accentWeight -= 0.08
  }

  return rgbToHex(candidate)
}

const getReadableAccentForSurface = (
  accentColor: ThemeAccentColor,
  resolvedTheme: ResolvedTheme
): ThemeAccentColor => {
  if (resolvedTheme === 'dark') {
    return getReadableAccentForDarkSurface(accentColor, resolvedTheme)
  }

  const visibleAccentRgb = getVisibleAccentRgb(accentColor, resolvedTheme)
  const contrastAgainstSurface = getContrastRatio(visibleAccentRgb, WHITE_RGB)

  if (contrastAgainstSurface >= 4.5 && contrastAgainstSurface <= 9) {
    return rgbToHex(visibleAccentRgb)
  }

  let accentWeight = 0.92
  let candidate = visibleAccentRgb
  const background = contrastAgainstSurface > 9 ? WHITE_RGB : BLACK_RGB

  while (accentWeight >= 0.18) {
    candidate = mixRgbColors(visibleAccentRgb, background, accentWeight)
    const candidateContrast = getContrastRatio(candidate, WHITE_RGB)

    if (candidateContrast >= 4.5 && candidateContrast <= 9) {
      return rgbToHex(candidate)
    }

    accentWeight -= 0.08
  }

  return rgbToHex(candidate)
}

export const setActiveThemeScope = (scope: string | null): void => {
  const resolvedScope = resolveThemeScope(scope)

  if (resolvedScope === GUEST_THEME_SCOPE) {
    localStorage.removeItem(THEME_SCOPE_STORAGE_KEY)
    return
  }

  localStorage.setItem(THEME_SCOPE_STORAGE_KEY, resolvedScope)
}

export const getStoredTheme = (scope?: string | null): ThemePreference => {
  const resolvedScope = resolveThemeScope(scope)
  const scopedTheme = normalizeTheme(localStorage.getItem(getThemeStorageKey(resolvedScope)))

  if (scopedTheme) {
    return scopedTheme
  }

  // Backward-compatibility: migrate old global theme key to guest scope once.
  if (resolvedScope === GUEST_THEME_SCOPE) {
    const legacyTheme = normalizeTheme(localStorage.getItem(LEGACY_THEME_STORAGE_KEY))
    if (legacyTheme) {
      localStorage.setItem(getThemeStorageKey(GUEST_THEME_SCOPE), legacyTheme)
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY)
      return legacyTheme
    }
  }

  return 'auto'
}

export const getStoredAccentColor = (scope?: string | null): ThemeAccentColor => {
  const resolvedScope = resolveThemeScope(scope)
  const scopedAccent = normalizeAccentColor(localStorage.getItem(getAccentStorageKey(resolvedScope)))

  if (scopedAccent) {
    return scopedAccent
  }

  if (resolvedScope === GUEST_THEME_SCOPE) {
    const legacyAccent = normalizeAccentColor(localStorage.getItem(LEGACY_ACCENT_STORAGE_KEY))
    if (legacyAccent) {
      localStorage.setItem(getAccentStorageKey(GUEST_THEME_SCOPE), legacyAccent)
      localStorage.removeItem(LEGACY_ACCENT_STORAGE_KEY)
      return legacyAccent
    }
  }

  return DEFAULT_THEME_ACCENT_COLOR
}

export const resolveTheme = (theme: ThemePreference): ResolvedTheme =>
  theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme

const enableThemeTransition = (root: HTMLElement) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  root.classList.add(THEME_TRANSITION_CLASS)

  if (themeTransitionTimeout !== null) {
    window.clearTimeout(themeTransitionTimeout)
  }

  themeTransitionTimeout = window.setTimeout(() => {
    root.classList.remove(THEME_TRANSITION_CLASS)
    themeTransitionTimeout = null
  }, THEME_TRANSITION_MS)
}

type ApplyThemeOptions = {
  animate?: boolean
  persist?: boolean
  scope?: string | null
}

type ApplyAccentOptions = {
  animate?: boolean
  persist?: boolean
  scope?: string | null
}

export const applyAccentColorPreference = (
  accentColor: ThemeAccentColor,
  { animate = false, persist = true, scope }: ApplyAccentOptions = {}
): ThemeAccentColor => {
  const root = document.documentElement
  const normalizedAccentColor = normalizeAccentColor(accentColor) ?? DEFAULT_THEME_ACCENT_COLOR
  const resolvedScope = resolveThemeScope(scope)
  const resolvedTheme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  const onAccentColor = getReadableOnAccentColor(normalizedAccentColor, resolvedTheme)
  const accentOnSurface = getReadableAccentForSurface(normalizedAccentColor, resolvedTheme)
  const accentOnDarkSurface = getReadableAccentForDarkSurface(normalizedAccentColor, resolvedTheme)

  if (animate) {
    enableThemeTransition(root)
  }

  root.style.setProperty('--theme-accent-base', normalizedAccentColor)
  root.style.setProperty('--color-on-primary', onAccentColor)
  root.style.setProperty('--color-primary-on-surface', accentOnSurface)
  root.style.setProperty('--color-primary-on-dark-surface', accentOnDarkSurface)

  if (persist) {
    localStorage.setItem(getAccentStorageKey(resolvedScope), normalizedAccentColor)
  }

  return normalizedAccentColor
}

export const applyThemePreference = (
  theme: ThemePreference,
  { animate = false, persist = true, scope }: ApplyThemeOptions = {}
): ResolvedTheme => {
  const root = document.documentElement
  const resolvedTheme = resolveTheme(theme)
  const resolvedScope = resolveThemeScope(scope)

  if (animate) {
    enableThemeTransition(root)
  }

  root.setAttribute('data-theme', resolvedTheme)
  applyAccentColorPreference(getStoredAccentColor(resolvedScope), { persist: false, scope: resolvedScope })

  if (persist) {
    localStorage.setItem(getThemeStorageKey(resolvedScope), theme)
  }

  return resolvedTheme
}

export const moveThemePreferencesToScope = (
  fromScope: string | null | undefined,
  toScope: string | null | undefined
): void => {
  const previousScope = resolveThemeScope(fromScope)
  const nextScope = resolveThemeScope(toScope)

  if (previousScope === nextScope) return

  const theme = localStorage.getItem(getThemeStorageKey(previousScope))
  const accent = localStorage.getItem(getAccentStorageKey(previousScope))

  if (theme) {
    localStorage.setItem(getThemeStorageKey(nextScope), theme)
  }

  if (accent) {
    localStorage.setItem(getAccentStorageKey(nextScope), accent)
  }

  if (previousScope !== GUEST_THEME_SCOPE) {
    localStorage.removeItem(getThemeStorageKey(previousScope))
    localStorage.removeItem(getAccentStorageKey(previousScope))
  }
}
