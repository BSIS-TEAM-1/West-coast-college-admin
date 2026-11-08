import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  HardDrive,
  Lock,
  MoreVertical,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  X
} from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import './BackupDashboard.css'

type BackupRecord = {
  _id: string; fileName: string; backupType: string; status: 'in_progress' | 'completed' | 'failed';
  verificationStatus?: 'pending' | 'verified' | 'failed' | 'missing' | 'remote'; createdAt: string; size?: number;
  verificationLabel?: string; verificationState?: string; verificationDetail?: string; storagePresent?: boolean; restorable?: boolean; storageLocation?: 'local' | 'remote';
  instanceId?: string | null; storedVerificationStatus?: string;
  compressedSize?: number; checksum?: string | null; durationMs?: number | null; isProtected?: boolean;
  isEncrypted?: boolean; storageProvider?: string; appVersion?: string; schemaVersion?: string;
  backupEngineVersion?: string; backupFormatVersion?: string; documentCount?: number; collections?: { name: string; count: number }[];
  triggeredBy?: string; error?: string | null
}

type ReadinessCategory = { id: string; label: string; score: number; maxScore: number; status: 'pass' | 'warning' | 'critical' | 'info'; detail: string }

type BackupHealth = {
  totalBackups: number; failedBackups: number; successRate: number; verificationSuccessRate: number;
  averageBackupDurationMs: number; lastSuccessfulBackup: string | null; lastVerifiedBackup: string | null;
  nextScheduledBackup: string | null; activeOperation: { type: string } | null;
  storage: { total: number | null; used: number | null; free: number | null; usedPercentage: number | null; provider: string; warningLevel: string | null };
  health: { score: number; label: string; ageHours: number | null };
  disasterRecovery: { score: number; label: string; rpoHours: number; rtoMinutes: number; lastVerifiedRestore: string | null; encryptionEnabled: boolean; storageRedundancy: string; categories?: ReadinessCategory[] };
  scheduleTime?: string;
}

const PRESET_SCHEDULES = [
  { timeLabel: '12:00 AM', hour: '12', minute: '00', ampm: 'AM' as const, sublabel: 'Midnight maintenance window' },
  { timeLabel: '02:00 AM', hour: '2', minute: '00', ampm: 'AM' as const, sublabel: 'Optimal off-peak window', badge: 'Recommended' },
  { timeLabel: '04:00 AM', hour: '4', minute: '00', ampm: 'AM' as const, sublabel: 'Early dawn snapshot' },
  { timeLabel: '06:00 AM', hour: '6', minute: '00', ampm: 'AM' as const, sublabel: 'Pre-office standard' },
]

function parse24HourTime(timeStr?: string) {
  if (!timeStr || !timeStr.includes(':')) return { hour: '12', minute: '00', ampm: 'AM' as const }
  const [hStr, mStr] = timeStr.split(':')
  const h = Number.parseInt(hStr, 10)
  if (Number.isNaN(h)) return { hour: '12', minute: '00', ampm: 'AM' as const }
  const ampm = (h >= 12 ? 'PM' : 'AM') as 'AM' | 'PM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  const minute = (mStr || '00').padStart(2, '0')
  return { hour: String(hour12), minute, ampm }
}

type Preview = { backup: BackupRecord; compatibility: { compatible: boolean; requiresConfirmation: boolean; warnings: string[]; current: Record<string, string>; backup: Record<string, string> } }
type Comparison = { first: BackupRecord; second: BackupRecord; differences: { collection: string; firstCount: number; secondCount: number; difference: number }[]; totals: { documentDifference: number; sizeDifference: number; durationDifferenceMs: number } }
type SortKey = 'createdAt' | 'fileName' | 'status' | 'compressedSize' | 'durationMs'

const PAGE_SIZE = 5

export default function BackupDashboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [health, setHealth] = useState<BackupHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [busyFile, setBusyFile] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [compareSelection, setCompareSelection] = useState<string[]>([])
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [showScheduleSettings, setShowScheduleSettings] = useState(false)
  const [scheduleHour, setScheduleHour] = useState('12')
  const [scheduleMinute, setScheduleMinute] = useState('00')
  const [scheduleAmPm, setScheduleAmPm] = useState('AM')
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const wasRunningRef = useRef(false)

  const request = async (route: string, init: RequestInit = {}) => {
    const token = await getStoredToken()
    if (!token) throw new Error('Authentication required')
    const response = await fetch(`${API_URL}${route}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.success === false) {
      const requestError = new Error(data.error || `Request failed (${response.status})`) as Error & { data?: unknown }
      requestError.data = data
      throw requestError
    }
    return data
  }

  const loadBackups = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      setError(null)
      const [historyData, healthData] = await Promise.all([request('/api/admin/backup/history'), request('/api/admin/backup/health')])
      setBackups(historyData.backups || []); setHealth(healthData)
    } catch (loadError) {
      // A background refresh that fails should not flash an error banner over
      // a page the user is already reading; the next poll will retry.
      if (!silent) setError(loadError instanceof Error ? loadError.message : 'Failed to load backups')
    }
    finally { setLoading(false) }
  }

  useEffect(() => { void loadBackups() }, [refreshKey])

  // A backup takes minutes. While one is running, keep the history fresh so the
  // user never has to decide whether the job "failed" or is simply still going.
  const backupRunning = Boolean(health?.activeOperation) || backups.some(item => item.status === 'in_progress')

  useEffect(() => {
    if (!backupRunning) return
    const timer = setInterval(() => { void loadBackups(true) }, 5000)
    return () => clearInterval(timer)
  }, [backupRunning])

  useEffect(() => {
    if (wasRunningRef.current && !backupRunning) {
      setError(null)
    }
    wasRunningRef.current = backupRunning
  }, [backupRunning])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.backup-actions-menu')) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const filtered = useMemo(() => backups.filter(backup => {
    const matchesQuery = `${backup.fileName} ${backup.triggeredBy || ''}`.toLowerCase().includes(query.trim().toLowerCase())
    return matchesQuery && (filter === 'all' || backup.backupType === filter || backup.status === filter || backup.verificationStatus === filter || (filter === 'encrypted' && backup.isEncrypted))
  }).sort((a, b) => {
    const aValue = sortKey === 'createdAt' ? new Date(a.createdAt).getTime() : (a[sortKey] ?? '')
    const bValue = sortKey === 'createdAt' ? new Date(b.createdAt).getTime() : (b[sortKey] ?? '')
    const result = aValue < bValue ? -1 : aValue > bValue ? 1 : 0
    return sortDirection === 'asc' ? result : -result
  }), [backups, query, filter, sortKey, sortDirection])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const formatBytes = (bytes = 0) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(1)} GB`
  const formatDuration = (value?: number | null) => value == null ? '-' : value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`
  const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Not available'
  // One vocabulary across the table and the preview: the integrity column
  // reports the verification result, the type column reports where the
  // archive lives. "remote" is a location, not a verification outcome.
  const verificationText = (status?: string) => !status || status === 'pending' || status === 'remote' ? 'unverified' : status

  const runAction = async (fileName: string, action: () => Promise<unknown>) => {
    try { setBusyFile(fileName); setError(null); await action(); await loadBackups() }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'Backup action failed') }
    finally { setBusyFile(null) }
  }

  const download = async (backup: BackupRecord) => {
    try {
      setBusyFile(backup.fileName)
      const token = await getStoredToken(); if (!token) throw new Error('Authentication required')
      const response = await fetch(`${API_URL}/api/admin/backup/download/${encodeURIComponent(backup.fileName)}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Download failed')
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a')
      link.href = url; link.download = `${backup.fileName}.gz${backup.isEncrypted ? '.enc' : ''}`; link.click(); URL.revokeObjectURL(url)
    } catch (downloadError) { setError(downloadError instanceof Error ? downloadError.message : 'Download failed') }
    finally { setBusyFile(null) }
  }

  const openPreview = async (backup: BackupRecord) => {
    try { setBusyFile(backup.fileName); setPreview(await request(`/api/admin/backup/preview/${encodeURIComponent(backup.fileName)}`)) }
    catch (previewError) { setError(previewError instanceof Error ? previewError.message : 'Could not load restore preview') }
    finally { setBusyFile(null) }
  }

  const confirmRestore = async () => {
    if (!preview) return
    const fileName = preview.backup.fileName
    await runAction(fileName, () => request('/api/admin/backup/restore', { method: 'POST', body: JSON.stringify({ backupFileName: fileName, confirmCompatibility: preview.compatibility.requiresConfirmation }) }))
    setPreview(null)
  }

  const compare = async () => {
    if (compareSelection.length !== 2) return
    try { setComparison(await request('/api/admin/backup/compare', { method: 'POST', body: JSON.stringify({ firstFileName: compareSelection[0], secondFileName: compareSelection[1] }) })) }
    catch (compareError) { setError(compareError instanceof Error ? compareError.message : 'Comparison failed') }
  }

  const handleBackupAction = async (backup: BackupRecord, action: string) => {
    if (!action) return
    if (action === 'details' || action === 'restore') {
      await openPreview(backup)
      return
    }
    if (action === 'verify') {
      await runAction(backup.fileName, () => request('/api/admin/backup/verify', { method: 'POST', body: JSON.stringify({ backupFileName: backup.fileName }) }))
      return
    }
    if (action === 'download') {
      await download(backup)
      return
    }
    if (action === 'rename') {
      const newName = window.prompt('New backup name', backup.fileName.replace(/\.json$/i, ''))
      if (newName) await runAction(backup.fileName, () => request('/api/admin/backup/rename', { method: 'PATCH', body: JSON.stringify({ backupFileName: backup.fileName, newName }) }))
      return
    }
    if (action === 'protection') {
      await runAction(backup.fileName, () => request('/api/admin/backup/protection', { method: 'PATCH', body: JSON.stringify({ backupFileName: backup.fileName, isProtected: !backup.isProtected }) }))
      return
    }
    if (action === 'delete' && window.confirm(`Permanently delete ${backup.fileName}? This cannot be undone.`)) {
      await runAction(backup.fileName, () => request('/api/admin/backup/delete', { method: 'DELETE', body: JSON.stringify({ backupFileName: backup.fileName, confirm: true }) }))
    }
  }

  const changeSort = (key: SortKey) => { if (sortKey === key) setSortDirection(value => value === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDirection('asc') } }

  const openScheduleModal = () => {
    if (health?.scheduleTime) {
      const parsed = parse24HourTime(health.scheduleTime)
      setScheduleHour(parsed.hour)
      setScheduleMinute(parsed.minute)
      setScheduleAmPm(parsed.ampm)
    }
    setShowScheduleSettings(true)
  }

  const incrementHour = () => {
    const current = Number.parseInt(scheduleHour, 10) || 12
    const next = current === 12 ? 1 : current + 1
    setScheduleHour(String(next))
  }

  const decrementHour = () => {
    const current = Number.parseInt(scheduleHour, 10) || 12
    const prev = current === 1 ? 12 : current - 1
    setScheduleHour(String(prev))
  }

  const MINUTE_STEPS = ['00', '15', '30', '45']

  const incrementMinute = () => {
    const idx = MINUTE_STEPS.indexOf(scheduleMinute)
    if (idx === -1) {
      setScheduleMinute('00')
    } else {
      setScheduleMinute(MINUTE_STEPS[(idx + 1) % MINUTE_STEPS.length])
    }
  }

  const decrementMinute = () => {
    const idx = MINUTE_STEPS.indexOf(scheduleMinute)
    if (idx === -1) {
      setScheduleMinute('00')
    } else {
      setScheduleMinute(MINUTE_STEPS[(idx - 1 + MINUTE_STEPS.length) % MINUTE_STEPS.length])
    }
  }

  const nextRunPreview = useMemo(() => {
    let hour24 = Number.parseInt(scheduleHour, 10) || 6
    if (scheduleAmPm === 'PM' && hour24 !== 12) {
      hour24 += 12
    } else if (scheduleAmPm === 'AM' && hour24 === 12) {
      hour24 = 0
    }
    const minuteNum = Number.parseInt(scheduleMinute, 10) || 0

    const now = new Date()
    const target = new Date(now)
    target.setHours(hour24, minuteNum, 0, 0)
    if (target <= now) {
      target.setDate(target.getDate() + 1)
    }

    const isToday = target.getDate() === now.getDate()
    const dayLabel = isToday ? 'Today' : 'Tomorrow'
    const formattedTime = `${scheduleHour.padStart(2, '0')}:${scheduleMinute} ${scheduleAmPm}`

    const diffMs = target.getTime() - now.getTime()
    const diffMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)))
    const diffHours = Math.floor(diffMinutes / 60)
    const remMins = diffMinutes % 60
    const countdown = diffHours > 0 ? `Runs in ${diffHours}h ${remMins}m` : `Runs in ${remMins}m`

    let tz = 'Local Time'
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Manila'
    } catch {
      tz = 'UTC+8'
    }

    return {
      timeString: `${dayLabel} at ${formattedTime}`,
      countdown,
      timezone: tz,
    }
  }, [scheduleHour, scheduleMinute, scheduleAmPm])

  const saveSchedule = async () => {
    try {
      setScheduleSaving(true); setError(null)
      // Convert 12-hour format to 24-hour format
      let hour24 = Number.parseInt(scheduleHour, 10)
      if (scheduleAmPm === 'PM' && hour24 !== 12) {
        hour24 += 12
      } else if (scheduleAmPm === 'AM' && hour24 === 12) {
        hour24 = 0
      }
      const time24 = `${String(hour24).padStart(2, '0')}:${scheduleMinute}`
      await request('/api/admin/backup/schedule', { method: 'PATCH', body: JSON.stringify({ scheduleTime: time24 }) })
      setShowScheduleSettings(false)
      await loadBackups(true)
    } catch (scheduleError) { setError(scheduleError instanceof Error ? scheduleError.message : 'Failed to update schedule') }
    finally { setScheduleSaving(false) }
  }

  return <section className="backup-dashboard" aria-labelledby="backup-history-title">
    <header className="backup-dashboard__header"><div><span className="system-health-eyebrow">Disaster Recovery</span><h2 id="backup-history-title">Backup Health & History</h2><p>Verified restore points and administrative controls.</p></div><div className="backup-dashboard__header-actions"><button type="button" className="backup-dashboard__schedule-button" onClick={openScheduleModal} title="Configure daily backup schedule"><Clock size={16} /> Backup Schedule</button><button type="button" className="backup-dashboard__refresh" onClick={() => void loadBackups()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh</button></div></header>

    {health && <div className="backup-health-grid">
      <article className={`backup-health-card backup-health-card--${health.health.label.toLowerCase()}`}><span>Overall Health</span><strong>{health.health.label}</strong><small>{health.health.score}/100</small></article>
      <article className="backup-health-card"><span>Last Successful</span><strong>{formatDate(health.lastSuccessfulBackup)}</strong><small>{health.health.ageHours == null ? 'No recovery point' : `${health.health.ageHours} hours old`}</small></article>
      <article className="backup-health-card"><span>Verification</span><strong>{health.verificationSuccessRate}%</strong><small>{health.failedBackups} failed backups</small></article>
      <article className="backup-health-card"><span>Storage</span><strong>{health.storage.usedPercentage == null ? formatBytes(health.storage.used || 0) : `${health.storage.usedPercentage}% used`}</strong><small>{health.storage.provider} / {health.storage.warningLevel || 'normal'}</small></article>
      <article className="backup-health-card"><span>Average Duration</span><strong>{formatDuration(health.averageBackupDurationMs)}</strong><small>{health.successRate}% backup success</small></article>
      <article className="backup-health-card"><span>Active Operation</span><strong>{health.activeOperation?.type || 'Idle'}</strong><small>Next: {formatDate(health.nextScheduledBackup)}</small></article>
      <article className="backup-health-card"><span>Last Restore Test</span><strong>{formatDate(health.disasterRecovery.lastVerifiedRestore)}</strong><small>{health.disasterRecovery.encryptionEnabled ? 'Encryption enabled' : 'Encryption disabled'}</small></article>
    </div>}

    <div className="backup-dashboard__toolbar"><label className="backup-dashboard__search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search backups</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} placeholder="Search backups" /></label><select aria-label="Filter backups" value={filter} onChange={event => { setFilter(event.target.value); setPage(1) }}><option value="all">All backups</option><option value="manual">Manual</option><option value="scheduled">Scheduled</option><option value="initial">Startup</option><option value="emergency">Emergency</option><option value="verified">Verified</option><option value="failed">Failed</option><option value="encrypted">Encrypted</option></select><button type="button" disabled={compareSelection.length !== 2} onClick={() => void compare()}><BarChart3 size={16} /> Compare ({compareSelection.length}/2)</button></div>
    {backupRunning && <div className="backup-dashboard__running" role="status"><RefreshCw size={16} className="spin" /> Backup in progress — the list refreshes automatically.</div>}
    {error && <div className="backup-dashboard__error" role="alert">{error}</div>}
    {loading && backups.length === 0 ? <div className="backup-dashboard__skeleton" aria-label="Loading backups">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div> : visible.length === 0 ? <div className="backup-dashboard__empty"><ShieldCheck size={30} /><strong>No backups found</strong><span>Create a backup or adjust the filters.</span></div> : <div className="backup-table-wrap" id="backup-history-table"><table className="backup-table"><colgroup><col style={{width:'2.5rem'}} /><col style={{width:'2fr'}} /><col style={{width:'7rem'}} /><col style={{width:'6.5rem'}} /><col style={{width:'8rem'}} /><col style={{width:'5.5rem'}} /><col style={{width:'6rem'}} /><col style={{width:'5rem'}} /><col style={{width:'7rem'}} /><col style={{width:'6rem'}} /></colgroup><thead><tr><th aria-label="Compare" /><th><button onClick={() => changeSort('fileName')}>Name</button></th><th><button onClick={() => changeSort('status')}>Type</button></th><th><button onClick={() => changeSort('status')}>Status</button></th><th><button onClick={() => changeSort('createdAt')}>Created</button></th><th><button onClick={() => changeSort('compressedSize')}>Size</button></th><th>Integrity</th><th><button onClick={() => changeSort('durationMs')}>Duration</button></th><th>Security</th><th>Actions</th></tr></thead><tbody>{visible.map(backup => {
      const busy = busyFile === backup.fileName; const selected = compareSelection.includes(backup.fileName)
      return <tr key={backup._id}>
        <td data-label="Compare"><input type="checkbox" checked={selected} aria-label={`Compare ${backup.fileName}`} onChange={() => setCompareSelection(values => selected ? values.filter(value => value !== backup.fileName) : values.length < 2 ? [...values, backup.fileName] : values)} /></td>
        <td data-label="Name"><button className="backup-name-button" onClick={() => void openPreview(backup)}><strong>{backup.fileName}</strong></button><small>{backup.triggeredBy || 'System'} · app {backup.appVersion || 'unknown'}</small></td>
        <td data-label="Type"><div className="backup-type-stack"><span className="backup-badge">{backup.backupType}</span><span className="backup-badge" title={backup.storageLocation === 'remote' ? 'Archive is stored on another server' : 'Archive is stored on this server'}>{backup.storageLocation === 'remote' ? <Cloud size={12} aria-hidden="true" /> : <HardDrive size={12} aria-hidden="true" />}{backup.storageLocation === 'remote' ? 'remote' : 'local'}</span></div></td>
        <td data-label="Status"><span className={`backup-badge backup-badge--${backup.status}`}>{backup.status.replace('_', ' ')}</span>{backup.error && <small className="backup-failure-reason">{backup.error}</small>}</td>
        <td data-label="Created"><time>{new Date(backup.createdAt).toLocaleString()}</time></td>
        <td data-label="Size"><span className="backup-size">{backup.status === 'in_progress' ? '—' : formatBytes(backup.compressedSize || backup.size)}</span></td>
        <td data-label="Integrity">{backup.status === 'in_progress' ? <span className="backup-muted" title="Integrity is checked when the backup finishes">unverified</span> : <span className={`backup-badge backup-badge--${backup.verificationStatus === 'remote' ? 'pending' : (backup.verificationStatus || 'pending')}`} title={backup.verificationDetail}>{verificationText(backup.verificationStatus)}</span>}</td>
        <td data-label="Duration"><span className="backup-duration">{formatDuration(backup.durationMs)}</span></td>
        <td data-label="Security"><div className="backup-security-stack"><span className={`backup-badge ${backup.isEncrypted ? 'backup-badge--verified' : ''}`}>{backup.isEncrypted ? 'Encrypted' : 'Plain'}</span><span className={backup.isProtected ? 'backup-protected' : 'backup-muted'}><Lock size={13} /> {backup.isProtected ? 'Protected' : 'Standard'}</span></div></td>
        <td data-label="Actions">
          <div className="backup-actions-menu">
            <button className="backup-actions-button" aria-label={`Actions for ${backup.fileName}`} disabled={busy} onClick={() => setOpenMenuId(openMenuId === backup._id ? null : backup._id)}>
              <MoreVertical size={16} />
            </button>
            {openMenuId === backup._id && <div className="backup-actions-dropdown">
              <button onClick={() => { void handleBackupAction(backup, 'details'); setOpenMenuId(null); }}>View details</button>
              <button disabled={backup.verificationStatus === 'remote' || backup.status === 'in_progress'} onClick={() => { void handleBackupAction(backup, 'verify'); setOpenMenuId(null); }}>Verify integrity</button>
              <button disabled={!backup.restorable} onClick={() => { void handleBackupAction(backup, 'restore'); setOpenMenuId(null); }}>Restore</button>
              <button disabled={backup.status !== 'completed' || backup.verificationStatus === 'remote'} onClick={() => { void handleBackupAction(backup, 'download'); setOpenMenuId(null); }}>Download</button>
              <button disabled={backup.verificationStatus === 'remote'} onClick={() => { void handleBackupAction(backup, 'rename'); setOpenMenuId(null); }}>Rename</button>
              <button onClick={() => { void handleBackupAction(backup, 'protection'); setOpenMenuId(null); }}>{backup.isProtected ? 'Unprotect' : 'Protect'}</button>
              <button className="backup-actions-delete" onClick={() => { void handleBackupAction(backup, 'delete'); setOpenMenuId(null); }}>Delete</button>
            </div>}
          </div>
        </td>
      </tr>
    })}</tbody></table></div>}
    <footer className="backup-dashboard__pagination"><span>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span><div><button type="button" disabled={currentPage <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(value => value + 1)}>Next</button></div></footer>

    {preview && <div className="backup-detail-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPreview(null) }}><section className="backup-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-detail-title"><header><div><span className="system-health-eyebrow">Restore Preview</span><h3 id="backup-detail-title">{preview.backup.fileName}</h3></div><button onClick={() => setPreview(null)} aria-label="Close backup details">x</button></header>{preview.compatibility.warnings.length > 0 && <div className="backup-compatibility-warning"><strong>Compatibility warning</strong>{preview.compatibility.warnings.map(warning => <span key={warning}>{warning}</span>)}</div>}<dl className="backup-detail-grid"><div><dt>Created</dt><dd>{formatDate(preview.backup.createdAt)}</dd></div><div><dt>Created by</dt><dd>{preview.backup.triggeredBy || 'System'}</dd></div><div><dt>Documents</dt><dd>{preview.backup.documentCount ?? 0}</dd></div><div><dt>Backup size</dt><dd>{formatBytes(preview.backup.compressedSize || preview.backup.size)}</dd></div><div><dt>Verification</dt><dd title={preview.backup.verificationDetail}>{verificationText(preview.backup.verificationStatus)}</dd></div><div><dt>Checksum</dt><dd className="backup-checksum">{preview.backup.checksum || 'Unavailable'}</dd></div><div><dt>Application</dt><dd>{preview.backup.appVersion || 'unknown'}</dd></div><div><dt>Schema / format</dt><dd>{preview.backup.schemaVersion || 'unknown'} / {preview.backup.backupFormatVersion || 'unknown'}</dd></div><div><dt>Encryption</dt><dd>{preview.backup.isEncrypted ? 'AES-256-GCM' : 'Not encrypted'}</dd></div><div><dt>Storage</dt><dd>{preview.backup.storageLocation === 'remote' ? 'Another server' : 'This server'}</dd></div></dl><div className="backup-detail-collections"><strong>Collections ({preview.backup.collections?.length || 0})</strong><div>{preview.backup.collections?.map(item => <span key={item.name}>{item.name}: {item.count}</span>)}</div></div><footer><button onClick={() => setPreview(null)}>Cancel</button><button className="backup-restore-confirm" disabled={!preview.compatibility.compatible || !preview.backup.restorable} onClick={() => void confirmRestore()}><RotateCcw size={16} /> {preview.compatibility.requiresConfirmation ? 'Confirm compatibility and restore' : 'Confirm restore'}</button></footer></section></div>}
    {comparison && <div className="backup-detail-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setComparison(null) }}><section className="backup-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-compare-title"><header><div><span className="system-health-eyebrow">Backup Analytics</span><h3 id="backup-compare-title">Backup Comparison</h3></div><button onClick={() => setComparison(null)} aria-label="Close comparison">x</button></header><div className="backup-comparison-summary"><span>Documents: {comparison.totals.documentDifference > 0 ? '+' : ''}{comparison.totals.documentDifference}</span><span>Size: {formatBytes(Math.abs(comparison.totals.sizeDifference))} {comparison.totals.sizeDifference >= 0 ? 'larger' : 'smaller'}</span><span>Duration: {formatDuration(Math.abs(comparison.totals.durationDifferenceMs))} difference</span></div><div className="backup-comparison-list">{comparison.differences.map(item => <div className={item.difference ? 'changed' : ''} key={item.collection}><strong>{item.collection}</strong><span>{item.firstCount}</span><span>{item.secondCount}</span><span>{item.difference > 0 ? '+' : ''}{item.difference}</span></div>)}</div></section></div>}

    {showScheduleSettings && <div className="backup-detail-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowScheduleSettings(false) }}><section className="backup-detail-dialog backup-schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-settings-title"><header className="backup-schedule-header"><div className="backup-schedule-header-left"><div className="backup-schedule-icon-badge"><Clock size={22} className="backup-schedule-icon" /></div><div><div className="backup-schedule-eyebrow-wrap"><span className="system-health-eyebrow">Automated Backup Service</span></div><h3 id="schedule-settings-title">Backup Schedule</h3><p className="backup-schedule-subtitle">Configure the execution time for automated database archives.</p></div></div><button type="button" className="backup-schedule-close" onClick={() => setShowScheduleSettings(false)} aria-label="Close schedule settings"><X size={18} /></button></header><div className="backup-schedule-body"><div className="backup-schedule-hero"><div className="backup-schedule-hero-time"><strong>{nextRunPreview.countdown}</strong></div><div className="backup-schedule-hero-meta"><span><Calendar size={13} /> Next run: {nextRunPreview.timeString}</span><span><Clock size={13} /> Timezone: {nextRunPreview.timezone}</span></div></div><div className="backup-schedule-clock-section"><div className="backup-schedule-section-label"><span>Execution Time</span><small>Use steppers or click interval</small></div><div className="backup-schedule-clock-cluster"><div className="schedule-digit-box"><button type="button" className="schedule-digit-btn" onClick={incrementHour} aria-label="Increase hour" title="Increase hour"><ChevronUp size={18} /></button><div className="schedule-digit-value" tabIndex={0} role="spinbutton" aria-valuenow={Number(scheduleHour)} aria-valuemin={1} aria-valuemax={12} aria-label="Hour" onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); incrementHour(); } else if (e.key === 'ArrowDown') { e.preventDefault(); decrementHour(); } }}>{scheduleHour.padStart(2, '0')}</div><button type="button" className="schedule-digit-btn" onClick={decrementHour} aria-label="Decrease hour" title="Decrease hour"><ChevronDown size={18} /></button><span className="schedule-digit-label">Hour (1-12)</span></div><div className="schedule-colon-separator" aria-hidden="true">:</div><div className="schedule-digit-box"><button type="button" className="schedule-digit-btn" onClick={incrementMinute} aria-label="Increase minute" title="Increase minute"><ChevronUp size={18} /></button><div className="schedule-digit-value" tabIndex={0} role="spinbutton" aria-valuenow={Number(scheduleMinute)} aria-label="Minute" onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); incrementMinute(); } else if (e.key === 'ArrowDown') { e.preventDefault(); decrementMinute(); } }}>{scheduleMinute}</div><button type="button" className="schedule-digit-btn" onClick={decrementMinute} aria-label="Decrease minute" title="Decrease minute"><ChevronDown size={18} /></button><span className="schedule-digit-label">Minute</span></div><div className="schedule-ampm-wrapper"><select value={scheduleAmPm} onChange={e => setScheduleAmPm(e.target.value)} aria-label="Meridiem" className="schedule-ampm-select"><option value="AM">AM</option><option value="PM">PM</option></select><span className="schedule-digit-label">Meridiem</span></div></div><div className="schedule-minute-presets"><span className="schedule-minute-presets-label">Minutes:</span>{MINUTE_STEPS.map(m => <button key={m} type="button" className={`schedule-minute-chip ${scheduleMinute === m ? 'active' : ''}`} onClick={() => setScheduleMinute(m)}>:{m}</button>)}</div></div><div className="schedule-presets-section"><div className="backup-schedule-section-label"><span>Recommended Off-Peak Windows</span><small>Low-traffic periods</small></div><div className="schedule-presets-grid">{PRESET_SCHEDULES.map(preset => { const isSelected = scheduleHour === preset.hour && scheduleMinute === preset.minute && scheduleAmPm === preset.ampm; return <button key={preset.timeLabel} type="button" className={`schedule-preset-card ${isSelected ? 'active' : ''}`} onClick={() => { setScheduleHour(preset.hour); setScheduleMinute(preset.minute); setScheduleAmPm(preset.ampm); }}><div className="schedule-preset-header"><span className="schedule-preset-time">{preset.timeLabel}</span>{preset.badge && <span className="schedule-preset-badge">{preset.badge}</span>}</div><span className="schedule-preset-desc">{preset.sublabel}</span></button>; })}</div></div></div><footer className="backup-schedule-footer"><button type="button" className="backup-schedule-btn-secondary" onClick={() => setShowScheduleSettings(false)} disabled={scheduleSaving}>Cancel</button><button type="button" className="backup-schedule-btn-primary" onClick={() => void saveSchedule()} disabled={scheduleSaving}>{scheduleSaving ? <><RefreshCw size={15} className="spin" /><span>Saving...</span></> : <><Check size={16} /><span>Save Schedule</span></>}</button></footer></section></div>}
  </section>
}