import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, RefreshCw, ShieldAlert, X } from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import './BackupProgressNotifier.css'

type BackupOperation = {
  type?: string
  backupType?: string
  triggeredBy?: string
  startedAt?: string
  updatedAt?: string
  stage?: string
  label?: string
  progress?: number
}

type AutomaticBackup = {
  _id?: string
  fileName?: string
  backupType?: string
  status?: 'in_progress' | 'completed' | 'failed'
  verificationStatus?: string
  createdAt?: string
  completedAt?: string
  durationMs?: number | null
  error?: string | null
}

type StatusResponse = {
  success?: boolean
  activeOperation?: BackupOperation | null
  latestAutomatic?: AutomaticBackup | null
}

type ProgressState = {
  /** Identifies one automatic backup run (type + start time). */
  key: string
  mode: 'running' | 'completed' | 'failed'
  title: string
  label: string
  progress: number
  startedAt: number
  fileName?: string
  error?: string | null
  durationMs?: number | null
}

const AUTOMATIC_TYPES = new Set(['scheduled', 'initial', 'emergency'])
const RUNNING_POLL_MS = 3000
const IDLE_POLL_MS = 10000
const COMPLETE_DISMISS_MS = 10000
const FAILED_DISMISS_MS = 14000

function sourceLabel(backupType?: string) {
  if (backupType === 'scheduled') return 'Scheduled backup'
  if (backupType === 'initial') return 'Initial backup'
  if (backupType === 'emergency') return 'Emergency backup'
  return 'Automatic backup'
}

function clampProgress(value?: number) {
  if (!Number.isFinite(value)) return 5
  return Math.max(0, Math.min(100, Math.round(value as number)))
}

function formatDuration(value?: number | null) {
  if (!Number.isFinite(value) || (value as number) < 0) return null
  const ms = value as number
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatElapsed(startedAt: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

/**
 * Watches the backup engine while an automatic (scheduled / startup) backup
 * runs and shows a fixed progress popup until the job finishes, so an admin
 * who is busy elsewhere in the panel still knows the job is alive.
 */
export default function BackupProgressNotifier() {
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const watchRef = useRef<{ key: string; startedAt: number; backupType: string } | null>(null)
  const dismissedKeyRef = useRef<string | null>(null)
  const lastSeenAutomaticIdRef = useRef<string | null>(null)
  const initializedRef = useRef(false)
  const inFlightRef = useRef(false)
  const mountedRef = useRef(true)

  const pollStatus = useCallback(async () => {
    if (inFlightRef.current || document.visibilityState !== 'visible') return
    inFlightRef.current = true
    try {
      const token = await getStoredToken()
      if (!token) return
      const response = await fetch(`${API_URL}/api/admin/backup/status`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        cache: 'no-store'
      })
      if (!response.ok) return
      const data = (await response.json()) as StatusResponse
      if (!mountedRef.current) return

      const operation = data.activeOperation
      const latest = data.latestAutomatic
      const latestId = latest?._id ? String(latest._id) : null
      const runningAutomatic =
        operation && operation.type === 'backup' && AUTOMATIC_TYPES.has(String(operation.backupType || ''))

      if (runningAutomatic) {
        const startedAt = new Date(operation.startedAt || Date.now()).getTime()
        const key = `${operation.backupType}-${operation.startedAt || startedAt}`
        watchRef.current = { key, startedAt, backupType: String(operation.backupType || '') }

        if (latestId) lastSeenAutomaticIdRef.current = latestId
        initializedRef.current = true

        if (dismissedKeyRef.current !== key) {
          setProgress({
            key,
            mode: 'running',
            title: `${sourceLabel(operation.backupType)} in progress`,
            label: operation.label || 'Starting backup…',
            progress: clampProgress(operation.progress),
            startedAt
          })
        }
        return
      }

      // The job left the lock. Resolve its outcome from the record it wrote so
      // the popup can confirm success or surface the failure reason.
      const watched = watchRef.current
      if (watched) {
        watchRef.current = null
        if (latest && latest.createdAt && new Date(latest.createdAt).getTime() >= watched.startedAt - 5000) {
          if (latest.status === 'in_progress') {
            // The record can briefly still report in_progress; let the next
            // poll settle it.
            watchRef.current = watched
          } else if (dismissedKeyRef.current !== watched.key) {
            const succeeded = latest.status === 'completed'
            setProgress({
              key: watched.key,
              mode: succeeded ? 'completed' : 'failed',
              title: `${sourceLabel(watched.backupType)} ${succeeded ? 'completed' : 'failed'}`,
              label: succeeded ? 'Backup archive verified and stored.' : latest.error || 'The backup engine reported a failure.',
              progress: 100,
              startedAt: watched.startedAt,
              fileName: latest.fileName,
              error: latest.error || null,
              durationMs: latest.durationMs
            })
          }
        }
        if (latestId) lastSeenAutomaticIdRef.current = latestId
        return
      }

      // A job that started and finished between polls (or while the tab was
      // hidden) is not lost: confirm the newest automatic record once.
      if (
        initializedRef.current &&
        latest &&
        latestId &&
        latestId !== lastSeenAutomaticIdRef.current &&
        latest.status !== 'in_progress' &&
        dismissedKeyRef.current !== latestId
      ) {
        const succeeded = latest.status === 'completed'
        setProgress({
          key: latestId,
          mode: succeeded ? 'completed' : 'failed',
          title: `${sourceLabel(latest.backupType)} ${succeeded ? 'completed' : 'failed'}`,
          label: succeeded ? 'Backup archive verified and stored.' : latest.error || 'The backup engine reported a failure.',
          progress: 100,
          startedAt: latest.createdAt ? new Date(latest.createdAt).getTime() : Date.now(),
          fileName: latest.fileName,
          error: latest.error || null,
          durationMs: latest.durationMs
        })
      }
      if (latestId) lastSeenAutomaticIdRef.current = latestId
      initializedRef.current = true
    } catch {
      // Network hiccups should not break the panel; the next poll retries.
    } finally {
      inFlightRef.current = false
    }
  }, [])

  // Recursive polling keeps a fast cadence only while a backup is running.
  useEffect(() => {
    mountedRef.current = true
    let cancelled = false
    let timer: number | null = null

    const schedule = () => {
      if (cancelled) return
      const delay = progress?.mode === 'running' ? RUNNING_POLL_MS : IDLE_POLL_MS
      timer = window.setTimeout(async () => {
        await pollStatus()
        schedule()
      }, delay)
    }

    void pollStatus().then(schedule)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void pollStatus()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      mountedRef.current = false
      if (timer) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
    // Re-arm the cadence whenever the popup switches between running and idle.
  }, [pollStatus, progress?.mode])

  // Drive the elapsed-time readout once a second while the job is running.
  useEffect(() => {
    if (progress?.mode !== 'running') return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [progress?.mode, progress?.key])

  // Result popups acknowledge themselves; the running popup stays until the
  // job completes or the admin closes it.
  useEffect(() => {
    if (!progress || progress.mode === 'running') return
    const timer = window.setTimeout(
      () => setProgress(current => (current?.key === progress.key ? null : current)),
      progress.mode === 'completed' ? COMPLETE_DISMISS_MS : FAILED_DISMISS_MS
    )
    return () => window.clearTimeout(timer)
  }, [progress])

  if (!progress) return null

  const dismiss = () => {
    dismissedKeyRef.current = progress.key
    setProgress(null)
  }

  const running = progress.mode === 'running'

  return (
    <aside
      className={`backup-progress-popup backup-progress-popup--${progress.mode}`}
      role="status"
      aria-live="polite"
      aria-label={progress.title}
    >
      <div className="backup-progress-popup__icon" aria-hidden="true">
        {running ? (
          <RefreshCw size={18} className="backup-progress-popup__spin" />
        ) : progress.mode === 'completed' ? (
          <CheckCircle2 size={18} />
        ) : (
          <ShieldAlert size={18} />
        )}
      </div>

      <div className="backup-progress-popup__body">
        <div className="backup-progress-popup__heading">
          <strong>{progress.title}</strong>
          <span className="backup-progress-popup__elapsed">
            {running ? formatElapsed(progress.startedAt, now) : formatDuration(progress.durationMs) || 'done'}
          </span>
        </div>

        <p className="backup-progress-popup__label">{progress.label}</p>

        <div
          className={`backup-progress-popup__track${running && progress.progress <= 5 ? ' is-indeterminate' : ''}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.progress}
          aria-valuetext={running ? `${progress.progress}% — ${progress.label}` : progress.label}
        >
          <span style={{ width: `${progress.progress}%` }} />
        </div>

        <div className="backup-progress-popup__meta">
          <span>{running ? `${progress.progress}% complete` : progress.fileName || 'No archive name reported'}</span>
          {running && <span>Runs in the background — you can keep working.</span>}
        </div>

        {progress.mode === 'failed' && progress.error && (
          <p className="backup-progress-popup__error">{progress.error}</p>
        )}
      </div>

      <button
        type="button"
        className="backup-progress-popup__close"
        onClick={dismiss}
        aria-label={running ? 'Hide backup progress' : 'Dismiss backup notification'}
      >
        <X size={16} />
      </button>
    </aside>
  )
}
