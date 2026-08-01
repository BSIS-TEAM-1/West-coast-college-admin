import type { ReactNode } from 'react'
import './DashboardPrimitives.css'

type DashboardCardProps = {
  title: string
  icon?: ReactNode
  children: ReactNode
  className?: string
}

export function DashboardCard({ title, icon, children, className = '' }: DashboardCardProps) {
  return (
    <section className={`dashboard-card ${className}`.trim()}>
      <header className="dashboard-card__header">
        <h2>{title}</h2>
        {icon ? <span className="dashboard-card__icon" aria-hidden="true">{icon}</span> : null}
      </header>
      <div className="dashboard-card__body">{children}</div>
    </section>
  )
}

type StatCardProps = {
  label: string
  value: ReactNode
  status?: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'critical' | 'info'
}

export function StatCard({ label, value, status, tone = 'neutral' }: StatCardProps) {
  return (
    <article className={`dashboard-stat dashboard-stat--${tone}`}>
      <span className="dashboard-stat__label">{label}</span>
      <strong className="dashboard-stat__value">{value}</strong>
      {status ? <span className="dashboard-stat__status">{status}</span> : null}
    </article>
  )
}
