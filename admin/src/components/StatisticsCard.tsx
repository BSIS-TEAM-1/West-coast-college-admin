import React from 'react'

interface Statistic {
  label: string
  value: string | number
  icon?: React.ReactNode
  change?: number
  changeType?: 'increase' | 'decrease'
}

interface StatisticsCardProps {
  statistics: Statistic[]
}

const StatisticsCard: React.FC<StatisticsCardProps> = ({ statistics }) => {
  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
      gap: '1rem' 
    }}>
      {statistics.map((stat, index) => (
        <div 
          key={index} 
          className="statistics-card" 
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            padding: '1.25rem',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1rem'
          }}
        >
          {stat.icon && (
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'var(--color-primary-subtle)',
              color: 'var(--color-primary-on-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              lineHeight: 1,
              marginTop: '6px'
            }}>
              {stat.icon}
            </div>
          )}
          
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ 
              fontSize: '0.875rem', 
              color: 'var(--color-text-secondary)', 
              marginBottom: '0.25rem',
              fontWeight: '500'
            }}>
              {stat.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{
                fontSize: '1.75rem',
                fontWeight: '700',
                color: 'var(--color-text)',
                lineHeight: 1
              }}>
                {stat.value}
              </span>
              
              {stat.change !== undefined && (
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  color: stat.changeType === 'increase' ? '#10b981' : '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px'
                }}>
                  {stat.changeType === 'increase' ? '↑' : '↓'} {Math.abs(stat.change)}%
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default StatisticsCard
