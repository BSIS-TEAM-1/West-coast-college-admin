import { useState, useEffect } from 'react'
import { Activity, AlertTriangle, FileText, HardDrive, RefreshCw, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import LiveGraph from '../components/LiveGraph';
import { API_URL, getStoredToken } from '../lib/authApi'
import './SystemHealth.css'

interface SystemMetrics {
  uptime: number;
  activeUsers: number;
  databaseUsage: number;
  backupStatus: 'success' | 'error';
  errorCount: number;
  serverLoad: number;
  memoryUsage: number;
  lastBackup: string;
  statistics: {
    totalAdmins: number;
    totalDocuments: number;
    activeAnnouncements: number;
    recentLogins: number;
    errorLogs: number;
    warningLogs: number;
    accountTypes: {
      admins: number;
      registrars: number;
      professors: number;
      students: number;
    };
  };
  atlasMetrics: {
    enabled: boolean;
    clusterInfo: {
      name: string;
      version: string;
      connections: number;
      diskUsage: number | null;
    } | null;
    databaseInfo: {
      collectionsCount: number;
      dataSize: string;
      indexSize: string;
    } | null;
    measurements: {
      available: boolean;
      diskUsed: number | null;
      diskTotal: number | null;
      indexSize: number;
    } | null;
  };
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  module: string;
}

type BackupToast = {
  type: 'success' | 'error';
  title: string;
  message: string;
};

interface SystemHealthProps {
  onNavigate?: (view: string) => void;
}

export default function SystemHealth({ onNavigate }: SystemHealthProps = {}): React.ReactElement {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    uptime: 0,
    activeUsers: 0,
    databaseUsage: 0,
    backupStatus: 'success',
    errorCount: 0,
    serverLoad: 0,
    memoryUsage: 0,
    lastBackup: '',
    statistics: {
      totalAdmins: 0,
      totalDocuments: 0,
      activeAnnouncements: 0,
      recentLogins: 0,
      errorLogs: 0,
      warningLogs: 0,
      accountTypes: {
        admins: 0,
        registrars: 0,
        professors: 0,
        students: 0
      }
    },
    atlasMetrics: {
      enabled: false,
      clusterInfo: null,
      databaseInfo: null,
      measurements: null
    }
  });
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
  const [serverLoadHistory, setServerLoadHistory] = useState<number[]>([]);
  const [atlasDiskHistory, setAtlasDiskHistory] = useState<number[]>([]);
  const [atlasConnectionHistory, setAtlasConnectionHistory] = useState<number[]>([]);
  const [atlasDetailedDiskHistory, setAtlasDetailedDiskHistory] = useState<number[]>([]);
  const [, setDocumentsHistory] = useState<number[]>([]);
  const [activeUsersHistory, setActiveUsersHistory] = useState<number[]>([]);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningType, setWarningType] = useState<string>('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupToast, setBackupToast] = useState<BackupToast | null>(null);

  // Detect dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(prefersDark);
    };

    checkDarkMode();
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    fetchSystemHealth(true); // Force initial scan to get fresh data
    
    // Set up real-time updates every 5 seconds for more accurate live data
    const interval = setInterval(() => fetchSystemHealth(), 5000);
    
    // Force refresh every 2 minutes to clear cache
    const forceRefreshInterval = setInterval(() => fetchSystemHealth(true), 120000);
    
    // Fetch error logs separately from database
    fetchErrorLogs();
    const errorLogsInterval = setInterval(fetchErrorLogs, 30000); // Refresh error logs every 30 seconds
    
    return () => {
      clearInterval(interval);
      clearInterval(forceRefreshInterval);
      clearInterval(errorLogsInterval);
    };
  }, []);

  useEffect(() => {
    if (!backupToast) return;
    const timer = window.setTimeout(() => setBackupToast(null), 4300);
    return () => window.clearTimeout(timer);
  }, [backupToast]);

  const fetchErrorLogs = async () => {
    try {
      const token = await getStoredToken();
      if (!token) return;

      const response = await fetch(`${API_URL}/api/admin/error-logs?limit=100`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Handle 404 gracefully - the endpoint might not exist yet
      if (response.status === 404) {
        console.log('Error logs endpoint not available, using fallback data');
        setLogs([]);
        setError(null);
        return;
      }

      if (!response.ok) {
        if (response.status === 401) {
          setError('Authentication failed');
        } else {
          setError('Failed to fetch error logs');
        }
        return;
      }

      const data = await response.json();
      // Convert database error logs to LogEntry format
      const dbLogs: LogEntry[] = (data.logs || []).map((log: any) => ({
        id: log.id,
        timestamp: log.timestamp,
        level: log.level.toUpperCase(),
        message: log.message,
        module: log.source || 'SYSTEM'
      }));
      
      // Combine with existing logs or replace if database logs are available
      if (dbLogs.length > 0) {
        setLogs(prev => {
          // Combine unique logs, prioritizing database logs
          const combinedLogs = [...dbLogs];
          const existingIds = new Set(dbLogs.map(l => l.id));
          
          // Add any existing logs that aren't in database logs
          prev.forEach(log => {
            if (!existingIds.has(log.id)) {
              combinedLogs.push(log);
            }
          });
          
          // Sort by timestamp (newest first) and limit to 50
          return combinedLogs
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 50);
        });
      } else {
        setLogs(data.logs || []);
      }
      
      setError(null);
    } catch (err) {
      console.error('Failed to fetch error logs:', err);
      setError('Network error while fetching error logs');
    }
  };
  
  const fetchSystemHealth = async (forceScan = false) => {
    try {
      const token = await getStoredToken();
      if (!token) {
        setError('Authentication required');
        setLoading(false);
        return;
      }
      
      const response = await fetch(`${API_URL}/api/admin/system-health${forceScan ? '?forceScan=true' : ''}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          setError('Authentication failed');
        } else {
          setError('Failed to fetch system health data');
        }
        setLoading(false);
        return;
      }
      
      const data = await response.json();
      
      // Update error count based on current logs
      const currentErrorCount = logs.filter(log => log.level === 'ERROR').length;
      
      setMetrics((prev) => ({
        ...prev,
        ...data,
        errorCount: currentErrorCount > 0 ? currentErrorCount : (data.errorCount ?? prev.errorCount),
        statistics: {
          ...prev.statistics,
          ...(data.statistics || {}),
          accountTypes: {
            ...prev.statistics.accountTypes,
            ...(data.statistics?.accountTypes || {})
          }
        },
        atlasMetrics: {
          ...prev.atlasMetrics,
          ...(data.atlasMetrics || {})
        }
      }));
      
      setLogs(data.logs || []);
      
      // If no logs are found, create a fallback log for testing
      if (!data.logs || data.logs.length === 0) {
        const fallbackLog = {
          id: 'frontend-fallback',
          timestamp: new Date().toISOString(),
          level: 'INFO',
          message: 'System health check completed - no recent errors detected',
          module: 'SYSTEM'
        };
        setLogs([fallbackLog]);
      }
      
      // Update historical data (keep last 20 data points)
      const nextMemoryUsage = Number(data.memoryUsage ?? metrics.memoryUsage ?? 0);
      const nextServerLoad = Number(data.serverLoad ?? metrics.serverLoad ?? 0);
      const nextTotalDocuments = Number(data.statistics?.totalDocuments ?? metrics.statistics.totalDocuments ?? 0);
      const nextActiveUsers = Number(data.activeUsers ?? metrics.activeUsers ?? 0);

      setMemoryHistory(prev => {
        const newHistory = [...prev, nextMemoryUsage].slice(-20);
        return newHistory.length === 1 ? Array(20).fill(nextMemoryUsage).map((_, i) => 
          i === newHistory.length - 1 ? nextMemoryUsage : nextMemoryUsage * (0.8 + Math.random() * 0.4)
        ) : newHistory;
      });
      
      setServerLoadHistory(prev => {
        const newHistory = [...prev, nextServerLoad].slice(-20);
        return newHistory.length === 1 ? Array(20).fill(nextServerLoad).map((_, i) => 
          i === newHistory.length - 1 ? nextServerLoad : nextServerLoad * (0.8 + Math.random() * 0.4)
        ) : newHistory;
      });
      
      // Update Atlas metrics history if available
      if (data.atlasMetrics && data.atlasMetrics.enabled) {
        if (data.atlasMetrics.clusterInfo && data.atlasMetrics.clusterInfo.diskUsage !== null) {
          setAtlasDiskHistory(prev => {
            const newHistory = [...prev, data.atlasMetrics.clusterInfo.diskUsage].slice(-20);
            return newHistory.length === 1 ? Array(20).fill(data.atlasMetrics.clusterInfo.diskUsage) : newHistory;
          });
        }
        
        if (data.atlasMetrics.measurements && data.atlasMetrics.measurements.diskUsed !== null) {
          setAtlasDetailedDiskHistory(prev => {
            const newHistory = [...prev, data.atlasMetrics.measurements.diskUsed].slice(-20);
            return newHistory.length === 1 ? Array(20).fill(data.atlasMetrics.measurements.diskUsed) : newHistory;
          });
        }
        
        if (data.atlasMetrics.clusterInfo && data.atlasMetrics.clusterInfo.connections > 0) {
          setAtlasConnectionHistory(prev => {
            const newHistory = [...prev, data.atlasMetrics.clusterInfo.connections].slice(-20);
            return newHistory.length === 1 ? Array(20).fill(data.atlasMetrics.clusterInfo.connections) : newHistory;
          });
        }
      }
      
      // Update documents history
      setDocumentsHistory(prev => {
        const newHistory = [...prev, nextTotalDocuments].slice(-20);
        return newHistory.length === 1 ? Array(20).fill(nextTotalDocuments) : newHistory;
      });
      
      // Update active users history
      setActiveUsersHistory(prev => {
        const newHistory = [...prev, nextActiveUsers].slice(-20);
        return newHistory.length === 1 ? Array(20).fill(nextActiveUsers) : newHistory;
      });
      
      setError(null);
    } catch (err) {
      console.error('Failed to fetch system health:', err);
      setError('Network error while fetching system health');
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return timestamp;
    }
  };

  const formatNumber = (value: number) => value.toLocaleString();

  const formatMetricPercent = (value: number) => `${Number(value || 0).toFixed(1)}%`;

  const getStatusColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.good) return 'success';
    if (value >= thresholds.warning) return 'warning';
    return 'error';
  };

  const getStatusLabel = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.good) return 'Optimal';
    if (value >= thresholds.warning) return 'Degraded';
    return 'Critical';
  };

  const openWarningDetails = (type: string) => {
    setWarningType(type);
    setShowWarningModal(true);
  };

  const getWarningDetails = (type: string) => {
    const warnings = {
      uptime: {
        title: 'Low Server Uptime',
        description: 'Server uptime is below optimal levels.',
        recommendations: [
          'Check server logs for crash patterns',
          'Monitor system resources (CPU, memory)',
          'Review recent deployments or changes',
          'Consider implementing auto-restart mechanisms'
        ],
        severity: 'high'
      },
      backup: {
        title: 'Backup Issues',
        description: 'Backup system is experiencing problems.',
        recommendations: [
          'Check available disk space',
          'Verify backup permissions',
          'Review backup configuration',
          'Test manual backup process'
        ],
        severity: 'medium'
      },
      errors: {
        title: 'High Error Rate',
        description: 'System is generating more errors than normal.',
        recommendations: [
          'Review application logs',
          'Check database connectivity',
          'Monitor API response times',
          'Verify external service integrations'
        ],
        severity: 'high'
      },
      resources: {
        title: 'Resource Usage Warning',
        description: 'System resources are running high.',
        recommendations: [
          'Monitor CPU and memory usage',
          'Check for memory leaks',
          'Review database query performance',
          'Consider scaling resources'
        ],
        severity: 'medium'
      }
    };
    
    return warnings[type as keyof typeof warnings] || {
      title: 'System Warning',
      description: 'System health warning detected.',
      recommendations: ['Check system logs', 'Monitor performance metrics'],
      severity: 'medium'
    };
  };

  const handleBackupNow = async () => {
    if (isBackingUp) return;

    try {
      setIsBackingUp(true);
      const token = await getStoredToken();
      if (!token) {
        setError('Authentication required');
        return;
      }

      // Trigger backup via API using the correct endpoint
      const response = await fetch(`${API_URL}/api/admin/backup/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to start backup');
      }

      const result = await response.json();
      
      // Show success message
      if (result.success) {
        setBackupToast({
          type: 'success',
          title: 'Backup completed',
          message: result.fileName || 'Backup created successfully.'
        });
      } else {
        setBackupToast({
          type: 'error',
          title: 'Backup failed',
          message: result.error || 'Unknown error'
        });
      }
      
      // Refresh metrics to show updated backup status - force fresh scan
      fetchSystemHealth(true);
    } catch (error) {
      console.error('Backup failed:', error);
      setBackupToast({
        type: 'error',
        title: 'Backup failed',
        message: 'Please try again.'
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleExportLogs = () => {
    const content = logs
      .map(log => `[${formatTimestamp(log.timestamp)}] ${log.level.toUpperCase()} ${log.module}: ${log.message}`)
      .join('\n');
    const blob = new Blob([content || 'No logs available'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wcc-system-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  
  // Calculate document change percentage
  // Calculate active users change percentage
  const getActiveUsersChange = () => {
    if (activeUsersHistory.length < 2) return 0;
    const current = activeUsersHistory[activeUsersHistory.length - 1];
    const previous = activeUsersHistory[activeUsersHistory.length - 2];
    if (previous === 0) return 0;
    const change = ((current - previous) / previous) * 100;
    return Math.round(change * 10) / 10; // Round to 1 decimal place
  };

  const recentErrorLogs = logs.filter((log) => log.level.toUpperCase() === 'ERROR');
  const latestErrorLog = recentErrorLogs[0] || null;
  const errorModuleLabel = latestErrorLog?.module
    ? `${latestErrorLog.module.charAt(0).toUpperCase()}${latestErrorLog.module.slice(1).toLowerCase()}`
    : 'System';
  const errorSummaryLabel = metrics.errorCount === 0
    ? 'No active errors'
    : `${metrics.errorCount} ${errorModuleLabel} ${metrics.errorCount === 1 ? 'error' : 'errors'}`;
  const latestErrorMessage = latestErrorLog?.message || 'No recent error details available.';
  
  if (loading) {
    return (
      <div className={`system-health ${isDarkMode ? 'dark-mode' : ''}`}>
        <div className="health-header">
          <h1>System Health & Performance</h1>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading system health data...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className={`system-health ${isDarkMode ? 'dark-mode' : ''}`}>
        <div className="health-header">
          <h1>System Health & Performance</h1>
        </div>
        <div className="error-container">
          <AlertTriangle size={48} color="#ef4444" />
          <h3>Error Loading System Health</h3>
          <p>{error}</p>
          <button onClick={() => fetchSystemHealth()} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`system-health ${isDarkMode ? 'dark-mode' : ''}`}>
      <div className="health-header">
        <div>
          <span className="system-health-eyebrow">Academic Administration</span>
          <h1>System Health & Performance</h1>
          <p>Live operational monitoring for the West Coast College portal.</p>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => {
              if (onNavigate) {
                onNavigate('security');
              }
            }}
            className="security-btn primary"
          >
            <ShieldCheck size={16} />
            Security
          </button>
        </div>
      </div>

      <div className="dashboard-shell">
        <div className="dashboard-summary-grid">
          <div className="summary-card">
            <div className="summary-card-header">
              <h3>User Statistics</h3>
              <Users size={20} />
            </div>
            <div className="summary-card-body">
              <div className="summary-stat">
                <span className="summary-stat-label">Active Users (1h)</span>
                <span className="summary-stat-value">{formatNumber(metrics.activeUsers)}</span>
                <span className={`summary-stat-change ${getActiveUsersChange() >= 0 ? 'positive' : 'negative'}`}>
                  <TrendingUp size={13} />
                  {getActiveUsersChange() >= 0 ? '+' : ''}{getActiveUsersChange()}%
                </span>
              </div>
              <div className="summary-stat">
                <span className="summary-stat-label">Total Admins</span>
                <span className="summary-stat-value">{formatNumber(metrics.statistics.accountTypes?.admins || 0)}</span>
                <span className="summary-stat-note">Stable</span>
              </div>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-card-header">
              <h3>Performance</h3>
              <Activity size={20} />
            </div>
            <div className="summary-card-body">
              <div className="summary-stat">
                <span className="summary-stat-label">Server Load</span>
                <span className="summary-stat-value">{formatMetricPercent(metrics.serverLoad)}</span>
                <span className="summary-stat-note">{getStatusLabel(metrics.serverLoad, { good: 50, warning: 75 })}</span>
              </div>
              <div className="summary-stat">
                <span className="summary-stat-label">Memory</span>
                <span className="summary-stat-value">{formatMetricPercent(metrics.memoryUsage)}</span>
                <span className="summary-stat-note">{metrics.memoryUsage > 80 ? 'Warning' : 'Normal'}</span>
              </div>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-card-header">
              <h3>Resources</h3>
              <HardDrive size={20} />
            </div>
            <div className="summary-card-body">
              <div className="summary-stat disabled">
                <span className="summary-stat-label">DB Usage</span>
                <span className="summary-stat-value">{formatMetricPercent(metrics.databaseUsage)}</span>
                <span className="summary-stat-note">{metrics.atlasMetrics?.enabled ? 'Atlas enabled' : 'Disabled'}</span>
              </div>
              <div className="summary-stat">
                <span className="summary-stat-label">Total Docs</span>
                <span className="summary-stat-value">{formatNumber(metrics.statistics.totalDocuments)}</span>
                <span className="summary-stat-note">Current</span>
              </div>
            </div>
          </div>
        </div>

        <div className="operational-status-grid">
          <div className="status-card">
            <div className="status-card-header">
              <div>
                <p className="status-card-label">Server Uptime</p>
                <p className="status-card-value">{formatMetricPercent(metrics.uptime)}</p>
              </div>
              <span
                className={`status-pill ${getStatusColor(metrics.uptime, { good: 99, warning: 95 })} ${getStatusColor(metrics.uptime, { good: 99, warning: 95 }) !== 'success' ? 'clickable-warning' : 'no-click'}`}
                onClick={() => getStatusColor(metrics.uptime, { good: 99, warning: 95 }) !== 'success' && openWarningDetails('uptime')}
                title={getStatusColor(metrics.uptime, { good: 99, warning: 95 }) !== 'success' ? 'Click to see details' : ''}
              >
                {getStatusLabel(metrics.uptime, { good: 99, warning: 95 })}
              </span>
            </div>
            <div className="status-card-ring">
              <svg viewBox="0 0 64 64" className="status-ring">
                <circle cx="32" cy="32" r="28" className="status-ring-bg" />
                <circle cx="32" cy="32" r="28" className="status-ring-fill" style={{ strokeDashoffset: 176 - (metrics.uptime / 100) * 176 }} />
              </svg>
            </div>
          </div>

          <div className={`status-card ${isBackingUp ? 'backup-card-busy' : ''}`} aria-busy={isBackingUp}>
            <div className="status-card-header">
              <div>
                <p className="status-card-label">Backup Status</p>
                <span
                  className={`backup-status ${isBackingUp ? 'in-progress' : metrics.backupStatus} ${!isBackingUp && metrics.backupStatus !== 'success' ? 'clickable-warning' : ''}`}
                  onClick={() => !isBackingUp && metrics.backupStatus !== 'success' && openWarningDetails('backup')}
                  title={!isBackingUp && metrics.backupStatus !== 'success' ? 'Click to see details' : ''}
                >
                  {isBackingUp ? 'RUNNING' : metrics.backupStatus === 'success' ? 'SUCCESS' : 'ERROR'}
                </span>
              </div>
              <button 
                onClick={handleBackupNow}
                className="backup-now-btn"
                title="Start manual backup"
                disabled={isBackingUp}
              >
                <RefreshCw size={13} />
                {isBackingUp ? 'BACKING UP...' : 'BACKUP NOW'}
              </button>
              {isBackingUp && (
                <div className="backup-progress" role="progressbar" aria-label="Backup in progress">
                  <span />
                </div>
              )}
            </div>
            <p className="status-card-note">Last: {metrics.lastBackup || 'N/A'}</p>
          </div>

          <div className="status-card">
            <div className="status-card-header">
              <div>
                <p className="status-card-label">Errors (24h)</p>
                <div className="error-card-value-row">
                  <p className="status-card-value status-card-value--error">{metrics.errorCount}</p>
                  <span>{errorSummaryLabel}</span>
                </div>
              </div>
            </div>
            <div className="status-card-meta">
              <span
                className={`status-badge ${metrics.errorCount > 50 ? 'high' : metrics.errorCount > 20 ? 'medium' : 'low'} ${metrics.errorCount > 20 ? 'clickable-warning' : ''}`}
                onClick={() => metrics.errorCount > 20 && openWarningDetails('errors')}
                title={metrics.errorCount > 20 ? 'Click to see details' : ''}
              >
                {metrics.errorCount > 50 ? 'High' : metrics.errorCount > 20 ? 'Medium' : 'Low'}
              </span>
              <span className="status-card-note">{latestErrorMessage}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="graphs-section">
        <div className="section-heading-row">
          <div>
            <span className="system-health-eyebrow">Live Service Performance</span>
            <h2>Render Service History</h2>
          </div>
        </div>
        <div className="graphs-grid">
          <div className="graph-container">
            <LiveGraph
              title="Memory Usage History"
              data={memoryHistory}
              maxValue={100}
              unit="%"
              color="#775a19"
            />
          </div>
          <div className="graph-container">
            <LiveGraph
              title="Server Load (CPU) History"
              data={serverLoadHistory}
              maxValue={100}
              unit="%"
              color="#002147"
            />
          </div>
        </div>
      </div>

      {metrics.atlasMetrics && metrics.atlasMetrics.enabled && (
        <div className="atlas-graphs-section">
          <h2>MongoDB Atlas Live Monitoring</h2>
          <div className="graphs-grid">
            {atlasDiskHistory.length > 0 && (
              <div className="graph-container">
                <LiveGraph
                  title="Atlas Disk Usage (%)"
                  data={atlasDiskHistory}
                  maxValue={100}
                  unit="%"
                  color="#10b981"
                />
              </div>
            )}
            {atlasDetailedDiskHistory.length > 0 && (
              <div className="graph-container">
                <LiveGraph
                  title="Atlas Disk Used (GB)"
                  data={atlasDetailedDiskHistory}
                  maxValue={Math.max(...atlasDetailedDiskHistory) * 1.2 || 5}
                  unit="GB"
                  color="#8b5cf6"
                />
              </div>
            )}
            {atlasConnectionHistory.length > 0 && (
              <div className="graph-container">
                <LiveGraph
                  title="Atlas Connections"
                  data={atlasConnectionHistory}
                  maxValue={Math.max(...atlasConnectionHistory) * 1.2 || 25}
                  unit=""
                  color="#f59e0b"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="logs-section">
        <div className="logs-section-header">
          <h2>
            System Activity Logs
            <FileText size={18} />
          </h2>
          <div className="logs-actions">
            <button type="button" onClick={handleExportLogs}>Export Logs</button>
            <button type="button" className="danger" onClick={() => setLogs([])}>Clear Logs</button>
          </div>
        </div>
        <div className="activity-log-table" role="table" aria-label="System activity logs">
          <div className="activity-log-header" role="row">
            <span>Time</span>
            <span>Level</span>
            <span>Module</span>
            <span>Message</span>
          </div>
          <div className="activity-log-body">
            {logs.length === 0 ? (
              <div className="activity-log-empty">
                <FileText size={28} />
                <span>No recent system logs found.</span>
              </div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="activity-log-row" role="row">
                  <span className="activity-log-time">{formatTimestamp(log.timestamp)}</span>
                  <span className={`activity-log-level ${log.level.toLowerCase()}`}>{log.level.toUpperCase()}</span>
                  <span className="activity-log-module">{log.module}</span>
                  <span className="activity-log-message">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Warning Modal */}
      {showWarningModal && (
        <div className="warning-modal-overlay" onClick={() => setShowWarningModal(false)}>
          <div className="warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="warning-modal-header">
              <h3>{getWarningDetails(warningType).title}</h3>
              <button 
                className="warning-modal-close" 
                onClick={() => setShowWarningModal(false)}
                aria-label="Close warning details"
              >
                ×
              </button>
            </div>
            <div className="warning-modal-content">
              <p className="warning-description">{getWarningDetails(warningType).description}</p>
              <div className="warning-recommendations">
                <h4>Recommended Actions:</h4>
                <ul>
                  {getWarningDetails(warningType).recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
              <div className={`warning-severity ${getWarningDetails(warningType).severity}`}>
                Severity: {getWarningDetails(warningType).severity.toUpperCase()}
              </div>
            </div>
            <div className="warning-modal-footer">
              <button 
                className="warning-modal-btn primary" 
                onClick={() => setShowWarningModal(false)}
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}

      {backupToast && (
        <div className={`backup-toast ${backupToast.type}`} role="status" aria-live="polite">
          <strong>{backupToast.title}</strong>
          <span>{backupToast.message}</span>
        </div>
      )}

      <footer className="system-health-footer">
        <span>West Coast College Portal</span>
        <div>
          <a href="#privacy">Privacy Policy</a>
          <a href="#terms">Terms of Service</a>
          <a href="#security">Campus Security</a>
          <a href="#contact">Contact Us</a>
        </div>
      </footer>
    </div>
  );
}
