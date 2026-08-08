import { CheckCircle, XCircle, AlertCircle } from 'lucide-react'

type BlockStatus = 'OPEN' | 'CLOSED' | 'WARNING' | 'ERROR'

type BlockStatusBadgeProps = {
  status: BlockStatus
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  className?: string
}

const statusConfig = {
  OPEN: {
    label: 'Open',
    icon: CheckCircle,
    className: 'block-status-badge--open'
  },
  CLOSED: {
    label: 'Closed',
    icon: XCircle,
    className: 'block-status-badge--closed'
  },
  WARNING: {
    label: 'Warning',
    icon: AlertCircle,
    className: 'block-status-badge--warning'
  },
  ERROR: {
    label: 'Error',
    icon: XCircle,
    className: 'block-status-badge--error'
  }
}

const sizeStyles = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base'
}

export default function BlockStatusBadge({
  status,
  size = 'md',
  showIcon = true,
  className = ''
}: BlockStatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon
  const sizeClass = sizeStyles[size]

  return (
    <span
      className={`block-status-badge ${config.className} ${sizeClass} ${className}`}
      role="status"
      aria-label={`Status: ${config.label}`}
    >
      {showIcon && <Icon size={size === 'sm' ? 12 : size === 'md' ? 14 : 16} />}
      {config.label}
    </span>
  )
}