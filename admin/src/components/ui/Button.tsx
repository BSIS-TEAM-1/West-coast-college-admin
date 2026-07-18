import type { ButtonHTMLAttributes, ReactNode } from 'react'

import './Button.css'

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'success' | 'utility' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  loading?: boolean
  fullWidth?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  fullWidth = false,
  children,
  className = '',
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = [
    'erp-button',
    `erp-button--${variant}`,
    `erp-button--${size}`,
    fullWidth ? 'erp-button--full' : '',
    loading ? 'is-loading' : '',
    className
  ].filter(Boolean).join(' ')

  return (
    <button type={type} className={classes} disabled={disabled || loading} {...props}>
      {icon ? <span className="erp-button__icon" aria-hidden="true">{icon}</span> : null}
      <span className="erp-button__label">{loading ? 'Loading...' : children}</span>
    </button>
  )
}

export default Button
