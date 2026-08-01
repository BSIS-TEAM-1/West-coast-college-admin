import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, CheckCircle2, Cloud, Database, Download, HardDrive, Lock, Play, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2, Unlock } from 'lucide-react'
import { API_URL, getStoredToken } from '../lib/authApi'
import './BackupDashboard.css'

type BackupRecord = {
  _id: string; fileName: string; backupType: string; status: 'in_progress' | 'completed' | 'failed';
  verificationStatus?: 'pending' | 'verified' | 'failed' | 'missing'; createdAt: string; size?: number;
  compressedSize?: number; checksum?: string | null; durationMs?: number | null; isProtected?: boolean;
  isEncrypted?: boolean; storageProvider?: string; appVersion?: string; schemaVersion?: string;
  backupEngineVersion?: string; backupFormatVersion?: string; documentCount?: number; collections?: { name: string; count: number }[];
  triggeredBy?: string; error?: string | null
}

type BackupHealth = {
  totalBackups: number; failedBackups: number; successRate: number; verificationSuccessRate: number;
  averageBackupDurationMs: number; lastSuccessfulBackup: string | null; lastVerifiedBackup: string | null;
  nextScheduledBackup: string | null; activeOperation: { type: string } | null;
  storage: { total: number | null; used: number | null; free: number | null; usedPercentage: number | null; provider: string; warningLevel: string | null };
  health: { score: number; label: string; ageHours: number | null };
  disasterRecovery: { score: number; label: string; rpoHours: number; rtoMinutes: number; lastVerifiedRestore: string | null; encryptionEnabled: boolean; storageRedundancy: string }
}

type Preview = { backup: BackupRecord; compatibility: { compatible: boolean; requiresConfirmation: boolean; warnings: string[]; current: Record<string, string>; backup: Record<string, string> } }
type Comparison = { first: BackupRecord; second: BackupRecord; differences: { collection: string; firstCount: number; secondCount: number; difference: number }[]; totals: { documentDifference: number; sizeDifference: number; durationDifferenceMs: number } }
type SortKey = 'createdAt' | 'fileName' | 'status' | 'compressedSize' | 'durationMs'
type RecoveryIssue = { id: string; severity: 'critical' | 'warning' | 'info'; title: string; value: string; why: string; impact: string; recommendation: string }

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
  const [showReadinessDetails, setShowReadinessDetails] = useState(false)
  const [recoveryBusy, setRecoveryBusy] = useState<string | null>(null)
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null)

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

  const loadBackups = async () => {
    try {
      setLoading(true); setError(null)
      const [historyData, healthData] = await Promise.all([request('/api/admin/backup/history'), request('/api/admin/backup/health')])
      setBackups(historyData.backups || []); setHealth(healthData)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Failed to load backups') }
    finally { setLoading(false) }
  }

  useEffect(() => { void loadBackups() }, [refreshKey])

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

  const readinessIssues = useMemo<RecoveryIssue[]>(() => {
    if (!health) return []
    const issues: RecoveryIssue[] = []
    if (!health.lastSuccessfulBackup || (health.health.ageHours != null && health.health.ageHours > health.disasterRecovery.rpoHours)) issues.push({ id: 'recovery-point', severity: health.lastSuccessfulBackup ? 'warning' : 'critical', title: 'Recovery Point', value: health.lastSuccessfulBackup ? `${health.health.ageHours}h old` : 'No successful backup', why: health.lastSuccessfulBackup ? `The latest recovery point exceeds the ${health.disasterRecovery.rpoHours}-hour RPO.` : 'No usable recovery point exists.', impact: 'Recent data may be unavailable after an incident.', recommendation: 'Create and verify a fresh manual backup.' })
    if (health.verificationSuccessRate < 95) issues.push({ id: 'verification', severity: 'warning', title: 'Backup Integrity', value: `${health.verificationSuccessRate}% verified`, why: 'Integrity verification is below the recommended 95% target.', impact: 'An unverified archive may not be recoverable.', recommendation: 'Verify all completed backups.' })
    if (health.failedBackups > 0) issues.push({ id: 'failed', severity: 'warning', title: 'Failed Backups', value: `${health.failedBackups} failed`, why: 'Jobs can fail because storage is full, a checksum mismatches, compression fails, or the database is unavailable.', impact: 'Repeated failures reduce the number of viable restore points.', recommendation: 'Review failure reasons, retry verification, then remove obsolete failed records.' })
    if (health.storage.warningLevel) issues.push({ id: 'storage', severity: health.storage.warningLevel === 'full' ? 'critical' : 'warning', title: 'Storage', value: `${health.storage.usedPercentage ?? 0}% used`, why: `Backup storage has reached the ${health.storage.warningLevel} threshold.`, impact: 'New scheduled backups may fail when capacity is exhausted.', recommendation: 'Clean old automatic backups or move archives to secondary storage.' })
    if (!health.disasterRecovery.lastVerifiedRestore) issues.push({ id: 'restore', severity: 'warning', title: 'Restore Verification', value: 'Never tested', why: 'A backup has never been restored into an isolated environment.', impact: 'Backup integrity alone does not prove the application can recover.', recommendation: 'Run an isolated restore test.' })
    if (!health.disasterRecovery.encryptionEnabled) issues.push({ id: 'encryption', severity: 'info', title: 'Encryption', value: 'Disabled', why: 'Backup archives are stored without application-level encryption.', impact: 'Anyone with storage access may be able to read backup data.', recommendation: 'Configure a valid 32-byte key and enable backup encryption.' })
    if (health.disasterRecovery.storageRedundancy === 'single-copy') issues.push({ id: 'redundancy', severity: 'warning', title: 'Backup Redundancy', value: 'Local storage only', why: 'Only one storage copy is configured.', impact: 'A host or volume failure could remove both the application and its backups.', recommendation: 'Configure durable off-site secondary storage and test replication.' })
    return issues
  }, [health])

  const runRecoveryAction = async (action: string) => {
    try {
      setRecoveryBusy(action); setRecoveryNotice(null); setError(null)
      if (action === 'failed') { setFilter('failed'); setPage(1); setShowReadinessDetails(false); document.getElementById('backup-history-table')?.scrollIntoView({ behavior: 'smooth' }); return }
      if (action === 'largest') { setSortKey('compressedSize'); setSortDirection('desc'); setPage(1); setShowReadinessDetails(false); return }
      if (action === 'export') {
        const failed = backups.filter(item => item.status === 'failed' || item.verificationStatus === 'failed' || item.verificationStatus === 'missing')
        const csv = ['Backup,Timestamp,Status,Failure reason', ...failed.map(item => [item.fileName, item.createdAt, item.status, item.error || 'No reason recorded'].map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))].join('\n')
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = 'backup-error-log.csv'; link.click(); URL.revokeObjectURL(url); setRecoveryNotice('Error log exported.'); return
      }
      if (action === 'create') await request('/api/admin/backup/create', { method: 'POST' })
      if (action === 'restore') await request('/api/admin/backup/restore-test', { method: 'POST' })
      if (action === 'cleanup') await request('/api/admin/backup/cleanup', { method: 'POST' })
      if (action === 'verify') {
        const candidates = backups.filter(item => item.status === 'completed' && item.verificationStatus !== 'verified')
        for (const item of candidates) await request('/api/admin/backup/verify', { method: 'POST', body: JSON.stringify({ backupFileName: item.fileName }) })
      }
      if (action === 'delete-failed') {
        const failed = backups.filter(item => item.status === 'failed' || item.verificationStatus === 'failed' || item.verificationStatus === 'missing')
        if (!failed.length || !window.confirm(`Delete ${failed.length} failed backup record${failed.length === 1 ? '' : 's'}? Protected backups will be retained.`)) return
        for (const item of failed.filter(entry => !entry.isProtected)) await request('/api/admin/backup/delete', { method: 'DELETE', body: JSON.stringify({ backupFileName: item.fileName, confirm: true }) })
      }
      await loadBackups(); setRecoveryNotice('Action completed. Readiness has been recalculated.')
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'Recovery action failed') }
    finally { setRecoveryBusy(null) }
  }

  return <section className="backup-dashboard" aria-labelledby="backup-history-title">
    <header className="backup-dashboard__header"><div><span className="system-health-eyebrow">Disaster Recovery</span><h2 id="backup-history-title">Backup Health & History</h2><p>Verified restore points, readiness monitoring, and administrative controls.</p></div><button type="button" className="backup-dashboard__refresh" onClick={() => void loadBackups()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh</button></header>

    {health && <div className="backup-health-grid">
      <article className={`backup-health-card backup-health-card--${health.health.label.toLowerCase()}`}><span>Overall Health</span><strong>{health.health.label}</strong><small>{health.health.score}/100</small></article>
      <article className="backup-health-card"><span>Last Successful</span><strong>{formatDate(health.lastSuccessfulBackup)}</strong><small>{health.health.ageHours == null ? 'No recovery point' : `${health.health.ageHours} hours old`}</small></article>
      <article className="backup-health-card"><span>Verification</span><strong>{health.verificationSuccessRate}%</strong><small>{health.failedBackups} failed backups</small></article>
      <article className="backup-health-card"><span>Storage</span><strong>{health.storage.usedPercentage == null ? formatBytes(health.storage.used || 0) : `${health.storage.usedPercentage}% used`}</strong><small>{health.storage.provider} / {health.storage.warningLevel || 'normal'}</small></article>
      <article className="backup-health-card"><span>Average Duration</span><strong>{formatDuration(health.averageBackupDurationMs)}</strong><small>{health.successRate}% backup success</small></article>
      <article className={`backup-health-card backup-health-card--${health.disasterRecovery.label.toLowerCase()}`}><span>DR Readiness</span><strong>{health.disasterRecovery.label}</strong><small>{health.disasterRecovery.score}/100 / RPO {health.disasterRecovery.rpoHours}h</small><button type="button" className="backup-health-details-button" onClick={() => setShowReadinessDetails(true)}>Details{readinessIssues.length ? ` (${readinessIssues.length})` : ''}</button></article>
      <article className="backup-health-card"><span>Active Operation</span><strong>{health.activeOperation?.type || 'Idle'}</strong><small>Next: {formatDate(health.nextScheduledBackup)}</small></article>
      <article className="backup-health-card"><span>Last Restore Test</span><strong>{formatDate(health.disasterRecovery.lastVerifiedRestore)}</strong><small>{health.disasterRecovery.encryptionEnabled ? 'Encryption enabled' : 'Encryption disabled'}</small></article>
    </div>}

    <div className="backup-dashboard__toolbar"><label className="backup-dashboard__search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search backups</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} placeholder="Search backups" /></label><select aria-label="Filter backups" value={filter} onChange={event => { setFilter(event.target.value); setPage(1) }}><option value="all">All backups</option><option value="manual">Manual</option><option value="scheduled">Scheduled</option><option value="initial">Startup</option><option value="emergency">Emergency</option><option value="verified">Verified</option><option value="failed">Failed</option><option value="encrypted">Encrypted</option></select><button type="button" disabled={compareSelection.length !== 2} onClick={() => void compare()}><BarChart3 size={16} /> Compare ({compareSelection.length}/2)</button></div>
    {error && <div className="backup-dashboard__error" role="alert">{error}</div>}
    {loading && backups.length === 0 ? <div className="backup-dashboard__skeleton" aria-label="Loading backups">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div> : visible.length === 0 ? <div className="backup-dashboard__empty"><ShieldCheck size={30} /><strong>No backups found</strong><span>Create a backup or adjust the filters.</span></div> : <div className="backup-table-wrap" id="backup-history-table"><table className="backup-table"><thead><tr><th aria-label="Compare" /><th><button onClick={() => changeSort('fileName')}>Name</button></th><th>Type</th><th><button onClick={() => changeSort('status')}>Status</button></th><th><button onClick={() => changeSort('createdAt')}>Created</button></th><th><button onClick={() => changeSort('compressedSize')}>Size</button></th><th>Integrity</th><th><button onClick={() => changeSort('durationMs')}>Duration</button></th><th>Security</th><th>Actions</th></tr></thead><tbody>{visible.map(backup => {
      const busy = busyFile === backup.fileName; const selected = compareSelection.includes(backup.fileName)
      return <tr key={backup._id}>
        <td data-label="Compare"><input type="checkbox" checked={selected} aria-label={`Compare ${backup.fileName}`} onChange={() => setCompareSelection(values => selected ? values.filter(value => value !== backup.fileName) : values.length < 2 ? [...values, backup.fileName] : values)} /></td>
        <td data-label="Name"><button className="backup-name-button" onClick={() => void openPreview(backup)}><strong title={backup.fileName}>{backup.fileName}</strong></button><small>{backup.triggeredBy || 'System'} / app {backup.appVersion || 'unknown'}</small></td>
        <td data-label="Type"><span className="backup-badge">{backup.backupType}</span><span className="backup-badge">{backup.storageProvider || 'local'}</span></td>
        <td data-label="Status"><span className={`backup-badge backup-badge--${backup.status}`}>{backup.status.replace('_', ' ')}</span>{backup.error && <small className="backup-failure-reason" title={backup.error}>{backup.error}</small>}</td>
        <td data-label="Created">{new Date(backup.createdAt).toLocaleString()}</td>
        <td data-label="Size">{formatBytes(backup.compressedSize || backup.size)}</td>
        <td data-label="Integrity"><span className={`backup-badge backup-badge--${backup.verificationStatus || 'pending'}`} title={backup.checksum || ''}>{backup.verificationStatus || 'pending'}</span></td>
        <td data-label="Duration">{formatDuration(backup.durationMs)}</td>
        <td data-label="Security"><span className={`backup-badge ${backup.isEncrypted ? 'backup-badge--verified' : ''}`}>{backup.isEncrypted ? 'Encrypted' : 'Plain'}</span>{backup.isProtected ? <span className="backup-protected"><Lock size={14} /> Protected</span> : <span className="backup-muted"><Unlock size={14} /> Standard</span>}</td>
        <td data-label="Actions">
          <select className="backup-action-select" aria-label={`Actions for ${backup.fileName}`} disabled={busy} value="" onChange={event => { const action = event.target.value; event.target.value = ''; void handleBackupAction(backup, action) }}>
            <option value="" disabled>{busy ? 'Working...' : 'Actions'}</option>
            <option value="details">View details</option>
            <option value="verify">Verify integrity</option>
            <option value="restore" disabled={backup.verificationStatus !== 'verified'}>Restore</option>
            <option value="download" disabled={backup.status !== 'completed'}>Download</option>
            <option value="rename">Rename</option>
            <option value="protection">{backup.isProtected ? 'Unprotect' : 'Protect'}</option>
            <option value="delete">Delete</option>
          </select>
        </td>
      </tr>
    })}</tbody></table></div>}
    <footer className="backup-dashboard__pagination"><span>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span><div><button type="button" disabled={currentPage <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(value => value + 1)}>Next</button></div></footer>

    {preview && <div className="backup-detail-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPreview(null) }}><section className="backup-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-detail-title"><header><div><span className="system-health-eyebrow">Restore Preview</span><h3 id="backup-detail-title">{preview.backup.fileName}</h3></div><button onClick={() => setPreview(null)} aria-label="Close backup details">x</button></header>{preview.compatibility.warnings.length > 0 && <div className="backup-compatibility-warning"><strong>Compatibility warning</strong>{preview.compatibility.warnings.map(warning => <span key={warning}>{warning}</span>)}</div>}<dl className="backup-detail-grid"><div><dt>Created</dt><dd>{formatDate(preview.backup.createdAt)}</dd></div><div><dt>Created by</dt><dd>{preview.backup.triggeredBy || 'System'}</dd></div><div><dt>Documents</dt><dd>{preview.backup.documentCount ?? 0}</dd></div><div><dt>Backup size</dt><dd>{formatBytes(preview.backup.compressedSize || preview.backup.size)}</dd></div><div><dt>Verification</dt><dd>{preview.backup.verificationStatus}</dd></div><div><dt>Checksum</dt><dd className="backup-checksum">{preview.backup.checksum || 'Unavailable'}</dd></div><div><dt>Application</dt><dd>{preview.backup.appVersion || 'unknown'}</dd></div><div><dt>Schema / format</dt><dd>{preview.backup.schemaVersion || 'unknown'} / {preview.backup.backupFormatVersion || 'unknown'}</dd></div><div><dt>Encryption</dt><dd>{preview.backup.isEncrypted ? 'AES-256-GCM' : 'Not encrypted'}</dd></div><div><dt>Storage</dt><dd>{preview.backup.storageProvider || 'local'}</dd></div></dl><div className="backup-detail-collections"><strong>Collections ({preview.backup.collections?.length || 0})</strong><div>{preview.backup.collections?.map(item => <span key={item.name}>{item.name}: {item.count}</span>)}</div></div><footer><button onClick={() => setPreview(null)}>Cancel</button><button className="backup-restore-confirm" disabled={!preview.compatibility.compatible || preview.backup.verificationStatus !== 'verified'} onClick={() => void confirmRestore()}><RotateCcw size={16} /> {preview.compatibility.requiresConfirmation ? 'Confirm compatibility and restore' : 'Confirm restore'}</button></footer></section></div>}
    {showReadinessDetails && health && <div className="backup-detail-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setShowReadinessDetails(false) }}><section className="backup-detail-dialog recovery-center" role="dialog" aria-modal="true" aria-labelledby="readiness-detail-title"><header><div><span className="system-health-eyebrow">Disaster Preparedness</span><h3 id="readiness-detail-title">Recovery Center</h3><p>{readinessIssues.length} issue{readinessIssues.length === 1 ? '' : 's'} affecting recoverability</p></div><button onClick={() => setShowReadinessDetails(false)} aria-label="Close Recovery Center">x</button></header><div className="readiness-summary"><strong className={`readiness-score readiness-score--${health.disasterRecovery.label.toLowerCase()}`}>{health.disasterRecovery.score}/100 - {health.disasterRecovery.label}</strong><span>RPO: {health.disasterRecovery.rpoHours} hours</span><span>RTO: {health.disasterRecovery.rtoMinutes} minutes</span></div>{recoveryNotice && <div className="recovery-notice" role="status"><CheckCircle2 size={16} />{recoveryNotice}</div>}<div className="recovery-layout"><main><h4>Issues reducing score</h4><div className="readiness-issues">{readinessIssues.length === 0 ? <div className="readiness-empty"><ShieldCheck size={24} /><strong>No readiness issues detected</strong><span>Backups, verification, restore testing, and storage are within their configured targets.</span></div> : readinessIssues.map((issue, index) => <article className={`readiness-issue readiness-issue--${issue.severity}`} key={issue.id}><div className="recovery-issue-heading"><span className="recovery-issue-number">{index + 1}</span><div><strong>{issue.title}</strong><span>{issue.value}</span></div><span className={`recovery-severity recovery-severity--${issue.severity}`}>{issue.severity}</span></div><dl><div><dt>Why</dt><dd>{issue.why}</dd></div><div><dt>Impact</dt><dd>{issue.impact}</dd></div><div><dt>Recommendation</dt><dd>{issue.recommendation}</dd></div></dl><div className="recovery-actions">{issue.id === 'failed' && <><button onClick={() => void runRecoveryAction('failed')}>Review Failed</button><button disabled={!!recoveryBusy} onClick={() => void runRecoveryAction('verify')}>Retry Verification</button><button disabled={!!recoveryBusy} onClick={() => void runRecoveryAction('delete-failed')}><Trash2 size={14} /> Delete Failed</button><button onClick={() => void runRecoveryAction('export')}><Download size={14} /> Export Logs</button></>}{issue.id === 'storage' && <><button disabled={!!recoveryBusy} onClick={() => void runRecoveryAction('cleanup')}><Trash2 size={14} /> Clean Old Backups</button><button onClick={() => void runRecoveryAction('largest')}>View Largest</button></>}{issue.id === 'restore' && <button disabled={!!recoveryBusy} onClick={() => void runRecoveryAction('restore')}><Play size={14} /> Run Restore Test</button>}{issue.id === 'redundancy' && <button onClick={() => setRecoveryNotice('Set BACKUP_STORAGE_PROVIDER and BACKUP_STORAGE_REDUNDANCY in the server configuration, then restart the service and test replication.')}><Cloud size={14} /> Setup Guide</button>}{issue.id === 'encryption' && <button onClick={() => setRecoveryNotice('Provide a valid 32-byte BACKUP_ENCRYPTION_KEY, enable BACKUP_ENCRYPTION, then restart the server.')}><Lock size={14} /> Setup Guide</button>}{issue.id === 'verification' && <button disabled={!!recoveryBusy} onClick={() => void runRecoveryAction('verify')}>Verify Backups</button>}{issue.id === 'recovery-point' && <button disabled={!!recoveryBusy} onClick={() => void runRecoveryAction('create')}>Create Backup</button>}</div></article>)}</div></main><aside><h4>Quick actions</h4><div className="recovery-quick-actions"><button disabled={!!recoveryBusy} onClick={() => void runRecoveryAction('create')}><Database size={16} /><span>Create Backup<small>New recovery point</small></span></button><button disabled={!!recoveryBusy} onClick={() => void runRecoveryAction('restore')}><Play size={16} /><span>Run Restore Test<small>Isolated validation</small></span></button><button disabled={!!recoveryBusy} onClick={() => void runRecoveryAction('verify')}><ShieldCheck size={16} /><span>Verify Backups<small>Check integrity</small></span></button><button disabled={!!recoveryBusy} onClick={() => void runRecoveryAction('cleanup')}><HardDrive size={16} /><span>Clean Storage<small>Apply retention policy</small></span></button><button onClick={() => void runRecoveryAction('failed')}><AlertTriangle size={16} /><span>Failed Backups<small>Review error details</small></span></button></div><h4>Recovery timeline</h4><div className="recovery-timeline"><div className="done"><span /><p><strong>Latest backup</strong><small>{formatDate(health.lastSuccessfulBackup)}</small></p></div><div className={health.lastVerifiedBackup ? 'done' : 'warning'}><span /><p><strong>Integrity verification</strong><small>{formatDate(health.lastVerifiedBackup)}</small></p></div><div className={health.disasterRecovery.lastVerifiedRestore ? 'done' : 'warning'}><span /><p><strong>Restore test</strong><small>{formatDate(health.disasterRecovery.lastVerifiedRestore)}</small></p></div><div><span /><p><strong>Next scheduled backup</strong><small>{formatDate(health.nextScheduledBackup)}</small></p></div></div></aside></div></section></div>}
    {comparison && <div className="backup-detail-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setComparison(null) }}><section className="backup-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-compare-title"><header><div><span className="system-health-eyebrow">Backup Analytics</span><h3 id="backup-compare-title">Backup Comparison</h3></div><button onClick={() => setComparison(null)} aria-label="Close comparison">x</button></header><div className="backup-comparison-summary"><span>Documents: {comparison.totals.documentDifference > 0 ? '+' : ''}{comparison.totals.documentDifference}</span><span>Size: {formatBytes(Math.abs(comparison.totals.sizeDifference))} {comparison.totals.sizeDifference >= 0 ? 'larger' : 'smaller'}</span><span>Duration: {formatDuration(Math.abs(comparison.totals.durationDifferenceMs))} difference</span></div><div className="backup-comparison-list">{comparison.differences.map(item => <div className={item.difference ? 'changed' : ''} key={item.collection}><strong>{item.collection}</strong><span>{item.firstCount}</span><span>{item.secondCount}</span><span>{item.difference > 0 ? '+' : ''}{item.difference}</span></div>)}</div></section></div>}
  </section>
}
