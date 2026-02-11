import React, { useState, useEffect } from 'react';
import { getStoredToken, API_URL } from '../lib/authApi';
import { Shield, AlertTriangle, CheckCircle, XCircle, Lock, Activity, FileText, Settings, Ban, Globe, ShieldAlert } from 'lucide-react';
import LiveChart from '../components/LiveChart';
import BandwidthChart from '../components/BandwidthChart';
import './Security.css';

interface SecurityMetrics {
  failedLogins: number;
  suspiciousActivity: number;
  blockedIPs: number;
  activeSessions: number;
  lastSecurityScan: string;
  securityScore: number;
  recentThreats: SecurityThreat[];
}

interface SecurityThreat {
  id: string;
  timestamp: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  source: string;
  status: 'active' | 'resolved' | 'investigating';
}

interface SecurityProps {
  onBack?: () => void;
}

interface SecurityHeaderConfig {
  present: boolean;
  value: string;
  status: 'pass' | 'fail';
  description: string;
}

interface SecurityFinding {
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  category: string;
  status: 'pass' | 'fail';
  recommendation?: string;
}

interface SecurityRecommendation {
  priority: 'low' | 'medium' | 'high';
  action: string;
  details: string;
}

interface SecurityScanResults {
  success: boolean;
  scanType: string;
  timestamp: string;
  summary: {
    score: number;
    grade: string;
    headersChecked?: number;
    headersPassed?: number;
    criticalIssues: number;
    warnings: number;
    info?: number;
  };
  findings: SecurityFinding[];
  recommendations: SecurityRecommendation[];
  securityHeaders?: Record<string, SecurityHeaderConfig>;
  serverUrl?: string;
}

const Security: React.FC<SecurityProps> = ({ onBack }) => {
  const [metrics, setMetrics] = useState<SecurityMetrics>({
    failedLogins: 0,
    suspiciousActivity: 0,
    blockedIPs: 0,
    activeSessions: 0,
    lastSecurityScan: 'N/A',
    securityScore: 0,
    recentThreats: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [showBlockedIPs, setShowBlockedIPs] = useState(false);
  const [blockedIPs, setBlockedIPs] = useState<any[]>([]);
  const [blockedIPsLoading, setBlockedIPsLoading] = useState(false);
  const [newBlockIP, setNewBlockIP] = useState({ ipAddress: '', reason: '', severity: 'medium' });
  const [showScanResults, setShowScanResults] = useState(false);
  const [scanResults, setScanResults] = useState<SecurityScanResults | null>(null);
  const [scanLoading, setScanLoading] = useState(false);

  useEffect(() => {
    fetchSecurityMetrics();
    const interval = setInterval(fetchSecurityMetrics, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchSecurityMetrics = async () => {
    try {
      const token = await getStoredToken();
      
      if (!token) {
        console.log('Security metrics: No token found');
        setError('Authentication required');
        setLoading(false);
        return;
      }

      console.log('Security metrics: Fetching with token:', token ? 'token exists' : 'no token');
      const response = await fetch(`${API_URL}/api/admin/security-metrics`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('Security metrics: Response status:', response.status);
      console.log('Security metrics: Response ok:', response.ok);

      if (!response.ok) {
        console.log('Security metrics: Response not ok:', response.status);
        throw new Error('Failed to fetch security metrics');
      }

      const data = await response.json();
      console.log('Security metrics: Data received:', data);
      console.log('Security metrics: Security score:', data.securityScore);
      
      // Ensure securityScore is a number
      if (data.securityScore === undefined || data.securityScore === null) {
        console.log('Security metrics: No security score in response, setting to 0');
        data.securityScore = 0;
      }
      
      // Convert to number if it's a string
      if (typeof data.securityScore === 'string') {
        data.securityScore = parseInt(data.securityScore, 10);
      }
      
      console.log('Security metrics: Final security score:', data.securityScore);
      
      setMetrics(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch security metrics:', err);
      setError('Network error while fetching security metrics');
    } finally {
      setLoading(false);
    }
  };

  const getSecurityScoreColor = (score: number) => {
    if (score >= 90) return '#10b981'; // Green - A
    if (score >= 80) return '#22c55e'; // Green - B
    if (score >= 70) return '#f59e0b'; // Yellow - C
    if (score >= 60) return '#f97316'; // Orange - D
    return '#ef4444'; // Red - F
  };

  const getScoreColor = getSecurityScoreColor;

  const getSecurityGrade = (score: number) => {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  };

  const handleSecurityScan = async () => {
    try {
      const token = await getStoredToken();
      if (!token) return;

      setScanLoading(true);

      // Call the new security scan endpoint
      const response = await fetch(`${API_URL}/api/admin/security-scan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const results = await response.json();
        console.log('Security scan results received:', results);
        console.log('Score:', results.summary?.score);
        console.log('Grade:', results.summary?.grade);
        setScanResults(results);
        setShowScanResults(true);
        
        // Update main security score with scan results
        if (results.summary && results.summary.score !== undefined) {
          setMetrics(prev => ({
            ...prev,
            securityScore: results.summary.score
          }));
        }
        
        fetchSecurityMetrics();
      } else {
        alert('System scan failed. Please try again.');
      }
    } catch (error) {
      console.error('System scan failed:', error);
      alert('System scan failed. Please try again.');
    } finally {
      setScanLoading(false);
    }
  };

  const handleSecurityHeadersScan = async () => {
    try {
      const token = await getStoredToken();
      if (!token) return;

      setScanLoading(true);

      // Call security headers scan endpoint
      const response = await fetch(`${API_URL}/api/admin/security-headers-scan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const results = await response.json();
        setScanResults(results);
        setShowScanResults(true);
      } else {
        alert('Security headers scan failed. Please try again.');
      }
    } catch (error) {
      console.error('Security headers scan failed:', error);
      alert('Security headers scan failed. Please try again.');
    } finally {
      setScanLoading(false);
    }
  };

  const handleViewAuditLogs = async () => {
    setShowAuditLogs(true);
    setAuditLogsLoading(true);
    
    try {
      const token = await getStoredToken();
      if (!token) {
        setError('Authentication required');
        return;
      }

      const response = await fetch(`${API_URL}/api/admin/audit-logs?limit=50`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const data = await response.json();
      setAuditLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      setError('Failed to load audit logs');
    } finally {
      setAuditLogsLoading(false);
    }
  };

  const handleManageBlockedIPs = async () => {
    setShowBlockedIPs(true);
    setBlockedIPsLoading(true);
    
    try {
      const token = await getStoredToken();
      if (!token) {
        setError('Authentication required');
        return;
      }

      const response = await fetch(`${API_URL}/api/admin/blocked-ips`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch blocked IPs');
      }

      const data = await response.json();
      setBlockedIPs(data || []);
    } catch (error) {
      console.error('Failed to fetch blocked IPs:', error);
      setError('Failed to load blocked IPs');
    } finally {
      setBlockedIPsLoading(false);
    }
  };

  const handleBlockIP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newBlockIP.ipAddress || !newBlockIP.reason) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const token = await getStoredToken();
      if (!token) return;

      const response = await fetch(`${API_URL}/api/admin/blocked-ips`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newBlockIP)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to block IP');
      }

      // Refresh blocked IPs list
      await handleManageBlockedIPs();
      setNewBlockIP({ ipAddress: '', reason: '', severity: 'medium' });
      alert('IP address blocked successfully');
    } catch (error) {
      console.error('Failed to block IP:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to block IP'}`);
    }
  };

  const handleUnblockIP = async (id: string) => {
    if (!confirm('Are you sure you want to unblock this IP?')) return;

    try {
      const token = await getStoredToken();
      if (!token) return;

      const response = await fetch(`${API_URL}/api/admin/blocked-ips/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to unblock IP');
      }

      // Refresh blocked IPs list
      await handleManageBlockedIPs();
      alert('IP address unblocked successfully');
    } catch (error) {
      console.error('Failed to unblock IP:', error);
      alert('Failed to unblock IP');
    }
  };

  const handleSecuritySettings = () => {
    alert('Security settings panel coming soon!');
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#dc2626';
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return (
      <div className="security-container">
        <div className="loading">Loading security metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="security-container">
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className="security-container">
      <div className="security-header">
        <div className="header-left">
          {onBack && (
            <button onClick={onBack} className="back-button">
              ← Back
            </button>
          )}
          <h1>Security Center</h1>
        </div>
        <div className="security-score">
          <div 
            className="security-metric-card"
            style={{ 
              padding: '16px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '180px',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              backgroundColor: getSecurityScoreColor(metrics.securityScore || 0)
            }} />
            
            <div style={{ 
              fontSize: '0.75rem', 
              textTransform: 'uppercase', 
              letterSpacing: '0.05em', 
              color: 'var(--text-secondary, #64748b)', 
              fontWeight: '600',
              marginBottom: '8px',
              marginTop: '4px'
            }}>
              Security Score
            </div>
            
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
              <span style={{ 
                fontSize: '3rem', 
                fontWeight: '800', 
                color: getSecurityScoreColor(metrics.securityScore || 0),
                lineHeight: 1,
                letterSpacing: '-0.02em'
              }}>
                {metrics.securityScore !== undefined && metrics.securityScore !== null ? metrics.securityScore : '--'}
              </span>
              <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: '500' }}>/100</span>
            </div>

            <div style={{ 
              padding: '4px 12px',
              borderRadius: '20px',
              backgroundColor: `${getSecurityScoreColor(metrics.securityScore || 0)}15`,
              color: getSecurityScoreColor(metrics.securityScore || 0),
              fontSize: '0.875rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>Grade</span>
              <span style={{ fontSize: '1.1em' }}>{getSecurityGrade(metrics.securityScore || 0)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="security-metrics-grid">
        <div className="security-metric-card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', marginRight: '12px' }}>
              <Lock size={20} />
            </div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-secondary, #64748b)' }}>Failed Logins (24h)</h3>
          </div>
          <div className="metric-value" style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="value" style={{ fontSize: '2rem', fontWeight: '700', marginRight: '8px' }}>{metrics.failedLogins}</span>
            <span className={`indicator ${metrics.failedLogins > 10 ? 'high' : metrics.failedLogins > 5 ? 'medium' : 'low'}`} style={{ width: '10px', height: '10px', borderRadius: '50%' }}></span>
          </div>
        </div>

        <div className="security-metric-card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', marginRight: '12px' }}>
              <ShieldAlert size={20} />
            </div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-secondary, #64748b)' }}>Suspicious Activity</h3>
          </div>
          <div className="metric-value" style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="value" style={{ fontSize: '2rem', fontWeight: '700', marginRight: '8px' }}>{metrics.suspiciousActivity}</span>
            <span className={`indicator ${metrics.suspiciousActivity > 5 ? 'high' : metrics.suspiciousActivity > 2 ? 'medium' : 'low'}`} style={{ width: '10px', height: '10px', borderRadius: '50%' }}></span>
          </div>
        </div>

        <div className="security-metric-card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', marginRight: '12px' }}>
              <Ban size={20} />
            </div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-secondary, #64748b)' }}>Blocked IPs</h3>
          </div>
          <div className="metric-value" style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="value" style={{ fontSize: '2rem', fontWeight: '700', marginRight: '8px' }}>{metrics.blockedIPs}</span>
          </div>
        </div>

        <div className="security-metric-card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', marginRight: '12px' }}>
              <Globe size={20} />
            </div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-secondary, #64748b)' }}>Active Sessions</h3>
          </div>
          <div className="metric-value" style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="value" style={{ fontSize: '2rem', fontWeight: '700', marginRight: '8px' }}>{metrics.activeSessions}</span>
          </div>
        </div>
      </div>

      {/* Live Server Metrics Chart */}
      <LiveChart className="security-live-chart" />

      {/* Bandwidth Monitor */}
      <BandwidthChart className="security-bandwidth-chart" />

      <div className="security-sections">
        <div className="security-section">
          <h2>Recent Security Threats</h2>
          <div className="threats-container">
            {metrics.recentThreats.length === 0 ? (
              <div className="no-threats">No recent security threats detected</div>
            ) : (
              <div className="threats-list">
                {metrics.recentThreats.map(threat => (
                  <div key={threat.id} className="threat-item">
                    <div className="threat-header">
                      <span className="threat-type">{threat.type}</span>
                      <span 
                        className="threat-severity"
                        style={{ color: getSeverityColor(threat.severity) }}
                      >
                        {threat.severity.toUpperCase()}
                      </span>
                      <span className="threat-status">{threat.status}</span>
                    </div>
                    <div className="threat-description">{threat.description}</div>
                    <div className="threat-meta">
                      <span>Source: {threat.source}</span>
                      <span>{new Date(threat.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="security-section">
          <h2>Security Actions</h2>
          <div className="security-actions">
            <button 
              className="security-btn primary" 
              onClick={handleSecurityScan}
              disabled={scanLoading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Activity size={18} />
              {scanLoading ? 'Scanning...' : 'Run System Scan'}
            </button>
            <button 
              className="security-btn primary" 
              onClick={handleSecurityHeadersScan}
              disabled={scanLoading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Shield size={18} />
              {scanLoading ? 'Scanning...' : 'Security Headers Scan'}
            </button>
            <button className="security-btn secondary" onClick={handleViewAuditLogs} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <FileText size={18} />
              View Audit Logs
            </button>
            <button className="security-btn secondary" onClick={handleManageBlockedIPs} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Ban size={18} />
              Manage Blocked IPs
            </button>
            <button className="security-btn secondary" onClick={handleSecuritySettings} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Settings size={18} />
              Security Settings
            </button>
          </div>
        </div>
      </div>

      {/* Audit Logs Modal */}
      {showAuditLogs && (
        <div className="audit-logs-modal">
          <div className="modal-overlay" onClick={() => setShowAuditLogs(false)}></div>
          <div className="modal-content">
            <div className="modal-header">
              <h2>Audit Logs</h2>
              <button className="close-btn" onClick={() => setShowAuditLogs(false)}>×</button>
            </div>
            <div className="modal-body">
              {auditLogsLoading ? (
                <div className="loading">Loading audit logs...</div>
              ) : auditLogs.length === 0 ? (
                <div className="no-logs">No audit logs found</div>
              ) : (
                <div className="audit-logs-container">
                  <div className="logs-header">
                    <span>Timestamp</span>
                    <span>Action</span>
                    <span>User</span>
                    <span>Status</span>
                    <span>Description</span>
                  </div>
                  <div className="logs-list">
                    {auditLogs.map((log) => (
                      <div key={log._id} className="log-entry">
                        <span className="timestamp">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                        <span className="action">{log.action}</span>
                        <span className="user">{log.performedBy?.username || 'System'}</span>
                        <span className={`status ${log.status.toLowerCase()}`}>
                          {log.status}
                        </span>
                        <span className="description">{log.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Blocked IPs Modal */}
      {showBlockedIPs && (
        <div className="audit-logs-modal">
          <div className="modal-overlay" onClick={() => setShowBlockedIPs(false)}></div>
          <div className="modal-content" style={{ maxWidth: '1000px' }}>
            <div className="modal-header">
              <h2>Manage Blocked IP Addresses</h2>
              <button className="close-btn" onClick={() => setShowBlockedIPs(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem', overflowY: 'auto' }}>
              <form onSubmit={handleBlockIP} style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#1e293b' }}>Block New IP Address</h3>
                
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                    IP Address <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input 
                    type="text"
                    placeholder="e.g., 192.168.1.100"
                    value={newBlockIP.ipAddress}
                    onChange={(e) => setNewBlockIP({ ...newBlockIP, ipAddress: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', fontFamily: 'monospace' }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                    Reason <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input 
                    type="text"
                    placeholder="e.g., Brute force attack"
                    value={newBlockIP.reason}
                    onChange={(e) => setNewBlockIP({ ...newBlockIP, reason: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                    Severity Level
                  </label>
                  <select 
                    value={newBlockIP.severity}
                    onChange={(e) => setNewBlockIP({ ...newBlockIP, severity: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <button 
                  type="submit"
                  style={{ backgroundColor: '#3b82f6', color: 'white', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', fontWeight: '500', cursor: 'pointer' }}
                >
                  Block IP Address
                </button>
              </form>

              {blockedIPsLoading ? (
                <div className="loading">Loading blocked IPs...</div>
              ) : blockedIPs.length === 0 ? (
                <div className="no-logs" style={{ color: '#6b7280', padding: '2rem', textAlign: 'center' }}>No blocked IP addresses</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>IP Address</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Reason</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Severity</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Blocked At</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blockedIPs.map((ip) => (
                        <tr key={ip._id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: '#1f2937' }}>{ip.ipAddress}</td>
                          <td style={{ padding: '0.75rem', color: '#475569' }}>{ip.reason}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{ 
                              padding: '0.25rem 0.75rem', 
                              borderRadius: '4px', 
                              fontSize: '0.875rem',
                              fontWeight: '600',
                              backgroundColor: ip.severity === 'critical' ? '#fee2e2' : ip.severity === 'high' ? '#fecaca' : ip.severity === 'medium' ? '#fef3c7' : '#d1fae5',
                              color: ip.severity === 'critical' ? '#dc2626' : ip.severity === 'high' ? '#ef4444' : ip.severity === 'medium' ? '#d97706' : '#059669'
                            }}>
                              {ip.severity?.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#64748b' }}>
                            {new Date(ip.blockedAt).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <button 
                              onClick={() => handleUnblockIP(ip._id)}
                              style={{ backgroundColor: '#ef4444', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '4px', border: 'none', fontSize: '0.875rem', cursor: 'pointer' }}
                            >
                              Unblock
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Security Scan Results Modal */}
      {showScanResults && scanResults && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          pointerEvents: 'auto',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-secondary, white)',
            color: 'var(--text-primary, #333)',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            zIndex: 1001,
            pointerEvents: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
                {scanResults.scanType || 'Security'} Scan Results
              </h3>
              <button
                onClick={() => setShowScanResults(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: 'var(--text-primary, #333)'
                }}
              >
                ✕
              </button>
            </div>

            {/* Scan Summary */}
            {scanResults.summary && (
              <div style={{
                backgroundColor: 'var(--bg-tertiary, #f5f5f5)',
                padding: '16px',
                borderRadius: '6px',
                marginBottom: '20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '12px'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: '800', color: getScoreColor(scanResults.summary.score) }}>
                    {scanResults.summary.score}%
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary, #666)' }}>Score</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: getScoreColor(scanResults.summary.score) }}>
                    {scanResults.summary.grade}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary, #666)' }}>Grade</div>
                </div>
                {scanResults.summary.headersChecked && (
                  <>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>
                        {scanResults.summary.headersPassed}/{scanResults.summary.headersChecked}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary, #666)' }}>Headers Passed</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ef4444' }}>
                        {scanResults.summary.criticalIssues}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary, #666)' }}>Critical Issues</div>
                    </div>
                  </>
                )}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f59e0b' }}>
                    {scanResults.summary.warnings || 0}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary, #666)' }}>Warnings</div>
                </div>
              </div>
            )}

            {/* Security Headers Details */}
            {scanResults.securityHeaders && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary, #333)' }}>
                  Security Headers Status
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(scanResults.securityHeaders).map(([header, config]) => (
                    <div key={header} style={{
                      backgroundColor: config.status === 'pass' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                      border: `1px solid ${config.status === 'pass' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                      borderRadius: '8px',
                      padding: '12px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {config.status === 'pass' ? <CheckCircle size={14} color="#10b981" /> : <XCircle size={14} color="#ef4444" />}
                          {header}
                        </span>
                        <span style={{
                          fontSize: '12px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          backgroundColor: config.status === 'pass' ? '#22c55e' : '#ef4444',
                          color: 'white'
                        }}>
                          {config.status === 'pass' ? 'PASS' : 'FAIL'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary, #666)', marginBottom: '4px' }}>
                        {config.description}
                      </div>
                      {config.value && (
                        <div style={{ 
                          fontSize: '11px', 
                          fontFamily: 'monospace', 
                          backgroundColor: 'var(--bg-tertiary, #f5f5f5)', 
                          padding: '4px 8px', 
                          borderRadius: '3px',
                          wordBreak: 'break-all'
                        }}>
                          {config.value}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scan Details */}
            {scanResults.findings && scanResults.findings.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary, #333)' }}>
                  Detailed Findings
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                  {scanResults.findings.map((finding, index) => (
                    <div key={index} style={{
                      backgroundColor: finding.severity === 'high' ? 'rgba(239, 68, 68, 0.05)' : 
                                     finding.severity === 'medium' ? 'rgba(245, 158, 11, 0.05)' : 'rgba(16, 185, 129, 0.05)',
                      border: `1px solid ${
                        finding.severity === 'high' ? 'rgba(239, 68, 68, 0.2)' : 
                        finding.severity === 'medium' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'
                      }`,
                      borderRadius: '8px',
                      padding: '12px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {finding.severity === 'high' ? <AlertTriangle size={14} color="#ef4444" /> : <Shield size={14} />}
                          {finding.title}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '12px',
                          backgroundColor: finding.severity === 'high' ? '#ef4444' : 
                                         finding.severity === 'medium' ? '#f59e0b' : '#10b981',
                          color: 'white'
                        }}>
                          {finding.severity.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary, #666)', marginBottom: '4px' }}>
                        {finding.description}
                      </div>
                      {finding.recommendation && (
                        <div style={{ fontSize: '11px', fontStyle: 'italic', color: 'var(--text-primary, #333)' }}>
                          💡 {finding.recommendation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {scanResults.recommendations && scanResults.recommendations.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary, #333)' }}>
                  Recommendations
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {scanResults.recommendations.map((rec, index) => (
                    <div key={index} style={{
                      backgroundColor: 'var(--bg-tertiary, #f5f5f5)',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      padding: '12px'
                    }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                        {rec.action}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary, #666)' }}>
                        {rec.details}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scan Metadata */}
            <div style={{
              fontSize: '12px',
              color: 'var(--text-secondary, #666)',
              textAlign: 'center',
              paddingTop: '12px',
              borderTop: '1px solid #e5e7eb'
            }}>
              Scan completed at {new Date(scanResults.timestamp).toLocaleString()}
              {scanResults.serverUrl && ` • Server: ${scanResults.serverUrl}`}
            </div>

            {/* Close Button */}
            <button
              onClick={() => setShowScanResults(false)}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: 'var(--accent-color, #3b82f6)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Security;
