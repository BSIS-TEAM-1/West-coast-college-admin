import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  Smartphone,
  Download,
  ShieldCheck,
  Cpu,
  CheckCircle2,
  ArrowLeft,
  QrCode,
  FileCode2,
  Sparkles,
  BookOpen,
  Calendar,
  Bell,
  FileText
} from 'lucide-react'
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
  fileSize: '~21 MB',
  appVersion: '1.0.0+1',
  architecture: 'arm64-v8a (64-bit ARM)',
  downloadUrl: '/WCConnect-arm64.apk'
}

function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return DEFAULT_METADATA.fileSize
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DownloadAppPage({ onBack }: DownloadAppPageProps) {
  const [metadata, setMetadata] = useState<ApkMetadata>(DEFAULT_METADATA)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
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
        // Fallback to HEAD check on static APK file
      }

      try {
        const headRes = await fetch('/WCConnect-arm64.apk', { method: 'HEAD' })
        if (!cancelled && headRes.ok) {
          const contentLength = Number(headRes.headers.get('content-length') || 0)
          setMetadata(prev => ({
            ...prev,
            available: true,
            fileSize: contentLength > 0 ? formatByteSize(contentLength) : prev.fileSize,
            downloadUrl: '/WCConnect-arm64.apk'
          }))
        }
      } catch {
        // Keep default metadata
      }
    }

    const generateQr = async () => {
      try {
        const targetUrl = `${window.location.origin}/download-apk`
        const url = await QRCode.toDataURL(targetUrl, {
          width: 200,
          margin: 1,
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          }
        })
        if (!cancelled) setQrDataUrl(url)
      } catch {
        // Ignore QR generation errors
      }
    }

    void loadMetadata()
    void generateQr()

    return () => {
      cancelled = true
    }
  }, [])

  const handleDownloadClick = () => {
    setDownloadStarted(true)
  }

  return (
    <div className="download-app-page">
      <header className="download-app-header">
        <a
          href="#top"
          className="download-app-brand"
          onClick={e => {
            e.preventDefault()
            onBack()
          }}
        >
          <img src="/Logo.jpg" alt="West Coast College" />
          <span>West Coast College</span>
        </a>
        <div className="download-app-header-actions">
          <button type="button" className="download-app-btn download-app-btn-ghost" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>Back to Home</span>
          </button>
        </div>
      </header>

      <main className="download-app-main" id="top">
        <section className="download-app-hero">
          <div className="download-app-hero-content">
            <div className="download-app-badges">
              <span className="download-app-badge download-app-badge-gold">
                <Smartphone size={14} />
                Official Android Release
              </span>
              <span className="download-app-badge download-app-badge-blue">
                <Cpu size={14} />
                ARM64 (arm64-v8a) Compatible
              </span>
            </div>

            <h1>WestConnect Student Mobile App</h1>
            <p className="download-app-lead">
              Access your grades, class schedule, Certificate of Registration (COR), and real-time campus
              announcements directly on your Android smartphone. Built natively for 64-bit ARM64 Android devices.
            </p>

            <div className="download-app-cta-group">
              <a
                href={metadata.downloadUrl}
                download={metadata.fileName}
                className="download-app-primary-cta"
                onClick={handleDownloadClick}
              >
                <Download size={20} />
                <div className="download-app-primary-cta-text">
                  <strong>Download APK for Android (ARM64)</strong>
                  <span>
                    {metadata.fileName} &bull; {metadata.fileSize} &bull; v{metadata.appVersion}
                  </span>
                </div>
              </a>

              {downloadStarted && (
                <div className="download-app-started-banner" role="status">
                  <CheckCircle2 size={18} />
                  <span>
                    Your download has started! Once finished, open <strong>{metadata.fileName}</strong> on your Android device to install.
                  </span>
                </div>
              )}
            </div>

            <div className="download-app-specs-strip">
              <div className="download-app-spec-pill">
                <Cpu size={16} />
                <div>
                  <small>Architecture</small>
                  <strong>{metadata.architecture}</strong>
                </div>
              </div>
              <div className="download-app-spec-pill">
                <ShieldCheck size={16} />
                <div>
                  <small>Requirement</small>
                  <strong>Android 5.0+ (API 21+)</strong>
                </div>
              </div>
              <div className="download-app-spec-pill">
                <FileCode2 size={16} />
                <div>
                  <small>Package ID</small>
                  <strong>com.westcoastcollege.westconnect</strong>
                </div>
              </div>
            </div>
          </div>

          <aside className="download-app-qr-card" aria-label="QR Code for mobile download">
            <div className="download-app-qr-header">
              <QrCode size={18} />
              <span>Scan with Android Phone</span>
            </div>
            <div className="download-app-qr-box">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Code to open WestConnect APK download page" width={180} height={180} />
              ) : (
                <div className="download-app-qr-placeholder">Generating QR…</div>
              )}
            </div>
            <p className="download-app-qr-caption">
              Viewing on a computer? Point your phone&apos;s camera at this QR code to open this page and install directly on your Android device.
            </p>
          </aside>
        </section>

        <section className="download-app-grid">
          <article className="download-app-card">
            <h2>
              <Sparkles size={20} />
              How to Install on Android
            </h2>
            <ol className="download-app-steps">
              <li>
                <span className="download-app-step-num">1</span>
                <div>
                  <strong>Download the ARM64 APK</strong>
                  <p>Tap the <em>Download APK for Android (ARM64)</em> button above and wait for <code>{metadata.fileName}</code> to finish downloading.</p>
                </div>
              </li>
              <li>
                <span className="download-app-step-num">2</span>
                <div>
                  <strong>Allow Installation from Browser</strong>
                  <p>Open the downloaded file from your notification bar or <em>Files / Downloads</em> app. If prompted, enable <strong>Install unknown apps</strong> for your browser.</p>
                </div>
              </li>
              <li>
                <span className="download-app-step-num">3</span>
                <div>
                  <strong>Install &amp; Sign In</strong>
                  <p>Tap <strong>Install</strong>, open <strong>WestConnect</strong>, and log in using your official 12-digit Student Number and password.</p>
                </div>
              </li>
            </ol>
          </article>

          <article className="download-app-card">
            <h2>
              <Smartphone size={20} />
              What&apos;s Inside WestConnect
            </h2>
            <div className="download-app-features">
              <div className="download-app-feature-item">
                <span className="download-app-feature-icon">
                  <BookOpen size={18} />
                </span>
                <div>
                  <strong>Real-Time Grades &amp; Academic Evaluation</strong>
                  <p>View published semester grades, GWA, and curriculum progress as soon as they are verified by the Registrar.</p>
                </div>
              </div>
              <div className="download-app-feature-item">
                <span className="download-app-feature-icon">
                  <Calendar size={18} />
                </span>
                <div>
                  <strong>Block &amp; Class Schedule</strong>
                  <p>Check your assigned block section, subject schedule, room assignments, and instructors anytime.</p>
                </div>
              </div>
              <div className="download-app-feature-item">
                <span className="download-app-feature-icon">
                  <FileText size={18} />
                </span>
                <div>
                  <strong>Digital Certificate of Registration (COR)</strong>
                  <p>Keep your current enrollment details and subject load accessible on your phone.</p>
                </div>
              </div>
              <div className="download-app-feature-item">
                <span className="download-app-feature-icon">
                  <Bell size={18} />
                </span>
                <div>
                  <strong>Campus Announcements &amp; Alerts</strong>
                  <p>Stay updated on school announcements, enrollment schedules, and academic events.</p>
                </div>
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}
