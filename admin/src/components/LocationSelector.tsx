import { useEffect, useRef, useState } from 'react'
import { getRegions, getProvinces, getCities, getBarangays } from '../lib/locationApi'
import './LocationSelector.css'

type LocationValue = {
  regionCode?: string
  regionName?: string
  provinceCode?: string
  provinceName?: string
  cityCode?: string
  cityName?: string
  barangayCode?: string
  barangayName?: string
}

type LocationSelectorProps = {
  value: LocationValue
  onChange: (value: LocationValue) => void
  labels?: {
    region?: string
    province?: string
    city?: string
    barangay?: string
  }
  required?: boolean
}

function SearchableSelect({
  label,
  value,
  onSelect,
  onSearch,
  options,
  loading,
  error,
  emptyText,
  required,
  disabled,
  displayValue
}: {
  label: string
  value?: string
  onSelect: (option: { code: string; name: string }) => void
  onSearch: (query: string) => void
  options: { code: string; name: string }[]
  loading: boolean
  error: string
  emptyText: string
  required?: boolean
  disabled?: boolean
  displayValue: string
}) {
  const [query, setQuery] = useState(displayValue)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(displayValue)
  }, [displayValue])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(i => Math.min(i + 1, options.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(i => Math.max(i - 1, -1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (activeIndex >= 0 && options[activeIndex]) {
          onSelect(options[activeIndex])
          setOpen(false)
          setActiveIndex(-1)
        }
      } else if (e.key === 'Escape') {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, activeIndex, options, onSelect])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const handleSearch = (next: string) => {
    setQuery(next)
    onSearch(next)
    setOpen(true)
    setActiveIndex(-1)
  }

  const handleSelect = (option: { code: string; name: string }) => {
    onSelect(option)
    setOpen(false)
    setQuery(option.name)
  }

  const handleFocus = () => {
    setOpen(true)
    if (query) onSearch(query)
    else onSearch('')
  }

  const handleClear = () => {
    setQuery('')
    onSelect({ code: '', name: '' })
    onSearch('')
  }

  return (
    <div className="location-field" ref={containerRef}>
      <label className="location-label">
        {label}
        {required && <span className="location-required" aria-hidden="true">*</span>}
      </label>
      <div className="location-search-wrap">
        <input
          type="text"
          className="location-search-input"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={handleFocus}
          disabled={disabled}
          placeholder={`Search ${label.toLowerCase()}...`}
          autoComplete="off"
          required={required}
        />
        {value && (
          <button
            type="button"
            className="location-clear"
            onClick={handleClear}
            aria-label="Clear selection"
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <ul className="location-results" role="listbox">
          {loading && <li className="location-loading">Loading...</li>}
          {!loading && error && <li className="location-error">{error}</li>}
          {!loading && !error && options.length === 0 && <li className="location-empty">{emptyText}</li>}
          {!loading && options.map((opt, i) => (
            <li
              key={opt.code}
              className={`location-result ${i === activeIndex ? 'location-result-active' : ''}`}
              onMouseDown={() => handleSelect(opt)}
              onMouseEnter={() => setActiveIndex(i)}
              role="option"
              aria-selected={i === activeIndex}
            >
              {opt.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function LocationSelector({
  value,
  onChange,
  labels = { region: 'Region', province: 'Province', city: 'City / Municipality', barangay: 'Barangay' },
  required = false
}: LocationSelectorProps) {
  const [regionOptions, setRegionOptions] = useState<{ code: string; name: string }[]>([])
  const [provinceOptions, setProvinceOptions] = useState<{ code: string; name: string }[]>([])
  const [cityOptions, setCityOptions] = useState<{ code: string; name: string }[]>([])
  const [barangayOptions, setBarangayOptions] = useState<{ code: string; name: string }[]>([])

  const [regionLoading, setRegionLoading] = useState(false)
  const [provinceLoading, setProvinceLoading] = useState(false)
  const [cityLoading, setCityLoading] = useState(false)
  const [barangayLoading, setBarangayLoading] = useState(false)

  const [regionError, setRegionError] = useState('')
  const [provinceError, setProvinceError] = useState('')
  const [cityError, setCityError] = useState('')
  const [barangayError, setBarangayError] = useState('')

  useEffect(() => {
    let cancelled = false
    setRegionLoading(true)
    setRegionError('')
    getRegions('', 100)
      .then(data => { if (!cancelled) setRegionOptions(data.map(r => ({ code: r.code, name: r.name }))) })
      .catch(err => { if (!cancelled) setRegionError(err.message) })
      .finally(() => { if (!cancelled) setRegionLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!value.regionCode) {
      setProvinceOptions([])
      return
    }
    let cancelled = false
    setProvinceLoading(true)
    setProvinceError('')
    getProvinces(value.regionCode, '', 100)
      .then(data => { if (!cancelled) setProvinceOptions(data.map(p => ({ code: p.code, name: p.name }))) })
      .catch(err => { if (!cancelled) setProvinceError(err.message) })
      .finally(() => { if (!cancelled) setProvinceLoading(false) })
    return () => { cancelled = true }
  }, [value.regionCode])

  useEffect(() => {
    if (!value.provinceCode) {
      setCityOptions([])
      return
    }
    let cancelled = false
    setCityLoading(true)
    setCityError('')
    getCities(value.provinceCode, '', 100)
      .then(data => { if (!cancelled) setCityOptions(data.map(c => ({ code: c.code, name: c.name }))) })
      .catch(err => { if (!cancelled) setCityError(err.message) })
      .finally(() => { if (!cancelled) setCityLoading(false) })
    return () => { cancelled = true }
  }, [value.provinceCode])

  useEffect(() => {
    if (!value.cityCode) {
      setBarangayOptions([])
      return
    }
    let cancelled = false
    setBarangayLoading(true)
    setBarangayError('')
    getBarangays(value.cityCode, '', 100)
      .then(data => { if (!cancelled) setBarangayOptions(data.map(b => ({ code: b.code, name: b.name }))) })
      .catch(err => { if (!cancelled) setBarangayError(err.message) })
      .finally(() => { if (!cancelled) setBarangayLoading(false) })
    return () => { cancelled = true }
  }, [value.cityCode])

  const handleRegionSearch = (q: string) => {
    getRegions(q, 100).then(data => setRegionOptions(data.map(r => ({ code: r.code, name: r.name }))))
  }

  const handleProvinceSearch = (q: string) => {
    if (!value.regionCode) return
    getProvinces(value.regionCode, q, 100).then(data => setProvinceOptions(data.map(p => ({ code: p.code, name: p.name }))))
  }

  const handleCitySearch = (q: string) => {
    if (!value.provinceCode) return
    getCities(value.provinceCode, q, 100).then(data => setCityOptions(data.map(c => ({ code: c.code, name: c.name }))))
  }

  const handleBarangaySearch = (q: string) => {
    if (!value.cityCode) return
    getBarangays(value.cityCode, q, 100).then(data => setBarangayOptions(data.map(b => ({ code: b.code, name: b.name }))))
  }

  const setRegion = (region: { code: string; name: string }) => {
    onChange({
      regionCode: region.code,
      regionName: region.name,
      provinceCode: undefined,
      provinceName: undefined,
      cityCode: undefined,
      cityName: undefined,
      barangayCode: undefined,
      barangayName: undefined
    })
    setProvinceOptions([])
    setCityOptions([])
    setBarangayOptions([])
  }

  const setProvince = (province: { code: string; name: string }) => {
    onChange({
      ...value,
      provinceCode: province.code,
      provinceName: province.name,
      cityCode: undefined,
      cityName: undefined,
      barangayCode: undefined,
      barangayName: undefined
    })
    setCityOptions([])
    setBarangayOptions([])
  }

  const setCity = (city: { code: string; name: string }) => {
    onChange({
      ...value,
      cityCode: city.code,
      cityName: city.name,
      barangayCode: undefined,
      barangayName: undefined
    })
    setBarangayOptions([])
  }

  const setBarangay = (barangay: { code: string; name: string }) => {
    onChange({
      ...value,
      barangayCode: barangay.code,
      barangayName: barangay.name
    })
  }

  return (
    <div className="location-selector">
      <SearchableSelect
        label={labels.region || 'Region'}
        value={value.regionCode}
        displayValue={value.regionName || ''}
        onSelect={setRegion}
        onSearch={handleRegionSearch}
        options={regionOptions}
        loading={regionLoading}
        error={regionError}
        emptyText="No regions found"
        required={required}
      />
      <SearchableSelect
        label={labels.province || 'Province'}
        value={value.provinceCode}
        displayValue={value.provinceName || ''}
        onSelect={setProvince}
        onSearch={handleProvinceSearch}
        options={provinceOptions}
        loading={provinceLoading}
        error={provinceError}
        emptyText={value.regionCode ? 'No provinces found' : 'Select a region first'}
        required={required}
        disabled={!value.regionCode}
      />
      <SearchableSelect
        label={labels.city || 'City / Municipality'}
        value={value.cityCode}
        displayValue={value.cityName || ''}
        onSelect={setCity}
        onSearch={handleCitySearch}
        options={cityOptions}
        loading={cityLoading}
        error={cityError}
        emptyText={value.provinceCode ? 'No cities found' : 'Select a province first'}
        required={required}
        disabled={!value.provinceCode}
      />
      <SearchableSelect
        label={labels.barangay || 'Barangay'}
        value={value.barangayCode}
        displayValue={value.barangayName || ''}
        onSelect={setBarangay}
        onSearch={handleBarangaySearch}
        options={barangayOptions}
        loading={barangayLoading}
        error={barangayError}
        emptyText={value.cityCode ? 'No barangays found' : 'Select a city first'}
        required={required}
        disabled={!value.cityCode}
      />
    </div>
  )
}
