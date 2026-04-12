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
export default function AddressInput({ value, onChange, placeholder, googleApiKey, countries }) {
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
    if (countries && countries.length > 0) {
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

      const result = {
        name: place.name || place.formatted_address,
        address: place.formatted_address,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        country: countryCode,
      }
      setText(result.name)
      onChange(result)
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
        className="w-full pl-9 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-slate-400"
      />
    </div>
  )
}
