import { useState, useRef, useEffect } from 'react'

const COUNTRIES = [
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { code: 'ET', name: 'Ethiopia', dial: '+251', flag: '🇪🇹' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { code: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { code: 'CN', name: 'China', dial: '+86', flag: '🇨🇳' },
  { code: 'JP', name: 'Japan', dial: '+81', flag: '🇯🇵' },
  { code: 'KE', name: 'Kenya', dial: '+254', flag: '🇰🇪' },
  { code: 'NG', name: 'Nigeria', dial: '+234', flag: '🇳🇬' },
  { code: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦' },
  { code: 'AE', name: 'UAE', dial: '+971', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', dial: '+966', flag: '🇸🇦' },
  { code: 'MX', name: 'Mexico', dial: '+52', flag: '🇲🇽' },
  { code: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷' },
  { code: 'IT', name: 'Italy', dial: '+39', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', dial: '+34', flag: '🇪🇸' },
  { code: 'KR', name: 'South Korea', dial: '+82', flag: '🇰🇷' },
]

export default function PhoneInput({ value, onChange, availableCountries, placeholder }) {
  const allowed = (availableCountries && availableCountries.length > 0)
    ? COUNTRIES.filter(c => availableCountries.includes(c.code))
    : COUNTRIES.slice(0, 1) // just first country as fallback

  const [selected, setSelected] = useState(allowed[0] || COUNTRIES[0])
  const [localNumber, setLocalNumber] = useState('')
  const [open, setOpen] = useState(false)

  // Always sync selected country when availableCountries changes
  useEffect(() => {
    if (allowed.length === 0) return
    // If current selected is not in the allowed list, switch to first allowed
    if (!allowed.find(c => c.code === selected.code)) {
      setSelected(allowed[0])
    }
  }, [availableCountries])
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch('') } }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  const handleSelect = (c) => {
    setSelected(c)
    setOpen(false)
    setSearch('')
    onChange(c.dial + localNumber)
  }

  const handleNumber = (num) => {
    const cleaned = num.replace(/[^\d]/g, '')
    setLocalNumber(cleaned)
    onChange(selected.dial + cleaned)
  }

  const filtered = search
    ? allowed.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.dial.includes(search) || c.code.toLowerCase().includes(search.toLowerCase()))
    : allowed

  return (
    <div ref={ref} className="relative">
      <div className="flex">
        {/* Country button */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-3 py-3 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl hover:bg-slate-100 transition-colors shrink-0"
        >
          <span className="text-xl leading-none">{selected.flag}</span>
          <span className="text-sm text-slate-700 font-medium">{selected.dial}</span>
          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Number input */}
        <input
          type="tel"
          value={localNumber}
          onChange={e => handleNumber(e.target.value)}
          placeholder={placeholder || 'Phone number'}
          className="flex-1 px-3 py-3 border border-slate-200 rounded-r-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-w-0"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-100">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search country..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* List */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-4">No countries found</p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors ${selected.code === c.code ? 'bg-purple-50' : ''}`}
                >
                  <span className="text-xl leading-none">{c.flag}</span>
                  <span className="text-sm text-slate-900 flex-1">{c.name}</span>
                  <span className="text-xs text-slate-400 font-mono">{c.dial}</span>
                  {selected.code === c.code && (
                    <svg className="w-4 h-4 text-purple-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
