const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const PLACEHOLDER_KEYS = new Set(['', 'replace-me-with-the-service-role-key', 'your-service-role-key', 'changeme'])
const isConfigured = Boolean(SUPABASE_URL) && Boolean(SUPABASE_SERVICE_ROLE_KEY) && !PLACEHOLDER_KEYS.has(SUPABASE_SERVICE_ROLE_KEY.trim().toLowerCase())

let supabase = null
if (isConfigured) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Supabase phone OTP service.
 *
 * Wraps Supabase Auth's phone OTP flow so the existing /api/admin/profile/phone/*
 * routes can use Supabase as an alternative to the smsApiPhService gateway.
 *
 * The caller (route handler) is responsible for normalizing the phone number
 * to E.164 format before calling these functions.
 */
class SupabaseAuthService {
  isConfigured() {
    return isConfigured && supabase !== null
  }

  /**
   * Send an OTP to the given phone number via Supabase Auth.
   * @param {string} phoneE164 — phone in E.164 format (e.g. +639171234567)
   * @returns {Promise<{ message: string }>}
   */
  async sendOtp(phoneE164) {
    if (!this.isConfigured()) {
      throw new Error('Supabase Auth is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    }
    const { error } = await supabase.auth.signInWithOtp({
      phone: phoneE164,
      options: { shouldCreateUser: false },
    })
    if (error) {
      throw new Error(`Supabase OTP send failed: ${error.message}`)
    }
    return { message: 'Verification code sent via Supabase.' }
  }

  /**
   * Verify an OTP code for the given phone number via Supabase Auth.
   * @param {string} phoneE164 — phone in E.164 format
   * @param {string} token — the OTP code entered by the user
   * @returns {Promise<{ verified: boolean }>}
   */
  async verifyOtp(phoneE164, token) {
    if (!this.isConfigured()) {
      throw new Error('Supabase Auth is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    }
    const { data, error } = await supabase.auth.verifyOtp({
      phone: phoneE164,
      token: String(token || '').trim(),
      type: 'sms',
    })
    if (error) {
      throw new Error(`Supabase OTP verification failed: ${error.message}`)
    }
    return { verified: true, session: data.session || null }
  }
}

const supabaseAuthService = new SupabaseAuthService()

module.exports = supabaseAuthService
module.exports.SupabaseAuthService = SupabaseAuthService
