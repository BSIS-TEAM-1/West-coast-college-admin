import React, { useState, useEffect } from 'react';
import { getStoredToken, API_URL } from '../lib/authApi';
import { Shield, AlertTriangle, CheckCircle, XCircle, Lock, Activity, FileText, Settings, Ban, Globe, ShieldAlert } from 'lucide-react';
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
  const [systemScanLoading, setSystemScanLoading] = useState(false);
  const [headersScanLoading, setHeadersScanLoading] = useState(false);
  const [activeScanTab, setActiveScanTab] = useState<'findings' | 'recommendations' | 'headers'>('findings');

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

      setSystemScanLoading(true);

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
            securityScore: results.summary.score,
            lastSecurityScan: new Date().toISOString()
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
      setSystemScanLoading(false);
    }
  };

  const handleSecurityHeadersScan = async () => {
    try {
      const token = await getStoredToken();
      if (!token) return;

      setHeadersScanLoading(true);

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
      setHeadersScanLoading(false);
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

      
      
      <div className="security-sections">
        <div className="security-section">
          <h2>Recent Security Threats</h2>
          <div className="threats-container">
            {metrics.recentThreats.length === 0 ? (
              <div className="no-threats" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: '#94a3b8', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                <Shield size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p style={{ margin: 0, fontWeight: 500 }}>No recent security threats detected</p>
                <span style={{ fontSize: '0.875rem', opacity: 0.8, marginTop: '0.5rem' }}>Your system is currently secure</span>
              </div>
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
          <div className="security-actions-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            <div 
              className="action-card" 
              onClick={!systemScanLoading ? handleSecurityScan : undefined}
              style={{ 
                backgroundColor: 'var(--bg-secondary, #fff)', 
                padding: '24px', 
                borderRadius: '12px', 
                border: '1px solid var(--border-color, #e2e8f0)',
                cursor: systemScanLoading ? 'wait' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }}
            >
              <div style={{ 
                padding: '12px', 
                borderRadius: '50%', 
                backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                color: '#3b82f6', 
                marginBottom: '16px' 
              }}>
                <Activity size={24} className={systemScanLoading ? "spin" : ""} />
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', fontWeight: 600 }}>System Scan</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', lineHeight: 1.4 }}>
                {systemScanLoading ? 'Scanning system...' : 'Run full system diagnostic'}
              </p>
            </div>

            <div 
              className="action-card" 
              onClick={!headersScanLoading ? handleSecurityHeadersScan : undefined}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }}
            >
              <div>
                <Shield size={24} className={headersScanLoading ? "spin" : ""} />
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', fontWeight: 600 }}>Headers Scan</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', lineHeight: 1.4 }}>
                {headersScanLoading ? 'Checking headers...' : 'Verify security headers'}
              </p>
            </div>

            <div 
              className="action-card" 
              onClick={handleViewAuditLogs}
              style={{ 
                backgroundColor: 'var(--bg-secondary, #fff)', 
                padding: '24px', 
                borderRadius: '12px', 
                border: '1px solid var(--border-color, #e2e8f0)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }}
            >
              <div style={{ 
                padding: '12px', 
                borderRadius: '50%', 
                backgroundColor: 'rgba(245, 158, 11, 0.1)', 
                color: '#f59e0b', 
                marginBottom: '16px' 
              }}>
                <FileText size={24} />
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', fontWeight: 600 }}>Audit Logs</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', lineHeight: 1.4 }}>Review system activity logs</p>
            </div>

            <div 
              className="action-card" 
              onClick={handleManageBlockedIPs}
              style={{ 
                backgroundColor: 'var(--bg-secondary, #fff)', 
                padding: '24px', 
                borderRadius: '12px', 
                border: '1px solid var(--border-color, #e2e8f0)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }}
            >
              <div style={{ 
                padding: '12px', 
                borderRadius: '50%', 
                backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                color: '#ef4444', 
                marginBottom: '16px' 
              }}>
                <Ban size={24} />
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', fontWeight: 600 }}>Blocked IPs</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', lineHeight: 1.4 }}>Manage blocked addresses</p>
            </div>

            <div 
              className="action-card" 
              onClick={handleSecuritySettings}
              style={{ 
                backgroundColor: 'var(--bg-secondary, #fff)', 
                padding: '24px', 
                borderRadius: '12px', 
                border: '1px solid var(--border-color, #e2e8f0)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }}
            >
              <div style={{ 
                padding: '12px', 
                borderRadius: '50%', 
                backgroundColor: 'rgba(107, 114, 128, 0.1)', 
                color: '#6b7280', 
                marginBottom: '16px' 
              }}>
                <Settings size={24} />
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', fontWeight: 600 }}>Settings</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', lineHeight: 1.4 }}>Configure security preferences</p>
            </div>
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(8px)', fontFamily: "'Inter', sans-serif" }}>
          <div style={{ backgroundColor: '#0f172a', color: '#e2e8f0', borderRadius: '16px', width: '90%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid #334155', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderBottom: '1px solid #334155', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Shield size={24} style={{ color: '#3b82f6' }} />
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{scanResults.scanType || 'Security'} Scan Report</h3>
              </div>
              <button onClick={() => setShowScanResults(false)} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#334155'; e.currentTarget.style.color = '#e2e8f0'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#1e293b'; e.currentTarget.style.color = '#94a3b8'; }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
              {scanResults.summary && (
                <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '2rem', padding: '1.5rem', backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="120" height="120" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="54" fill="none" stroke="#334155" strokeWidth="12" />
                      <circle cx="60" cy="60" r="54" fill="none" stroke={getScoreColor(scanResults.summary.score)} strokeWidth="12" strokeLinecap="round" strokeDasharray={2 * Math.PI * 54} strokeDashoffset={(2 * Math.PI * 54) - (scanResults.summary.score / 100) * (2 * Math.PI * 54)} transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset 0.5s ease-out' }} />
                      <text x="50%" y="50%" textAnchor="middle" dy=".3em" style={{ fontSize: '2rem', fontWeight: 'bold', fill: getScoreColor(scanResults.summary.score) }}>{scanResults.summary.grade}</text>
                    </svg>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>Score: {scanResults.summary.score}/100</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>{scanResults.summary.criticalIssues}</div><div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Critical Issues</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>{scanResults.summary.warnings || 0}</div><div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Warnings</div></div>
                    {scanResults.summary.headersChecked != null && <div style={{ textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>{scanResults.summary.headersPassed}/{scanResults.summary.headersChecked}</div><div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Headers Passed</div></div>}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', borderBottom: '1px solid #334155', marginBottom: '1.5rem' }}>
                {scanResults.findings && <button onClick={() => setActiveScanTab('findings')} style={{ padding: '0.75rem 1rem', border: 'none', background: 'none', color: activeScanTab === 'findings' ? '#3b82f6' : '#94a3b8', fontWeight: 600, cursor: 'pointer', borderBottom: activeScanTab === 'findings' ? '2px solid #3b82f6' : '2px solid transparent', marginBottom: '-1px', transition: 'all 0.2s' }}>Findings ({scanResults.findings.length})</button>}
                {scanResults.recommendations && <button onClick={() => setActiveScanTab('recommendations')} style={{ padding: '0.75rem 1rem', border: 'none', background: 'none', color: activeScanTab === 'recommendations' ? '#3b82f6' : '#94a3b8', fontWeight: 600, cursor: 'pointer', borderBottom: activeScanTab === 'recommendations' ? '2px solid #3b82f6' : '2px solid transparent', marginBottom: '-1px', transition: 'all 0.2s' }}>Recommendations ({scanResults.recommendations.length})</button>}
                {scanResults.securityHeaders && <button onClick={() => setActiveScanTab('headers')} style={{ padding: '0.75rem 1rem', border: 'none', background: 'none', color: activeScanTab === 'headers' ? '#3b82f6' : '#94a3b8', fontWeight: 600, cursor: 'pointer', borderBottom: activeScanTab === 'headers' ? '2px solid #3b82f6' : '2px solid transparent', marginBottom: '-1px', transition: 'all 0.2s' }}>Headers ({Object.keys(scanResults.securityHeaders).length})</button>}
              </div>

              <div>
                {activeScanTab === 'findings' && scanResults.findings && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {scanResults.findings.length > 0 ? scanResults.findings.map((finding, index) => (
                      <div key={index} style={{ background: '#1e293b', borderLeft: `4px solid ${getSeverityColor(finding.severity)}`, borderRadius: '4px', padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: '600', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {finding.severity === 'critical' || finding.severity === 'high' ? <AlertTriangle size={16} color={getSeverityColor(finding.severity)} /> : <ShieldAlert size={16} color={getSeverityColor(finding.severity)} />}
                            {finding.title}
                          </span>
                          <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', borderRadius: '12px', backgroundColor: getSeverityColor(finding.severity), color: 'white', fontWeight: 'bold' }}>{finding.severity.toUpperCase()}</span>
                        </div>
                        <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0 0 0.5rem 0' }}>{finding.description}</p>
                        {finding.recommendation && <div style={{ fontSize: '0.875rem', color: '#cbd5e1', background: '#334155', padding: '0.5rem', borderRadius: '4px', fontStyle: 'italic' }}>💡 Recommendation: {finding.recommendation}</div>}
                      </div>
                    )) : <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>No findings detected.</div>}
                  </div>
                )}
                {activeScanTab === 'recommendations' && scanResults.recommendations && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {scanResults.recommendations.length > 0 ? scanResults.recommendations.map((rec, index) => (
                      <div key={index} style={{ background: '#1e293b', borderLeft: `4px solid ${rec.priority === 'high' ? '#ef4444' : rec.priority === 'medium' ? '#f59e0b' : '#3b82f6'}`, borderRadius: '4px', padding: '1rem' }}>
                        <div style={{ fontWeight: '600', fontSize: '1rem', marginBottom: '0.25rem' }}>{rec.action}</div>
                        <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{rec.details}</div>
                      </div>
                    )) : <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>No recommendations.</div>}
                  </div>
                )}
                {activeScanTab === 'headers' && scanResults.securityHeaders && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {Object.entries(scanResults.securityHeaders).map(([header, config]) => (
                      <div key={header} style={{ background: '#1e293b', borderLeft: `4px solid ${config.status === 'pass' ? '#10b981' : '#ef4444'}`, borderRadius: '4px', padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '600', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {config.status === 'pass' ? <CheckCircle size={16} color="#10b981" /> : <XCircle size={16} color="#ef4444" />}
                            {header}
                          </span>
                          <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: config.status === 'pass' ? '#10b981' : '#ef4444', color: 'white' }}>{config.status.toUpperCase()}</span>
                        </div>
                        {config.value && <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#94a3b8', background: '#0f172a', padding: '0.25rem 0.5rem', borderRadius: '4px', wordBreak: 'break-all', marginTop: '0.5rem' }}>{config.value}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Scan completed at {new Date(scanResults.timestamp).toLocaleString()}</div>
              <button onClick={() => setShowScanResults(false)} style={{ padding: '0.5rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}>Close Report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Security;
