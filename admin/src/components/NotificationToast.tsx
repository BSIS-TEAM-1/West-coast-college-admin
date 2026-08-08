import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'
import { useEffect } from 'react'

type NotificationType = 'success' | 'error' | 'warning'

type NotificationToastProps = {
  type: NotificationType
  title: string
  message: string
  duration?: number
  onClose: () => void
  className?: string
}

const notificationConfig = {
  success: {
    icon: CheckCircle,
    className: 'block-notification--success'
  },
  error: {
    icon: XCircle,
    className: 'block-notification--error'
  },
  warning: {
    icon: AlertCircle,
    className: 'block-notification--warning'
  }
}

export default function NotificationToast({
  type,
  title,
  message,
  duration = 5000,
  onClose,
  className = ''
}: NotificationToastProps) {
  const config = notificationConfig[type]
  const Icon = config.icon

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  return (
    <div
      className={`block-notification ${config.className} ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <Icon size={20} className="block-notification-icon" />
      <div className="block-notification-content">
        <div className="block-notification-title">{title}</div>
        <div className="block-notification-message">{message}</div>
      </div>
      <button
        type="button"
        className="block-notification-close"
        onClick={onClose}
        aria-label="Close notification"
      >
        <X size={16} />
      </button>
    </div>
  )
}