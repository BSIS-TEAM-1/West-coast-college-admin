import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle,
  ChevronRight,
  FileText,
  Globe,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { getStoredToken, API_URL } from '../lib/authApi';
import './Security.css';

interface SecurityMetrics {
  failedLogins: number;
  suspiciousActivity: number;
  blockedIPs: number;
  activeSessions: number;
  lastSecurityScan: string;
  lastHeaderScan: string | null;
  securityScore: number;
  headerScore: number | null;
  headersPassed: number;
  headersChecked: number;
  headerGrade: string | null;
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
  scanId: string;
  timestamp: string;
  duration: number;
  status: string;
  findings: SecurityFinding[];
  recommendations: SecurityRecommendation[];
  summary: {
    score: number;
    grade: string;
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    criticalIssues: number;
    warnings: number;
    headersChecked?: number;
    headersPassed?: number;
  };
  score: number;
  grade: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  criticalIssues: number;
  warnings: number;
  headersChecked?: number;
  headersPassed?: number;
  scanType?: string;
  success?: boolean;
  securityHeaders?: Record<string, SecurityHeaderConfig>;
  serverUrl?: string;
  error?: string;
}

interface BlockedIPRecord {
  _id: string;
  ipAddress: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  blockedAt: string;
  expiresAt?: string;
  attemptCount?: number;
  isExpired?: boolean;
}

interface BlockedIpAuditRecord {
  _id: string;
  action: 'BLOCK_IP' | 'UNBLOCK_IP';
  resourceName?: string;
  description: string;
  status: string;
  createdAt: string;
  performedBy?: {
    username?: string;
    displayName?: string;
  };
}

type Tone = 'success' | 'warning' | 'critical' | 'info' | 'neutral';

const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

const normalizeIpv4Input = (value: string): string => {
  return value.trim().replace(/[.,;]+$/, '');
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const formatDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : dateTimeFormatter.format(parsed);
};

const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : dateFormatter.format(parsed);
};

const formatRelative = (value?: string | null): string => {
  if (!value) return 'Never';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Never';

  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 60_000) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return dateFormatter.format(parsed);
};

// Treats the API's 'N/A' placeholder as "never".
const formatScanTime = (value?: string | null): string => {
  if (!value || value === 'N/A') return 'Never';
  return formatRelative(value);
};

const getSecurityGrade = (score: number): string => {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
};

const getScoreTone = (score: number): Tone => {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'critical';
};

const getScoreSummary = (score: number): string => {
  if (score >= 90) return 'Strong posture. No action required.';
  if (score >= 80) return 'Healthy, with light hardening left.';
  if (score >= 70) return 'A few findings need attention.';
  if (score >= 60) return 'Several issues should be addressed.';
  return 'Critical findings need immediate review.';
};

const getSeverityTone = (severity: string): Tone => {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'critical';
    case 'medium':
      return 'warning';
    case 'low':
      return 'info';
    default:
      return 'neutral';
  }
};

const getThreatStatusTone = (status: string): Tone => {
  switch (status) {
    case 'active':
      return 'critical';
    case 'investigating':
      return 'warning';
    case 'resolved':
      return 'success';
    default:
      return 'neutral';
  }
};

const getAuditStatusTone = (status?: string): Tone => {
  switch (String(status || '').toUpperCase()) {
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
    case 'BLOCKED':
      return 'critical';
    case 'WARNING':
      return 'warning';
    default:
      return 'neutral';
  }
};

const getFindingSeverityLabel = (severity: string): string => {
  switch (severity) {
    case 'critical': return 'CRITICAL';
    case 'high': return 'HIGH';
    case 'medium': return 'ATTENTION';
    case 'low': return 'ADVISORY';
    default: return String(severity || 'INFO').toUpperCase();
  }
};

const getPriorityTone = (priority: string): Tone => {
  switch (priority) {
    case 'high':
      return 'critical';
    case 'medium':
      return 'warning';
    default:
      return 'info';
  }
};

const SCORE_RING_RADIUS = 52;
const SCORE_RING_CIRCUMFERENCE = 2 * Math.PI * SCORE_RING_RADIUS;

const Security: React.FC<SecurityProps> = ({ onBack }) => {
  const [metrics, setMetrics] = useState<SecurityMetrics>({
    failedLogins: 0,
    suspiciousActivity: 0,
    blockedIPs: 0,
    activeSessions: 0,
    lastSecurityScan: 'N/A',
    lastHeaderScan: null,
    securityScore: 0,
    headerScore: null,
    headersPassed: 0,
    headersChecked: 0,
    headerGrade: null,
    recentThreats: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [showBlockedIPs, setShowBlockedIPs] = useState(false);
  const [blockedIPs, setBlockedIPs] = useState<BlockedIPRecord[]>([]);
  const [blockedIPsLoading, setBlockedIPsLoading] = useState(false);
  const [blockedIpAuditLogs, setBlockedIpAuditLogs] = useState<BlockedIpAuditRecord[]>([]);
  const [blockedIpAuditLoading, setBlockedIpAuditLoading] = useState(false);
  const [blockedFilter, setBlockedFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [blockedTab, setBlockedTab] = useState<'addresses' | 'history'>('addresses');
  const [newBlockIP, setNewBlockIP] = useState({ ipAddress: '', reason: '', severity: 'medium' });
  const [unblockIpAddress, setUnblockIpAddress] = useState('');
  const [unblockingIpId, setUnblockingIpId] = useState<string | null>(null);
  const [blockingIpLoading, setBlockingIpLoading] = useState(false);
  const [unblockByIpLoading, setUnblockByIpLoading] = useState(false);
  const [showScanResults, setShowScanResults] = useState(false);
  const [scanResults, setScanResults] = useState<SecurityScanResults | null>(null);
  const [systemScanLoading, setSystemScanLoading] = useState(false);
  const [headersScanLoading, setHeadersScanLoading] = useState(false);
  const [activeScanTab, setActiveScanTab] = useState<'findings' | 'recommendations' | 'headers'>('findings');
  const metricsInFlightRef = useRef(false);

  useEffect(() => {
    fetchSecurityMetrics();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchSecurityMetrics();
      }
    }, 60000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSecurityMetrics();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Close the top-most dialog with Escape.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showScanResults) {
        setShowScanResults(false);
      } else if (showBlockedIPs) {
        setShowBlockedIPs(false);
      } else if (showAuditLogs) {
        setShowAuditLogs(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showScanResults, showBlockedIPs, showAuditLogs]);

  const fetchSecurityMetrics = async () => {
    if (metricsInFlightRef.current) return;
    metricsInFlightRef.current = true;
    try {
      const token = await getStoredToken();

      if (!token) {
        setError('Authentication required');
        setLoading(false);
        return;
      }

      // First fetch the security metrics
      const metricsResponse = await fetch(`${API_URL}/api/admin/security-metrics`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!metricsResponse.ok) {
        throw new Error('Failed to fetch security metrics');
      }

      const data = await metricsResponse.json();

      // Ensure securityScore is a valid number
      if (data.securityScore === undefined || data.securityScore === null || isNaN(data.securityScore)) {
        data.securityScore = 0;
      } else {
        // Convert to number and round to nearest integer
        data.securityScore = Math.round(Number(data.securityScore));
      }

      setMetrics(prev => ({
        ...prev,
        ...data,
        // Only update the score if we got a valid one
        securityScore: data.securityScore !== undefined ? data.securityScore : prev.securityScore,
        lastSecurityScan: data.lastSecurityScan || prev.lastSecurityScan
      }));

      setError(null);
    } catch (err) {
      console.error('Failed to fetch security metrics:', err);
      setError('Network error while fetching security metrics');
    } finally {
      metricsInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleSecurityScan = async () => {
    try {
      const token = await getStoredToken();
      if (!token) {
        console.error('No authentication token found');
        return;
      }

      setSystemScanLoading(true);

      const response = await fetch(`${API_URL}/api/admin/security-scan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Scan failed with status:', response.status, 'Response:', errorText);
        throw new Error(`Scan failed with status ${response.status}`);
      }

      const responseData = await response.json();

      if (!responseData) {
        throw new Error('Empty response from server');
      }

      // Ensure we have a valid summary object
      const summary = responseData.summary || {};
      const filteredFindings = Array.isArray(responseData.findings)
        ? responseData.findings.filter((finding: SecurityFinding) =>
            String(finding?.title || '').toLowerCase() !== 'active ip blocks'
          )
        : [];
      const mediumFindings = filteredFindings.filter((finding: SecurityFinding) => finding.severity === 'medium').length;
      const score = typeof summary.score === 'number' ? summary.score : 0;
      const timestamp = responseData.timestamp || new Date().toISOString();

      // Transform the results to match our interface
      const formattedResults: SecurityScanResults = {
        scanId: responseData.scanId || `scan-${Date.now()}`,
        timestamp: timestamp,
        duration: responseData.duration || 0,
        status: responseData.status || 'completed',
        findings: filteredFindings,
        recommendations: responseData.recommendations || [],
        summary: {
          score: score,
          grade: summary.grade || getSecurityGrade(score),
          total: summary.total || 0,
          critical: summary.critical || 0,
          high: summary.high || 0,
          medium: summary.medium || 0,
          low: summary.low || 0,
          info: summary.info || 0,
          criticalIssues: summary.criticalIssues || 0,
          warnings: mediumFindings,
          headersChecked: summary.headersChecked || 0,
          headersPassed: summary.headersPassed || 0
        },
        scanType: responseData.scanType || 'System',
        success: responseData.success !== false, // default to true if not specified
        securityHeaders: responseData.securityHeaders,
        serverUrl: responseData.serverUrl,
        // Add direct properties for backward compatibility
        score: score,
        grade: summary.grade || getSecurityGrade(score),
        total: summary.total || 0,
        critical: summary.critical || 0,
        high: summary.high || 0,
        medium: summary.medium || 0,
        low: summary.low || 0,
        info: summary.info || 0,
        criticalIssues: summary.criticalIssues || 0,
        warnings: mediumFindings
      };

      // Update the scan results state
      setScanResults(formattedResults);
      setActiveScanTab('findings');
      setShowScanResults(true);

      // Also update the metrics with the scan results
      setMetrics(prev => ({
        ...prev,
        securityScore: score,
        lastSecurityScan: timestamp
      }));

      // Force a refresh of the metrics to ensure consistency
      await fetchSecurityMetrics();

    } catch (error) {
      console.error('System scan failed:', error);
      alert(`Scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        setActiveScanTab('headers');
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
    setBlockedTab('addresses');
    setBlockedIPsLoading(true);
    setBlockedIpAuditLoading(true);

    try {
      const token = await getStoredToken();
      if (!token) {
        setError('Authentication required');
        return;
      }

      const blockedIpsResponse = await fetch(`${API_URL}/api/admin/blocked-ips`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!blockedIpsResponse.ok) {
        throw new Error('Failed to fetch blocked IPs');
      }

      const data = await blockedIpsResponse.json();
      setBlockedIPs(data || []);

      const blockedAuditResponse = await fetch(
        `${API_URL}/api/admin/blocked-ips/logs?limit=200`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!blockedAuditResponse.ok) {
        console.error('Failed to fetch blocked IP audit logs');
        setBlockedIpAuditLogs([]);
      } else {
        const blockedAuditData = await blockedAuditResponse.json();
        const logs = Array.isArray(blockedAuditData.logs) ? blockedAuditData.logs : [];
        setBlockedIpAuditLogs(logs);
      }
    } catch (error) {
      console.error('Failed to fetch blocked IPs:', error);
      setError('Failed to load blocked IPs');
      setBlockedIpAuditLogs([]);
    } finally {
      setBlockedIPsLoading(false);
      setBlockedIpAuditLoading(false);
    }
  };

  const handleBlockIP = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedIpAddress = normalizeIpv4Input(newBlockIP.ipAddress);

    if (!normalizedIpAddress || !newBlockIP.reason) {
      alert('Please fill in all required fields');
      return;
    }

    if (!IPV4_REGEX.test(normalizedIpAddress)) {
      alert('Please enter a valid IPv4 address');
      return;
    }

    try {
      setBlockingIpLoading(true);
      const token = await getStoredToken();
      if (!token) return;

      const response = await fetch(`${API_URL}/api/admin/blocked-ips`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...newBlockIP,
          ipAddress: normalizedIpAddress
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to block IP');
      }

      const data = await response.json().catch(() => ({} as { revokedSessions?: number }));

      // Refresh blocked IPs list
      await handleManageBlockedIPs();
      setNewBlockIP({ ipAddress: '', reason: '', severity: 'medium' });
      const revokedSessions = Number(data?.revokedSessions || 0);
      alert(
        revokedSessions > 0
          ? `IP address blocked successfully. ${revokedSessions} active session(s) were logged out.`
          : 'IP address blocked successfully'
      );
    } catch (error) {
      console.error('Failed to block IP:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to block IP'}`);
    } finally {
      setBlockingIpLoading(false);
    }
  };

  const handleUnblockIP = async (id: string, ipAddress?: string) => {
    if (!confirm('Are you sure you want to unblock this IP?')) return;

    try {
      setUnblockingIpId(id);
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
      if (ipAddress && normalizeIpv4Input(unblockIpAddress) === ipAddress) {
        setUnblockIpAddress('');
      }
      alert('IP address unblocked successfully');
    } catch (error) {
      console.error('Failed to unblock IP:', error);
      alert('Failed to unblock IP');
    } finally {
      setUnblockingIpId(null);
    }
  };

  const handleUnblockByIp = async () => {
    const candidate = normalizeIpv4Input(unblockIpAddress);
    if (!candidate) {
      alert('Enter an IP address to unblock');
      return;
    }

    if (!IPV4_REGEX.test(candidate)) {
      alert('Please enter a valid IPv4 address');
      return;
    }

    try {
      setUnblockByIpLoading(true);
      const token = await getStoredToken();
      if (!token) return;

      const response = await fetch(`${API_URL}/api/admin/blocked-ips/by-ip/${encodeURIComponent(candidate)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({} as { error?: string }));
        throw new Error(data?.error || 'Failed to unblock IP');
      }

      await handleManageBlockedIPs();
      setUnblockIpAddress('');
      alert('IP address unblocked successfully');
    } catch (error) {
      console.error('Failed to unblock IP by address:', error);
      alert(error instanceof Error ? error.message : 'Failed to unblock IP');
    } finally {
      setUnblockByIpLoading(false);
    }
  };

  const securityScore = Math.round(Number(metrics.securityScore) || 0);
  const securityTone = getScoreTone(securityScore);
  const headerCoverage = metrics.headersChecked > 0
    ? Math.round(((metrics.headersPassed || 0) / metrics.headersChecked) * 100)
    : 0;
  const headerTone: Tone = headerCoverage >= 90 ? 'success' : headerCoverage >= 70 ? 'warning' : 'critical';
  const failedLoginTone: Tone = metrics.failedLogins > 10 ? 'critical' : metrics.failedLogins > 5 ? 'warning' : 'neutral';
  const suspiciousTone: Tone = metrics.suspiciousActivity > 5 ? 'critical' : metrics.suspiciousActivity > 2 ? 'warning' : 'neutral';
  const activeBlockCount = blockedIPs.filter(ip => !ip.isExpired).length;
  const expiredBlockCount = blockedIPs.length - activeBlockCount;
  const visibleBlockedIPs = blockedIPs.filter(ip => {
    if (blockedFilter === 'active') return !ip.isExpired;
    if (blockedFilter === 'expired') return Boolean(ip.isExpired);
    return true;
  });

  if (loading) {
    return (
      <div className="secure-shield">
        <div className="ss-loading" role="status" aria-live="polite">
          <span className="ss-spinner" aria-hidden="true" />
          <p>Loading security posture…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="secure-shield">
      <header className="ss-header">
        <div className="ss-header__copy">
          {onBack && (
            <button type="button" className="ss-back" onClick={onBack}>
              <ArrowLeft size={16} aria-hidden="true" />
              System health
            </button>
          )}
          <span className="ss-eyebrow">Security operations</span>
          <h1 className="ss-title">WCC SecureShield</h1>
          <p className="ss-subtitle">
            Sign-in activity, live threats, and network blocks for the West Coast College admin portal.
          </p>
        </div>
        <div className="ss-header__actions">
          <button
            type="button"
            className="ss-btn"
            onClick={handleSecurityHeadersScan}
            disabled={headersScanLoading}
          >
            <ShieldCheck size={16} aria-hidden="true" />
            {headersScanLoading ? 'Checking headers…' : 'Check headers'}
          </button>
          <button
            type="button"
            className="ss-btn ss-btn--solid"
            onClick={handleSecurityScan}
            disabled={systemScanLoading}
          >
            <RefreshCw size={16} className={systemScanLoading ? 'ss-spin' : undefined} aria-hidden="true" />
            {systemScanLoading ? 'Running scan…' : 'Run system scan'}
          </button>
        </div>
      </header>

      {error && (
        <div className="ss-alert" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <p>{error}</p>
          <button
            type="button"
            className="ss-back"
            onClick={() => {
              setLoading(true);
              fetchSecurityMetrics();
            }}
          >
            Retry
          </button>
        </div>
      )}

      <section className="ss-posture" aria-label="Security posture">
        <div className="ss-score">
          <div className={`ss-score__dial ss-tone--${securityTone}`}>
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle className="ss-score__track" cx="60" cy="60" r={SCORE_RING_RADIUS} />
              <circle
                className="ss-score__value"
                cx="60"
                cy="60"
                r={SCORE_RING_RADIUS}
                strokeDasharray={SCORE_RING_CIRCUMFERENCE}
                strokeDashoffset={SCORE_RING_CIRCUMFERENCE - (securityScore / 100) * SCORE_RING_CIRCUMFERENCE}
              />
            </svg>
            <div className="ss-score__center">
              <strong>{securityScore}</strong>
              <span>/100</span>
            </div>
          </div>
          <div className="ss-score__meta">
            <span className="ss-score__kicker"><Shield size={14} aria-hidden="true" /> Security score</span>
            <span className={`ss-grade ss-tone--${securityTone}`}>Grade {getSecurityGrade(securityScore)}</span>
            <p className="ss-score__note">{getScoreSummary(securityScore)}</p>
            <p className="ss-score__time">Last system scan {formatScanTime(metrics.lastSecurityScan)}</p>
          </div>
        </div>

        <dl className="ss-stats">
          <div className="ss-stat">
            <dt><Lock size={15} aria-hidden="true" /> Failed logins <span>24h</span></dt>
            <dd className={`ss-tone--${failedLoginTone}`}>{metrics.failedLogins}</dd>
          </div>
          <div className="ss-stat">
            <dt><ShieldAlert size={15} aria-hidden="true" /> Suspicious activity <span>24h</span></dt>
            <dd className={`ss-tone--${suspiciousTone}`}>{metrics.suspiciousActivity}</dd>
          </div>
          <div className="ss-stat">
            <dt><Ban size={15} aria-hidden="true" /> Blocked addresses</dt>
            <dd>{metrics.blockedIPs}</dd>
          </div>
          <div className="ss-stat">
            <dt><Globe size={15} aria-hidden="true" /> Active sessions <span>1h</span></dt>
            <dd>{metrics.activeSessions}</dd>
          </div>
        </dl>

        <div className="ss-coverage">
          <div className="ss-coverage__head">
            <span><ShieldCheck size={15} aria-hidden="true" /> HTTP security headers</span>
            <span>
              {metrics.headersChecked > 0
                ? `${metrics.headersPassed || 0} of ${metrics.headersChecked} passing · ${headerCoverage}%`
                : 'Not scanned yet'}
            </span>
          </div>
          <div className="ss-coverage__track" role="presentation">
            <span className={`ss-tone--${headerTone}`} style={{ width: `${headerCoverage}%` }} />
          </div>
          <p className="ss-coverage__note">
            Last header scan {formatScanTime(metrics.lastHeaderScan)}
          </p>
        </div>
      </section>

      <div className="ss-workspace">
        <section className="ss-panel ss-panel--activity">
          <header className="ss-panel__head">
            <div>
              <h2>Recent security activity</h2>
              <p>High and medium severity events from the last 24 hours.</p>
            </div>
            <span className="ss-count">{metrics.recentThreats.length} events</span>
          </header>
          {metrics.recentThreats.length === 0 ? (
            <div className="ss-empty">
              <ShieldCheck size={32} aria-hidden="true" />
              <strong>No security events in the last 24 hours</strong>
              <span>Failed sign-ins, breaches, and lockouts will appear here.</span>
            </div>
          ) : (
            <ul className="ss-events">
              {metrics.recentThreats.map((threat) => {
                const severityTone = getSeverityTone(threat.severity);
                return (
                  <li key={threat.id} className="ss-event">
                    <span className={`ss-event__marker ss-tone--${severityTone}`} aria-hidden="true" />
                    <div className="ss-event__body">
                      <div className="ss-event__top">
                        <span className="ss-event__type">{threat.type}</span>
                        <span className={`ss-pill ss-pill--${severityTone}`}>{threat.severity.toUpperCase()}</span>
                        <span className={`ss-status ss-status--${getThreatStatusTone(threat.status)}`}>
                          {threat.status}
                        </span>
                      </div>
                      <p className="ss-event__desc">{threat.description}</p>
                      <div className="ss-event__meta">
                        <span>Source: {threat.source}</span>
                        <span>{formatDateTime(threat.timestamp)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="ss-panel ss-panel--tools" aria-label="Security tools">
          <header className="ss-panel__head">
            <div>
              <h2>Security tools</h2>
              <p>Diagnostics and records.</p>
            </div>
          </header>
          <ul className="ss-tools">
            <li>
              <button
                type="button"
                className="ss-tool"
                onClick={handleSecurityScan}
                disabled={systemScanLoading}
              >
                <span className="ss-tool__icon"><Activity size={18} aria-hidden="true" /></span>
                <span className="ss-tool__copy">
                  <strong>{systemScanLoading ? 'Running system scan…' : 'System scan'}</strong>
                  <small>Full diagnostic · last run {formatScanTime(metrics.lastSecurityScan)}</small>
                </span>
                <ChevronRight size={16} className="ss-tool__chevron" aria-hidden="true" />
              </button>
            </li>
            <li>
              <button
                type="button"
                className="ss-tool"
                onClick={handleSecurityHeadersScan}
                disabled={headersScanLoading}
              >
                <span className="ss-tool__icon"><ShieldCheck size={18} aria-hidden="true" /></span>
                <span className="ss-tool__copy">
                  <strong>{headersScanLoading ? 'Checking headers…' : 'Security headers'}</strong>
                  <small>
                    {metrics.headersChecked > 0
                      ? `${metrics.headersPassed || 0} of ${metrics.headersChecked} passing`
                      : 'Verify HTTP response headers'}
                  </small>
                </span>
                <ChevronRight size={16} className="ss-tool__chevron" aria-hidden="true" />
              </button>
            </li>
            <li>
              <button type="button" className="ss-tool" onClick={handleViewAuditLogs}>
                <span className="ss-tool__icon"><FileText size={18} aria-hidden="true" /></span>
                <span className="ss-tool__copy">
                  <strong>Audit logs</strong>
                  <small>Authentication and admin activity</small>
                </span>
                <ChevronRight size={16} className="ss-tool__chevron" aria-hidden="true" />
              </button>
            </li>
            <li>
              <button type="button" className="ss-tool" onClick={handleManageBlockedIPs}>
                <span className="ss-tool__icon"><Ban size={18} aria-hidden="true" /></span>
                <span className="ss-tool__copy">
                  <strong>Blocked addresses</strong>
                  <small>
                    {metrics.blockedIPs === 0
                      ? 'No addresses blocked'
                      : `${metrics.blockedIPs} address${metrics.blockedIPs === 1 ? '' : 'es'} blocked`}
                  </small>
                </span>
                <ChevronRight size={16} className="ss-tool__chevron" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>
      </div>

      {/* Audit Logs Dialog */}
      {showAuditLogs && (
        <div className="ss-modal">
          <div className="ss-modal__overlay" onClick={() => setShowAuditLogs(false)} />
          <div className="ss-dialog" role="dialog" aria-modal="true" aria-labelledby="ss-audit-title">
            <header className="ss-dialog__header">
              <div>
                <h2 id="ss-audit-title">Audit logs</h2>
                <p>Most recent administrative and security events.</p>
              </div>
              <button
                type="button"
                className="ss-dialog__close"
                onClick={() => setShowAuditLogs(false)}
                aria-label="Close audit logs"
                autoFocus
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="ss-dialog__body">
              {auditLogsLoading ? (
                <div className="ss-table-state" role="status">
                  <span className="ss-spinner" aria-hidden="true" />
                  Loading audit logs…
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="ss-empty">
                  <FileText size={28} aria-hidden="true" />
                  <strong>No audit logs found</strong>
                  <span>Activity will appear here once admins start working.</span>
                </div>
              ) : (
                <div className="ss-table-wrap">
                  <table className="ss-table">
                    <thead>
                      <tr>
                        <th scope="col">Time</th>
                        <th scope="col">Action</th>
                        <th scope="col">User</th>
                        <th scope="col">Status</th>
                        <th scope="col">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log._id}>
                          <td data-label="Time">{formatDateTime(log.createdAt)}</td>
                          <td data-label="Action"><code className="ss-code">{log.action}</code></td>
                          <td data-label="User">{log.performedBy?.username || 'System'}</td>
                          <td data-label="Status">
                            <span className={`ss-status ss-status--${getAuditStatusTone(log.status)}`}>
                              {log.status}
                            </span>
                          </td>
                          <td data-label="Description">{log.description}</td>
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

      {/* Blocked Addresses Dialog */}
      {showBlockedIPs && (
        <div className="ss-modal">
          <div className="ss-modal__overlay" onClick={() => setShowBlockedIPs(false)} />
          <div
            className="ss-dialog ss-dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ss-blocked-title"
          >
            <header className="ss-dialog__header">
              <div>
                <h2 id="ss-blocked-title">Blocked addresses</h2>
                <p>Deny portal access by IPv4 address and review the block history.</p>
              </div>
              <button
                type="button"
                className="ss-dialog__close"
                onClick={() => setShowBlockedIPs(false)}
                aria-label="Close blocked addresses"
                autoFocus
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <div className="ss-dialog__tabs" role="tablist" aria-label="Blocked address views">
              <button
                type="button"
                role="tab"
                aria-selected={blockedTab === 'addresses'}
                className={`ss-tab ${blockedTab === 'addresses' ? 'is-active' : ''}`}
                onClick={() => setBlockedTab('addresses')}
              >
                Addresses <span>{blockedIPs.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={blockedTab === 'history'}
                className={`ss-tab ${blockedTab === 'history' ? 'is-active' : ''}`}
                onClick={() => setBlockedTab('history')}
              >
                Block history <span>{blockedIpAuditLogs.length}</span>
              </button>
            </div>

            <div className="ss-dialog__body">
              {blockedTab === 'addresses' ? (
                <div className="ss-blocks">
                  <div className="ss-blocks__main">
                    <div className="ss-blocks__toolbar">
                      <div className="ss-segmented" role="group" aria-label="Filter blocked addresses">
                        {([
                          { key: 'all', label: 'All', count: blockedIPs.length },
                          { key: 'active', label: 'Active', count: activeBlockCount },
                          { key: 'expired', label: 'Expired', count: expiredBlockCount }
                        ] as const).map((filter) => (
                          <button
                            key={filter.key}
                            type="button"
                            className={`ss-segmented__item ${blockedFilter === filter.key ? 'is-active' : ''}`}
                            aria-pressed={blockedFilter === filter.key}
                            onClick={() => setBlockedFilter(filter.key)}
                          >
                            {filter.label} <span>{filter.count}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {blockedIPsLoading ? (
                      <div className="ss-table-state" role="status">
                        <span className="ss-spinner" aria-hidden="true" />
                        Loading blocked addresses…
                      </div>
                    ) : visibleBlockedIPs.length === 0 ? (
                      <div className="ss-empty">
                        <Ban size={28} aria-hidden="true" />
                        <strong>
                          {blockedIPs.length === 0 ? 'No addresses blocked' : 'No addresses match this filter'}
                        </strong>
                        <span>
                          {blockedIPs.length === 0
                            ? 'Blocked addresses will be listed here.'
                            : 'Try a different filter to see other blocks.'}
                        </span>
                      </div>
                    ) : (
                      <div className="ss-table-wrap">
                        <table className="ss-table ss-table--blocks">
                          <thead>
                            <tr>
                              <th scope="col">Address</th>
                              <th scope="col">Reason</th>
                              <th scope="col">Severity</th>
                              <th scope="col">Window</th>
                              <th scope="col">Status</th>
                              <th scope="col"><span className="ss-visually-hidden">Actions</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleBlockedIPs.map((ip) => (
                              <tr key={ip._id}>
                                <td data-label="Address">
                                  <code className="ss-code">{ip.ipAddress}</code>
                                  <span className="ss-cell-meta">
                                    {Number(ip.attemptCount || 0)} attempt{Number(ip.attemptCount || 0) === 1 ? '' : 's'}
                                  </span>
                                </td>
                                <td data-label="Reason">
                                  <span className="ss-clamp" title={ip.reason}>{ip.reason}</span>
                                </td>
                                <td data-label="Severity">
                                  <span className={`ss-pill ss-pill--${getSeverityTone(ip.severity)}`}>
                                    {ip.severity?.toUpperCase()}
                                  </span>
                                </td>
                                <td data-label="Window">
                                  <span className="ss-window">
                                    <span>Blocked {formatDate(ip.blockedAt)}</span>
                                    <span>{ip.expiresAt ? `Expires ${formatDate(ip.expiresAt)}` : 'No expiry'}</span>
                                  </span>
                                </td>
                                <td data-label="Status">
                                  <span className={`ss-status ss-status--${ip.isExpired ? 'neutral' : 'success'}`}>
                                    {ip.isExpired ? 'Expired' : 'Active'}
                                  </span>
                                </td>
                                <td className="ss-table__action" data-label="Action">
                                  <button
                                    type="button"
                                    className="ss-unblock"
                                    onClick={() => handleUnblockIP(ip._id, ip.ipAddress)}
                                    disabled={unblockingIpId === ip._id}
                                  >
                                    {unblockingIpId === ip._id ? 'Unblocking…' : 'Unblock'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <aside className="ss-blocks__aside">
                    <form className="ss-form" onSubmit={handleBlockIP}>
                      <h3>Block an address</h3>
                      <p className="ss-form__hint">Active sessions from this address are signed out immediately.</p>
                      <label className="ss-field">
                        <span>IP address</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="203.0.113.100"
                          value={newBlockIP.ipAddress}
                          onChange={(e) => setNewBlockIP({ ...newBlockIP, ipAddress: e.target.value })}
                        />
                      </label>
                      <label className="ss-field">
                        <span>Reason</span>
                        <input
                          type="text"
                          placeholder="Repeated failed sign-ins"
                          value={newBlockIP.reason}
                          onChange={(e) => setNewBlockIP({ ...newBlockIP, reason: e.target.value })}
                        />
                      </label>
                      <label className="ss-field">
                        <span>Severity</span>
                        <select
                          value={newBlockIP.severity}
                          onChange={(e) => setNewBlockIP({ ...newBlockIP, severity: e.target.value })}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </label>
                      <button type="submit" className="ss-btn ss-btn--risk" disabled={blockingIpLoading}>
                        <Ban size={16} aria-hidden="true" />
                        {blockingIpLoading ? 'Blocking…' : 'Block address'}
                      </button>
                    </form>

                    <form
                      className="ss-form ss-form--quiet"
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleUnblockByIp();
                      }}
                    >
                      <h3>Quick unblock</h3>
                      <p className="ss-form__hint">Lift a block by address for appeal cases.</p>
                      <label className="ss-field">
                        <span>IP address</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="122.2.183.58"
                          value={unblockIpAddress}
                          onChange={(e) => setUnblockIpAddress(e.target.value)}
                        />
                      </label>
                      <button
                        type="submit"
                        className="ss-btn"
                        disabled={unblockByIpLoading || !unblockIpAddress.trim()}
                      >
                        {unblockByIpLoading ? 'Unblocking…' : 'Unblock address'}
                      </button>
                    </form>
                  </aside>
                </div>
              ) : (
                blockedIpAuditLoading ? (
                  <div className="ss-table-state" role="status">
                    <span className="ss-spinner" aria-hidden="true" />
                    Loading block history…
                  </div>
                ) : blockedIpAuditLogs.length === 0 ? (
                  <div className="ss-empty">
                    <FileText size={28} aria-hidden="true" />
                    <strong>No block history yet</strong>
                    <span>Block and unblock events will be recorded here.</span>
                  </div>
                ) : (
                  <div className="ss-table-wrap">
                    <table className="ss-table">
                      <thead>
                        <tr>
                          <th scope="col">Time</th>
                          <th scope="col">Action</th>
                          <th scope="col">Address</th>
                          <th scope="col">Admin</th>
                          <th scope="col">Status</th>
                          <th scope="col">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {blockedIpAuditLogs.map((log) => (
                          <tr key={log._id}>
                            <td data-label="Time">{formatDateTime(log.createdAt)}</td>
                            <td data-label="Action">
                              <span className={`ss-pill ss-pill--${log.action === 'BLOCK_IP' ? 'critical' : 'success'}`}>
                                {log.action === 'BLOCK_IP' ? 'BLOCKED' : 'UNBLOCKED'}
                              </span>
                            </td>
                            <td data-label="Address"><code className="ss-code">{log.resourceName || '—'}</code></td>
                            <td data-label="Admin">
                              {log.performedBy?.displayName || log.performedBy?.username || 'System'}
                            </td>
                            <td data-label="Status">
                              <span className={`ss-status ss-status--${getAuditStatusTone(log.status)}`}>
                                {log.status}
                              </span>
                            </td>
                            <td data-label="Description">{log.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scan Report Dialog */}
      {showScanResults && scanResults && (
        <div className="ss-modal">
          <div className="ss-modal__overlay" onClick={() => setShowScanResults(false)} />
          <div
            className="ss-dialog ss-dialog--report"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ss-report-title"
          >
            <header className="ss-dialog__header">
              <div>
                <h2 id="ss-report-title">{scanResults.scanType || 'Security'} scan report</h2>
                <p>
                  Completed {formatDateTime(scanResults.timestamp)}
                  {scanResults.duration ? ` · ${scanResults.duration} ms` : ''}
                </p>
              </div>
              <button
                type="button"
                className="ss-dialog__close"
                onClick={() => setShowScanResults(false)}
                aria-label="Close scan report"
                autoFocus
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <div className="ss-dialog__body">
              {scanResults.summary && (
                <div className="ss-report-summary">
                  <div className={`ss-report-score ss-tone--${getScoreTone(scanResults.summary.score)}`}>
                    <span>Score</span>
                    <strong>{scanResults.summary.score}<small>/100</small></strong>
                    <em>Grade {scanResults.summary.grade}</em>
                  </div>
                  <div className="ss-report-metric">
                    <span>Critical issues</span>
                    <strong className="ss-tone--critical">{scanResults.summary.criticalIssues ?? 0}</strong>
                  </div>
                  <div className="ss-report-metric">
                    <span>Needs attention</span>
                    <strong className="ss-tone--warning">{scanResults.summary.warnings ?? 0}</strong>
                  </div>
                  <div className="ss-report-metric">
                    <span>Headers passing</span>
                    <strong>
                      {scanResults.summary.headersChecked
                        ? `${scanResults.summary.headersPassed || 0}/${scanResults.summary.headersChecked}`
                        : '—'}
                    </strong>
                  </div>
                </div>
              )}

              <div className="ss-tabs" role="tablist" aria-label="Scan report sections">
                {scanResults.findings && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeScanTab === 'findings'}
                    className={`ss-tab ${activeScanTab === 'findings' ? 'is-active' : ''}`}
                    onClick={() => setActiveScanTab('findings')}
                  >
                    Findings <span>{scanResults.findings.length}</span>
                  </button>
                )}
                {scanResults.recommendations && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeScanTab === 'recommendations'}
                    className={`ss-tab ${activeScanTab === 'recommendations' ? 'is-active' : ''}`}
                    onClick={() => setActiveScanTab('recommendations')}
                  >
                    Recommendations <span>{scanResults.recommendations.length}</span>
                  </button>
                )}
                {scanResults.securityHeaders && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeScanTab === 'headers'}
                    className={`ss-tab ${activeScanTab === 'headers' ? 'is-active' : ''}`}
                    onClick={() => setActiveScanTab('headers')}
                  >
                    Headers <span>{Object.keys(scanResults.securityHeaders).length}</span>
                  </button>
                )}
              </div>

              <div className="ss-tab-panel">
                {activeScanTab === 'findings' && scanResults.findings && (
                  scanResults.findings.length > 0 ? (
                    <div className="ss-findings">
                      {scanResults.findings.map((finding, index) => {
                        const tone = getSeverityTone(finding.severity);
                        return (
                          <article key={`${finding.title}-${index}`} className={`ss-finding ss-tone--${tone}`}>
                            <div className="ss-finding__head">
                              <span className="ss-finding__icon" aria-hidden="true">
                                {finding.severity === 'critical' || finding.severity === 'high'
                                  ? <AlertTriangle size={16} />
                                  : <ShieldAlert size={16} />}
                              </span>
                              <h4>{finding.title}</h4>
                              <span className={`ss-pill ss-pill--${tone}`}>{getFindingSeverityLabel(finding.severity)}</span>
                            </div>
                            <p>{finding.description}</p>
                            {finding.recommendation && (
                              <div className="ss-finding__reco">
                                <strong>Recommendation</strong>
                                <span>{finding.recommendation}</span>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="ss-empty">
                      <ShieldCheck size={28} aria-hidden="true" />
                      <strong>No findings detected</strong>
                      <span>This scan did not surface any issues.</span>
                    </div>
                  )
                )}

                {activeScanTab === 'recommendations' && scanResults.recommendations && (
                  scanResults.recommendations.length > 0 ? (
                    <div className="ss-findings">
                      {scanResults.recommendations.map((rec, index) => (
                        <article key={`${rec.action}-${index}`} className="ss-reco">
                          <span className={`ss-pill ss-pill--${getPriorityTone(rec.priority)}`}>
                            {rec.priority.toUpperCase()} priority
                          </span>
                          <h4>{rec.action}</h4>
                          <p>{rec.details}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="ss-empty">
                      <CheckCircle size={28} aria-hidden="true" />
                      <strong>No recommendations</strong>
                      <span>Nothing further to action from this scan.</span>
                    </div>
                  )
                )}

                {activeScanTab === 'headers' && scanResults.securityHeaders && (
                  <div className="ss-header-list">
                    {Object.entries(scanResults.securityHeaders).map(([header, config]) => (
                      <div
                        key={header}
                        className={`ss-header-item ${config.status === 'pass' ? 'is-pass' : 'is-fail'}`}
                      >
                        <span className="ss-header-item__icon" aria-hidden="true">
                          {config.status === 'pass'
                            ? <CheckCircle size={16} />
                            : <XCircle size={16} />}
                        </span>
                        <code className="ss-header-item__name">{header}</code>
                        <span className={`ss-pill ss-pill--${config.status === 'pass' ? 'success' : 'critical'}`}>
                          {config.status.toUpperCase()}
                        </span>
                        {config.value && (
                          <code className="ss-header-item__value" title={config.value}>{config.value}</code>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <footer className="ss-dialog__footer">
              <span className="ss-dialog__note">Report generated {formatDateTime(scanResults.timestamp)}</span>
              <button
                type="button"
                className="ss-btn ss-btn--solid"
                onClick={() => setShowScanResults(false)}
              >
                Close report
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default Security;
