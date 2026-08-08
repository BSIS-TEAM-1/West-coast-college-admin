import { MoreVertical, Edit, Trash2, Copy, Eye, Users, Settings } from 'lucide-react'
import { useState } from 'react'

type QuickAction = {
  id: string
  label: string
  icon: any
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

type QuickActionsMenuProps = {
  actions: QuickAction[]
  position?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

export default function QuickActionsMenu({
  actions,
  position = 'bottom',
  className = ''
}: QuickActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  const positionStyles = {
    top: 'bottom-full right-0 mb-2',
    bottom: 'top-full right-0 mt-2',
    left: 'right-full top-0 mr-2',
    right: 'left-full top-0 ml-2'
  }

  return (
    <div className={`block-quick-actions-menu ${className}`}>
      <button
        type="button"
        className="block-quick-actions-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Quick actions"
        aria-expanded={isOpen}
      >
        <MoreVertical size={18} />
      </button>

      {isOpen && (
        <>
          <div
            className="block-quick-actions-backdrop"
            onClick={() => setIsOpen(false)}
          />
          <div className={`block-quick-actions-dropdown ${positionStyles[position]}`}>
            {actions.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.id}
                  type="button"
                  className={`block-quick-action-item ${action.danger ? 'block-quick-action-item--danger' : ''} ${action.disabled ? 'block-quick-action-item--disabled' : ''}`}
                  onClick={() => {
                    if (!action.disabled) {
                      action.onClick()
                      setIsOpen(false)
                    }
                  }}
                  disabled={action.disabled}
                  aria-label={action.label}
                >
                  <Icon size={16} />
                  <span>{action.label}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// Predefined action builders
export const createEditAction = (onClick: () => void): QuickAction => ({
  id: 'edit',
  label: 'Edit',
  icon: Edit,
  onClick
})

export const createDeleteAction = (onClick: () => void): QuickAction => ({
  id: 'delete',
  label: 'Delete',
  icon: Trash2,
  onClick,
  danger: true
})

export const createDuplicateAction = (onClick: () => void): QuickAction => ({
  id: 'duplicate',
  label: 'Duplicate',
  icon: Copy,
  onClick
})

export const createViewAction = (onClick: () => void): QuickAction => ({
  id: 'view',
  label: 'View Details',
  icon: Eye,
  onClick
})

export const createAssignAction = (onClick: () => void): QuickAction => ({
  id: 'assign',
  label: 'Assign Students',
  icon: Users,
  onClick
})

export const createSettingsAction = (onClick: () => void): QuickAction => ({
  id: 'settings',
  label: 'Settings',
  icon: Settings,
  onClick
})