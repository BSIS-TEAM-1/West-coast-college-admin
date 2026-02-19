import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyThemePreference, getStoredTheme } from './lib/theme'

// Initialize theme before React renders to prevent flash
const theme = getStoredTheme()
applyThemePreference(theme, { persist: false })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
