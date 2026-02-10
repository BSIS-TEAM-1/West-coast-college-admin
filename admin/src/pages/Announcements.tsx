import { useState, useEffect } from 'react'
import { 
  Bell, Plus, Search, Filter, Pin, Clock, AlertTriangle, Info, AlertCircle, 
  Wrench, Users, Edit, Trash2, Eye, MoreVertical, ChevronDown,
  CheckCircle, XCircle, Archive, RefreshCw, Upload, X
} from 'lucide-react'
import { getStoredToken, clearStoredToken, API_URL } from '../lib/authApi'
import './Announcements.css'

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

interface AnnouncementsProps {
  onNavigate?: (view: string, announcementId?: string) => void
}

const audienceOptions = [
  { value: 'all', label: 'All users' },
  { value: 'students', label: 'Students' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admins' },
]

export default function Announcements({ onNavigate }: AnnouncementsProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedAnnouncements, setSelectedAnnouncements] = useState<string[]>([])
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null)
  const [showEditForm, setShowEditForm] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
    const [imagePreviews, setImagePreviews] = useState<{[key: string]: string}>({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newAnnouncement, setNewAnnouncement] = useState<Partial<Announcement>>({
    title: '',
    message: '',
    type: 'info',
    targetAudience: 'all',
    isActive: true,
    isPinned: false,
    media: []
  })

  
  useEffect(() => {
    fetchAnnouncements()
  }, [])

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)
      const token = getStoredToken()
      console.log('Fetching announcements with token:', token ? 'valid token' : 'no token')
      const response = await fetch(`${API_URL}/api/admin/announcements`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        if (response.status === 401) {
          console.error('Authentication failed - token may be expired')
          clearStoredToken()
          throw new Error('Authentication failed. Please log in again.')
        } else {
          throw new Error(`Failed to fetch announcements: ${response.status}`)
        }
      }
      
      const data = await response.json().catch(() => {
        console.error('Failed to parse announcements response')
        return {}
      })
      setAnnouncements(data.announcements || [])
      setLoading(false)
    } catch (error) {
      console.error('Failed to fetch announcements:', error)
      setLoading(false)
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'urgent': return <AlertTriangle size={16} />
      case 'warning': return <AlertCircle size={16} />
      case 'maintenance': return <Wrench size={16} />
      default: return <Info size={16} />
    }
  }

  const handleViewAnnouncement = (announcementId: string) => {
    if (onNavigate) {
      onNavigate('announcement-detail', announcementId)
    }
  }

  const handleEditAnnouncement = (announcement: Announcement) => {
    setEditingAnnouncement(announcement)
    setShowEditForm(true)
    setMediaFiles([]) // Reset media files for new edit session
  }

  const handleSaveEdit = async (updatedAnnouncement: Partial<Announcement>) => {
    if (!editingAnnouncement) return
    
    try {
      // Upload new media files first
      const newMedia = await uploadMediaFiles(mediaFiles)
      
      // If user uploaded new media, treat it as a replacement for existing media.
      // Otherwise, keep the current media array as-is.
      const sourceMedia =
        mediaFiles.length > 0
          ? newMedia
          : (editingAnnouncement.media || [])

      const allMedia = sourceMedia.map((m) => ({
        ...m,
        fileSize: (m as any).fileSize ?? 0,
      })) as NonNullable<Announcement['media']>
      
      const token = getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/announcements/${editingAnnouncement._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...updatedAnnouncement,
          media: allMedia
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to update announcement')
      }
      
      // Refresh announcements list
      await fetchAnnouncements()
      setShowEditForm(false)
      setEditingAnnouncement(null)
      setMediaFiles([])
    } catch (error) {
      console.error('Failed to update announcement:', error)
    }
  }

  const handleCancelEdit = () => {
    setShowEditForm(false)
    setEditingAnnouncement(null)
    setMediaFiles([])
  }

  const handleCreateAnnouncement = () => {
    setShowCreateForm(true)
    setMediaFiles([])
    setNewAnnouncement({
      title: '',
      message: '',
      type: 'info',
      targetAudience: 'all',
      isActive: true,
      isPinned: false,
      media: []
    })
  }

  const handleSaveNewAnnouncement = async () => {
    try {
      // Upload media files first
      const newMedia = await uploadMediaFiles(mediaFiles)
      
      // Combine with existing media
      const allMediaRaw = [...(newAnnouncement.media || []), ...newMedia]
      const allMedia = allMediaRaw.map((m) => ({
        ...m,
        // Ensure fileSize is present for backend schema
        fileSize: (m as any).fileSize ?? 0,
      })) as NonNullable<Announcement['media']>
      
      const token = getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/announcements`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...newAnnouncement,
          // Normalize targetAudience to allowed enum values
          targetAudience:
            newAnnouncement.targetAudience && audienceOptions.some(a => a.value === newAnnouncement.targetAudience)
              ? newAnnouncement.targetAudience
              : 'all',
          media: allMedia
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to create announcement')
      }
      
      // Refresh announcements list
      await fetchAnnouncements()
      setShowCreateForm(false)
      setNewAnnouncement({
        title: '',
        message: '',
        type: 'info',
        targetAudience: 'all',
        isActive: true,
        isPinned: false,
        media: []
      })
      setMediaFiles([])
    } catch (error) {
      console.error('Failed to create announcement:', error)
    }
  }

  const handleCancelCreate = () => {
    setShowCreateForm(false)
    setNewAnnouncement({
      title: '',
      message: '',
      type: 'info',
      targetAudience: 'all',
      isActive: true,
      isPinned: false,
      media: []
    })
    setMediaFiles([])
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = Array.from(e.dataTransfer.files)
    const validFiles = files.filter(file => 
      file.type.startsWith('image/') || file.type.startsWith('video/')
    )
    
    // Create previews for image files
    validFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (event) => {
          setImagePreviews(prev => ({
            ...prev,
            [file.name + file.size]: event.target?.result as string
          }))
        }
        reader.readAsDataURL(file)
      }
    })
    
    setMediaFiles(prev => [...prev, ...validFiles])
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const validFiles = files.filter(file => 
      file.type.startsWith('image/') || file.type.startsWith('video/')
    )
    
    // Create previews for image files
    validFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (event) => {
          setImagePreviews(prev => ({
            ...prev,
            [file.name + file.size]: event.target?.result as string
          }))
        }
        reader.readAsDataURL(file)
      }
    })
    
    setMediaFiles(prev => [...prev, ...validFiles])
  }

  const removeMediaFile = (index: number) => {
    const file = mediaFiles[index]
    const previewKey = file.name + file.size
    
    setMediaFiles(prev => prev.filter((_, i) => i !== index))
    setImagePreviews(prev => {
      const newPreviews = {...prev}
      delete newPreviews[previewKey]
      return newPreviews
    })
  }

  const uploadMediaFiles = async (files: File[]): Promise<NonNullable<Announcement['media']>> => {
    if (files.length === 0) return []
    
    const uploadedMedia: NonNullable<Announcement['media']> = []
    
    for (const file of files) {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          // Remove data URL prefix to get just the base64 data
          const base64Data = result.split(',')[1]
          resolve(base64Data)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      
      uploadedMedia.push({
        type: file.type.startsWith('image/') ? 'image' : 'video',
        url: `data:${file.type};base64,${base64}`,
        fileName: `${Date.now()}-${file.name}`,
        originalFileName: file.name,
        mimeType: file.type,
        // Include fileSize to satisfy backend schema requirements
        fileSize: file.size,
      } as any)
    }
    
    return uploadedMedia
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + 
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const filteredAnnouncements = announcements.filter(announcement => {
    const matchesSearch = announcement.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         announcement.message.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = filterType === 'all' || announcement.type === filterType
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'active' && announcement.isActive) ||
                         (filterStatus === 'inactive' && !announcement.isActive)
    
    return matchesSearch && matchesType && matchesStatus
  })

  const handleSelectAnnouncement = (id: string) => {
    setSelectedAnnouncements(prev => 
      prev.includes(id) 
        ? prev.filter(announcementId => announcementId !== id)
        : [...prev, id]
    )
  }

  const handleSelectAll = () => {
    if (selectedAnnouncements.length === filteredAnnouncements.length) {
      setSelectedAnnouncements([])
    } else {
      setSelectedAnnouncements(filteredAnnouncements.map(a => a._id))
    }
  }

  const handleBulkAction = async (action: string) => {
    // Implementation for bulk actions (delete, archive, etc.)
    console.log(`Bulk action: ${action}`, selectedAnnouncements)
  }

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const token = getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/announcements/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: !currentStatus })
      })
      
      if (!response.ok) {
        console.error('Failed to toggle announcement status. HTTP status:', response.status)
        return
      }

      // Update local state immediately to show the change
      setAnnouncements(prev => {
        const updated = prev.map(announcement => 
          announcement._id === id 
            ? { ...announcement, isActive: !currentStatus }
            : announcement
        )
        return updated
      })

            
      // Refresh data after a short delay to ensure server sync
      setTimeout(() => {
        fetchAnnouncements()
      }, 500)
    } catch (error) {
      console.error('Failed to toggle announcement status:', error)
    }
  }

  return (
    <div className="announcements-page">
      <div className="announcements-header">
        <div className="announcements-title">
          <Bell size={24} />
          <h1>Announcements</h1>
        </div>
        <button className="announcements-create-btn" onClick={handleCreateAnnouncement}>
          <Plus size={20} />
          Create Announcement
        </button>
      </div>

      <div className="announcements-controls">
        <div className="announcements-search">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search announcements..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="announcements-actions">
          <button 
            className="announcements-filter-btn"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={20} />
            Filters
            <ChevronDown size={16} />
          </button>
          
          <button className="announcements-refresh-btn" onClick={fetchAnnouncements}>
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="announcements-filters">
          <select 
            value={filterType} 
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="urgent">Urgent</option>
            <option value="maintenance">Maintenance</option>
          </select>

          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      )}

      {selectedAnnouncements.length > 0 && (
        <div className="announcements-bulk-actions">
          <span>{selectedAnnouncements.length} selected</span>
          <div className="bulk-actions-buttons">
            <button onClick={() => handleBulkAction('archive')}>
              <Archive size={16} />
              Archive
            </button>
            <button onClick={() => handleBulkAction('delete')}>
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        </div>
      )}

      {showEditForm && editingAnnouncement && (
        <div className="announcements-edit-modal">
          <div className="announcements-edit-form">
            <div className="announcements-edit-header">
              <h2>Edit Announcement</h2>
              <button 
                className="announcements-edit-close"
                onClick={handleCancelEdit}
              >
                ×
              </button>
            </div>
            
            <div className="announcements-edit-body">
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={editingAnnouncement.title}
                  onChange={(e) => setEditingAnnouncement({
                    ...editingAnnouncement,
                    title: e.target.value
                  })}
                />
              </div>
              
              <div className="form-group">
                <label>Message</label>
                <textarea
                  rows={4}
                  value={editingAnnouncement.message}
                  onChange={(e) => setEditingAnnouncement({
                    ...editingAnnouncement,
                    message: e.target.value
                  })}
                />
              </div>
              
              <div className="form-group">
                <label>Type</label>
                <select
                  value={editingAnnouncement.type}
                  onChange={(e) => setEditingAnnouncement({
                    ...editingAnnouncement,
                    type: e.target.value as Announcement['type']
                  })}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="urgent">Urgent</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Target Audience</label>
                <select
                  value={editingAnnouncement.targetAudience}
                  onChange={(e) =>
                    setEditingAnnouncement({
                      ...editingAnnouncement,
                      targetAudience: e.target.value,
                    })
                  }
                >
                  {audienceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Media Files</label>
                <div 
                  className={`media-upload-area ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="media-upload-content">
                    <Upload size={48} className="media-upload-icon" />
                    <p>Drag and drop media files here or click to browse</p>
                    <p className="media-upload-hint">Supported: Images (JPG, PNG, GIF) and Videos (MP4, WebM)</p>
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      onChange={handleFileSelect}
                      className="media-upload-input"
                    />
                  </div>
                </div>
                
                {mediaFiles.length > 0 && (
                  <div className="media-files-list">
                    <h4>New Files to Upload:</h4>
                    {mediaFiles.map((file, index) => {
                      const previewKey = file.name + file.size
                      const isImage = file.type.startsWith('image/')
                      const preview = imagePreviews[previewKey]
                      
                      return (
                        <div key={index} className="media-file-item">
                          <div className="media-file-preview">
                            {isImage && preview ? (
                              <img 
                                src={preview} 
                                alt={file.name}
                                className="media-file-image"
                              />
                            ) : (
                              <div className="media-file-icon">
                                {file.type.startsWith('video/') ? '🎥' : '📄'}
                              </div>
                            )}
                          </div>
                          <div className="media-file-info">
                            <span className="media-file-name">{file.name}</span>
                            <span className="media-file-size">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                          <button 
                            type="button"
                            className="media-file-remove"
                            onClick={() => removeMediaFile(index)}
                            title="Remove file"
                          >
                            <X size={20} strokeWidth={2.5} />
                            <span className="remove-text">×</span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                
                {editingAnnouncement.media && editingAnnouncement.media.length > 0 && (
                  <div className="media-files-list">
                    <h4>Existing Media:</h4>
                    {editingAnnouncement.media.map((media, index) => (
                      <div key={index} className="media-file-item existing">
                        <div className="media-file-preview">
                          {media.type === 'image' ? (
                            <img 
                              src={media.url} 
                              alt={media.originalFileName}
                              className="media-file-image"
                            />
                          ) : (
                            <div className="media-file-icon">
                              🎥
                            </div>
                          )}
                        </div>
                        <div className="media-file-info">
                          <span className="media-file-name">{media.originalFileName}</span>
                          <span className="media-file-type">{media.type}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={editingAnnouncement.isActive}
                    onChange={(e) => setEditingAnnouncement({
                      ...editingAnnouncement,
                      isActive: e.target.checked
                    })}
                  />
                  Active
                </label>
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={editingAnnouncement.isPinned}
                    onChange={(e) => setEditingAnnouncement({
                      ...editingAnnouncement,
                      isPinned: e.target.checked
                    })}
                  />
                  Pinned
                </label>
              </div>
            </div>
            
            <div className="announcements-edit-footer">
              <button 
                className="announcements-edit-cancel"
                onClick={handleCancelEdit}
              >
                Cancel
              </button>
              <button 
                className="announcements-edit-save"
                onClick={() => handleSaveEdit(editingAnnouncement)}
                disabled={false}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateForm && (
        <div className="announcements-edit-modal" onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleCancelCreate()
          }
        }}>
          <div className="announcements-edit-form" onClick={(e) => e.stopPropagation()}>
            <div className="announcements-edit-header">
              <h2>Create Announcement</h2>
              <button 
                className="announcements-edit-close"
                onClick={handleCancelCreate}
              >
                ×
              </button>
            </div>
            
            <div className="announcements-edit-body">
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={newAnnouncement.title}
                  onChange={(e) => setNewAnnouncement({
                    ...newAnnouncement,
                    title: e.target.value
                  })}
                />
              </div>
              
              <div className="form-group">
                <label>Message</label>
                <textarea
                  rows={4}
                  value={newAnnouncement.message}
                  onChange={(e) => setNewAnnouncement({
                    ...newAnnouncement,
                    message: e.target.value
                  })}
                />
              </div>
              
              <div className="form-group">
                <label>Type</label>
                <select
                  value={newAnnouncement.type}
                  onChange={(e) => setNewAnnouncement({
                    ...newAnnouncement,
                    type: e.target.value as Announcement['type']
                  })}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="urgent">Urgent</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Target Audience</label>
                <select
                  value={newAnnouncement.targetAudience || 'all'}
                  onChange={(e) =>
                    setNewAnnouncement({
                      ...newAnnouncement,
                      targetAudience: e.target.value,
                    })
                  }
                >
                  {audienceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={newAnnouncement.isActive}
                    onChange={(e) => setNewAnnouncement({
                      ...newAnnouncement,
                      isActive: e.target.checked
                    })}
                  />
                  Active
                </label>
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={newAnnouncement.isPinned}
                    onChange={(e) => setNewAnnouncement({
                      ...newAnnouncement,
                      isPinned: e.target.checked
                    })}
                  />
                  Pinned
                </label>
              </div>
              
              <div className="form-group">
                <label>Media Files</label>
                <div 
                  className={`media-upload-area ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="media-upload-content">
                    <Upload size={48} className="media-upload-icon" />
                    <p>Drag and drop media files here or click to browse</p>
                    <p className="media-upload-hint">Supported: Images (JPG, PNG, GIF) and Videos (MP4, WebM)</p>
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      onChange={handleFileSelect}
                      className="media-upload-input"
                    />
                  </div>
                </div>
                
                {mediaFiles.length > 0 && (
                  <div className="media-files-list">
                    <h4>New Files to Upload:</h4>
                    {mediaFiles.map((file, index) => {
                      const previewKey = file.name + file.size
                      const isImage = file.type.startsWith('image/')
                      const preview = imagePreviews[previewKey]
                      
                      return (
                        <div key={index} className="media-file-item">
                          <div className="media-file-preview">
                            {isImage && preview ? (
                              <img 
                                src={preview} 
                                alt={file.name}
                                className="media-file-image"
                              />
                            ) : (
                              <div className="media-file-icon">
                                {file.type.startsWith('video/') ? '🎥' : '📄'}
                              </div>
                            )}
                          </div>
                          <div className="media-file-info">
                            <span className="media-file-name">{file.name}</span>
                            <span className="media-file-size">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                          <button 
                            type="button"
                            className="media-file-remove"
                            onClick={() => removeMediaFile(index)}
                            title="Remove file"
                          >
                            <X size={20} strokeWidth={2.5} />
                            <span className="remove-text">×</span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            
            <div className="announcements-edit-footer">
              <button 
                className="announcements-edit-cancel"
                onClick={handleCancelCreate}
              >
                Cancel
              </button>
              <button 
                className="announcements-edit-save"
                onClick={handleSaveNewAnnouncement}
                disabled={false}
              >
                Create Announcement
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      <div className="announcements-list">
        {loading ? (
          <div className="announcements-loading">
            <div className="announcements-spinner"></div>
            <p>Loading announcements...</p>
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="announcements-empty">
            <Bell size={48} />
            <h3>No announcements found</h3>
            <p>
              {searchTerm || filterType !== 'all' || filterStatus !== 'all' 
                ? 'Try adjusting your filters or search terms.' 
                : 'Create your first announcement to get started.'}
            </p>
          </div>
        ) : (
          <div className="announcements-table">
            <div className="announcements-table-header">
              <div className="table-checkbox">
                <input
                  type="checkbox"
                  checked={selectedAnnouncements.length === filteredAnnouncements.length}
                  onChange={handleSelectAll}
                />
              </div>
              <div className="table-title">Title</div>
              <div className="table-type">Type</div>
              <div className="table-audience">Audience</div>
              <div className="table-status">Status</div>
              <div className="table-date">Created</div>
              <div className="table-actions">Actions</div>
            </div>

            {filteredAnnouncements.map((announcement) => (
              <div className="announcements-table-row" key={announcement._id}>
                <div className="table-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedAnnouncements.includes(announcement._id)}
                    onChange={() => handleSelectAnnouncement(announcement._id)}
                  />
                </div>
                
                <div className="table-title">
                  <div className="announcement-title-content">
                    {announcement.isPinned && (
                      <Pin size={14} className="pinned-icon" />
                    )}
                    <span className="title-text">{announcement.title}</span>
                    {announcement.media && announcement.media.length > 0 && (
                      <span className="media-indicator">📎</span>
                    )}
                  </div>
                  <div className="announcement-message">{announcement.message}</div>
                </div>

                <div className="table-type">
                  <span 
                    className={`type-badge type-${announcement.type}`}
                  >
                    {getTypeIcon(announcement.type)}
                    {announcement.type}
                  </span>
                </div>

                <div className="table-audience">
                  <Users size={14} />
                  {announcement.targetAudience}
                </div>

                <div className="table-status">
                  <button
                    className={`status-toggle ${announcement.isActive ? 'active' : 'inactive'}`}
                    onClick={() => handleToggleStatus(announcement._id, announcement.isActive)}
                  >
                    {announcement.isActive ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    {announcement.isActive ? 'Active' : 'Inactive'}
                  </button>
                </div>

                <div className="table-date">
                  <Clock size={14} />
                  {formatDate(announcement.createdAt)}
                </div>

                <div className="table-actions">
                  <button 
                    className="action-btn"
                    onClick={() => handleViewAnnouncement(announcement._id)}
                    title="View announcement details"
                  >
                    <Eye size={16} />
                  </button>
                  <button 
                    className="action-btn"
                    onClick={() => handleEditAnnouncement(announcement)}
                    title="Edit announcement"
                  >
                    <Edit size={16} />
                  </button>
                  <button className="action-btn">
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
