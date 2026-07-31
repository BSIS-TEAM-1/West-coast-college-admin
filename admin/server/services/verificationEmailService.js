const SendGridEmailService = require('./sendGridEmailService')
const SemaphoreEmailService = require('./semaphoreEmailService')
const GmailApiEmailService = require('./gmailApiEmailService')

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

function getVerificationBrandMarkup() {
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
  const brandStyle = 'display:inline-block;width:72px;height:72px;border:2px solid #fde68a;border-radius:50%;background:#ffffff;color:#7c2d12;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;line-height:68px;text-align:center;text-decoration:none;'

  if (brandUrl) {
    return `<a href="${escapeHtmlAttribute(brandUrl)}" target="_blank" aria-label="Visit West Coast College" style="${brandStyle}">WCC</a>`
  }

  return `<span aria-label="West Coast College" style="${brandStyle}">WCC</span>`
}

function getSupportMarkup() {
  const supportUrl = String(process.env.SUPPORT_URL || process.env.SUPPORT_EMAIL || '').trim()
  if (!supportUrl) return ''

  const href = isValidEmail(supportUrl) ? `mailto:${supportUrl}` : supportUrl
  if (!/^(https:\/\/|mailto:)/i.test(href)) return ''

  return `<a href="${escapeHtmlAttribute(href)}" style="color:#b45309;text-decoration:underline;font-weight:600;">Contact support</a>`
}

function buildVerificationEmailHtml({
  logoMarkup,
  safeDisplayName,
  verificationCode,
  expiresLabel,
  supportMarkup = ''
}) {
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">',
    '<style>@media only screen and (max-width:620px){.email-shell{width:100%!important}.email-pad{padding-left:24px!important;padding-right:24px!important}.code{font-size:34px!important;letter-spacing:6px!important}}@media (prefers-color-scheme:dark){.email-bg{background:#111827!important}.email-shell,.email-body{background:#1f2937!important}.email-text{color:#e5e7eb!important}.email-muted{color:#cbd5e1!important}.email-panel{background:#292524!important;border-color:#92400e!important}.email-footer{background:#172033!important;color:#94a3b8!important}}</style>',
    '</head><body class="email-bg" style="margin:0;padding:0;background:#f1f5f9;-webkit-text-size-adjust:100%;word-spacing:normal;">',
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your West Coast College verification code is ready and expires soon.</div>',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-bg" style="width:100%;background:#f1f5f9;border-collapse:collapse;"><tr><td align="center" style="padding:32px 12px;">',
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;border-collapse:separate;overflow:hidden;">',
    '<tr><td align="center" style="padding:32px 32px 24px;background:#7c2d12;">',
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center">${logoMarkup}</td></tr></table>`,
    '<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#fde68a;">West Coast College</p>',
    '<h1 style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:34px;color:#ffffff;">Verify your identity</h1>',
    '</td></tr>',
    '<tr><td class="email-body email-pad" style="padding:36px 40px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">',
    `<p class="email-text" style="margin:0 0 14px;font-size:16px;line-height:25px;color:#1e293b;">Hello ${safeDisplayName},</p>`,
    '<p class="email-text" style="margin:0;font-size:16px;line-height:25px;color:#1e293b;">Enter this verification code to continue securely:</p>',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0;border-collapse:separate;"><tr><td align="center" class="email-panel" style="padding:24px 12px;background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;">',
    '<p style="margin:0 0 10px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#92400e;">Verification code</p>',
    `<p class="code" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:40px;line-height:48px;font-weight:700;letter-spacing:8px;color:#7c2d12;">${verificationCode}</p>`,
    `<p class="email-muted" style="margin:10px 0 0;font-size:14px;line-height:22px;color:#64748b;">Expires in <strong>${expiresLabel} minute${expiresLabel === 1 ? '' : 's'}</strong></p>`,
    '</td></tr></table>',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;"><tr><td style="padding:16px 18px;background:#f8fafc;border-left:4px solid #d97706;border-radius:6px;">',
    '<p class="email-muted" style="margin:0;font-size:13px;line-height:21px;color:#475569;"><strong>Security notice:</strong> Never share this code. West Coast College staff will never ask for it. If you did not request this email, you can safely ignore it.</p>',
    '</td></tr></table>',
    supportMarkup ? `<p class="email-muted" style="margin:24px 0 0;font-size:13px;line-height:21px;color:#64748b;">Need help? ${supportMarkup}.</p>` : '',
    '</td></tr>',
    '<tr><td align="center" class="email-footer email-pad" style="padding:24px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;color:#64748b;">',
    `<p style="margin:0;font-size:12px;line-height:19px;">&copy; ${new Date().getFullYear()} West Coast College. All rights reserved.</p>`,
    '<p style="margin:4px 0 0;font-size:12px;line-height:19px;">West Coast College Admin Portal &bull; Automated security message</p>',
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

class VerificationEmailService {
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
      semaphore: this.semaphoreService,
      sendgrid: this.sendGridService
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

  async sendVerificationCode({ to, code, expiresInMinutes = 10, displayName = '' } = {}) {
    const recipientEmail = String(to || '').trim().toLowerCase()
    if (!isValidEmail(recipientEmail)) {
      throw new Error('Invalid recipient email address.')
    }

    const verificationCode = String(code || '').trim()
    if (!/^\d{6}$/.test(verificationCode)) {
      throw new Error('Verification code must be a 6-digit value.')
    }

    const expiresLabel = Number.isFinite(Number(expiresInMinutes)) && Number(expiresInMinutes) > 0
      ? Math.max(1, Math.round(Number(expiresInMinutes)))
      : 10

    const safeDisplayName = escapeHtml(displayName || 'Administrator')
    // Keep the new attachment-free template out of Gmail threads that contain
    // verification messages sent by the legacy Logo.jpg MIME implementation.
    const subject = 'Your West Coast College security code'
    const text = [
      `Hello ${displayName || 'Administrator'},`,
      '',
      `Your West Coast College verification code is ${verificationCode}.`,
      `This code expires in ${expiresLabel} minute${expiresLabel === 1 ? '' : 's'}.`,
      '',
      'If you did not request this code, you can ignore this email.'
    ].join('\n')
    const supportMarkup = getSupportMarkup()

    let lastError = null

    for (const { providerKey, service } of this.getProviders()) {
      if (typeof service.isConfigured === 'function' && !service.isConfigured()) {
        continue
      }

      try {
        const logoMarkup = getVerificationBrandMarkup()
        const html = buildVerificationEmailHtml({
          logoMarkup,
          safeDisplayName,
          verificationCode,
          expiresLabel,
          supportMarkup
        })
        const result = await service.sendEmail({
          to: recipientEmail,
          subject,
          text,
          html
        })

        return {
          emailProvider: providerKey,
          recipient: result?.recipient || recipientEmail,
          status: result?.status || 'accepted',
          messageId: result?.messageId || null,
          providerMessage: null
        }
      } catch (error) {
        lastError = error
        console.error('Verification email delivery failed.', {
          provider: providerKey,
          message: error?.message || 'Unknown email delivery error.'
        })
      }
    }

    if (lastError) {
      throw lastError
    }

    throw new Error('Email verification service is not configured. Set Gmail API, Semaphore Email, or SendGrid credentials.')
  }
}

module.exports = VerificationEmailService
