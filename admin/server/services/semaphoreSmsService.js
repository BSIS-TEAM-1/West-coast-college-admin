const axios = require('axios')

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

    const payload = new URLSearchParams()
    payload.append('apikey', this.apiKey)
    payload.append('number', normalizedNumber)
    payload.append('message', textMessage)
    if (finalSenderName) {
      payload.append('sendername', finalSenderName)
    }

    try {
      const response = await axios.post(this.apiUrl, payload.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: this.timeoutMs
      })

      const records = Array.isArray(response.data) ? response.data : [response.data]
      const firstRecord = records[0] || {}

      return {
        provider: 'semaphore',
        recipient: firstRecord.recipient || normalizedNumber,
        status: firstRecord.status || 'queued',
        messageId: firstRecord.message_id || null,
        senderName: firstRecord.sender_name || finalSenderName || null
      }
    } catch (error) {
      const statusCode = Number(error?.response?.status || 0)
      if (statusCode > 0) {
        console.error('Semaphore API request failed.', { statusCode })
        if (statusCode >= 400 && statusCode < 500) {
          throw new Error('Semaphore rejected the SMS request.')
        }
        throw new Error('Semaphore service is currently unavailable.')
      }

      console.error('Semaphore request failed.')
      throw new Error('Semaphore service is currently unavailable.')
    }
  }
}

module.exports = SemaphoreSmsService
