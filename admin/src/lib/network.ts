const NETWORK_ERROR_PATTERNS = [
  'failed to fetch',
  'load failed',
  'networkerror',
  'network request failed',
  'the internet connection appears to be offline',
  'network error'
]

function createAbortError(): Error {
  try {
    return new DOMException('The operation was aborted.', 'AbortError')
  } catch {
    const error = new Error('The operation was aborted.')
    error.name = 'AbortError'
    return error
  }
}

export function isAbortRequestError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function isNetworkRequestError(error: unknown): boolean {
  if (isAbortRequestError(error)) return false

  if (error instanceof TypeError) return true

  const message = error instanceof Error ? error.message : String(error || '')
  const normalized = message.trim().toLowerCase()
  return NETWORK_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern))
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError())
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, ms)

    const handleAbort = () => {
      window.clearTimeout(timeoutId)
      signal?.removeEventListener('abort', handleAbort)
      reject(createAbortError())
    }

    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

export function waitForOnline({ signal }: { signal?: AbortSignal } = {}): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError())
  }

  if (typeof window === 'undefined' || typeof navigator === 'undefined' || navigator.onLine) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const handleOnline = () => {
      cleanup()
      resolve()
    }

    const handleAbort = () => {
      cleanup()
      reject(createAbortError())
    }

    const cleanup = () => {
      window.removeEventListener('online', handleOnline)
      signal?.removeEventListener('abort', handleAbort)
    }

    window.addEventListener('online', handleOnline, { once: true })
    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

type FetchWithAutoReconnectOptions = {
  maxRetries?: number
  retryDelayMs?: number
  retryBackoffMs?: number
}

export async function fetchWithAutoReconnect(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchWithAutoReconnectOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    retryDelayMs = 1500,
    retryBackoffMs = 1500
  } = options

  let attempt = 0
  const signal = init.signal ?? undefined

  while (true) {
    try {
      return await fetch(input, init)
    } catch (error) {
      if (!isNetworkRequestError(error)) {
        throw error
      }

      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      if (offline) {
        await waitForOnline({ signal })
        continue
      }

      if (attempt >= maxRetries) {
        throw error
      }

      const delay = retryDelayMs + attempt * retryBackoffMs
      attempt += 1
      await sleep(delay, signal)
    }
  }
}
