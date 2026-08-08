const SendGridEmailService = require('./sendGridEmailService')
const SemaphoreEmailService = require('./semaphoreEmailService')
const GmailApiEmailService = require('./gmailApiEmailService')
const fs = require('fs')
const path = require('path')

const LOGO_CONTENT_ID = 'wcc-logo'

let cachedLogoBase64 = null
let logoLoadAttempted = false

function getLogoBase64() {
  if (logoLoadAttempted) return cachedLogoBase64
  logoLoadAttempted = true

  const candidatePaths = [
    path.join(__dirname, '..', '..', 'public', 'logo-bg-removed.png'),
    path.join(__dirname, '..', 'public', 'logo-bg-removed.png'),
    path.join(__dirname, 'public', 'logo-bg-removed.png')
  ]

  for (const logoPath of candidatePaths) {
    try {
      if (fs.existsSync(logoPath)) {
        const buffer = fs.readFileSync(logoPath)
        cachedLogoBase64 = buffer.toString('base64')
        console.info('Applicant email logo loaded from:', logoPath)
        break
      }
    } catch (err) {
      console.warn('Failed to load logo from:', logoPath, err?.message)
    }
  }

  if (!cachedLogoBase64) {
    console.warn('No logo file found for applicant emails — falling back to text badge.')
  }

  return cachedLogoBase64
}

function getLogoAttachment() {
  const base64 = getLogoBase64()
  if (!base64) return null

  return {
    filename: 'logo-bg-removed.png',
    contentType: 'image/png',
    disposition: 'inline',
    contentId: LOGO_CONTENT_ID,
    content: base64
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;')
}

function getBrandMarkup() {
  const brandStyle = 'display:inline-block;width:72px;height:72px;border:2px solid #fde68a;border-radius:50%;background:#ffffff;color:#7c2d12;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;line-height:68px;text-align:center;text-decoration:none;'

  const candidateUrls = [
    process.env.WCC_WEBSITE_URL,
    process.env.PUBLIC_URL,
    process.env.APP_URL,
    process.env.FRONTEND_URL,
    process.env.RENDER_EXTERNAL_URL
  ]
  const brandUrl = candidateUrls
    .map((value) => String(value || '').trim())
    .find((value) => /^https:\/\//i.test(value))

  if (brandUrl) {
    return `<a href="${escapeHtmlAttribute(brandUrl)}" target="_blank" aria-label="Visit West Coast College" style="${brandStyle}">WCC</a>`
  }

  return `<span aria-label="West Coast College" style="${brandStyle}">WCC</span>`
}

const STATUS_CONFIG = {
  'Submitted': {
    subject: 'We received your West Coast College application',
    panelColor: '#2563eb',
    panelBg: '#eff6ff',
    panelBorder: '#93c5fd',
    heading: 'Your application is being processed',
    body: 'Thank you for applying to West Coast College! We have received your application and it is now being processed. Our admissions team will review your submission and contact you with updates. Please keep your applicant number for reference.'
  },
  'For Evaluation': {
    subject: 'Your West Coast College application is being processed',
    panelColor: '#f59e0b',
    panelBg: '#fffbeb',
    panelBorder: '#fcd34d',
    heading: 'Your application is being reviewed',
    body: 'Good news! Your application is now being evaluated by our admissions team. We will contact you once the review is complete.'
  },
  'Incomplete Requirements': {
    subject: 'Action needed: missing requirements for your WCC application',
    panelColor: '#b45309',
    panelBg: '#fffbeb',
    panelBorder: '#fcd34d',
    heading: 'Additional requirements needed',
    body: 'Your application requires additional information or documents before we can proceed with the review. Please review the remarks below and submit the missing requirements as soon as possible.'
  },
  'Approved for Enrollment': {
    subject: 'Congratulations! You are approved for enrollment at WCC',
    panelColor: '#15803d',
    panelBg: '#f0fdf4',
    panelBorder: '#86efac',
    heading: 'You are approved for enrollment!',
    body: 'Congratulations! Your application has been approved. Please proceed to the admissions office to complete your enrollment. Bring this email and a valid ID for verification.'
  },
  'Rejected': {
    subject: 'Update on your West Coast College application',
    panelColor: '#b91c1c',
    panelBg: '#fef2f2',
    panelBorder: '#fca5a5',
    heading: 'Application status update',
    body: 'After careful review of your application, we regret to inform you that we are unable to offer you admission at this time. We appreciate your interest in West Coast College and encourage you to apply again in the future.'
  },
  'Cancelled': {
    subject: 'Your West Coast College application has been cancelled',
    panelColor: '#6b7280',
    panelBg: '#f9fafb',
    panelBorder: '#e5e7eb',
    heading: 'Application cancelled',
    body: 'Your application has been cancelled. If you believe this was done in error or if you wish to reapply, please contact our admissions office.'
  }
}

function buildStatusEmailHtml({ logoMarkup, applicantName, applicantNumber, status, remarks, courseName, config }) {
  const remarksBlock = remarks
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;border-collapse:separate;"><tr><td style="padding:16px 18px;background:#f8fafc;border-left:4px solid ${escapeHtmlAttribute(config.panelColor)};border-radius:6px;"><p style="margin:0 0 6px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#475569;">Registrar remarks</p><p style="margin:0;font-size:15px;line-height:24px;color:#1e293b;">${escapeHtml(remarks)}</p></td></tr></table>`
    : ''

  const courseLine = courseName
    ? `<p class="email-muted" style="margin:0 0 4px;font-size:14px;line-height:22px;color:#64748b;">Program: <strong>${escapeHtml(courseName)}</strong></p>`
    : ''

  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">',
    '<style>@media only screen and (max-width:620px){.email-shell{width:100%!important}.email-pad{padding-left:24px!important;padding-right:24px!important}}@media (prefers-color-scheme:dark){.email-bg{background:#111827!important}.email-shell,.email-body{background:#1f2937!important}.email-text{color:#e5e7eb!important}.email-muted{color:#cbd5e1!important}.email-footer{background:#172033!important;color:#94a3b8!important}}</style>',
    '</head><body class="email-bg" style="margin:0;padding:0;background:#f1f5f9;-webkit-text-size-adjust:100%;word-spacing:normal;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-bg" style="width:100%;background:#f1f5f9;border-collapse:collapse;"><tr><td align="center" style="padding:32px 12px;">',
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;border-collapse:separate;overflow:hidden;">',
    '<tr><td align="center" style="padding:32px 32px 24px;background:#7c2d12;">',
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center">${logoMarkup}</td></tr></table>`,
    '<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#fde68a;">West Coast College</p>',
    '<h1 style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;color:#ffffff;">Application Status Update</h1>',
    '</td></tr>',
    '<tr><td class="email-body email-pad" style="padding:36px 40px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">',
    `<p class="email-text" style="margin:0 0 14px;font-size:16px;line-height:25px;color:#1e293b;">Hello ${escapeHtml(applicantName)},</p>`,
    `<p class="email-muted" style="margin:0 0 4px;font-size:14px;line-height:22px;color:#64748b;">Applicant Number: <strong>${escapeHtml(applicantNumber)}</strong></p>`,
    courseLine,
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;border-collapse:separate;"><tr><td align="left" style="padding:24px 20px;background:${escapeHtmlAttribute(config.panelBg)};border:1px solid ${escapeHtmlAttribute(config.panelBorder)};border-radius:12px;">`,
    `<p style="margin:0 0 8px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${escapeHtmlAttribute(config.panelColor)};">Status: ${escapeHtml(status)}</p>`,
    `<p style="margin:0 0 10px;font-size:18px;line-height:26px;font-weight:600;color:#1e293b;">${escapeHtml(config.heading)}</p>`,
    `<p class="email-text" style="margin:0;font-size:15px;line-height:24px;color:#1e293b;">${escapeHtml(config.body)}</p>`,
    '</td></tr></table>',
    remarksBlock,
    '</td></tr>',
    '<tr><td align="center" class="email-footer email-pad" style="padding:24px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;color:#64748b;">',
    `<p style="margin:0;font-size:12px;line-height:19px;">&copy; ${new Date().getFullYear()} West Coast College. All rights reserved.</p>`,
    '<p style="margin:4px 0 0;font-size:12px;line-height:19px;">West Coast College Admin Portal &bull; Automated notification</p>',
    '</td></tr></table>',
    '</td></tr></table></body></html>'
  ].join('')
}

function normalizeProviderPriority(value) {
  const supportedProviders = ['gmail-api', 'semaphore', 'sendgrid']
  const requested = String(value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  const ordered = []
  requested.forEach((providerKey) => {
    if (supportedProviders.includes(providerKey) && !ordered.includes(providerKey)) {
      ordered.push(providerKey)
    }
  })

  return ordered.length > 0 ? ordered : ['gmail-api']
}

class ApplicantEmailService {
  constructor({
    gmailApiService = new GmailApiEmailService(),
    semaphoreService = new SemaphoreEmailService(),
    sendGridService = new SendGridEmailService(),
    providerPriority = process.env.VERIFICATION_EMAIL_PROVIDER_PRIORITY || 'gmail-api'
  } = {}) {
    this.gmailApiService = gmailApiService
    this.semaphoreService = semaphoreService
    this.sendGridService = sendGridService
    this.providerPriority = normalizeProviderPriority(providerPriority)
  }

  getProviders() {
    const serviceMap = {
      'gmail-api': this.gmailApiService,
      'semaphore': this.semaphoreService,
      'sendgrid': this.sendGridService
    }

    return this.providerPriority
      .map((providerKey) => ({
        providerKey,
        service: serviceMap[providerKey]
      }))
      .filter(({ service }) => service && typeof service.sendEmail === 'function')
  }

  isConfigured() {
    return this.getProviders().some(({ service }) => typeof service.isConfigured === 'function' && service.isConfigured())
  }

  async sendStatusUpdate({ to, applicantName, applicantNumber, status, remarks, courseName } = {}) {
    const recipientEmail = String(to || '').trim().toLowerCase()
    if (!isValidEmail(recipientEmail)) {
      return { sent: false, provider: null, error: 'Invalid recipient email address.' }
    }

    const config = STATUS_CONFIG[status]
    if (!config) {
      return { sent: false, provider: null, error: `No email template for status "${status}".` }
    }

    const safeName = escapeHtml(applicantName || 'Applicant')
    const safeNumber = escapeHtml(applicantNumber || 'N/A')
    const subject = config.subject
    const text = [
      `Hello ${applicantName || 'Applicant'},`,
      '',
      `Application Number: ${applicantNumber || 'N/A'}`,
      courseName ? `Program: ${courseName}` : '',
      '',
      `Status: ${status}`,
      '',
      config.body,
      '',
      remarks ? `Registrar remarks: ${remarks}` : '',
      '',
      'This is an automated message from West Coast College.'
    ].filter(Boolean).join('\n')

    let lastError = null

    for (const { providerKey, service } of this.getProviders()) {
      if (typeof service.isConfigured === 'function' && !service.isConfigured()) {
        continue
      }

      try {
        const supportsInline = providerKey !== 'semaphore'
        const logoAttachment = supportsInline ? getLogoAttachment() : null
        const logoMarkup = logoAttachment
          ? `<img src="cid:${LOGO_CONTENT_ID}" alt="West Coast College" width="72" height="72" style="display:inline-block;width:72px;height:72px;border:2px solid #fde68a;border-radius:50%;background:#ffffff;" />`
          : getBrandMarkup()
        const html = buildStatusEmailHtml({
          logoMarkup,
          applicantName: safeName,
          applicantNumber: safeNumber,
          status,
          remarks,
          courseName,
          config
        })
        const sendParams = {
          to: recipientEmail,
          subject,
          text,
          html
        }

        if (logoAttachment) {
          sendParams.attachments = [logoAttachment]
        }

        const result = await service.sendEmail(sendParams)

        return {
          sent: true,
          provider: providerKey,
          recipient: result?.recipient || recipientEmail,
          messageId: result?.messageId || null,
          error: null
        }
      } catch (error) {
        lastError = error
        console.error('Applicant status email delivery failed.', {
          provider: providerKey,
          status,
          applicantNumber,
          message: error?.message || 'Unknown email delivery error.'
        })
      }
    }

    return {
      sent: false,
      provider: null,
      error: lastError?.message || 'Email service is not configured.'
    }
  }
}

module.exports = ApplicantEmailService
