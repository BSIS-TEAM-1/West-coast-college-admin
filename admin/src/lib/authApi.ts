const rawApiUrl = import.meta.env.VITE_API_URL?.trim()

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '')
}

function resolveApiUrl(): string {
  if (rawApiUrl) return stripTrailingSlashes(rawApiUrl)

  if (typeof window !== 'undefined') {
    const { origin, hostname } = window.location
    const localHosts = new Set(['localhost', '127.0.0.1', '::1'])
    if (!localHosts.has(hostname)) {
      return stripTrailingSlashes(origin)
    }
  }

  return 'http://localhost:3001'
}

export const API_URL = resolveApiUrl()

// Use browser localStorage for secure, user-specific token storage
const TOKEN_KEY = 'auth_token'
const DEVICE_ID_KEY = 'client_device_id'

function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const generated = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    localStorage.setItem(DEVICE_ID_KEY, generated)
    return generated
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  }
}

export async function getStoredToken(): Promise<string | null> {
  try {
    // Get token from browser localStorage (user-specific)
    const token = localStorage.getItem(TOKEN_KEY)
    return token
  } catch (error) {
    console.warn('Failed to get token from localStorage:', error);
    return null
  }
}

export function setStoredToken(token: string): void {
  try {
    // Store token in browser localStorage (user-specific)
    localStorage.setItem(TOKEN_KEY, token)
  } catch (error) {
    console.warn('Failed to store token in localStorage:', error);
  }
}

export async function clearStoredToken(): Promise<void> {
  try {
    // Clear token from browser localStorage (user-specific)
    localStorage.removeItem(TOKEN_KEY)
  } catch (error) {
    console.warn('Failed to clear token from localStorage:', error);
  }
}

export async function logout(): Promise<{ message: string }> {
  const token = await getStoredToken()
  if (!token) {
    // If no token, just clear state and return success
    await clearStoredToken()
    return { message: 'No active session found.' }
  }

  try {
    const res = await fetch(`${API_URL}/api/admin/logout`, { 
      headers: await authHeaders(),
      method: 'POST'
    })
    const data = await res.json().catch(() => ({}))
    
    // Always clear local token regardless of server response
    await clearStoredToken()
    
    if (!res.ok) {
      // If server fails, still clear token but don't throw error
      console.warn('Logout server error:', data?.error || 'Unknown error')
      return { message: 'Logged out locally.' }
    }
    
    return data as { message: string }
  } catch (error) {
    // If network fails, still clear local token
    await clearStoredToken()
    console.warn('Logout network error:', error)
    return { message: 'Logged out locally.' }
  }
}

export type SignUpResponse = { message: string; username: string }
export type LoginResponse = { message: string; username: string; token: string; accountType?: 'admin' | 'registrar' | 'professor' }
export type ProfileResponse = {
  username: string
  displayName: string
  email: string
  phone?: string
  phoneVerified?: boolean
  avatar: string
  accountType: 'admin' | 'registrar' | 'professor'
}
export type UpdateProfileRequest = {
  displayName?: string
  email?: string
  phone?: string
  newUsername?: string
  currentPassword?: string
  newPassword?: string
}

export type AccountLog = {
  _id: string
  username: string
  displayName: string
  email: string
  avatar: string
  accountType: 'admin' | 'registrar' | 'professor'
  uid: string
  status: 'active' | 'inactive' | 'suspended'
  createdAt: string
  createdBy: string
}

export type CreateAccountRequest = {
  username: string
  displayName: string
  accountType: 'admin' | 'registrar' | 'professor'
  password: string
  uid: string
}

export async function signUp(username: string, password: string): Promise<SignUpResponse> {
  const res = await fetch(`${API_URL}/api/admin/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data?.error as string) || 'Sign up failed.')
  }
  return data as SignUpResponse
}

export async function login(username: string, password: string, captchaToken?: string): Promise<LoginResponse> {
  const payload: Record<string, string> = { username: username.trim(), password }
  if (captchaToken) payload.captchaToken = captchaToken
  const deviceId = getOrCreateDeviceId()

  const res = await fetch(`${API_URL}/api/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': deviceId
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data?.error as string) || 'Invalid username or password.')
  }
  return data as LoginResponse
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function getProfile(): Promise<ProfileResponse> {
  const res = await fetch(`${API_URL}/api/admin/profile`, { headers: await authHeaders() })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data?.error as string) || 'Failed to load profile.')
  }
  return data as ProfileResponse
}

export async function updateProfile(updates: {
  displayName?: string
  email?: string
  phone?: string
  newUsername?: string
  currentPassword?: string
  newPassword?: string
}): Promise<ProfileResponse> {
  const res = await fetch(`${API_URL}/api/admin/profile`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(updates),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data?.error as string) || 'Failed to update profile.')
  }
  return data as ProfileResponse
}

export async function sendPhoneVerificationCode(phone: string): Promise<{
  message: string
  phone: string
  expiresAt: string
  channel?: 'sms' | 'email'
  emailProvider?: 'semaphore' | 'sendgrid' | 'sms-api-ph' | null
  destination?: string
  fallbackUsed?: boolean
  fallbackReason?: string | null
  deliveryStatus?: string
  messageId?: string | null
  providerMessage?: string | null
}> {
  const res = await fetch(`${API_URL}/api/admin/profile/phone/send-code`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ phone }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data?.error as string) || 'Failed to send phone verification code.')
  }
  return data as {
    message: string
    phone: string
    expiresAt: string
    channel?: 'sms' | 'email'
    emailProvider?: 'semaphore' | 'sendgrid' | 'sms-api-ph' | null
    destination?: string
    fallbackUsed?: boolean
    fallbackReason?: string | null
    deliveryStatus?: string
    messageId?: string | null
    providerMessage?: string | null
  }
}

export async function verifyPhoneNumber(code: string): Promise<ProfileResponse> {
  const res = await fetch(`${API_URL}/api/admin/profile/phone/verify`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ code }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data?.error as string) || 'Failed to verify phone number.')
  }
  return data as ProfileResponse
}

export async function uploadAvatar(file: File): Promise<{ message: string; avatar: string; avatarUrl: string }> {
  const token = await getStoredToken()
  if (!token) {
    throw new Error('Authentication required.')
  }

  // Convert file to base64
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix to get just the base64 data
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const res = await fetch(`${API_URL}/api/admin/avatar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      avatarData: base64Data,
      mimeType: file.type
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data?.error as string) || 'Failed to upload avatar.')
  }
  return data as { message: string; avatar: string; avatarUrl: string }
}

export async function deleteAvatar(): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/api/admin/avatar`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data?.error as string) || 'Failed to remove avatar.')
  }
  return data as { message: string }
}

export async function getAccountLogs(): Promise<AccountLog[]> {
  const res = await fetch(`${API_URL}/api/admin/accounts`, { headers: await authHeaders() })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data?.error as string) || 'Failed to load account logs.')
  }
  return data as AccountLog[]
}

export async function createAccount(accountData: CreateAccountRequest): Promise<{ message: string; account: AccountLog }> {
  const res = await fetch(`${API_URL}/api/admin/accounts`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(accountData),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data?.error as string) || 'Failed to create account.')
  }
  return data as { message: string; account: AccountLog }
}

export async function getAccountCount(accountType: 'admin' | 'registrar' | 'professor'): Promise<number> {
  const res = await fetch(`${API_URL}/api/admin/accounts/count?type=${accountType}`, { headers: await authHeaders() })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data?.error as string) || 'Failed to get account count.')
  }
  return data.count as number
}

export async function deleteAccount(accountId: string): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/api/admin/accounts/${accountId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data?.error as string) || 'Failed to delete account.')
  }
  return data as { message: string }
}
