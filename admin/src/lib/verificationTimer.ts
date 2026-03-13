export function getVerificationSecondsRemaining(
  expiresAt: string | null | undefined,
  now = Date.now()
): number | null {
  if (!expiresAt) return null

  const expiresAtMs = new Date(expiresAt).getTime()
  if (!Number.isFinite(expiresAtMs)) {
    return null
  }

  return Math.max(0, Math.ceil((expiresAtMs - now) / 1000))
}

export function formatVerificationCountdown(secondsRemaining: number | null): string {
  if (secondsRemaining === null) return ''

  const minutes = Math.floor(secondsRemaining / 60)
  const seconds = secondsRemaining % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
