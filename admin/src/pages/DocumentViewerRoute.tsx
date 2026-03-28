import { useEffect, useState } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import DocumentViewer from './DocumentViewer'
import {
  ArchiveApiError,
  getArchiveDocument,
  getArchiveDocumentAssetUrl,
  trackArchiveDocumentDownload,
  type ArchiveDocument,
} from '../lib/documentArchiveApi'
import './DocumentViewerRoute.css'

type ViewerFeedback = {
  tone: 'success' | 'error'
  message: string
}

type DocumentViewerRouteProps = {
  documentId: string
  onClose: () => void
}

function formatFileSize(fileSize: number): string {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = fileSize
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function formatAbsoluteDate(value?: string): string {
  if (!value) {
    return 'No date'
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return 'No date'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsedDate)
}

function normalizeFileTypeLabel(rawValue: string): string {
  const cleanedValue = rawValue.replace(/^\./, '').trim()
  if (!cleanedValue) {
    return 'File'
  }

  const normalizedValue = cleanedValue.toUpperCase()
  return normalizedValue === 'JPG' ? 'JPEG' : normalizedValue
}

function getDocumentFileType(document: Pick<ArchiveDocument, 'originalFileName' | 'fileName' | 'mimeType'>): string {
  const nameCandidates = [document.originalFileName, document.fileName]

  for (const fileName of nameCandidates) {
    const extension = String(fileName || '').split('.').pop()
    if (extension && extension !== fileName) {
      return normalizeFileTypeLabel(extension)
    }
  }

  if (document.mimeType.startsWith('image/')) return 'Image'
  if (document.mimeType.includes('pdf')) return 'PDF'
  if (document.mimeType.includes('spreadsheet') || document.mimeType.includes('excel') || document.mimeType.includes('csv')) return 'Spreadsheet'
  if (document.mimeType.includes('word') || document.mimeType.includes('document')) return 'Document'
  return 'File'
}

function getPreviewKind(document: ArchiveDocument): 'image' | 'pdf' | 'text' | 'unsupported' {
  const fileType = getDocumentFileType(document)

  if (document.mimeType.startsWith('image/')) return 'image'
  if (document.mimeType === 'application/pdf' || fileType === 'PDF') return 'pdf'
  if (document.mimeType.startsWith('text/') || ['TXT', 'CSV', 'JSON', 'XML'].includes(fileType)) return 'text'
  return 'unsupported'
}

function getCategoryLabel(category: ArchiveDocument['category']): string {
  const labels: Record<ArchiveDocument['category'], string> = {
    POLICY: 'Policy',
    HANDBOOK: 'Handbook',
    ACCREDITATION: 'Accreditation',
    FORM: 'Form',
    GUIDELINE: 'Guideline',
    PROCEDURE: 'Procedure',
    REPORT: 'Report',
    OTHER: 'Other',
  }

  return labels[category] ?? 'Other'
}

function getDocumentSegmentSummary(document: ArchiveDocument): string {
  if (!document.folderId) {
    return 'Unfoldered'
  }

  const segmentLabels: Record<string, string> = {
    DOCUMENT_TYPE: 'Document Type',
    DEPARTMENT: 'Department',
    DATE: 'Date',
    CUSTOM: 'Custom Folder',
  }

  const segmentLabel = segmentLabels[document.folderId.segmentType || 'CUSTOM'] || 'Custom Folder'
  const segmentValue = document.folderId.segmentValue ? `: ${document.folderId.segmentValue}` : ''
  return `${segmentLabel}${segmentValue}`
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof ArchiveApiError) {
    return error.message
  }
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}

function getDownloadFileName(document: Pick<ArchiveDocument, 'originalFileName' | 'fileName' | 'title'>): string {
  return String(document.originalFileName || document.fileName || document.title || 'document').trim() || 'document'
}

async function fetchDocumentBlob(document: Pick<ArchiveDocument, 'filePath'>): Promise<Blob> {
  const response = await fetch(getArchiveDocumentAssetUrl(document))
  if (!response.ok) {
    throw new Error('Unable to load the document file.')
  }

  return response.blob()
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  window.document.body.appendChild(link)
  link.click()
  window.document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function printBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const iframe = window.document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.opacity = '0'
    iframe.style.pointerEvents = 'none'
    iframe.style.border = '0'
    let finished = false

    const cleanup = () => {
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl)
        iframe.remove()
      }, 1000)
    }

    iframe.onload = () => {
      const printWindow = iframe.contentWindow
      if (!printWindow) {
        cleanup()
        reject(new Error('Unable to prepare the print preview.'))
        return
      }

      const finish = () => {
        if (finished) {
          return
        }

        finished = true
        cleanup()
        resolve()
      }

      printWindow.onafterprint = finish

      window.setTimeout(() => {
        try {
          printWindow.focus()
          printWindow.print()
          window.setTimeout(finish, 1500)
        } catch {
          finished = true
          cleanup()
          reject(new Error('Unable to trigger the print dialog for this file.'))
        }
      }, 250)
    }

    iframe.onerror = () => {
      finished = true
      cleanup()
      reject(new Error('Unable to prepare the print preview.'))
    }

    iframe.src = objectUrl
    window.document.body.appendChild(iframe)
  })
}

export default function DocumentViewerRoute({ documentId, onClose }: DocumentViewerRouteProps) {
  const initialSnapshot = (() => {
    const routeState = window.history.state as { documentViewerId?: string; documentViewerSnapshot?: ArchiveDocument } | null
    if (routeState?.documentViewerId === documentId && routeState.documentViewerSnapshot) {
      return routeState.documentViewerSnapshot
    }

    return null
  })()

  const [viewerDocument, setViewerDocument] = useState<ArchiveDocument | null>(initialSnapshot)
  const [loading, setLoading] = useState(!initialSnapshot)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<ViewerFeedback | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [previewAssetUrl, setPreviewAssetUrl] = useState('')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewErrorMessage, setPreviewErrorMessage] = useState('')

  useEffect(() => {
    const previousOverflow = window.document.body.style.overflow
    const previousTitle = window.document.title
    window.document.body.style.overflow = 'hidden'

    return () => {
      window.document.body.style.overflow = previousOverflow
      window.document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (window.document.fullscreenElement) {
          return
        }

        void handleCloseViewer()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(window.document.fullscreenElement))
    }

    window.document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => window.document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  async function handleCloseViewer() {
    if (window.document.fullscreenElement) {
      try {
        await window.document.exitFullscreen()
      } catch {
        // Ignore fullscreen exit errors and continue closing the viewer.
      }
    }

    onClose()
  }

  useEffect(() => {
    let cancelled = false

    const routeState = window.history.state as { documentViewerId?: string; documentViewerSnapshot?: ArchiveDocument } | null
    const historySnapshot = routeState?.documentViewerId === documentId ? routeState.documentViewerSnapshot ?? null : null
    if (historySnapshot && reloadToken === 0) {
      setViewerDocument(historySnapshot)
      setError('')
      setLoading(false)
      window.document.title = `${historySnapshot.title} | Document Viewer`
      return () => {
        cancelled = true
      }
    }

    if (historySnapshot) {
      setViewerDocument(historySnapshot)
      setLoading(false)
    } else {
      setLoading(true)
    }

    setError('')

    void getArchiveDocument(documentId)
      .then((nextDocument) => {
        if (cancelled) {
          return
        }

        setViewerDocument(nextDocument)
        window.history.replaceState(
          {
            ...(window.history.state || {}),
            documentViewerId: documentId,
            documentViewerSnapshot: nextDocument,
          },
          '',
          window.location.pathname
        )
        window.document.title = `${nextDocument.title} | Document Viewer`
      })
      .catch((nextError) => {
        if (!cancelled) {
          if (!historySnapshot) {
            setError(getErrorMessage(nextError, 'Unable to load the document viewer.'))
          } else {
            setFeedback({ tone: 'error', message: getErrorMessage(nextError, 'Unable to refresh the latest document details.') })
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [documentId, reloadToken])

  useEffect(() => {
    if (!viewerDocument) {
      setPreviewAssetUrl('')
      setIsPreviewLoading(false)
      setPreviewErrorMessage('')
      return
    }

    const nextPreviewKind = getPreviewKind(viewerDocument)
    if (nextPreviewKind === 'image' || nextPreviewKind === 'unsupported') {
      setPreviewAssetUrl(getArchiveDocumentAssetUrl(viewerDocument))
      setIsPreviewLoading(false)
      setPreviewErrorMessage('')
      return
    }

    let cancelled = false
    let objectUrl = ''
    setIsPreviewLoading(true)
    setPreviewAssetUrl('')
    setPreviewErrorMessage('')

    void fetchDocumentBlob(viewerDocument)
      .then((fileBlob) => {
        objectUrl = URL.createObjectURL(fileBlob)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }

        setPreviewAssetUrl(objectUrl)
      })
      .catch((nextError) => {
        if (!cancelled) {
          setPreviewErrorMessage(getErrorMessage(nextError, 'Unable to load the document preview.'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPreviewLoading(false)
        }
      })

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [
    viewerDocument?._id,
    viewerDocument?.filePath,
    viewerDocument?.updatedAt,
    viewerDocument?.mimeType,
    viewerDocument?.originalFileName,
    viewerDocument?.fileName,
  ])

  async function handleDownload() {
    if (!viewerDocument) {
      return
    }

    try {
      const [fileBlob] = await Promise.all([
        fetchDocumentBlob(viewerDocument),
        trackArchiveDocumentDownload(viewerDocument._id).catch(() => null),
      ])

      triggerBlobDownload(fileBlob, getDownloadFileName(viewerDocument))
      setFeedback({ tone: 'success', message: `Download started for "${viewerDocument.title}".` })
    } catch (nextError) {
      setFeedback({ tone: 'error', message: getErrorMessage(nextError, 'Unable to start the download.') })
    }
  }

  function handlePrint() {
    if (!viewerDocument) {
      return
    }

    if (getPreviewKind(viewerDocument) === 'unsupported') {
      setFeedback({ tone: 'error', message: 'Print is not available for this file type.' })
      return
    }

    void fetchDocumentBlob(viewerDocument)
      .then((fileBlob) => printBlob(fileBlob))
      .catch((nextError) => {
        setFeedback({ tone: 'error', message: getErrorMessage(nextError, 'Unable to trigger the print dialog for this file.') })
      })
  }

  async function handleToggleFullscreen() {
    try {
      if (window.document.fullscreenElement) {
        await window.document.exitFullscreen()
        return
      }

      await window.document.documentElement.requestFullscreen()
    } catch {
      setFeedback({ tone: 'error', message: 'Fullscreen mode is not available in this browser.' })
    }
  }

  if (loading) {
    return (
      <div className="document-viewer-route">
        <div className="document-viewer-route__state">
          <LoaderCircle className="spin" size={28} />
          <span>Loading document viewer...</span>
        </div>
      </div>
    )
  }

  if (error || !viewerDocument) {
    return (
      <div className="document-viewer-route">
        <div className="document-viewer-route__state">
          <strong>Document viewer is unavailable.</strong>
          <p>{error || 'The requested document could not be loaded.'}</p>
          <div className="document-viewer-route__state-actions">
            <button type="button" className="document-viewer-route__button" onClick={() => setReloadToken((currentValue) => currentValue + 1)}>
              <RefreshCw size={16} />
              Retry
            </button>
            <button type="button" className="document-viewer-route__button is-ghost" onClick={handleCloseViewer}>
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  const previewKind = getPreviewKind(viewerDocument)

  return (
    <DocumentViewer
      title={viewerDocument.title}
      fileType={getDocumentFileType(viewerDocument)}
      fileSizeLabel={formatFileSize(viewerDocument.fileSize)}
      modifiedLabel={formatAbsoluteDate(viewerDocument.updatedAt)}
      folderPath={viewerDocument.folderId ? [viewerDocument.folderId.name] : []}
      categoryLabel={getCategoryLabel(viewerDocument.category)}
      segmentLabel={getDocumentSegmentSummary(viewerDocument)}
      previewKind={previewKind}
      assetUrl={previewKind === 'image' || previewKind === 'unsupported' ? getArchiveDocumentAssetUrl(viewerDocument) : previewAssetUrl}
      isPreviewLoading={isPreviewLoading}
      previewErrorMessage={previewErrorMessage}
      feedback={feedback}
      onDismissFeedback={() => setFeedback(null)}
      onBack={handleCloseViewer}
      onClose={handleCloseViewer}
      onPrint={handlePrint}
      onDownload={handleDownload}
      onToggleFullscreen={handleToggleFullscreen}
      canPrint={previewKind !== 'unsupported'}
      isFullscreen={isFullscreen}
    />
  )
}
