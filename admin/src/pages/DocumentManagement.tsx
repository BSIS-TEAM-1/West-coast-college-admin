import React, { useState, useEffect } from 'react'
import { Download, Edit2, Trash2, Search, Filter, FileText, Plus } from 'lucide-react'
import './DocumentManagement.css'

interface Document {
  _id: string
  title: string
  description: string
  category: string
  subcategory: string
  fileName: string
  originalFileName: string
  mimeType: string
  fileSize: number
  filePath: string
  version: string
  isPublic: boolean
  allowedRoles: string[]
  tags: string[]
  effectiveDate: string
  expiryDate: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'SUPERSEDED'
  downloadCount: number
  lastDownloadedBy?: {
    username: string
    displayName: string
  }
  lastDownloadedAt?: string
  createdBy: {
    username: string
    displayName: string
  }
  updatedBy?: {
    username: string
    displayName: string
  }
  createdAt: string
  updatedAt: string
}

const DocumentManagement: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [editingDocument, setEditingDocument] = useState<Document | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [filters, setFilters] = useState({
    category: '',
    status: '',
    search: ''
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'POLICY',
    subcategory: '',
    version: '1.0',
    isPublic: false,
    allowedRoles: [] as string[],
    tags: [] as string[],
    effectiveDate: '',
    expiryDate: '',
    status: 'ACTIVE' as 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'SUPERSEDED'
  })

  useEffect(() => {
    fetchDocuments()
  }, [currentPage, filters])

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:3001/api/admin/documents', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      
      if (!response.ok) {
        if (response.status === 401) {
          console.error('Authentication failed for documents')
          return
        }
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (error) {
      console.error('Failed to fetch documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      if (!formData.title) {
        setFormData(prev => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, '') }))
      }
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedFile && !editingDocument) {
      alert('Please select a file to upload')
      return
    }

    try {
      const token = localStorage.getItem('token')
      const url = editingDocument 
        ? `http://localhost:3001/api/admin/documents/${editingDocument._id}`
        : 'http://localhost:3001/api/admin/documents'
      
      const method = editingDocument ? 'PUT' : 'POST'
      
      let body: any = { ...formData }
      
      if (!editingDocument && selectedFile) {
        const fileData = await fileToBase64(selectedFile)
        body = {
          ...body,
          fileName: `${Date.now()}-${selectedFile.name}`,
          originalFileName: selectedFile.name,
          mimeType: selectedFile.type,
          fileSize: selectedFile.size,
          fileData
        }
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      })

      if (response.ok) {
        fetchDocuments()
        setShowUploadModal(false)
        setEditingDocument(null)
        resetForm()
      }
    } catch (error) {
      console.error('Failed to save document:', error)
    }
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = error => reject(error)
    })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return
    
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3001/api/admin/documents/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.ok) {
        fetchDocuments()
      }
    } catch (error) {
      console.error('Failed to delete document:', error)
    }
  }

  const handleDownload = async (document: Document) => {
    try {
      const token = localStorage.getItem('token')
      
      // Track download
      const response = await fetch(`http://localhost:3001/api/admin/documents/${document._id}/download`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })

      // Create download link
      const link = window.document.createElement('a')
      link.href = `/uploads/${document.filePath}`
      link.download = document.originalFileName
      link.click()
      
      fetchDocuments() // Refresh to update download count
    } catch (error) {
      console.error('Failed to download document:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      category: 'POLICY',
      subcategory: '',
      version: '1.0',
      isPublic: false,
      allowedRoles: [],
      tags: [],
      effectiveDate: '',
      expiryDate: '',
      status: 'ACTIVE'
    })
    setSelectedFile(null)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return '#059669'
      case 'DRAFT': return '#6b7280'
      case 'ARCHIVED': return '#7c3aed'
      case 'SUPERSEDED': return '#dc2626'
      default: return '#6b7280'
    }
  }

  if (loading && currentPage === 1) return <div className="loading">Loading documents...</div>

  return (
    <div className="document-management-container">
      <div className="header">
        <h1><FileText className="icon" /> Document Management</h1>
        <button 
          className="btn-primary"
          onClick={() => setShowUploadModal(true)}
        >
          <Plus size={20} /> Upload Document
        </button>
      </div>

      <div className="filters-section">
        <div className="filters-header">
          <h3><Filter size={20} /> Filters</h3>
        </div>
        
        <div className="filters-grid">
          <select 
            value={filters.category} 
            onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
          >
            <option value="">All Categories</option>
            <option value="POLICY">Policy</option>
            <option value="HANDBOOK">Handbook</option>
            <option value="ACCREDITATION">Accreditation</option>
            <option value="FORM">Form</option>
            <option value="GUIDELINE">Guideline</option>
            <option value="PROCEDURE">Procedure</option>
            <option value="REPORT">Report</option>
            <option value="OTHER">Other</option>
          </select>

          <select 
            value={filters.status} 
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
            <option value="SUPERSEDED">Superseded</option>
          </select>

          <div className="search-input">
            <Search size={20} />
            <input
              type="text"
              placeholder="Search documents..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="documents-grid">
        {documents.map((document) => (
          <div key={document._id} className="document-card">
            <div className="document-header">
              <div className="document-info">
                <h3>{document.title}</h3>
                <span className="category-badge">{document.category}</span>
                <span 
                  className="status-badge" 
                  style={{ backgroundColor: getStatusColor(document.status) }}
                >
                  {document.status}
                </span>
              </div>
              <div className="document-actions">
                <button 
                  className="btn-icon"
                  onClick={() => handleDownload(document)}
                  title="Download"
                >
                  <Download size={16} />
                </button>
                <button 
                  className="btn-icon"
                  onClick={() => {
                    setEditingDocument(document)
                    setFormData({
                      title: document.title,
                      description: document.description,
                      category: document.category,
                      subcategory: document.subcategory,
                      version: document.version,
                      isPublic: document.isPublic,
                      allowedRoles: document.allowedRoles,
                      tags: document.tags,
                      effectiveDate: document.effectiveDate ? new Date(document.effectiveDate).toISOString().slice(0, 10) : '',
                      expiryDate: document.expiryDate ? new Date(document.expiryDate).toISOString().slice(0, 10) : '',
                      status: document.status
                    })
                    setShowUploadModal(true)
                  }}
                  title="Edit"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  className="btn-icon delete"
                  onClick={() => handleDelete(document._id)}
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {document.description && (
              <p className="document-description">{document.description}</p>
            )}

            <div className="document-metadata">
              <div className="metadata-row">
                <span className="label">File:</span>
                <span className="value">{document.originalFileName}</span>
              </div>
              <div className="metadata-row">
                <span className="label">Size:</span>
                <span className="value">{formatFileSize(document.fileSize)}</span>
              </div>
              <div className="metadata-row">
                <span className="label">Version:</span>
                <span className="value">{document.version}</span>
              </div>
              <div className="metadata-row">
                <span className="label">Downloads:</span>
                <span className="value">{document.downloadCount}</span>
              </div>
              {document.tags.length > 0 && (
                <div className="metadata-row">
                  <span className="label">Tags:</span>
                  <div className="tags">
                    {document.tags.map((tag, index) => (
                      <span key={index} className="tag">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="document-footer">
              <span>Uploaded by {document.createdBy.displayName || document.createdBy.username}</span>
              <span>{formatDate(document.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          >
            Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          >
            Next
          </button>
        </div>
      )}

      {documents.length === 0 && !loading && (
        <div className="no-results">
          <FileText size={48} />
          <h3>No documents found</h3>
          <p>Try adjusting your filters or upload your first document.</p>
        </div>
      )}

      {showUploadModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{editingDocument ? 'Edit Document' : 'Upload Document'}</h2>
            <form onSubmit={handleUpload}>
              {!editingDocument && (
                <div className="form-group">
                  <label>File *</label>
                  <input
                    type="file"
                    onChange={handleFileSelect}
                    required
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                  />
                  {selectedFile && (
                    <div className="file-info">
                      <span>{selectedFile.name}</span>
                      <span>{formatFileSize(selectedFile.size)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  required
                  maxLength={200}
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  maxLength={1000}
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    required
                  >
                    <option value="POLICY">Policy</option>
                    <option value="HANDBOOK">Handbook</option>
                    <option value="ACCREDITATION">Accreditation</option>
                    <option value="FORM">Form</option>
                    <option value="GUIDELINE">Guideline</option>
                    <option value="PROCEDURE">Procedure</option>
                    <option value="REPORT">Report</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Subcategory</label>
                  <input
                    type="text"
                    value={formData.subcategory}
                    onChange={(e) => setFormData({...formData, subcategory: e.target.value})}
                    maxLength={100}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Version</label>
                  <input
                    type="text"
                    value={formData.version}
                    onChange={(e) => setFormData({...formData, version: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="ACTIVE">Active</option>
                    <option value="ARCHIVED">Archived</option>
                    <option value="SUPERSEDED">Superseded</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Effective Date</label>
                  <input
                    type="date"
                    value={formData.effectiveDate}
                    onChange={(e) => setFormData({...formData, effectiveDate: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label>Expiry Date</label>
                  <input
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({...formData, expiryDate: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-group checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isPublic}
                    onChange={(e) => setFormData({...formData, isPublic: e.target.checked})}
                  />
                  Make document public (accessible to all users)
                </label>
              </div>

              <div className="form-actions">
                <button type="button" onClick={() => {
                  setShowUploadModal(false)
                  setEditingDocument(null)
                  resetForm()
                }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingDocument ? 'Update' : 'Upload'} Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default DocumentManagement
