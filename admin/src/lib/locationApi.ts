import { API_URL } from './authApi'

export type RegionResult = {
  _id: string
  code: string
  name: string
}

export type ProvinceResult = {
  _id: string
  code: string
  regionCode: string
  name: string
}

export type CityResult = {
  _id: string
  code: string
  provinceCode: string
  name: string
  type: string
  zipCode?: string
}

export type BarangayResult = {
  _id: string
  code: string
  cityCode: string
  name: string
  status?: string
}

type ListResponse<T> = {
  data: T[]
  total: number
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `Request failed: ${response.status}`)
  }
  return data
}

export async function getRegions(q = '', limit = 50): Promise<RegionResult[]> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  params.set('limit', String(limit))
  const response = await fetch(`${API_URL}/api/locations/regions?${params}`)
  const payload = await readJson<ListResponse<RegionResult>>(response)
  return payload.data
}

export async function getProvinces(regionCode: string, q = '', limit = 100): Promise<ProvinceResult[]> {
  const params = new URLSearchParams()
  params.set('region', regionCode)
  if (q) params.set('q', q)
  params.set('limit', String(limit))
  const response = await fetch(`${API_URL}/api/locations/provinces?${params}`)
  const payload = await readJson<ListResponse<ProvinceResult>>(response)
  return payload.data
}

export async function getCities(provinceCode: string, q = '', limit = 100): Promise<CityResult[]> {
  const params = new URLSearchParams()
  params.set('province', provinceCode)
  if (q) params.set('q', q)
  params.set('limit', String(limit))
  const response = await fetch(`${API_URL}/api/locations/cities?${params}`)
  const payload = await readJson<ListResponse<CityResult>>(response)
  return payload.data
}

export async function getBarangays(cityCode: string, q = '', limit = 100): Promise<BarangayResult[]> {
  const params = new URLSearchParams()
  params.set('city', cityCode)
  if (q) params.set('q', q)
  params.set('limit', String(limit))
  const response = await fetch(`${API_URL}/api/locations/barangays?${params}`)
  const payload = await readJson<ListResponse<BarangayResult>>(response)
  return payload.data
}
