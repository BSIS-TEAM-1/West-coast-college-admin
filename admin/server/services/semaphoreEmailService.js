const axios = require('axios')

const SUCCESS_STATUSES = new Set(['queued', 'pending', 'sent', 'success', 'accepted', 'scheduled'])
const FAILURE_STATUSES = new Set(['failed', 'failure', 'rejected', 'invalid', 'undelivered', 'blocked', 'error'])

function extractSemaphoreErrorDetail(payload) {
  const parts = []
  const pushPart = (value) => {
    const text = String(value || '').trim()
    if (!text) return
    if (!parts.includes(text)) {
      parts.push(text)
    }
  }

  if (typeof payload === 'string') {
    pushPart(payload)
  } else if (Array.isArray(payload)) {
    payload.forEach((entry) => {
      if (typeof entry === 'string') {
        pushPart(entry)
        return
      }
      if (entry && typeof entry === 'object') {
        pushPart(entry.message)
        pushPart(entry.error)
        pushPart(entry.details)
        pushPart(entry.status)
      }
    })
  } else if (payload && typeof payload === 'object') {
    pushPart(payload.message)
    pushPart(payload.error)
    pushPart(payload.details)
    pushPart(payload.status)
  }

  return parts.filter(Boolean).join(' | ').slice(0, 300)
}

class SemaphoreEmailService {
  constructor({
    apiKey = process.env.SEMAPHORE_EMAIL_API_KEY || process.env.SEMAPHORE_API_KEY,
    apiUrl = process.env.SEMAPHORE_EMAIL_API_URL || '',
    fromEmail = process.env.SEMAPHORE_EMAIL_FROM || '',
    fromName = process.env.SEMAPHORE_EMAIL_FROM_NAME || '',
    timeoutMs = process.env.SEMAPHORE_EMAIL_TIMEOUT_MS || process.env.SEMAPHORE_TIMEOUT_MS || 10000
  } = {}) {
    this.apiKey = String(apiKey || '').trim()
    this.apiUrl = String(apiUrl || '').trim()
    this.fromEmail = String(fromEmail || '').trim()
    this.fromName = String(fromName || '').trim()
    const parsedTimeout = Number(timeoutMs)
    this.timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 10000
    this.defaultApiUrls = [
      'https://api.semaphore.co/api/v4/emails',
      'https://api.semaphore.co/api/v4/email',
      'https://api.semaphore.co/api/v4/email/send'
    ]
  }

  isConfigured() {
    return Boolean(this.apiKey)
  }

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())
  }

  getCandidateUrls() {
    if (this.apiUrl) return [this.apiUrl]
    return this.defaultApiUrls
  }

  async dispatchEmailRequest({ apiUrl, to, subject, text, html }) {
    const payload = new URLSearchParams()
    payload.append('apikey', this.apiKey)
    payload.append('to', to)
    payload.append('subject', subject)
    payload.append('text', text)
    payload.append('html', html)
    if (this.fromEmail) payload.append('from', this.fromEmail)
    if (this.fromName) payload.append('from_name', this.fromName)

    return axios.post(apiUrl, payload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: this.timeoutMs
    })
  }

  async sendEmail({ to, subject, text, html } = {}) {
    if (!this.isConfigured()) {
      throw new Error('Semaphore Email is not configured. Set SEMAPHORE_EMAIL_API_KEY or SEMAPHORE_API_KEY.')
    }

    const recipientEmail = String(to || '').trim()
    if (!this.isValidEmail(recipientEmail)) {
      throw new Error('Invalid recipient email address.')
    }

    const emailSubject = String(subject || '').trim()
    if (!emailSubject) {
      throw new Error('Email subject is required.')
    }

    const emailText = String(text || '').trim()
    const emailHtml = String(html || '').trim()
    if (!emailText && !emailHtml) {
      throw new Error('Email content is required.')
    }

    const candidateUrls = this.getCandidateUrls()
    let lastError = null

    for (const candidateUrl of candidateUrls) {
      try {
        const response = await this.dispatchEmailRequest({
          apiUrl: candidateUrl,
          to: recipientEmail,
          subject: emailSubject,
          text: emailText || emailHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
          html: emailHtml || `<p>${emailText}</p>`
        })

        const records = Array.isArray(response.data) ? response.data : [response.data]
        if (records.length === 0) {
          throw new Error('Semaphore returned an empty response.')
        }

        const firstRecord = records[0] || {}
        const rawStatus = String(firstRecord.status || '').trim()
        const normalizedStatus = rawStatus.toLowerCase()
        const messageId = firstRecord.message_id || firstRecord.messageId || firstRecord.id || null
        const providerDetail = extractSemaphoreErrorDetail(firstRecord)
        const looksLikeFailureDetail =
          /invalid|failed|rejected|forbidden|unauthorized|insufficient|credit|balance|error/i.test(providerDetail) &&
          !/queued|pending|accepted|success|sent|scheduled/i.test(providerDetail)

        if (FAILURE_STATUSES.has(normalizedStatus) || looksLikeFailureDetail) {
          const suffix = providerDetail ? ` (${providerDetail})` : ''
          throw new Error(`Semaphore rejected the email request${suffix}.`)
        }

        if (!messageId && normalizedStatus && !SUCCESS_STATUSES.has(normalizedStatus)) {
          const suffix = providerDetail ? ` (${providerDetail})` : ''
          throw new Error(`Semaphore returned an unexpected email status${suffix}.`)
        }

        return {
          provider: 'semaphore-email',
          recipient: recipientEmail,
          status: rawStatus || 'queued',
          messageId,
          apiUrl: candidateUrl
        }
      } catch (error) {
        const statusCode = Number(error?.response?.status || 0)
        const detail = extractSemaphoreErrorDetail(error?.response?.data)

        if (statusCode === 404 || statusCode === 405) {
          lastError = new Error(`Semaphore email endpoint not found at ${candidateUrl}.`)
          continue
        }

        if (statusCode > 0) {
          console.error('Semaphore Email API request failed.', {
            statusCode,
            apiUrl: candidateUrl,
            detail: detail || null
          })
          if (statusCode >= 400 && statusCode < 500) {
            const suffix = detail ? ` (${detail})` : ''
            throw new Error(`Semaphore rejected the email request${suffix}.`)
          }
          throw new Error('Semaphore email service is currently unavailable.')
        }

        lastError = error
      }
    }

    if (lastError) {
      throw lastError
    }

    throw new Error('Semaphore email service is currently unavailable.')
  }
}

module.exports = SemaphoreEmailService
