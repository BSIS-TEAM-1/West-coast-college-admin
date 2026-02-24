import { useState, useEffect } from 'react'
import { 
  Bell, Plus, Search, Filter, Clock, AlertTriangle, Info, AlertCircle, 
  Wrench, Users, Edit, Trash2, Eye, ChevronDown,
  CheckCircle, XCircle, Archive, RefreshCw, Upload, X, Send
} from 'lucide-react'
import { getStoredToken, clearStoredToken, API_URL, getProfile, type ProfileResponse } from '../lib/authApi'
import './Announcements.css'

interface Announcement {
  _id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'urgent' | 'maintenance'
  targetAudience: string
  isActive: boolean
  isPinned: boolean
  isArchived?: boolean
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
    fileSize?: number
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

const MAX_TITLE_LENGTH = 200
const MAX_MESSAGE_LENGTH = 500
const MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_FILE_BYTES = 8 * 1024 * 1024
const MAX_MEDIA_TOTAL_BYTES = 20 * 1024 * 1024
const MAX_MEDIA_FILES = 6

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
  const [savingEdit, setSavingEdit] = useState(false)
  const [savingCreate, setSavingCreate] = useState(false)
  const [newAnnouncement, setNewAnnouncement] = useState<Partial<Announcement>>({
    title: '',
    message: '',
    type: 'info',
    targetAudience: 'all',
    isActive: true,
    isPinned: false,
    media: []
  })
  const [currentUser, setCurrentUser] = useState<ProfileResponse | null>(null)

  // Helper function to escape HTML entities
  const escapeHtml = (str: string) => {
    return str.replace(/[&<>"']/g, (match) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match] || match
    })
  }

  const validateAnnouncementContent = (titleValue: string, messageValue: string) => {
    const normalizedTitle = String(titleValue || '').trim()
    const normalizedMessage = String(messageValue || '').trim()

    if (!normalizedTitle) return 'Title is required.'
    if (normalizedTitle.length > MAX_TITLE_LENGTH) {
      return `Title is too long. Limit is ${MAX_TITLE_LENGTH} characters.`
    }

    if (!normalizedMessage) return 'Message is required.'
    if (normalizedMessage.length > MAX_MESSAGE_LENGTH) {
      return `Message is too long. Limit is ${MAX_MESSAGE_LENGTH} characters.`
    }

    return ''
  }

  const getCounterClassName = (length: number, maxLength: number) => {
    if (length >= maxLength) return 'form-character-count is-at-limit'
    if (length >= Math.floor(maxLength * 0.9)) return 'form-character-count is-near-limit'
    return 'form-character-count'
  }

  useEffect(() => {
    fetchAnnouncements()
    getProfile()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null))
  }, [])

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)
      const token = await getStoredToken()
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

  const handleSaveEdit = async (updatedAnnouncement: Partial<Announcement>, saveAsDraft = false) => {
    if (!editingAnnouncement) return

    const trimmedTitle = String(updatedAnnouncement.title || '').trim()
    const trimmedMessage = String(updatedAnnouncement.message || '').trim()
    const validationError = validateAnnouncementContent(trimmedTitle, trimmedMessage)
    if (validationError) {
      alert(validationError)
      return
    }

    try {
      setSavingEdit(true)
      const hasNewMedia = mediaFiles.length > 0
      const newMedia = hasNewMedia ? await uploadMediaFiles(mediaFiles) : []

      const requestBody: Record<string, unknown> = {
        title: trimmedTitle,
        message: trimmedMessage,
        type: updatedAnnouncement.type || 'info',
        targetAudience:
          updatedAnnouncement.targetAudience && audienceOptions.some(a => a.value === updatedAnnouncement.targetAudience)
            ? updatedAnnouncement.targetAudience
            : 'all',
        isPinned: Boolean(updatedAnnouncement.isPinned),
        // If saving as draft, force isActive to false
        isActive: saveAsDraft ? false : (updatedAnnouncement.isActive ?? editingAnnouncement.isActive)
      }

      if (hasNewMedia) {
        requestBody.media = newMedia.map((m) => ({
          ...m,
          fileSize: (m as any).fileSize ?? 0,
        }))
      }
      
      const token = await getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/announcements/${editingAnnouncement._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
      
      const responseData = await response.json().catch(() => ({}))
      if (!response.ok) {
        const details = Array.isArray(responseData?.details) ? responseData.details.join(', ') : ''
        throw new Error(responseData?.error || responseData?.message || details || `Failed to update announcement (${response.status})`)
      }
      
      // Refresh announcements list
      await fetchAnnouncements()
      alert('Announcement edited')
      setShowEditForm(false)
      setEditingAnnouncement(null)
      setMediaFiles([])
    } catch (error) {
      console.error('Failed to update announcement:', error)
      alert(error instanceof Error ? error.message : 'Failed to update announcement')
    } finally {
      setSavingEdit(false)
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

  const handleSaveNewAnnouncement = async (saveAsDraft = false) => {
    const trimmedTitle = String(newAnnouncement.title || '').trim()
    const trimmedMessage = String(newAnnouncement.message || '').trim()
    const validationError = validateAnnouncementContent(trimmedTitle, trimmedMessage)
    if (validationError) {
      alert(validationError)
      return
    }

    try {
      setSavingCreate(true)
      // Upload media files first
      const newMedia = await uploadMediaFiles(mediaFiles)

      const allMedia = newMedia.map((m) => ({
        ...m,
        fileSize: (m as any).fileSize ?? 0,
      })) as NonNullable<Announcement['media']>
      
      const finalIsActive = saveAsDraft ? false : (newAnnouncement.isActive ?? true)
      
      const token = await getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/announcements`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          title: trimmedTitle,
          message: trimmedMessage,
          type: newAnnouncement.type || 'info',
          // If saving as draft, force isActive to false
          isActive: finalIsActive,
          isPinned: Boolean(newAnnouncement.isPinned),
          // Normalize targetAudience to allowed enum values
          targetAudience:
            newAnnouncement.targetAudience && audienceOptions.some(a => a.value === newAnnouncement.targetAudience)
              ? newAnnouncement.targetAudience
              : 'all',
          media: allMedia
        })
      })
      
      const responseData = await response.json().catch(() => ({}))
      if (!response.ok) {
        const details = Array.isArray(responseData?.details) ? responseData.details.join(', ') : ''
        throw new Error(responseData?.error || responseData?.message || details || `Failed to create announcement (${response.status})`)
      }
      
      // Backend workaround: If we saved as draft but backend returned isActive: true, fix it
      if (saveAsDraft && responseData.announcement?.isActive) {
        try {
          const fixResponse = await fetch(`${API_URL}/api/admin/announcements/${responseData.announcement._id}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isActive: false })
          })
          
          if (fixResponse.ok) {
            setSelectedAnnouncements([])
          } else {
            console.error('Failed to fix draft status:', fixResponse.status)
          }
        } catch (fixError) {
          console.error('Error fixing draft status:', fixError)
        }
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
      alert(error instanceof Error ? error.message : 'Failed to create announcement')
    } finally {
      setSavingCreate(false)
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

  const validateAndAppendMediaFiles = (incomingFiles: File[]) => {
    const validFiles = incomingFiles.filter(file =>
      file.type.startsWith('image/') || file.type.startsWith('video/')
    )

    if (validFiles.length === 0) {
      alert('Please select an image or video file.')
      return
    }

    if (mediaFiles.length + validFiles.length > MAX_MEDIA_FILES) {
      alert(`You can upload up to ${MAX_MEDIA_FILES} files per announcement.`)
      return
    }

    const tooLargeFile = validFiles.find((file) => {
      const perFileLimit = file.type.startsWith('image/') ? MAX_IMAGE_FILE_BYTES : MAX_VIDEO_FILE_BYTES
      return file.size > perFileLimit
    })
    if (tooLargeFile) {
      const limitMb = tooLargeFile.type.startsWith('image/') ? 5 : 8
      const fileCategory = tooLargeFile.type.startsWith('image/') ? 'image' : 'video'
      alert(`"${tooLargeFile.name}" is too large. Max ${fileCategory} size is ${limitMb}MB.`)
      return
    }

    const currentTotal = mediaFiles.reduce((sum, file) => sum + file.size, 0)
    const incomingTotal = validFiles.reduce((sum, file) => sum + file.size, 0)
    if (currentTotal + incomingTotal > MAX_MEDIA_TOTAL_BYTES) {
      alert('Total media size is too large. Keep total upload at 20MB or less.')
      return
    }

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
    validateAndAppendMediaFiles(Array.from(e.dataTransfer.files))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    validateAndAppendMediaFiles(Array.from(e.target.files || []))
    e.target.value = ''
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

  const truncateDisplayText = (value: string, maxLength: number) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    if (!text) return ''
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength).trimEnd()}...`
  }

  const filteredAnnouncements = announcements.filter(announcement => {
    const matchesSearch = announcement.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         announcement.message.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = filterType === 'all' || announcement.type === filterType
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'active' && announcement.isActive) ||
                         (filterStatus === 'inactive' && !announcement.isActive && !announcement.isArchived) ||
                         (filterStatus === 'archived' && announcement.isArchived)
    
    return matchesSearch && matchesType && matchesStatus
  })
  const hasSelectedAnnouncements = selectedAnnouncements.length > 0

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
    if (selectedAnnouncements.length === 0) return

    const confirmMsg = action === 'delete'
      ? `Are you sure you want to permanently delete ${selectedAnnouncements.length} announcement(s)? This cannot be undone.`
      : `Archive ${selectedAnnouncements.length} announcement(s)? Archived items will be marked inactive.`

    if (!window.confirm(confirmMsg)) return

    try {
      const token = await getStoredToken()

      for (const id of selectedAnnouncements) {
        if (action === 'delete') {
          const res = await fetch(`${API_URL}/api/admin/announcements/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          })

          if (!res.ok) {
            console.error('Failed to delete announcement', id, res.status)
          }
        } else if (action === 'archive') {
          // Archive by marking inactive and setting isArchived flag
          const res = await fetch(`${API_URL}/api/admin/announcements/${id}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isActive: false, isArchived: true })
          })

          if (!res.ok) {
            console.error('Failed to archive announcement', id, res.status)
          }
        }
      }

      // Clear selection and refresh list
      setSelectedAnnouncements([])
      await fetchAnnouncements()
    } catch (err) {
      console.error('Bulk action failed:', err)
      alert('Bulk action failed. Check console for details.')
    }
  }

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    // Check if user has permission to edit this announcement
    if (!currentUser) {
      alert('You must be logged in to update announcements')
      return
    }

    const announcement = announcements.find(a => a._id === id)
    if (!announcement) {
      console.error('Announcement not found:', id)
      return
    }

    // Check if user can edit this announcement based on role
    const canEdit = 
      currentUser.accountType === 'admin' ||
      announcement.createdBy.username === currentUser.username

    if (!canEdit) {
      alert(`Only ${currentUser.accountType === 'admin' ? 'admins' : 'the announcement creator'} can update announcements`)
      return
    }

    try {
      const token = await getStoredToken()
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

  const handleDeleteAnnouncement = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this announcement?')) return

    try {
      const token = await getStoredToken()
      const res = await fetch(`${API_URL}/api/admin/announcements/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!res.ok) {
        console.error('Failed to delete announcement', id, res.status)
        alert('Failed to delete announcement')
        return
      }

      // Remove from local state for immediate feedback
      setAnnouncements(prev => prev.filter(a => a._id !== id))
      // Also ensure it's not selected
      setSelectedAnnouncements(prev => prev.filter(sid => sid !== id))
    } catch (err) {
      console.error('Failed to delete announcement:', err)
      alert('Failed to delete announcement')
    }
  }

  const handleArchiveAnnouncement = async (id: string) => {
    if (!window.confirm('Archive this announcement? It will be marked inactive.')) return

    try {
      const token = await getStoredToken()
      const res = await fetch(`${API_URL}/api/admin/announcements/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: false, isArchived: true })
      })

      if (!res.ok) {
        console.error('Failed to archive announcement', id, res.status)
        alert('Failed to archive announcement')
        return
      }

      setAnnouncements(prev =>
        prev.map((announcement) =>
          announcement._id === id
            ? { ...announcement, isActive: false, isArchived: true }
            : announcement
        )
      )
      setSelectedAnnouncements(prev => prev.filter(sid => sid !== id))
    } catch (err) {
      console.error('Failed to archive announcement:', err)
      alert('Failed to archive announcement')
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
          {hasSelectedAnnouncements && (
            <button
              className="announcements-archive-selected-btn"
              onClick={() => handleBulkAction('archive')}
            >
              <Archive size={20} />
              Archive Selected
            </button>
          )}
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
            <option value="archived">Archived</option>
          </select>
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
                  maxLength={MAX_TITLE_LENGTH}
                />
                <div className="form-input-meta">
                  <span className={getCounterClassName(String(editingAnnouncement.title || '').length, MAX_TITLE_LENGTH)}>
                    {String(editingAnnouncement.title || '').length}/{MAX_TITLE_LENGTH}
                  </span>
                </div>
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
                  maxLength={MAX_MESSAGE_LENGTH}
                />
                <div className="form-input-meta">
                  <span className={getCounterClassName(String(editingAnnouncement.message || '').length, MAX_MESSAGE_LENGTH)}>
                    {String(editingAnnouncement.message || '').length}/{MAX_MESSAGE_LENGTH}
                  </span>
                </div>
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
                    <p className="media-upload-hint">Supported: Images up to 5MB, videos up to 8MB, max 6 files, total 20MB.</p>
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
                                alt={escapeHtml(file.name)}
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
                              alt={escapeHtml(media.originalFileName)}
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
              
              <div className="form-group horizontal-checkboxes">
                <ul className="checkbox-list">
                  <li>
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
                  </li>

                  <li>
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
                  </li>
                </ul>
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
                className="announcements-edit-save draft"
                onClick={() => handleSaveEdit(editingAnnouncement, true)}
                disabled={savingEdit}
              >
                {savingEdit ? 'Saving...' : 'Save Draft'}
              </button>

              <button 
                className="announcements-edit-save"
                onClick={() => handleSaveEdit(editingAnnouncement, false)}
                disabled={savingEdit}
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
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
                  maxLength={MAX_TITLE_LENGTH}
                />
                <div className="form-input-meta">
                  <span className={getCounterClassName(String(newAnnouncement.title || '').length, MAX_TITLE_LENGTH)}>
                    {String(newAnnouncement.title || '').length}/{MAX_TITLE_LENGTH}
                  </span>
                </div>
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
                  maxLength={MAX_MESSAGE_LENGTH}
                />
                <div className="form-input-meta">
                  <span className={getCounterClassName(String(newAnnouncement.message || '').length, MAX_MESSAGE_LENGTH)}>
                    {String(newAnnouncement.message || '').length}/{MAX_MESSAGE_LENGTH}
                  </span>
                </div>
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
              
              <div className="form-group horizontal-checkboxes">
                <ul className="checkbox-list">
                  <li>
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
                  </li>

                  <li>
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
                  </li>
                </ul>
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
                    <p className="media-upload-hint">Supported: Images up to 5MB, videos up to 8MB, max 6 files, total 20MB.</p>
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
                                alt={escapeHtml(file.name)}
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
                className="announcements-edit-save draft"
                onClick={() => handleSaveNewAnnouncement(true)}
                disabled={savingCreate}
              >
                {savingCreate ? 'Saving...' : 'Save Draft'}
              </button>

              <button 
                className="announcements-edit-save"
                onClick={() => handleSaveNewAnnouncement(false)}
                disabled={savingCreate}
              >
                {savingCreate ? 'Saving...' : 'Create Announcement'}
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
              <div className="table-title">Announcement</div>
              <div className="table-type">Type</div>
              <div className="table-audience">Audience</div>
              <div className="table-status">Status</div>
              <div className="table-date">Created</div>
              <div className="table-actions">Actions</div>
            </div>

            {filteredAnnouncements.map((announcement) => {
              const canEdit = currentUser?.accountType === 'admin' || 
                            currentUser?.username === announcement.createdBy.username
              const isSelected = selectedAnnouncements.includes(announcement._id)

              return (
                <div className="announcements-table-row" key={announcement._id}>
                  <div className="table-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectAnnouncement(announcement._id)}
                    />
                  </div>
                  <div className="table-title">
                    <span className="announcement-title" title={announcement.title}>
                      {truncateDisplayText(announcement.title, 88)}
                    </span>
                    <span className="announcement-description" title={announcement.message}>
                      {truncateDisplayText(announcement.message, 120)}
                    </span>
                  </div>
                  <div className="table-type">
                    <span className={`type-badge type-${announcement.type}`}>
                      {getTypeIcon(announcement.type)}
                      {announcement.type}
                    </span>
                  </div>
                  <div className="table-audience">
                    <Users size={14} />
                    {announcement.targetAudience}
                  </div>
                  <div className="table-status">
                    <span className={`status-badge ${announcement.isActive ? 'published' : announcement.isArchived ? 'archived' : 'draft'}`}>
                      {announcement.isActive ? <CheckCircle size={14} /> : announcement.isArchived ? <Archive size={14} /> : <XCircle size={14} />}
                      {announcement.isActive ? 'Published' : announcement.isArchived ? 'Archived' : 'Draft'}
                    </span>
                    {!announcement.isActive && canEdit && (
                      <button
                        className="action-btn publish-action"
                        onClick={() => handleToggleStatus(announcement._id, announcement.isActive)}
                        title="Publish"
                        aria-label="Publish announcement"
                      >
                        <Upload size={14} className="publish-icon-default" />
                        <Send size={14} className="publish-icon-hover" />
                      </button>
                    )}
                  </div>
                  <div className="table-date">
                    <Clock size={14} />
                    {formatDate(announcement.createdAt)}
                  </div>

                  <div className="table-actions">
                    <button 
                      className="action-btn"
                      onClick={() => handleViewAnnouncement(announcement._id)}
                      title="View details"
                    >
                      <Eye size={16} />
                    </button>
                    {canEdit && (
                      <button
                        className="action-btn archive-action"
                        onClick={() => handleArchiveAnnouncement(announcement._id)}
                        title="Archive"
                        disabled={Boolean(announcement.isArchived)}
                      >
                        <Archive size={16} />
                      </button>
                    )}
                    {canEdit && (
                      <button 
                        className="action-btn"
                        onClick={() => handleEditAnnouncement(announcement)}
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        className="action-btn"
                        onClick={() => handleDeleteAnnouncement(announcement._id)}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
