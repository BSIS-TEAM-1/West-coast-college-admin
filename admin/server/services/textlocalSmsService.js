const axios = require('axios')

function normalizePhilippineNumber(rawNumber) {
  const normalized = String(rawNumber || '').trim()
  if (!normalized) return ''

  const compactNumber = normalized.replace(/[()\-\s]/g, '')
  if (compactNumber.startsWith('+63')) return `0${compactNumber.slice(3)}`
  if (compactNumber.startsWith('63')) return `0${compactNumber.slice(2)}`
  if (compactNumber.startsWith('9') && compactNumber.length === 10) return `0${compactNumber}`
  return compactNumber
}

// Textlocal expects international format without the leading + (e.g. 639XXXXXXXXX).
function toTextlocalNumber(normalizedNumber) {
  const local = normalizePhilippineNumber(normalizedNumber)
  if (!/^09\d{9}$/.test(local)) return ''
  return `63${local.slice(1)}`
}

function parseGatewayError(errorPayload) {
  if (!errorPayload) return ''
  if (typeof errorPayload === 'string') return errorPayload.slice(0, 300)
  // Textlocal failure shape: { status: "failure", errors: [{ code, message }] }
  if (Array.isArray(errorPayload.errors) && errorPayload.errors.length) {
    const parts = errorPayload.errors
      .map((entry) => {
        if (!entry) return ''
        const code = entry.code != null ? `#${entry.code}` : ''
        const msg = String(entry.message || '').trim()
        return `${code}${code && msg ? ' ' : ''}${msg}`.trim()
      })
      .filter(Boolean)
    if (parts.length) return parts.join(' | ').slice(0, 300)
  }
  const parts = [
    errorPayload.error,
    errorPayload.message,
    errorPayload.details,
  ].map((value) => String(value || '').trim()).filter(Boolean)
  return parts.join(' | ').slice(0, 300)
}

class TextlocalSmsService {
  constructor({
    apiKey = process.env.TEXTLOCAL_API_KEY,
    apiUrl = process.env.TEXTLOCAL_API_URL || 'https://api.txtlocal.com/send/',
    sender = process.env.TEXTLOCAL_SENDER || '',
    timeoutMs = process.env.TEXTLOCAL_TIMEOUT_MS || 15000
  } = {}) {
    this.apiKey = String(apiKey || '').trim()
    this.apiUrl = String(apiUrl || '').trim()
    this.sender = String(sender || '').trim()
    const parsedTimeout = Number(timeoutMs)
    this.timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 15000
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiUrl)
  }

  async sendMessage({ recipient, message } = {}) {
    if (!this.isConfigured()) {
      throw new Error('Textlocal SMS is not configured. Set TEXTLOCAL_API_KEY.')
    }

    const textlocalNumber = toTextlocalNumber(recipient)
    if (!textlocalNumber) {
      throw new Error('Invalid recipient number. Use a valid PH mobile number (09XXXXXXXXX).')
    }

    const textMessage = String(message || '').trim()
    if (!textMessage) {
      throw new Error('SMS message is required.')
    }

    try {
      const formData = new URLSearchParams()
      formData.append('apiKey', this.apiKey)
      formData.append('numbers', textlocalNumber)
      formData.append('message', textMessage)
      if (this.sender) formData.append('sender', this.sender)

      const response = await axios.post(
        this.apiUrl,
        formData.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: this.timeoutMs
        }
      )

      const data = response?.data || {}
      const status = String(data.status || '').trim().toLowerCase()

      if (status === 'failure' || data?.errors) {
        const detail = parseGatewayError(data)
        const suffix = detail ? ` (${detail})` : ''
        throw new Error(`Textlocal rejected the request${suffix}.`)
      }

      const dataPayload = data.data || {}
      const gatewayMessage = String(data.message || '').trim() || null
      const messageId = dataPayload.id || data.id || null

      return {
        provider: 'textlocal',
        recipient: textlocalNumber,
        status: status === 'success' ? 'sent' : (status || 'accepted'),
        messageId,
        channel: 'sms',
        fallbackUsed: false,
        fallbackReason: null,
        providerMessage: gatewayMessage
      }
    } catch (error) {
      const statusCode = Number(error?.response?.status || 0)
      const detail = parseGatewayError(error?.response?.data)

      if (statusCode > 0) {
        console.error('Textlocal SMS request failed.', {
          statusCode,
          detail: detail || null
        })
        if (statusCode >= 400 && statusCode < 500) {
          const suffix = detail ? ` (${detail})` : ''
          throw new Error(`Textlocal rejected the request${suffix}.`)
        }
        throw new Error('Textlocal SMS service is currently unavailable.')
      }

      if (error instanceof Error && error.message) {
        throw error
      }
      throw new Error('Textlocal SMS service is currently unavailable.')
    }
  }
}

module.exports = TextlocalSmsService
