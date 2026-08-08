type CapacityLevel = 'low' | 'medium' | 'high' | 'full'

type CapacityIndicatorProps = {
  current: number
  capacity: number
  showLabel?: boolean
  showText?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const getCapacityLevel = (current: number, capacity: number): CapacityLevel => {
  const percentage = (current / capacity) * 100

  if (percentage >= 100) return 'full'
  if (percentage >= 85) return 'high'
  if (percentage >= 60) return 'medium'
  return 'low'
}

const sizeStyles = {
  sm: {
    height: '6px',
    fontSize: '0.7rem'
  },
  md: {
    height: '8px',
    fontSize: '0.75rem'
  },
  lg: {
    height: '10px',
    fontSize: '0.875rem'
  }
}

export default function CapacityIndicator({
  current,
  capacity,
  showLabel = true,
  showText = true,
  size = 'md',
  className = ''
}: CapacityIndicatorProps) {
  const level = getCapacityLevel(current, capacity)
  const percentage = Math.min((current / capacity) * 100, 100)
  const sizeStyle = sizeStyles[size]

  return (
    <div className={`block-capacity-indicator ${className}`}>
      {showLabel && (
        <span className="block-capacity-label" style={{ fontSize: sizeStyle.fontSize }}>
          Capacity
        </span>
      )}
      <div
        className="block-capacity-bar"
        style={{ height: sizeStyle.height }}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-label={`${current} of ${capacity} students (${Math.round(percentage)}%)`}
      >
        <div
          className={`block-capacity-fill block-capacity-fill--${level}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showText && (
        <span className="block-capacity-text" style={{ fontSize: sizeStyle.fontSize }}>
          {current}/{capacity}
        </span>
      )}
    </div>
  )
}