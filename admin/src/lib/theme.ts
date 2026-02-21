export type ThemePreference = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_PREFIX = 'theme'
const LEGACY_THEME_STORAGE_KEY = 'theme'
const THEME_SCOPE_STORAGE_KEY = 'theme_scope'
const GUEST_THEME_SCOPE = 'guest'
const THEME_TRANSITION_CLASS = 'theme-transitioning'
const THEME_TRANSITION_MS = 320

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

  if (persist) {
    localStorage.setItem(getThemeStorageKey(resolvedScope), theme)
  }

  return resolvedTheme
}
