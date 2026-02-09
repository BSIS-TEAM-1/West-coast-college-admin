import { useState, useEffect } from 'react'
import { 
  ArrowLeft, Pin, Clock, AlertTriangle, AlertCircle, Info, Wrench, 
  Share2, Download, Edit, Trash2, Eye, MessageSquare, Heart,
  Users, Zap, MoreVertical,
  Copy, ExternalLink, Bookmark, Play, Video
} from 'lucide-react'
import { getStoredToken } from '../lib/authApi'
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
}

interface AnnouncementDetailProps {
  announcementId: string
  onBack: () => void
}

export default function AnnouncementDetail({ announcementId, onBack }: AnnouncementDetailProps) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showActions, setShowActions] = useState(false)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [hasLiked, setHasLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [_showShareModal, _setShowShareModal] = useState(false)
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0)
  const [_showMediaViewer, _setShowMediaViewer] = useState(false)

  useEffect(() => {
    if (announcementId) {
      fetchAnnouncement(announcementId)
    }
  }, [announcementId])

  const fetchAnnouncement = async (announcementId: string) => {
    try {
      setLoading(true)
      const token = getStoredToken()
      const response = await fetch(`http://localhost:3001/api/announcements/${announcementId}`, {
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
      setLikeCount(data.engagement?.likes || 0)
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

  const handleLike = async () => {
    if (!announcement) return
    
    try {
      const token = getStoredToken()
      const response = await fetch(`http://localhost:3001/api/announcements/${announcement._id}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        setHasLiked(!hasLiked)
        setLikeCount(prev => hasLiked ? prev - 1 : prev + 1)
      }
    } catch (err) {
      console.error('Failed to like announcement:', err)
    }
  }

  const handleBookmark = async () => {
    if (!announcement) return
    
    try {
      const token = getStoredToken()
      const response = await fetch(`http://localhost:3001/api/announcements/${announcement._id}/bookmark`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        setIsBookmarked(!isBookmarked)
      }
    } catch (err) {
      console.error('Failed to bookmark announcement:', err)
    }
  }

  const handleShare = async () => {
    if (navigator.share && announcement) {
      try {
        await navigator.share({
          title: announcement.title,
          text: announcement.message.substring(0, 200) + '...',
          url: window.location.href
        })
      } catch (err) {
        console.log('Share failed:', err)
        _setShowShareModal(true)
      }
    } else {
      _setShowShareModal(true)
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.href)
    // Show toast notification
  }

  const handleMediaClick = (index: number) => {
    setSelectedMediaIndex(index)
    _setShowMediaViewer(true)
  }

  const handleDownload = () => {
    if (announcement) {
      const content = `${announcement.title}\n\n${announcement.message}\n\nPosted: ${formatDate(announcement.createdAt)}\nBy: ${announcement.createdBy.displayName || announcement.createdBy.username}`
      const blob = new Blob([content], { type: 'text/plain' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `announcement-${announcement.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`
      a.click()
      window.URL.revokeObjectURL(url)
    }
  }

  const handleEdit = () => {
    // For now, just show an alert - could be extended to open edit modal
    alert('Edit functionality would open here')
  }

  const handleDelete = async () => {
    if (announcement && window.confirm('Are you sure you want to delete this announcement?')) {
      try {
        const token = getStoredToken()
        const response = await fetch(`http://localhost:3001/api/admin/announcements/${announcement._id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        if (response.ok) {
          onBack()
        } else {
          throw new Error('Failed to delete announcement')
        }
      } catch (err) {
        console.error('Failed to delete announcement:', err)
        alert('Failed to delete announcement')
      }
    }
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
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to Announcements
        </button>
        
        <div className="header-actions">
          <button className="action-btn" onClick={handleLike} title="Like">
            <Heart size={18} className={hasLiked ? 'filled' : ''} />
            {likeCount > 0 && <span className="like-count">{likeCount}</span>}
          </button>
          <button className="action-btn" onClick={handleBookmark} title="Bookmark">
            <Bookmark size={18} className={isBookmarked ? 'filled' : ''} />
          </button>
          <button className="action-btn" onClick={handleShare} title="Share">
            <Share2 size={18} />
          </button>
          <button className="action-btn" onClick={handleDownload} title="Download">
            <Download size={18} />
          </button>
          <div className="more-actions">
            <button className="action-btn" onClick={() => setShowActions(!showActions)} title="More">
              <MoreVertical size={18} />
            </button>
            {showActions && (
              <div className="actions-dropdown">
                <button onClick={copyToClipboard}><Copy size={14} /> Copy Link</button>
                <button onClick={() => window.open(window.location.href, '_blank')}><ExternalLink size={14} /> Open in New Tab</button>
                <button onClick={handleEdit}><Edit size={14} /> Edit</button>
                <button className="danger" onClick={handleDelete}><Trash2 size={14} /> Delete</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="announcement-detail-card">
        {/* Media Column (Left) */}
        {announcement.media && announcement.media.length > 0 && (
          <div className="detail-media-column">
            <div className="media-gallery">
              {announcement.media.map((media, index) => (
                <div 
                  key={index} 
                  className="detail-media-item"
                  onClick={() => handleMediaClick(index)}
                >
                  {media.type === 'image' ? (
                    <img 
                      src={media.url} 
                      alt={media.caption || announcement.title}
                      className="detail-image"
                    />
                  ) : (
                    <div className="video-container">
                      <video 
                        src={media.url} 
                        className="detail-video"
                        muted
                      />
                      <div className="video-overlay">
                        <Play size={24} />
                      </div>
                    </div>
                  )}
                  {media.caption && (
                    <div className="media-caption">{media.caption}</div>
                  )}
                </div>
              ))}
            </div>
            {announcement.media.length > 1 && (
              <div className="media-thumbnails">
                {announcement.media.map((media, index) => (
                  <button
                    key={index}
                    className={`thumbnail ${selectedMediaIndex === index ? 'active' : ''}`}
                    onClick={() => setSelectedMediaIndex(index)}
                  >
                    {media.type === 'image' ? (
                      <img src={media.url} alt="" />
                    ) : (
                      <Video size={16} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content Column (Right) */}
        <div className="detail-content-column">
          <div className="content-header">
            <div className="badges-row">
              <span 
                className="status-badge" 
                style={{ backgroundColor: getTypeColor(announcement.type), color: 'white' }}
              >
                {getTypeIcon(announcement.type)}
                {announcement.type}
              </span>
              {announcement.isPinned && (
                <span className="status-badge" style={{ backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fcd34d' }}>
                  <Pin size={12} /> Pinned
                </span>
              )}
              {!announcement.isActive && (
                <span className="status-badge" style={{ backgroundColor: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>
                  Inactive
                </span>
              )}
              {announcement.priority && (
                <span className={`priority-badge priority-${announcement.priority}`}>
                  <Zap size={10} />
                  {announcement.priority}
                </span>
              )}
            </div>
            <div className="post-meta">
              <div className="post-date" style={{ color: '#64748b', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Clock size={14} />
                {formatDate(announcement.createdAt)}
              </div>
              {announcement.views !== undefined && (
                <div className="view-count">
                  <Eye size={14} />
                  {announcement.views} views
                </div>
              )}
            </div>
          </div>

          <h1 className="detail-title">{announcement.title}</h1>

          <div className="author-row">
            <div className="author-avatar">
              {announcement.createdBy.avatar ? (
                <img src={announcement.createdBy.avatar} alt={announcement.createdBy.displayName} />
              ) : (
                <span>{(announcement.createdBy.displayName || announcement.createdBy.username).charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="author-info">
              <span className="author-name">{announcement.createdBy.displayName || announcement.createdBy.username}</span>
              <span style={{ fontSize: '0.875rem', color: '#64748b' }}>@{announcement.createdBy.username}</span>
            </div>
          </div>

          <div className="detail-message">
            {announcement.message}
          </div>

          {announcement.tags && announcement.tags.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              {announcement.tags.map((tag, index) => (
                <span key={index} className="tag-pill">#{tag}</span>
              ))}
            </div>
          )}

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
        </div>
      </div>
    </div>
  )
}
