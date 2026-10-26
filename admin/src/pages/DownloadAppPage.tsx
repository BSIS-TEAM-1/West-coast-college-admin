import React, { useEffect, useState } from 'react'
import { Download, CheckCircle2 } from 'lucide-react'
import './DownloadAppPage.css'

type DownloadAppPageProps = {
  onBack: () => void
}

type ApkMetadata = {
  available: boolean
  fileName: string
  fileSize: string
  appVersion: string
  architecture: string
  downloadUrl: string
}

const DEFAULT_METADATA: ApkMetadata = {
  available: true,
  fileName: 'WCConnect-arm64.apk',
  fileSize: '~22.4 MB',
  appVersion: '1.0.0+1',
  architecture: 'arm64-v8a',
  downloadUrl: '/download-apk/file'
}

function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return DEFAULT_METADATA.fileSize
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DownloadAppPage({ onBack }: DownloadAppPageProps) {
  const [metadata, setMetadata] = useState<ApkMetadata>(DEFAULT_METADATA)
  const [downloadStarted, setDownloadStarted] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadMetadata = async () => {
      try {
        const res = await fetch('/api/public/apk-info', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled && data) {
            setMetadata({
              available: Boolean(data.available ?? true),
              fileName: data.fileName || DEFAULT_METADATA.fileName,
              fileSize: data.fileSize || DEFAULT_METADATA.fileSize,
              appVersion: data.appVersion || DEFAULT_METADATA.appVersion,
              architecture: data.architecture || DEFAULT_METADATA.architecture,
              downloadUrl: data.downloadUrl || DEFAULT_METADATA.downloadUrl
            })
            return
          }
        }
      } catch {
        // Fallback to static HEAD check
      }

      try {
        const headRes = await fetch('/app-release.apk', { method: 'HEAD' })
        if (!cancelled && headRes.ok) {
          const contentLength = Number(headRes.headers.get('content-length') || 0)
          setMetadata(prev => ({
            ...prev,
            available: true,
            fileSize: contentLength > 0 ? formatByteSize(contentLength) : prev.fileSize,
            downloadUrl: '/app-release.apk'
          }))
        }
      } catch {
        // Retain default metadata
      }
    }

    void loadMetadata()

    return () => {
      cancelled = true
    }
  }, [])

  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault()
    onBack()
  }

  const handleDownloadClick = () => {
    setDownloadStarted(true)
  }

  return (
    <div className="dl-page-root">
      <nav>
        <div className="wrap">
          <a className="logo" href="/" onClick={handleBackClick}>
            <img src="/logo-bg-removed.png" alt="West Coast College" />
            <span className="logo-brand-text">
              <strong>West Coast College</strong>
              <small>WCConnect Mobile Portal</small>
            </span>
          </a>
          <a
            href="/"
            onClick={handleBackClick}
            className="btn btn-outline"
            style={{ padding: '8px 18px', fontSize: '14px' }}
          >
            &larr; Back to site
          </a>
        </div>
      </nav>

      <main>
        <div className="wrap">
          <div className="dl-grid">
            <div className="dl-img">
              <img
                src="/Download-phone-feature.png"
                alt="WCConnect app on a phone"
                className="dl-phone-img"
              />
            </div>

            <div className="dl-copy">
              <h1>Get The App</h1>
              <p>Ready to carry your campus in your pocket?</p>
              <p>
                Access your real-time verified grades, official Certificate of Registration (COR),
                class schedules, faculty evaluations, and campus announcements &mdash; built
                exclusively for West Coast College students and faculty.
              </p>
              <p className="sign">Time to get connected.</p>
              <div className="dl-cta">
                <a
                  className="btn btn-dark"
                  href={metadata.downloadUrl}
                  download={metadata.fileName}
                  onClick={handleDownloadClick}
                >
                  <Download size={18} style={{ marginRight: 8, verticalAlign: -2 }} />
                  Download for Android
                </a>
              </div>
              {downloadStarted && (
                <div className="dl-feedback">
                  <CheckCircle2 size={16} />
                  <span>
                    Downloading <strong>{metadata.fileName}</strong> ({metadata.fileSize}). Open the file on your device to install.
                  </span>
                </div>
              )}
              <div className="dl-meta">
                Android 8.0+ &middot; Version {metadata.appVersion} &middot; Direct APK ({metadata.fileSize}) &middot; Powered by West Coast College
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer>
        <div>West Coast College &mdash; Official Student &amp; Faculty Mobile Portal</div>
      </footer>
    </div>
  )
}
