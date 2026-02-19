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

let recaptchaLoadPromise: Promise<void> | null = null

const isRecaptchaDebugEnabled = (): boolean => {
  const envFlag = String(import.meta.env.VITE_RECAPTCHA_DEBUG || import.meta.env.VITE_AUTH_DEBUG || '').toLowerCase() === 'true'
  if (envFlag) return true

  try {
    return window.localStorage.getItem('auth_debug') === '1'
  } catch {
    return false
  }
}

const debugRecaptcha = (message: string, context?: Record<string, unknown>) => {
  if (!isRecaptchaDebugEnabled()) return

  if (context) {
    console.log('[RECAPTCHA_DEBUG]', message, context)
    return
  }

  console.log('[RECAPTCHA_DEBUG]', message)
}

const maskSiteKey = (siteKey: string): string =>
  siteKey ? `${siteKey.slice(0, 6)}...${siteKey.slice(-4)}` : 'missing'

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
  debugRecaptcha('ensureRecaptchaLoaded:start', {
    siteKey: maskSiteKey(siteKey),
    hasApi: typeof window.grecaptcha !== 'undefined'
  })

  if (!siteKey) {
    throw new Error('Missing reCAPTCHA site key.')
  }

  const existingScript = document.getElementById(RECAPTCHA_SCRIPT_ID) as HTMLScriptElement | null
  if (existingScript) {
    const existingRenderKey = getRenderKeyFromScript(existingScript)
    debugRecaptcha('ensureRecaptchaLoaded:existing-script', {
      scriptSrc: existingScript.src,
      existingRenderKey: maskSiteKey(existingRenderKey),
      expectedRenderKey: maskSiteKey(siteKey)
    })

    if (existingRenderKey && existingRenderKey !== siteKey) {
      existingScript.remove()
      recaptchaLoadPromise = null
      window.grecaptcha = undefined
      debugRecaptcha('ensureRecaptchaLoaded:removed-stale-script')
    }
  }

  if (typeof window.grecaptcha?.ready === 'function' && typeof window.grecaptcha?.execute === 'function') {
    debugRecaptcha('ensureRecaptchaLoaded:api-ready')
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
        debugRecaptcha('ensureRecaptchaLoaded:script-appended', { scriptSrc: script.src })
      }

      await waitForRecaptchaApi()
      debugRecaptcha('ensureRecaptchaLoaded:api-loaded')
    })()
  }

  try {
    await recaptchaLoadPromise
  } catch (error) {
    recaptchaLoadPromise = null
    throw error
  }
}

export const executeRecaptchaAction = async (siteKey: string, action: string): Promise<string> => {
  debugRecaptcha('executeRecaptchaAction:start', {
    siteKey: maskSiteKey(siteKey),
    action
  })

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
          debugRecaptcha('executeRecaptchaAction:token-received', {
            action,
            tokenLength: token.length
          })
          resolve(token)
        })
        .catch((error) => {
          debugRecaptcha('executeRecaptchaAction:error', {
            action,
            message: error instanceof Error ? error.message : String(error)
          })
          reject(error)
        })
    })
  })
}
