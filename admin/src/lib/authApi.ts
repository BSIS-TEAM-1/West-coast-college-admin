export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

let currentToken: string | null = null

export async function getStoredToken(): Promise<string | null> {
  try {
    // Try to get token from database
    const response = await fetch(`${API_URL}/api/admin/get-stored-token`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.token) {
        currentToken = data.token;
        return data.token;
      }
    }
  } catch (error) {
    console.warn('Failed to get stored token from database:', error);
  }
  
  return currentToken;
}

export function setStoredToken(token: string): void {
  currentToken = token
  // Store token in database
  fetch(`${API_URL}/api/admin/store-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token })
  }).catch(error => {
    console.warn('Failed to store token in database:', error);
  });
}

export async function clearStoredToken(): Promise<void> {
  currentToken = null
  // Clear token from database
  try {
    await fetch(`${API_URL}/api/admin/clear-stored-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.warn('Failed to clear stored token from database:', error);
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
export type ProfileResponse = { username: string; displayName: string; email: string; avatar: string; accountType: 'admin' | 'registrar' | 'professor' }
export type UpdateProfileRequest = {
  displayName?: string
  email?: string
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

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
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
