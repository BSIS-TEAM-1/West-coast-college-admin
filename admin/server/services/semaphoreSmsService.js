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

class SemaphoreSmsService {
  constructor({
    apiKey = process.env.SEMAPHORE_API_KEY,
    senderName = process.env.SEMAPHORE_SENDER_NAME,
    apiUrl = process.env.SEMAPHORE_API_URL || 'https://api.semaphore.co/api/v4/messages',
    timeoutMs = process.env.SEMAPHORE_TIMEOUT_MS || 10000
  } = {}) {
    this.apiKey = String(apiKey || '').trim()
    this.senderName = String(senderName || '').trim()
    this.apiUrl = String(apiUrl || '').trim()
    const parsedTimeout = Number(timeoutMs)
    this.timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 10000
  }

  isConfigured() {
    return Boolean(this.apiKey)
  }

  normalizeNumber(rawNumber) {
    const normalized = String(rawNumber || '').trim()
    if (!normalized) return ''

    const compactNumber = normalized.replace(/[()\-\s]/g, '')
    if (compactNumber.startsWith('+63')) {
      return `0${compactNumber.slice(3)}`
    }
    if (compactNumber.startsWith('63')) {
      return `0${compactNumber.slice(2)}`
    }
    if (compactNumber.startsWith('9') && compactNumber.length === 10) {
      return `0${compactNumber}`
    }

    return compactNumber
  }

  isValidMobileNumber(normalizedNumber) {
    return /^09\d{9}$/.test(normalizedNumber)
  }

  async dispatchSmsRequest({ normalizedNumber, textMessage, senderName }) {
    const payload = new URLSearchParams()
    payload.append('apikey', this.apiKey)
    payload.append('number', normalizedNumber)
    payload.append('message', textMessage)

    const finalSenderName = String(senderName || '').trim()
    if (finalSenderName) {
      payload.append('sendername', finalSenderName)
    }

    return axios.post(this.apiUrl, payload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: this.timeoutMs
    })
  }

  async sendSms({ number, message, senderName } = {}) {
    if (!this.isConfigured()) {
      throw new Error('Semaphore SMS is not configured. Set SEMAPHORE_API_KEY.')
    }

    const normalizedNumber = this.normalizeNumber(number)
    if (!this.isValidMobileNumber(normalizedNumber)) {
      throw new Error('Invalid mobile number. Use a valid PH mobile number such as 09XXXXXXXXX.')
    }

    const textMessage = String(message || '').trim()
    if (!textMessage) {
      throw new Error('SMS message is required.')
    }

    const finalSenderName = String(senderName || this.senderName || '').trim()
    try {
      let response
      try {
        response = await this.dispatchSmsRequest({
          normalizedNumber,
          textMessage,
          senderName: finalSenderName
        })
      } catch (firstError) {
        const firstStatusCode = Number(firstError?.response?.status || 0)
        const firstDetail = extractSemaphoreErrorDetail(firstError?.response?.data)
        const senderLooksInvalid = /sender/i.test(firstDetail || '')

        if (finalSenderName && firstStatusCode >= 400 && firstStatusCode < 500 && senderLooksInvalid) {
          response = await this.dispatchSmsRequest({
            normalizedNumber,
            textMessage,
            senderName: ''
          })
        } else {
          throw firstError
        }
      }

      const records = Array.isArray(response.data) ? response.data : [response.data]
      if (records.length === 0) {
        throw new Error('Semaphore returned an empty response.')
      }

      const firstRecord = records[0] || {}
      const rawStatus = String(firstRecord.status || '').trim()
      const normalizedStatus = rawStatus.toLowerCase()
      const messageId = firstRecord.message_id || firstRecord.messageId || null
      const providerDetail = extractSemaphoreErrorDetail(firstRecord)
      const looksLikeFailureDetail =
        /invalid|failed|rejected|forbidden|unauthorized|insufficient|credit|balance|error/i.test(providerDetail) &&
        !/queued|pending|accepted|success|sent|scheduled/i.test(providerDetail)

      if (FAILURE_STATUSES.has(normalizedStatus) || looksLikeFailureDetail) {
        const suffix = providerDetail ? ` (${providerDetail})` : ''
        throw new Error(`Semaphore rejected the SMS request${suffix}.`)
      }

      if (!messageId && normalizedStatus && !SUCCESS_STATUSES.has(normalizedStatus)) {
        const suffix = providerDetail ? ` (${providerDetail})` : ''
        throw new Error(`Semaphore returned an unexpected SMS status${suffix}.`)
      }

      return {
        provider: 'semaphore',
        recipient: firstRecord.recipient || normalizedNumber,
        status: rawStatus || 'queued',
        messageId,
        senderName: firstRecord.sender_name || finalSenderName || null
      }
    } catch (error) {
      const statusCode = Number(error?.response?.status || 0)
      const detail = extractSemaphoreErrorDetail(error?.response?.data)

      if (statusCode > 0) {
        console.error('Semaphore API request failed.', {
          statusCode,
          detail: detail || null
        })
        if (statusCode >= 400 && statusCode < 500) {
          const suffix = detail ? ` (${detail})` : ''
          throw new Error(`Semaphore rejected the SMS request${suffix}.`)
        }
        throw new Error('Semaphore service is currently unavailable.')
      }

      console.error('Semaphore request failed.')
      throw new Error('Semaphore service is currently unavailable.')
    }
  }
}

module.exports = SemaphoreSmsService
