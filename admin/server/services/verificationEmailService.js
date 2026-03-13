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

function getBrandBaseUrl() {
  const candidates = [
    process.env.PUBLIC_URL,
    process.env.APP_URL,
    process.env.FRONTEND_URL,
    process.env.RENDER_EXTERNAL_URL
  ]

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim().replace(/\/+$/, '')
    if (normalized) {
      return normalized
    }
  }

  return ''
}

function buildVerificationEmailHtml({
  safeDisplayName,
  verificationCode,
  expiresLabel
}) {
  const brandBaseUrl = getBrandBaseUrl()
  const logoUrl = brandBaseUrl ? `${brandBaseUrl}/Logo.jpg` : ''
  const logoMarkup = logoUrl
    ? `<img src="${escapeHtmlAttribute(logoUrl)}" alt="West Coast College" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:16px;border:1px solid rgba(245,158,11,0.25);box-shadow:0 8px 18px rgba(15,23,42,0.12);object-fit:cover;" />`
    : '<div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#f59e0b,#b45309);color:#ffffff;font-size:24px;font-weight:800;line-height:64px;text-align:center;box-shadow:0 10px 24px rgba(180,83,9,0.25);">WCC</div>'

  return [
    '<div style="margin:0;padding:32px 16px;background:#f8fafc;">',
    '<div style="max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;background:#ffffff;box-shadow:0 24px 60px rgba(15,23,42,0.12);font-family:Arial,sans-serif;color:#0f172a;">',
    '<div style="padding:28px 32px;background:linear-gradient(135deg,#fff7ed 0%,#fef3c7 55%,#ffffff 100%);border-bottom:1px solid rgba(245,158,11,0.18);">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">',
    '<tr>',
    '<td style="vertical-align:middle;width:80px;">',
    logoMarkup,
    '</td>',
    '<td style="vertical-align:middle;padding-left:16px;">',
    '<div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:#b45309;">West Coast College</div>',
    '<div style="margin-top:6px;font-size:24px;line-height:1.2;font-weight:800;color:#0f172a;">Verification Code</div>',
    '<div style="margin-top:6px;font-size:14px;line-height:1.6;color:#475569;">Secure confirmation for your West Coast College account.</div>',
    '</td>',
    '</tr>',
    '</table>',
    '</div>',
    '<div style="padding:32px;">',
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">Hello ${safeDisplayName},</p>`,
    '<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">Use the code below to continue your West Coast College verification request.</p>',
    '<div style="margin:24px 0;padding:22px 20px;border:1px dashed rgba(245,158,11,0.35);border-radius:20px;background:linear-gradient(135deg,#fffdf7,#fff7ed);text-align:center;">',
    '<div style="font-size:12px;line-height:1.4;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#b45309;">One-Time Code</div>',
    `<div style="margin-top:14px;font-size:34px;line-height:1.1;font-weight:800;letter-spacing:0.28em;color:#92400e;">${verificationCode}</div>`,
    `<div style="margin-top:14px;font-size:14px;line-height:1.6;color:#475569;">This code expires in <strong>${expiresLabel} minute${expiresLabel === 1 ? '' : 's'}</strong>.</div>`,
    '</div>',
    '<div style="margin-top:24px;padding:16px 18px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;">',
    '<p style="margin:0;font-size:13px;line-height:1.7;color:#475569;">If you did not request this code, you can safely ignore this email. No changes will be made to your account without the verification code.</p>',
    '</div>',
    '<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e2e8f0;">',
    '<p style="margin:0;font-size:12px;line-height:1.7;color:#94a3b8;">West Coast College Admin Portal</p>',
    '<p style="margin:4px 0 0;font-size:12px;line-height:1.7;color:#94a3b8;">This is an automated message. Please do not reply directly to this email.</p>',
    '</div>',
    '</div>',
    '</div>',
    '</div>'
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
    const subject = 'West Coast College verification code'
    const text = [
      `Hello ${displayName || 'Administrator'},`,
      '',
      `Your West Coast College verification code is ${verificationCode}.`,
      `This code expires in ${expiresLabel} minute${expiresLabel === 1 ? '' : 's'}.`,
      '',
      'If you did not request this code, you can ignore this email.'
    ].join('\n')
    const html = buildVerificationEmailHtml({
      safeDisplayName,
      verificationCode,
      expiresLabel
    })

    let lastError = null

    for (const { providerKey, service } of this.getProviders()) {
      if (typeof service.isConfigured === 'function' && !service.isConfigured()) {
        continue
      }

      try {
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
