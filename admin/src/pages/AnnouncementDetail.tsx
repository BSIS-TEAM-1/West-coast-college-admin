import { useState, useEffect } from 'react'
import { 
  ArrowLeft, Pin, AlertTriangle, AlertCircle, Info, Wrench, 
  Share2, Eye, MessageSquare, Heart, Users, Copy, Play, Video
} from 'lucide-react'
import { getStoredToken, API_URL } from '../lib/authApi'
import './AnnouncementDetail.css'

interface Announcement {
  _id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'urgent' | 'maintenance'
  targetAudience: string
  isActive: boolean
  isPinned: boolean
  expiresAt: string
  createdAt: string
  updatedAt?: string
  tags?: string[]
  media?: Array<{
    type: 'image' | 'video'
    url: string
    fileName: string
    originalFileName: string
    mimeType: string
    caption?: string
  }>
  createdBy: {
    username: string
    displayName: string
    avatar?: string
  }
  views?: number
  engagement?: {
    likes: number
    comments: number
    shares: number
  }
  priority?: 'low' | 'medium' | 'high'
  scheduledFor?: string
  notificationSent?: boolean
  notificationSentAt?: string
}

interface AnnouncementDetailProps {
  announcementId: string
  onBack: () => void
}

export default function AnnouncementDetail({ announcementId, onBack }: AnnouncementDetailProps) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0)

  useEffect(() => {
    if (announcementId) {
      fetchAnnouncement(announcementId)
    }
  }, [announcementId])

  useEffect(() => {
    setSelectedMediaIndex(0)
  }, [announcement?._id])

  const fetchAnnouncement = async (announcementId: string) => {
    try {
      setLoading(true)
      const token = await getStoredToken()
      const response = await fetch(`${API_URL}/api/announcements/${announcementId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        if (response.status === 404) {
          setError('Announcement not found')
        } else if (response.status === 401) {
          setError('Authentication failed')
        } else {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        return
      }

      const data = await response.json()
      setAnnouncement(data)
    } catch (err) {
      console.error('Failed to fetch announcement:', err)
      setError('Failed to load announcement')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + 
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'urgent': return <AlertTriangle size={20} />
      case 'warning': return <AlertCircle size={20} />
      case 'maintenance': return <Wrench size={20} />
      default: return <Info size={20} />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'urgent': return '#dc2626'
      case 'warning': return '#ea580c'
      case 'maintenance': return '#2563eb'
      default: return '#16a34a'
    }
  }

  const resolveMediaUrl = (url: string) => {
    if (!url) return ''
    if (url.startsWith('data:')) return url
    if (url.startsWith('http://localhost') || url.startsWith('https://localhost')) {
      try {
        const u = new URL(url)
        return `${API_URL}${u.pathname}${u.search || ''}`
      } catch {
        // fall through
      }
    }
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    const normalized = url.startsWith('/') ? url : `/${url}`
    return `${API_URL}${normalized}`
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.href)
  }

  const handleMediaClick = (index: number) => {
    setSelectedMediaIndex(index)
  }

  if (loading) {
    return (
      <div className="announcement-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading announcement...</p>
      </div>
    )
  }

  if (error || !announcement) {
    return (
      <div className="announcement-detail-error">
        <div className="error-content">
          <h2>Announcement Not Found</h2>
          <p>{error || 'The announcement you\'re looking for doesn\'t exist or has been removed.'}</p>
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={16} />
            Back to Announcements
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="announcement-detail-page">
      <div className="article-layout">
        <section className="article-main">
          <div className="article-media-card">
            {announcement.media && announcement.media.length > 0 && announcement.media[selectedMediaIndex] ? (
              <div
                className="detail-media-item"
                onClick={() => handleMediaClick(selectedMediaIndex)}
              >
                {announcement.media[selectedMediaIndex].type === 'image' ? (
                  <img
                    src={resolveMediaUrl(announcement.media[selectedMediaIndex].url)}
                    alt={announcement.media[selectedMediaIndex].caption || announcement.title}
                    className="detail-image"
                  />
                ) : (
                  <div className="video-container">
                    <video
                      src={resolveMediaUrl(announcement.media[selectedMediaIndex].url)}
                      className="detail-video"
                      muted
                    />
                    <div className="video-overlay">
                      <Play size={24} />
                    </div>
                  </div>
                )}
                {announcement.media[selectedMediaIndex].caption && (
                  <div className="media-caption">{announcement.media[selectedMediaIndex].caption}</div>
                )}
              </div>
            ) : (
              <div className="media-empty-state">
                <Info size={24} />
                <span>No media attached</span>
              </div>
            )}

            {announcement.media && announcement.media.length > 1 && (
              <div className="media-thumbnails">
                {announcement.media.map((media, index) => (
                  <button
                    key={index}
                    className={`thumbnail ${selectedMediaIndex === index ? 'active' : ''}`}
                    onClick={() => setSelectedMediaIndex(index)}
                  >
                    {media.type === 'image' ? (
                      <img src={resolveMediaUrl(media.url)} alt="" />
                    ) : (
                      <Video size={16} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <article className="article-body-card">
            <div className="badges-row">
              <span className="status-badge" style={{ backgroundColor: getTypeColor(announcement.type), color: 'white' }}>
                {getTypeIcon(announcement.type)}
                {announcement.type}
              </span>
              {announcement.isPinned && (
                <span className="status-badge status-badge-muted">
                  <Pin size={12} /> Pinned
                </span>
              )}
              {!announcement.isActive && (
                <span className="status-badge status-badge-danger">Inactive</span>
              )}
            </div>

            <h1 className="article-title">{announcement.title}</h1>

            <div className="detail-message">
              {announcement.message}
            </div>

            <div className="detail-footer">
              <div className="footer-info">
                <div className="info-item">
                  <Users size={16} />
                  <span>Audience: {announcement.targetAudience}</span>
                </div>
                {announcement.expiresAt && (
                  <div className="info-item expiry">
                    <AlertCircle size={16} />
                    <span>Expires: {formatDate(announcement.expiresAt)}</span>
                  </div>
                )}
              </div>
              {announcement.engagement && (
                <div className="engagement-stats">
                  <div className="stat-item">
                    <Heart size={14} />
                    <span>{announcement.engagement.likes}</span>
                  </div>
                  <div className="stat-item">
                    <MessageSquare size={14} />
                    <span>{announcement.engagement.comments}</span>
                  </div>
                  <div className="stat-item">
                    <Share2 size={14} />
                    <span>{announcement.engagement.shares}</span>
                  </div>
                </div>
              )}
            </div>
          </article>
        </section>

        <aside className="article-sidebar">
          <div className="article-info-card">
            <h3 className="article-info-title">
              <Info size={18} />
              Article Information
            </h3>

            <div className="meta-block">
              <p className="meta-label">Published</p>
              <p className="meta-value">{new Date(announcement.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              <p className="meta-subvalue">{new Date(announcement.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>

            <div className="meta-block">
              <p className="meta-label">Author</p>
              <p className="meta-value">{announcement.createdBy.displayName || announcement.createdBy.username}</p>
            </div>

            {announcement.views !== undefined && (
              <div className="meta-block">
                <p className="meta-label">Views</p>
                <p className="meta-value inline-meta"><Eye size={14} /> {announcement.views}</p>
              </div>
            )}

            {announcement.tags && announcement.tags.length > 0 && (
              <div className="meta-block">
                <p className="meta-label">Tags</p>
                <div className="tags-container">
                  {announcement.tags.map((tag, index) => (
                    <span key={index} className="tag-pill">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="meta-block">
              <p className="meta-label">Share Article</p>
              <button className="copy-link-btn" onClick={copyToClipboard}>
                <Copy size={16} />
                Copy Link
              </button>
            </div>
          </div>

          <button className="article-back-btn" onClick={onBack}>
            <ArrowLeft size={18} />
            Back to News
          </button>
        </aside>
      </div>
    </div>
  )
}
