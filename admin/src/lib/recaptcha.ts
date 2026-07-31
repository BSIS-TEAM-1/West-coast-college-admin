type RecaptchaApi = {
  ready: (cb: () => void) => void
  execute: (siteKey: string, options: { action: string }) => Promise<string>
}

declare global {
  interface Window {
    grecaptcha?: RecaptchaApi
  }
}

const RECAPTCHA_SCRIPT_ID = 'google-recaptcha-v3-script'
const RECAPTCHA_LOAD_TIMEOUT_MS = 8000
const RECAPTCHA_DEBUG_ENABLED = String(import.meta.env.VITE_RECAPTCHA_DEBUG || '').toLowerCase() === 'true'

let recaptchaLoadPromise: Promise<void> | null = null

const logRecaptchaDebug = (event: string, details: Record<string, unknown> = {}): void => {
  if (!RECAPTCHA_DEBUG_ENABLED) return
  console.warn('[reCAPTCHA debug]', event, {
    productionBuild: import.meta.env.PROD,
    origin: window.location.origin,
    ...details
  })
}

const getRecaptchaScriptSrc = (siteKey: string): string =>
  `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`

const getRenderKeyFromScript = (script: HTMLScriptElement): string => {
  try {
    return new URL(script.src, window.location.origin).searchParams.get('render') || ''
  } catch {
    return ''
  }
}

export const getRecaptchaSiteKey = (): string =>
  String(
    import.meta.env.VITE_REACT_APP_RECAPTCHA_SITE_KEY ||
    import.meta.env.VITE_RECAPTCHA_SITE_KEY ||
    ''
  ).trim()

export const isRecaptchaEnabledForBuild = (): boolean =>
  import.meta.env.PROD && Boolean(getRecaptchaSiteKey())

const waitForRecaptchaApi = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const start = Date.now()

    const check = () => {
      if (typeof window.grecaptcha?.ready === 'function' && typeof window.grecaptcha?.execute === 'function') {
        resolve()
        return
      }

      if (Date.now() - start > RECAPTCHA_LOAD_TIMEOUT_MS) {
        reject(new Error('Timed out while loading reCAPTCHA API.'))
        return
      }

      window.setTimeout(check, 50)
    }

    check()
  })

export const ensureRecaptchaLoaded = async (siteKey: string): Promise<void> => {
  logRecaptchaDebug('load requested', {
    siteKeyConfigured: Boolean(siteKey),
    scriptPresent: Boolean(document.getElementById(RECAPTCHA_SCRIPT_ID)),
    apiReady: Boolean(window.grecaptcha?.ready && window.grecaptcha?.execute)
  })

  if (!siteKey) {
    logRecaptchaDebug('load blocked', { reason: 'missing-site-key' })
    throw new Error('Missing reCAPTCHA site key.')
  }

  const existingScript = document.getElementById(RECAPTCHA_SCRIPT_ID) as HTMLScriptElement | null
  if (existingScript) {
    const existingRenderKey = getRenderKeyFromScript(existingScript)

    if (existingRenderKey && existingRenderKey !== siteKey) {
      logRecaptchaDebug('replacing script', { reason: 'site-key-changed' })
      existingScript.remove()
      recaptchaLoadPromise = null
      window.grecaptcha = undefined
    }
  }

  if (typeof window.grecaptcha?.ready === 'function' && typeof window.grecaptcha?.execute === 'function') {
    logRecaptchaDebug('API already ready')
    return
  }

  if (!recaptchaLoadPromise) {
    recaptchaLoadPromise = (async () => {
      const currentScript = document.getElementById(RECAPTCHA_SCRIPT_ID) as HTMLScriptElement | null

      if (!currentScript) {
        const script = document.createElement('script')
        script.id = RECAPTCHA_SCRIPT_ID
        script.src = getRecaptchaScriptSrc(siteKey)
        script.async = true
        script.defer = true
        document.head.appendChild(script)
        logRecaptchaDebug('script injected', { scriptHost: 'www.google.com' })
      }

      await waitForRecaptchaApi()
      logRecaptchaDebug('API ready')
    })()
  }

  try {
    await recaptchaLoadPromise
  } catch (error) {
    recaptchaLoadPromise = null
    logRecaptchaDebug('load failed', {
      message: error instanceof Error ? error.message : 'Unknown loading error'
    })
    throw error
  }
}

export const executeRecaptchaAction = async (siteKey: string, action: string): Promise<string> => {
  logRecaptchaDebug('execution requested', { action })
  await ensureRecaptchaLoaded(siteKey)

  return new Promise((resolve, reject) => {
    const api = window.grecaptcha
    if (typeof api?.ready !== 'function' || typeof api?.execute !== 'function') {
      reject(new Error('reCAPTCHA API unavailable after loading.'))
      return
    }

    api.ready(() => {
      api.execute(siteKey, { action })
        .then((token) => {
          logRecaptchaDebug('token generated', {
            action,
            tokenPresent: Boolean(token),
            tokenLength: token.length
          })
          resolve(token)
        })
        .catch((error) => {
          logRecaptchaDebug('execution failed', {
            action,
            message: error instanceof Error ? error.message : 'Unknown execution error'
          })
          reject(error)
        })
    })
  })
}
