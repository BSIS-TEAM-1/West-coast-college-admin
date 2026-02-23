const axios = require('axios')

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())
}

function buildSendGridErrorMessage(errorPayload) {
  if (!errorPayload) return ''
  const errors = Array.isArray(errorPayload?.errors) ? errorPayload.errors : []
  const parts = []

  errors.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return
    const message = String(entry.message || '').trim()
    if (message) parts.push(message)
  })

  if (parts.length > 0) {
    return parts.join(' | ').slice(0, 300)
  }

  if (typeof errorPayload === 'string') {
    return errorPayload.slice(0, 300)
  }

  const fallback = String(errorPayload?.message || '').trim()
  return fallback.slice(0, 300)
}

class SendGridEmailService {
  constructor({
    apiKey = process.env.SENDGRID_API_KEY,
    apiUrl = process.env.SENDGRID_API_URL || 'https://api.sendgrid.com/v3/mail/send',
    fromEmail = process.env.SENDGRID_FROM_EMAIL,
    fromName = process.env.SENDGRID_FROM_NAME,
    replyTo = process.env.SENDGRID_REPLY_TO,
    timeoutMs = process.env.SENDGRID_TIMEOUT_MS || 10000
  } = {}) {
    this.apiKey = String(apiKey || '').trim()
    this.apiUrl = String(apiUrl || '').trim()
    this.fromEmail = String(fromEmail || '').trim()
    this.fromName = String(fromName || '').trim()
    this.replyTo = String(replyTo || '').trim()
    const parsedTimeout = Number(timeoutMs)
    this.timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 10000
  }

  isConfigured() {
    return Boolean(this.apiKey && this.fromEmail)
  }

  async sendEmail({ to, subject, text, html, fromEmail, fromName, replyTo } = {}) {
    if (!this.isConfigured()) {
      throw new Error('SendGrid Email is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.')
    }

    const recipientEmail = String(to || '').trim().toLowerCase()
    if (!isValidEmail(recipientEmail)) {
      throw new Error('Invalid recipient email address.')
    }

    const emailSubject = String(subject || '').trim()
    if (!emailSubject) {
      throw new Error('Email subject is required.')
    }

    const textBody = String(text || '').trim()
    const htmlBody = String(html || '').trim()
    if (!textBody && !htmlBody) {
      throw new Error('Email content is required.')
    }

    const finalFromEmail = String(fromEmail || this.fromEmail || '').trim().toLowerCase()
    if (!isValidEmail(finalFromEmail)) {
      throw new Error('Invalid SENDGRID_FROM_EMAIL.')
    }

    const finalFromName = String(fromName || this.fromName || '').trim()
    const finalReplyTo = String(replyTo || this.replyTo || '').trim().toLowerCase()
    if (finalReplyTo && !isValidEmail(finalReplyTo)) {
      throw new Error('Invalid SENDGRID_REPLY_TO email address.')
    }

    const content = []
    if (textBody) {
      content.push({ type: 'text/plain', value: textBody })
    }
    if (htmlBody) {
      content.push({ type: 'text/html', value: htmlBody })
    } else if (textBody) {
      content.push({ type: 'text/html', value: `<p>${textBody}</p>` })
    }

    const payload = {
      personalizations: [{ to: [{ email: recipientEmail }] }],
      from: finalFromName ? { email: finalFromEmail, name: finalFromName } : { email: finalFromEmail },
      subject: emailSubject,
      content
    }

    if (finalReplyTo) {
      payload.reply_to = { email: finalReplyTo }
    }

    try {
      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeoutMs
      })

      const statusCode = Number(response?.status || 0)
      if (statusCode !== 202 && statusCode !== 200) {
        throw new Error(`Unexpected SendGrid status code: ${statusCode}`)
      }

      const messageId = String(response?.headers?.['x-message-id'] || '').trim() || null
      return {
        provider: 'sendgrid',
        recipient: recipientEmail,
        status: 'accepted',
        messageId
      }
    } catch (error) {
      const statusCode = Number(error?.response?.status || 0)
      const detail = buildSendGridErrorMessage(error?.response?.data)

      if (statusCode > 0) {
        console.error('SendGrid API request failed.', {
          statusCode,
          detail: detail || null
        })

        if (statusCode >= 400 && statusCode < 500) {
          const suffix = detail ? ` (${detail})` : ''
          throw new Error(`SendGrid rejected the email request${suffix}.`)
        }
        throw new Error('SendGrid email service is currently unavailable.')
      }

      throw new Error('SendGrid email service is currently unavailable.')
    }
  }
}

module.exports = SendGridEmailService
