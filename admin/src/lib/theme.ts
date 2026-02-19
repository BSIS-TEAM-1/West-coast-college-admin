export type ThemePreference = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'theme'
const THEME_TRANSITION_CLASS = 'theme-transitioning'
const THEME_TRANSITION_MS = 320

let themeTransitionTimeout: number | null = null

export const getStoredTheme = (): ThemePreference => {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)

  if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'auto') {
    return storedTheme
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
}

export const applyThemePreference = (
  theme: ThemePreference,
  { animate = false, persist = true }: ApplyThemeOptions = {}
): ResolvedTheme => {
  const root = document.documentElement
  const resolvedTheme = resolveTheme(theme)

  if (animate) {
    enableThemeTransition(root)
  }

  root.setAttribute('data-theme', resolvedTheme)

  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }

  return resolvedTheme
}
