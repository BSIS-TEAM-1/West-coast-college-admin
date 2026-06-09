import { normalizeAnnouncementAudience } from '../../lib/announcementAudience'
import type { Announcement } from './professorTypes'

export const isVisibleProfessorAnnouncement = (value: any): value is Announcement => {
  if (!value || typeof value !== 'object') return false
  if (value.isActive === false) return false
  if (value.isArchived === true) return false

  const id = String(value._id || '').trim()
  const title = String(value.title || '').trim()
  if (!id || !title) return false

  const rawExpiry = String(value.expiresAt || '').trim()
  if (!rawExpiry) return true

  const expiry = new Date(rawExpiry)
  if (Number.isNaN(expiry.getTime())) return true

  if (expiry.getTime() <= Date.now()) return false

  const audiences = normalizeAnnouncementAudience(value.targetAudience)
  return audiences.includes('all') || audiences.includes('professor')
}

export const buildReconnectMessage = (resourceLabel: string) => (
  typeof navigator !== 'undefined' && navigator.onLine === false
    ? 'Internet connection lost. Reconnecting and reloading ' + resourceLabel + ' automatically.'
    : 'Connection is unstable. Retrying ' + resourceLabel + '.'
)
