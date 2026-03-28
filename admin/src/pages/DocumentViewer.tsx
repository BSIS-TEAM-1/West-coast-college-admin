import { ArrowLeft, Download, Expand, FileText, FolderOpen, Minimize, Printer, X } from 'lucide-react'
import './DocumentViewer.css'

type ViewerFeedback = {
  tone: 'success' | 'error'
  message: string
}

type DocumentViewerProps = {
  title: string
  fileType: string
  fileSizeLabel: string
  modifiedLabel: string
  folderPath: string[]
  categoryLabel: string
  segmentLabel: string
  previewKind: 'image' | 'pdf' | 'text' | 'unsupported'
  assetUrl: string
  isPreviewLoading: boolean
  previewErrorMessage?: string
  feedback?: ViewerFeedback | null
  onDismissFeedback: () => void
  onBack: () => void
  onClose: () => void
  onPrint: () => void
  onDownload: () => void
  onToggleFullscreen: () => void
  canPrint: boolean
  isFullscreen: boolean
}

export default function DocumentViewer({
  title,
  fileType,
  fileSizeLabel,
  modifiedLabel,
  folderPath,
  categoryLabel,
  segmentLabel,
  previewKind,
  assetUrl,
  isPreviewLoading,
  previewErrorMessage,
  feedback,
  onDismissFeedback,
  onBack,
  onClose,
  onPrint,
  onDownload,
  onToggleFullscreen,
  canPrint,
  isFullscreen,
}: DocumentViewerProps) {
  const addressSegments = ['Archive', ...folderPath, title]
  const addressLabel = addressSegments.join(' / ')

  return (
    <section className="document-viewer" aria-label="Document viewer">
      <header className="document-viewer__topbar">
        <div className="document-viewer__title-block">
          <button type="button" className="document-viewer__icon-button" onClick={onBack} aria-label="Back to archive">
            <ArrowLeft size={18} />
          </button>
          <div className="document-viewer__title-copy">
            <h1>{title}</h1>
            <p>{fileType} | {fileSizeLabel} | {modifiedLabel}</p>
          </div>
        </div>

        <div className="document-viewer__actions">
          <button
            type="button"
            className="document-viewer__button document-viewer__button--ghost"
            onClick={onPrint}
            disabled={!canPrint}
            aria-disabled={!canPrint}
            title={canPrint ? 'Print document' : 'Print is not available for this file type'}
          >
            <Printer size={16} />
            Print
          </button>
          <button type="button" className="document-viewer__button document-viewer__button--ghost" onClick={onToggleFullscreen}>
            {isFullscreen ? <Minimize size={16} /> : <Expand size={16} />}
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
          <button type="button" className="document-viewer__button document-viewer__button--primary" onClick={onDownload}>
            <Download size={16} />
            Download
          </button>
          <button type="button" className="document-viewer__icon-button" onClick={onClose} aria-label="Close viewer">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="document-viewer__addressbar" aria-label="File address">
        <span className="document-viewer__address-label">Location</span>
        <div className="document-viewer__address-value" title={addressLabel}>
          {addressLabel}
        </div>
      </div>

      {feedback ? (
        <div className={`document-viewer__banner is-${feedback.tone}`}>
          <span>{feedback.message}</span>
          <button type="button" className="document-viewer__icon-button" onClick={onDismissFeedback} aria-label="Dismiss message">
            <X size={16} />
          </button>
        </div>
      ) : null}

      <main className="document-viewer__stage">
        <div className="document-viewer__stage-meta">
          <div className="document-viewer__stage-chip">
            <FolderOpen size={15} />
            <span>{folderPath.length > 0 ? folderPath.join(' / ') : 'Archive root'}</span>
          </div>
          <div className="document-viewer__stage-chip">
            <span>{categoryLabel}</span>
          </div>
          <div className="document-viewer__stage-chip">
            <span>{segmentLabel}</span>
          </div>
        </div>
        {previewKind === 'image' ? (
          <img className="document-viewer__frame" src={assetUrl} alt={title} />
        ) : previewKind === 'pdf' || previewKind === 'text' ? (
          isPreviewLoading ? (
            <div className="document-viewer__unsupported">
              <FileText size={30} />
              <strong>Loading preview...</strong>
              <p>Preparing the document preview.</p>
            </div>
          ) : assetUrl ? (
            <iframe className="document-viewer__frame" src={assetUrl} title={title} />
          ) : (
            <div className="document-viewer__unsupported">
              <FileText size={30} />
              <strong>Preview is not available right now.</strong>
              <p>{previewErrorMessage || 'Use the actions above to print or download the original file.'}</p>
            </div>
          )
        ) : (
          <div className="document-viewer__unsupported">
            <FileText size={30} />
            <strong>Preview is not available for this file type.</strong>
            <p>Use the actions above to print or download the original file.</p>
          </div>
        )}
      </main>
    </section>
  )
}
