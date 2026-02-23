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

function toE164Ph(normalizedNumber) {
  const local = normalizePhilippineNumber(normalizedNumber)
  if (!/^09\d{9}$/.test(local)) return ''
  return `+63${local.slice(1)}`
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

function parseGatewayError(errorPayload) {
  if (!errorPayload) return ''
  if (typeof errorPayload === 'string') return errorPayload.slice(0, 300)
  const parts = [
    errorPayload.error,
    errorPayload.message,
    errorPayload.details,
  ].map((value) => String(value || '').trim()).filter(Boolean)
  return parts.join(' | ').slice(0, 300)
}

class SmsApiPhService {
  constructor({
    apiKey = process.env.SMS_API_PH_API_KEY,
    apiUrl = process.env.SMS_API_PH_URL || 'https://sms-api-ph-gceo.onrender.com/send/sms',
    timeoutMs = process.env.SMS_API_PH_TIMEOUT_MS || 15000
  } = {}) {
    this.apiKey = String(apiKey || '').trim()
    this.apiUrl = String(apiUrl || '').trim()
    const parsedTimeout = Number(timeoutMs)
    this.timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 15000
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiUrl)
  }

  async sendMessage({ recipient, message, fallbackEmail } = {}) {
    if (!this.isConfigured()) {
      throw new Error('SMS API PH is not configured. Set SMS_API_PH_API_KEY.')
    }

    const recipientE164 = toE164Ph(recipient)
    if (!recipientE164) {
      throw new Error('Invalid recipient number. Use a valid PH mobile number (09XXXXXXXXX).')
    }

    const textMessage = String(message || '').trim()
    if (!textMessage) {
      throw new Error('SMS message is required.')
    }

    try {
      const payload = { recipient: recipientE164, message: textMessage }
      const normalizedFallbackEmail = String(fallbackEmail || '').trim().toLowerCase()
      if (isValidEmail(normalizedFallbackEmail)) {
        payload.email = normalizedFallbackEmail
        payload.fallbackEmail = normalizedFallbackEmail
        payload.fallback_email = normalizedFallbackEmail
      }

      const response = await axios.post(
        this.apiUrl,
        payload,
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: this.timeoutMs
        }
      )

      const data = response?.data || {}
      const explicitFailure = data?.success === false || Boolean(data?.error)
      if (explicitFailure) {
        const detail = parseGatewayError(data)
        const suffix = detail ? ` (${detail})` : ''
        throw new Error(`SMS gateway rejected the request${suffix}.`)
      }

      const gatewayStatus = String(data.status || data.deliveryStatus || (data.success === true ? 'accepted' : 'queued')).trim()
      const gatewayMessage = String(data.message || '').trim() || null
      const inferredChannel = /email/i.test(String(data.channel || gatewayMessage || '')) ? 'email' : 'sms'
      const gatewayChannel = String(data.channel || inferredChannel).trim().toLowerCase()
      const gatewayRecipient = String(data.recipient || data.destination || recipientE164).trim()

      return {
        provider: 'sms-api-ph',
        recipient: gatewayRecipient || recipientE164,
        status: gatewayStatus || 'accepted',
        messageId: data.messageId || data.id || null,
        channel: gatewayChannel || 'sms',
        fallbackUsed: Boolean(data.fallbackUsed),
        fallbackReason: String(data.fallbackReason || '').trim() || null,
        providerMessage: gatewayMessage
      }
    } catch (error) {
      const statusCode = Number(error?.response?.status || 0)
      const detail = parseGatewayError(error?.response?.data)

      if (statusCode > 0) {
        console.error('SMS API PH request failed.', {
          statusCode,
          detail: detail || null
        })
        if (statusCode >= 400 && statusCode < 500) {
          const suffix = detail ? ` (${detail})` : ''
          throw new Error(`SMS gateway rejected the request${suffix}.`)
        }
        throw new Error('SMS gateway service is currently unavailable.')
      }

      if (error instanceof Error && error.message) {
        throw error
      }
      throw new Error('SMS gateway service is currently unavailable.')
    }
  }
}

module.exports = SmsApiPhService
