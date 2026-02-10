import React, { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Users, Database, Server, Clock, AlertTriangle, Activity } from 'lucide-react'
import './StatisticsCard.css'

interface Statistic {
  label: string
  value: string | number
  change?: number
  changeType?: 'increase' | 'decrease' | 'neutral'
  icon?: React.ReactNode
  color?: string
  disabled?: boolean
}

interface GraphData {
  label: string
  value: number
  timestamp: string
}

interface StatisticsCardProps {
  title: string
  statistics: Statistic[]
  graphData?: GraphData[]
  timeRange?: '1h' | '24h' | '7d' | '30d'
  onTimeRangeChange?: (range: string) => void
}

export default function StatisticsCard({ title, statistics, graphData = [], timeRange = '24h', onTimeRangeChange }: StatisticsCardProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

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

  // Generate historical data for graphs
  const generateHistoricalData = (baseValue: number, points: number = 24): GraphData[] => {
    const now = new Date();
    return Array.from({ length: points }, (_, i) => {
      const timestamp = new Date(now.getTime() - (points - 1 - i) * 3600000);
      const variation = (Math.random() - 0.5) * baseValue * 0.2;
      return {
        label: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: baseValue + variation,
        timestamp: timestamp.toISOString()
      };
    });
  };

  const userGraphData = generateHistoricalData(250, 24);
  const serverLoadData = generateHistoricalData(45, 24);
  const databaseData = generateHistoricalData(67, 24);

  const timeRanges = [
    { value: '1h', label: '1 Hour' },
    { value: '24h', label: '24 Hours' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' }
  ];

  const getTrendIcon = (changeType?: string) => {
    switch (changeType) {
      case 'increase': return <TrendingUp size={16} className="trend-up" />;
      case 'decrease': return <TrendingDown size={16} className="trend-down" />;
      default: return null;
    }
  };

  const renderMiniChart = (data: GraphData[], color: string) => {
    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    const range = maxValue - minValue;

    return (
      <div className="mini-chart">
        <svg width="100%" height="60" viewBox="0 0 100 60">
          {data.map((point, index) => {
            const x = (index / (data.length - 1)) * 100;
            const y = 60 - ((point.value - minValue) / range) * 50;
            
            return (
              <g key={index}>
                {index > 0 && (
                  <line
                    x1={((index - 1) / (data.length - 1)) * 100}
                    y1={60 - ((data[index - 1].value - minValue) / range) * 50}
                    x2={x}
                    y2={y}
                    stroke={color}
                    strokeWidth="2"
                    opacity="0.3"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r="3"
                  fill={color}
                />
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div className={`statistics-card ${isExpanded ? 'expanded' : ''} ${isDarkMode ? 'dark-mode' : ''}`}>
      <div className="card-header">
        <div className="card-title-section">
          <h3 className="card-title">{title}</h3>
          <button 
            className="expand-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <Activity size={16} />
          </button>
        </div>
        
        {onTimeRangeChange && (
          <div className="time-range-selector">
            {timeRanges.map(range => (
              <button
                key={range.value}
                className={`time-range-btn ${selectedTimeRange === range.value ? 'active' : ''}`}
                onClick={() => {
                  setSelectedTimeRange(range.value);
                  onTimeRangeChange(range.value);
                }}
              >
                {range.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card-content">
        <div className="statistics-grid">
          {statistics.map((stat, index) => (
            <div key={index} className={`statistic-item ${stat.disabled ? 'disabled' : ''}`}>
              <div className="stat-header">
                <div className="stat-icon">
                  {stat.icon || <Users size={20} />}
                </div>
                <div className="stat-info">
                  <div className="stat-label">{stat.label}</div>
                  <div className="stat-value">{stat.value}</div>
                </div>
              </div>
              {stat.change !== undefined && !stat.disabled && (
                <div className="stat-change">
                  {getTrendIcon(stat.changeType)}
                  <span className={`change-value ${stat.changeType}`}>
                    {Math.abs(stat.change)}%
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {graphData.length > 0 && (
          <div className="graphs-section">
            <div className="graph-grid">
              <div className="graph-item">
                <div className="graph-header">
                  <Users size={16} className="graph-icon" />
                  <span className="graph-title">Active Users</span>
                  <span className="graph-value">{userGraphData[userGraphData.length - 1].value}</span>
                </div>
                {renderMiniChart(userGraphData, '#3b82f6')}
              </div>

              <div className="graph-item">
                <div className="graph-header">
                  <Server size={16} className="graph-icon" />
                  <span className="graph-title">Server Load</span>
                  <span className="graph-value">{serverLoadData[serverLoadData.length - 1].value.toFixed(1)}%</span>
                </div>
                {renderMiniChart(serverLoadData, '#ef4444')}
              </div>

              <div className="graph-item">
                <div className="graph-header">
                  <Database size={16} className="graph-icon" />
                  <span className="graph-title">Database Usage</span>
                  <span className="graph-value">N/A</span>
                </div>
                {renderMiniChart(databaseData, '#f59e0b')}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
