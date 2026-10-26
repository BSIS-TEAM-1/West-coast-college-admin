import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import './index.css'
import App from './App.tsx'
import { applyThemePreference, getStoredTheme } from './lib/theme'
import { loadGradeScale } from './lib/gradingScale'

// Initialize theme before React renders to prevent flash style issues
const theme = getStoredTheme()
applyThemePreference(theme, { persist: false })

// Load the institution's configured grading scale once so grade displays and
// pass/fail labels outside the grade pages use policy, not the built-in default.
void loadGradeScale()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
