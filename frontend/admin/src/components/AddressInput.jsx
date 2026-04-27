import { useState, useRef, useEffect } from 'react'

/**
 * Address input with Google Places Autocomplete.
 * Falls back to plain text input if Google Maps API is not loaded.
 *
 * Props:
 * - value: string (display text)
 * - onChange: ({ name, address, lat, lng, country }) => void
 * - placeholder: string
 * - googleApiKey: string (optional — if not set, plain text mode)
 * - countries: string[] (optional — ISO country codes to restrict autocomplete, e.g. ['US', 'ET'])
 */
export default function AddressInput({ value, onChange, placeholder, googleApiKey, countries, serviceAreas, onUseCurrentLocation }) {
  const inputRef = useRef(null)
  const autocompleteRef = useRef(null)
  const [text, setText] = useState(value || '')
  const [loaded, setLoaded] = useState(false)

  // Load Google Maps script once
  useEffect(() => {
    if (!googleApiKey || googleApiKey === 'placeholder') return
    if (window.google?.maps?.places) { setLoaded(true); return }

    const existing = document.querySelector('script[src*="maps.googleapis.com"]')
    if (existing) {
      existing.addEventListener('load', () => setLoaded(true))
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleApiKey}&libraries=places`
    script.async = true
    script.onload = () => setLoaded(true)
    document.head.appendChild(script)
  }, [googleApiKey])

  // Init autocomplete when loaded
  useEffect(() => {
    if (!loaded || !inputRef.current || autocompleteRef.current) return

    const options = { types: ['establishment', 'geocode'] }

    // Prefer serviceAreas (new system) over countries (legacy)
    if (serviceAreas && serviceAreas.length > 0) {
      const cities = serviceAreas.filter(a => a.type === 'city' && a.bounds)
      const countryAreas = serviceAreas.filter(a => a.type === 'country')
      const allCountries = [...new Set([
        ...countryAreas.map(a => (a.country || '').toLowerCase()),
        ...cities.map(a => (a.country || '').toLowerCase()),
      ])].filter(Boolean).slice(0, 5)
      if (allCountries.length) options.componentRestrictions = { country: allCountries }

      if (cities.length) {
        // Union the city bounds for biasing
        const u = cities.reduce((acc, c) => ({
          north: Math.max(acc.north, c.bounds.north),
          south: Math.min(acc.south, c.bounds.south),
          east: Math.max(acc.east, c.bounds.east),
          west: Math.min(acc.west, c.bounds.west),
        }), { north: -90, south: 90, east: -180, west: 180 })
        options.bounds = new window.google.maps.LatLngBounds(
          { lat: u.south, lng: u.west },
          { lat: u.north, lng: u.east }
        )
        // Strict only when single city + no country area
        if (cities.length === 1 && countryAreas.length === 0) options.strictBounds = true
      }
    } else if (countries && countries.length > 0) {
      options.componentRestrictions = { country: countries.map(c => c.toLowerCase()) }
    }

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, options)

    ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      if (!place.geometry) return

      // Extract country from address components
      let countryCode = ''
      if (place.address_components) {
        const cc = place.address_components.find(c => c.types.includes('country'))
        if (cc) countryCode = cc.short_name
      }

      const lat = place.geometry.location.lat()
      const lng = place.geometry.location.lng()

      // Defense-in-depth: if serviceAreas configured, validate the picked place
      if (serviceAreas && serviceAreas.length > 0) {
        const cc = countryCode.toUpperCase()
        const ok = serviceAreas.some(a => {
          if (a.type === 'country') return (a.country || '').toUpperCase() === cc
          if (a.type === 'city' && a.bounds) {
            return a.bounds.south <= lat && lat <= a.bounds.north && a.bounds.west <= lng && lng <= a.bounds.east
          }
          return false
        })
        if (!ok) {
          const allowed = serviceAreas.map(a => a.type === 'city' ? `${a.name} (${a.country})` : a.name).join(', ')
          alert(`This address is outside our service area. We currently operate in: ${allowed}`)
          setText('')
          if (inputRef.current) inputRef.current.value = ''
          return
        }
      }

      // Build display name — prefer full formatted address but strip Plus Codes (e.g. "2PFX+RC7 Golla Park, ...")
      const PLUS_CODE_RE = /^[A-Z0-9]{4,}\+[A-Z0-9]+,?\s*/i
      const isPlusCodeOnly = (s) => /^[A-Z0-9]{4,}\+[A-Z0-9]+\s*$/i.test((s || '').trim())
      const stripPlusCode = (s) => {
        if (!s) return ''
        return s.replace(PLUS_CODE_RE, '').trim()
      }
      // If place.name is just a Plus Code, treat it as empty
      const placeName = isPlusCodeOnly(place.name) ? '' : stripPlusCode(place.name || '')
      const formatted = stripPlusCode(place.formatted_address || '')
      // If place.name is meaningful and the formatted_address doesn't already start with it, prepend it
      let fullName
      if (formatted && placeName && formatted !== placeName && !formatted.toLowerCase().startsWith(placeName.toLowerCase())) {
        fullName = `${placeName}, ${formatted}`
      } else {
        fullName = formatted || placeName || ''
      }
      const result = {
        name: fullName,
        address: place.formatted_address || fullName,
        lat,
        lng,
        country: countryCode,
      }
      setText(fullName)
      onChange(result)
      // Google's autocomplete sets the input to place.name AFTER place_changed.
      // Override on next tick so the user sees the full formatted_address.
      setTimeout(() => {
        if (inputRef.current) inputRef.current.value = fullName
        setText(fullName)
      }, 0)
    })

    autocompleteRef.current = ac
  }, [loaded])

  // Sync external value
  useEffect(() => { setText(value || '') }, [value])

  const handleChange = (e) => {
    setText(e.target.value)
    if (!loaded && e.target.value.length > 2) {
      onChange({ name: e.target.value, address: e.target.value, lat: 0, lng: 0, country: '' })
    }
  }

  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={handleChange}
        placeholder={placeholder || 'Search address...'}
        className={`w-full pl-9 ${onUseCurrentLocation ? 'pr-12' : 'pr-4'} py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-slate-400`}
      />
      {onUseCurrentLocation && (
        <button type="button" onClick={onUseCurrentLocation}
          title="Use my current location"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}
    </div>
  )
}
