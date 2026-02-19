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

export const getRecaptchaSiteKey = (): string =>
  String(import.meta.env.VITE_REACT_APP_RECAPTCHA_SITE_KEY || '').trim()

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
  if (!siteKey) {
    throw new Error('Missing reCAPTCHA site key.')
  }
  if (typeof window.grecaptcha?.ready === 'function' && typeof window.grecaptcha?.execute === 'function') {
    return
  }

  if (!recaptchaLoadPromise) {
    recaptchaLoadPromise = (async () => {
      const existingScript = document.getElementById(RECAPTCHA_SCRIPT_ID) as HTMLScriptElement | null

      if (!existingScript) {
        const script = document.createElement('script')
        script.id = RECAPTCHA_SCRIPT_ID
        script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`
        script.async = true
        script.defer = true
        document.head.appendChild(script)
      }

      await waitForRecaptchaApi()
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
  await ensureRecaptchaLoaded(siteKey)

  return new Promise((resolve, reject) => {
    const api = window.grecaptcha
    if (typeof api?.ready !== 'function' || typeof api?.execute !== 'function') {
      reject(new Error('reCAPTCHA API unavailable after loading.'))
      return
    }

    api.ready(() => {
      api.execute(siteKey, { action }).then(resolve).catch(reject)
    })
  })
}
