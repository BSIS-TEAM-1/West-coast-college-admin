import { useState, useEffect } from 'react'
import { TrendingUp, Users, Database, Server, AlertTriangle, Activity } from 'lucide-react'
import LiveGraph from '../components/LiveGraph';
import StatisticsCard from './StatisticsCard';
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
  const [documentsHistory, setDocumentsHistory] = useState<number[]>([]);
  const [activeUsersHistory, setActiveUsersHistory] = useState<number[]>([]);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningType, setWarningType] = useState<string>('');

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
      
      setMetrics({
        ...data,
        errorCount: currentErrorCount > 0 ? currentErrorCount : data.errorCount
      });
      
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
      setMemoryHistory(prev => {
        const newHistory = [...prev, data.memoryUsage].slice(-20);
        return newHistory.length === 1 ? Array(20).fill(data.memoryUsage).map((_, i) => 
          i === newHistory.length - 1 ? data.memoryUsage : data.memoryUsage * (0.8 + Math.random() * 0.4)
        ) : newHistory;
      });
      
      setServerLoadHistory(prev => {
        const newHistory = [...prev, data.serverLoad].slice(-20);
        return newHistory.length === 1 ? Array(20).fill(data.serverLoad).map((_, i) => 
          i === newHistory.length - 1 ? data.serverLoad : data.serverLoad * (0.8 + Math.random() * 0.4)
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
        const newHistory = [...prev, data.statistics.totalDocuments].slice(-20);
        return newHistory.length === 1 ? Array(20).fill(data.statistics.totalDocuments) : newHistory;
      });
      
      // Update active users history
      setActiveUsersHistory(prev => {
        const newHistory = [...prev, data.activeUsers].slice(-20);
        return newHistory.length === 1 ? Array(20).fill(data.activeUsers) : newHistory;
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

  const getStatusColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.good) return 'success';
    return 'error';
  };

  const handleWarningClick = (type: string) => {
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
    try {
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
        alert(`Backup completed successfully: ${result.fileName || 'Backup created'}`);
      } else {
        alert(`Backup failed: ${result.error || 'Unknown error'}`);
      }
      
      // Refresh metrics to show updated backup status - force fresh scan
      fetchSystemHealth(true);
    } catch (error) {
      console.error('Backup failed:', error);
      alert('Backup failed. Please try again.');
    }
  };

const getHealthStatus = () => {
    const issues = [
      metrics.uptime < 99,
      metrics.activeUsers > 500,
      metrics.databaseUsage > 80,
      metrics.backupStatus !== 'success',
      metrics.errorCount > 50,
      metrics.serverLoad > 70,
      metrics.memoryUsage > 80
    ].filter(Boolean).length;

    if (issues === 0) return { status: 'healthy', color: '#10b981', issues };
    if (issues <= 2) return { status: 'degraded', color: '#f59e0b', issues };
    return { status: 'critical', color: '#ef4444', issues };
  };

  const healthStatus = getHealthStatus();
  
  
  // Calculate document change percentage
  const getDocumentChange = () => {
    if (documentsHistory.length < 2) return 0;
    const current = documentsHistory[documentsHistory.length - 1];
    const previous = documentsHistory[documentsHistory.length - 2];
    if (previous === 0) return 0;
    const change = ((current - previous) / previous) * 100;
    return Math.round(change * 10) / 10; // Round to 1 decimal place
  };
  
  // Calculate active users change percentage
  const getActiveUsersChange = () => {
    if (activeUsersHistory.length < 2) return 0;
    const current = activeUsersHistory[activeUsersHistory.length - 1];
    const previous = activeUsersHistory[activeUsersHistory.length - 2];
    if (previous === 0) return 0;
    const change = ((current - previous) / previous) * 100;
    return Math.round(change * 10) / 10; // Round to 1 decimal place
  };
  
  // Generate data for statistics cards
  const userStats = [
    { label: 'Active Users (1h)', value: metrics.activeUsers, change: getActiveUsersChange(), changeType: getActiveUsersChange() >= 0 ? 'increase' as const : 'decrease' as const, icon: <Users size={20} /> },
    { label: 'Total Admins', value: metrics.statistics.accountTypes?.admins || 0, change: 0, changeType: 'neutral' as const, icon: <TrendingUp size={20} /> }
  ];

  const performanceStats = [
    { label: 'Server Load', value: `${metrics.serverLoad.toFixed(1)}%`, change: 2.3, changeType: 'increase' as const, icon: <Server size={20} /> },
    { label: 'Memory Usage', value: `${metrics.memoryUsage.toFixed(1)}%`, change: -3.1, changeType: 'decrease' as const, icon: <Activity size={20} /> }
  ];

  const resourceStats = [
    { label: 'Database Usage', value: `${metrics.databaseUsage.toFixed(1)}%`, change: 1.2, changeType: 'increase' as const, icon: <Database size={20} />, disabled: true },
    { label: 'Total Documents', value: metrics.statistics.totalDocuments, change: getDocumentChange(), changeType: getDocumentChange() >= 0 ? 'increase' as const : 'decrease' as const, icon: <Activity size={20} /> }
  ];

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
        <h1>System Health & Performance</h1>
        <div className="header-actions">
          <button 
            onClick={() => {
              if (onNavigate) {
                onNavigate('security');
              }
            }}
            className="security-btn primary"
          >
            Security
          </button>
          <div className="overall-status">
            <span className="status-indicator" style={{ backgroundColor: healthStatus.color }}></span>
            <span className="status-text" style={{ color: healthStatus.color }}>{healthStatus.status.toUpperCase()}</span>
          </div>
        </div>
      </div>

      <div className="statistics-section">
        <StatisticsCard 
          title="User Statistics" 
          statistics={userStats}
          timeRange="24h"
        />
          
        <StatisticsCard 
          title="Performance Metrics" 
          statistics={performanceStats}
          timeRange="1h"
        />
          
        <StatisticsCard 
          title="Resource Utilization" 
          statistics={resourceStats}
          timeRange="7d"
        />
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Server Uptime</h3>
          <div className="metric-value">
            <span className="value">{metrics.uptime.toFixed(1)}%</span>
            <span 
              className={`status ${getStatusColor(metrics.uptime, { good: 99, warning: 95 })} ${getStatusColor(metrics.uptime, { good: 99, warning: 95 }) !== 'success' ? 'clickable-warning' : ''}`}
              onClick={() => getStatusColor(metrics.uptime, { good: 99, warning: 95 }) !== 'success' && handleWarningClick('uptime')}
              title={getStatusColor(metrics.uptime, { good: 99, warning: 95 }) !== 'success' ? 'Click to see details' : ''}
            ></span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-card-header">
            <h3>Backup Status</h3>
            <button 
              onClick={handleBackupNow}
              className="backup-now-btn"
              title="Start manual backup"
            >
              ⬆ Backup Now
            </button>
          </div>
          <div className="metric-value">
            <span className={`backup-status ${metrics.backupStatus} ${metrics.backupStatus !== 'success' ? 'clickable-warning' : ''}`}
                  onClick={() => metrics.backupStatus !== 'success' && handleWarningClick('backup')}
                  title={metrics.backupStatus !== 'success' ? 'Click to see details' : ''}>
              {metrics.backupStatus === 'success' ? '✓ Success' : 
               '✗ Error'}
            </span>
            <div className="last-backup">Last: {metrics.lastBackup}</div>
          </div>
        </div>

        <div className="metric-card">
          <h3>Error Count (24h)</h3>
          <div className="metric-value">
            <span className="value">{metrics.errorCount}</span>
            <span 
              className={`error-indicator ${metrics.errorCount > 50 ? 'high' : metrics.errorCount > 20 ? 'medium' : 'low'} ${metrics.errorCount > 20 ? 'clickable-warning' : ''}`}
              onClick={() => metrics.errorCount > 20 && handleWarningClick('errors')}
              title={metrics.errorCount > 20 ? 'Click to see details' : ''}
            ></span>
          </div>
        </div>
      </div>

      <div className="graphs-section">
        <h2>Render Live Service Performance</h2>
        <div className="graphs-grid">
          <div className="graph-container">
            <LiveGraph
              title="Memory Usage"
              data={memoryHistory}
              maxValue={100}
              unit="%"
              color="#a855f7"
            />
          </div>
          <div className="graph-container">
            <LiveGraph
              title="Server Load (CPU)"
              data={serverLoadHistory}
              maxValue={100}
              unit="%"
              color="#ef4444"
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
        <h2>Recent Error Logs</h2>
        <div className="terminal-logs">
          <div className="logs-list">
            {logs.length === 0 ? (
              <div className="no-logs">
                <span className="no-logs-message">admin@wcc-server:~$ No recent error logs found</span>
              </div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="terminal-line">
                  <span className="terminal-timestamp">{formatTimestamp(log.timestamp)}</span>
                  <span className={`terminal-level ${log.level.toUpperCase()}`}>{log.level.toUpperCase()}</span>
                  <span className="terminal-module">{log.module}</span>
                  <span className="terminal-message">{log.message}</span>
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
    </div>
  );
}
