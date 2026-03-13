const axios = require('axios')

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())
}

function encodeHeaderValue(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  return `=?UTF-8?B?${Buffer.from(normalized, 'utf8').toString('base64')}?=`
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toBase64Url(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function extractGmailErrorMessage(payload) {
  if (!payload) return ''

  if (typeof payload === 'string') {
    return payload.slice(0, 300)
  }

  const errorMessage = String(
    payload?.error?.message ||
    payload?.error_description ||
    payload?.message ||
    ''
  ).trim()

  return errorMessage.slice(0, 300)
}

class GmailApiEmailService {
  constructor({
    clientId = process.env.GMAIL_CLIENT_ID,
    clientSecret = process.env.GMAIL_CLIENT_SECRET,
    refreshToken = process.env.GMAIL_REFRESH_TOKEN,
    senderEmail = process.env.GMAIL_SENDER_EMAIL,
    senderName = process.env.GMAIL_SENDER_NAME,
    userId = process.env.GMAIL_USER_ID || 'me',
    tokenUrl = process.env.GMAIL_TOKEN_URL || 'https://oauth2.googleapis.com/token',
    apiBaseUrl = process.env.GMAIL_API_URL || 'https://gmail.googleapis.com/gmail/v1',
    timeoutMs = process.env.GMAIL_TIMEOUT_MS || 10000
  } = {}) {
    this.clientId = String(clientId || '').trim()
    this.clientSecret = String(clientSecret || '').trim()
    this.refreshToken = String(refreshToken || '').trim()
    this.senderEmail = String(senderEmail || '').trim().toLowerCase()
    this.senderName = String(senderName || '').trim()
    this.userId = String(userId || 'me').trim() || 'me'
    this.tokenUrl = String(tokenUrl || '').trim()
    this.apiBaseUrl = String(apiBaseUrl || '').trim().replace(/\/+$/, '')
    const parsedTimeout = Number(timeoutMs)
    this.timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 10000
  }

  isConfigured() {
    return Boolean(
      this.clientId &&
      this.clientSecret &&
      this.refreshToken &&
      isValidEmail(this.senderEmail) &&
      this.tokenUrl &&
      this.apiBaseUrl
    )
  }

  buildRawMessage({ to, subject, text, html, fromEmail, fromName }) {
    const boundary = `wcc-boundary-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const normalizedRecipient = String(to || '').trim().toLowerCase()
    const normalizedFromEmail = String(fromEmail || this.senderEmail || '').trim().toLowerCase()
    const finalFromName = String(fromName || this.senderName || '').trim()
    const textBody = String(text || '').trim()
    const htmlBody = String(html || '').trim() || `<p>${escapeHtml(textBody)}</p>`

    const fromHeader = finalFromName
      ? `${encodeHeaderValue(finalFromName)} <${normalizedFromEmail}>`
      : normalizedFromEmail

    return [
      'MIME-Version: 1.0',
      `To: ${normalizedRecipient}`,
      `From: ${fromHeader}`,
      `Subject: ${encodeHeaderValue(subject)}`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      textBody,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      htmlBody,
      '',
      `--${boundary}--`
    ].join('\r\n')
  }

  async fetchAccessToken() {
    const payload = new URLSearchParams()
    payload.append('client_id', this.clientId)
    payload.append('client_secret', this.clientSecret)
    payload.append('refresh_token', this.refreshToken)
    payload.append('grant_type', 'refresh_token')

    try {
      const response = await axios.post(this.tokenUrl, payload.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: this.timeoutMs
      })

      const accessToken = String(response?.data?.access_token || '').trim()
      if (!accessToken) {
        throw new Error('Google OAuth did not return an access token.')
      }

      return accessToken
    } catch (error) {
      const statusCode = Number(error?.response?.status || 0)
      const detail = extractGmailErrorMessage(error?.response?.data)

      if (statusCode > 0) {
        console.error('Gmail OAuth token request failed.', {
          statusCode,
          detail: detail || null
        })

        if (statusCode >= 400 && statusCode < 500) {
          const suffix = detail ? ` (${detail})` : ''
          throw new Error(`Gmail API token request was rejected${suffix}.`)
        }
      }

      throw new Error('Gmail API authentication is currently unavailable.')
    }
  }

  async sendEmail({ to, subject, text, html, fromEmail, fromName } = {}) {
    if (!this.isConfigured()) {
      throw new Error('Gmail API email is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_SENDER_EMAIL.')
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

    const finalFromEmail = String(fromEmail || this.senderEmail || '').trim().toLowerCase()
    if (!isValidEmail(finalFromEmail)) {
      throw new Error('Invalid GMAIL_SENDER_EMAIL.')
    }

    const accessToken = await this.fetchAccessToken()
    const rawMessage = this.buildRawMessage({
      to: recipientEmail,
      subject: emailSubject,
      text: textBody,
      html: htmlBody,
      fromEmail: finalFromEmail,
      fromName
    })

    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/users/${encodeURIComponent(this.userId)}/messages/send`,
        { raw: toBase64Url(rawMessage) },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeoutMs
        }
      )

      const messageId = String(response?.data?.id || response?.data?.message?.id || '').trim() || null
      return {
        provider: 'gmail-api',
        recipient: recipientEmail,
        status: 'accepted',
        messageId
      }
    } catch (error) {
      const statusCode = Number(error?.response?.status || 0)
      const detail = extractGmailErrorMessage(error?.response?.data)

      if (statusCode > 0) {
        console.error('Gmail API send request failed.', {
          statusCode,
          detail: detail || null
        })

        if (statusCode >= 400 && statusCode < 500) {
          const suffix = detail ? ` (${detail})` : ''
          throw new Error(`Gmail API rejected the email request${suffix}.`)
        }
      }

      throw new Error('Gmail API email service is currently unavailable.')
    }
  }
}

module.exports = GmailApiEmailService
