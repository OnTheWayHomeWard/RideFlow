import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { useSettings } from '../hooks/useSettings'
import Toast from './Toast'
import AddressInput from './AddressInput'
import RouteCard, { collapseByRoute } from './RouteCard'

export default function StepRoute({ booking, cashierInfo, isQREntry, onSelect, onError }) {
  const settings = useSettings()
  const [routes, setRoutes] = useState([])
  const [nearbyRoutes, setNearbyRoutes] = useState(null)  // directional options sorted nearest-first
  const [vehicleRates, setVehicleRates] = useState([])
  const [pickup, setPickup] = useState(booking.pickup)
  const [dropoff, setDropoff] = useState(booking.dropoff)
  const [pickupText, setPickupText] = useState(booking.pickup?.address || '')
  const [dropoffText, setDropoffText] = useState('')
  const [loading, setLoading] = useState(false)
  const [routesLoading, setRoutesLoading] = useState(true)
  const [editingPickup, setEditingPickup] = useState(false)
  const [locationStatus, setLocationStatus] = useState(null) // 'requesting', 'granted', 'denied'
  const [userCountry, setUserCountry] = useState(null) // detected country from geolocation

  const hasQR = !!cashierInfo
  const hasPickup = !!pickup && !editingPickup

  useEffect(() => {
    Promise.all([
      api.getCommonRoutes().catch(() => []),
      api.getVehicleRates().catch(() => []),
    ]).then(([rs, rates]) => {
      setRoutes(rs)
      setVehicleRates((rates || []).filter(r => r.is_active))
    }).finally(() => setRoutesLoading(false))
  }, [])

  // "from $X" floor for a popular route. Two storage formats:
  //  - new per-vehicle:  {sedan: 100, suv: 125}  → cheapest = min(values), already a total
  //  - legacy _base:     {_base: 100}            → must add cheapest vehicle base_fare
  const floorPriceFor = (route) => {
    // Backend-computed, upsale-adjusted floor — matches the vehicle screen.
    if (route.from_price != null && !isNaN(Number(route.from_price))) return Math.round(Number(route.from_price))
    const prices = route.prices || {}
    if ('_base' in prices) {
      const base = Number(prices._base) || 0
      const cheapestVehicleBase = vehicleRates.length
        ? Math.min(...vehicleRates.map(v => Number(v.base_fare) || 0))
        : 0
      return Math.round(base + cheapestVehicleBase)
    }
    const vals = Object.values(prices).filter(v => typeof v === 'number' && v > 0)
    if (!vals.length) return null
    return Math.round(Math.min(...vals))
  }

  // When pickup comes from QR
  useEffect(() => {
    if (booking.pickup && !editingPickup) {
      setPickup(booking.pickup)
      setPickupText(booking.pickup.name || booking.pickup.address)
    }
  }, [booking.pickup])

  // Reusable geolocation function — used both on mount and from the pickup input button
  const useCurrentLocation = (force = false) => {
    if (!navigator.geolocation) {
      setLocationStatus('denied')
      return
    }
    setLocationStatus('requesting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationStatus('granted')
        const loc = {
          name: 'Your current location',
          address: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }
        setPickup(loc)
        setPickupText('Your current location')

        // Reverse geocode to get human-readable address + country
        if (window.google?.maps?.Geocoder) {
          const geocoder = new window.google.maps.Geocoder()
          geocoder.geocode({ location: { lat: pos.coords.latitude, lng: pos.coords.longitude } }, (results, status) => {
            if (status === 'OK' && results[0]) {
              const result = results[0]
              const cc = result.address_components?.find(c => c.types.includes('country'))
              if (cc) {
                setUserCountry(cc.short_name)
                loc.country = cc.short_name
              }
              // Use formatted address for human-readable name
              if (result.formatted_address) {
                loc.name = result.formatted_address
                loc.address = result.formatted_address
                setPickupText(result.formatted_address)
              }
              setPickup({ ...loc })
            }
          })
        } else {
          // No Google Maps — try free reverse geocode API
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
            .then(r => r.json())
            .then(data => {
              if (data.address?.country_code) {
                const cc = data.address.country_code.toUpperCase()
                setUserCountry(cc)
                loc.country = cc
              }
              if (data.display_name) {
                loc.name = data.display_name
                loc.address = data.display_name
                setPickupText(data.display_name)
              }
              setPickup({ ...loc })
            })
            .catch(() => {})
        }
      },
      () => {
        setLocationStatus('denied')
      }
    )
  }

  // On mount: auto-trigger geolocation if no pickup is set yet (works for QR + direct entry)
  useEffect(() => {
    if (booking.pickup) return
    useCurrentLocation()
  }, [])

  // When we know the user's location (pickup), fetch popular routes ordered
  // nearest-origin-first so they discover fixed-price routes from where they are.
  useEffect(() => {
    const lat = pickup?.lat
    const lng = pickup?.lng
    if (!lat || !lng) { setNearbyRoutes(null); return }
    api.getNearbyRoutes(lat, lng)
      .then(res => setNearbyRoutes(res?.routes || []))
      .catch(() => setNearbyRoutes(null))
  }, [pickup?.lat, pickup?.lng])

  // Book a popular route in a specific direction. Passing the exact endpoint
  // coords ensures the backend matches it as a fixed-price common route (forward
  // OR reverse), instead of falling back to the per-mile distance calc.
  const bookRoute = (from, to) => {
    setLoading(true)
    onSelect(from, to)
  }

  const handleCustomSubmit = () => {
    if (!pickup || !dropoff) return
    setLoading(true)
    onSelect(pickup, dropoff)
  }

  const handlePickupChange = (val) => {
    setPickupText(val)
    if (val.length > 3) {
      setPickup({ name: val, address: val, lat: 39.74, lng: -104.99 })
    } else {
      setPickup(null)
    }
  }

  const handleDropoffChange = (val) => {
    setDropoffText(val)
    if (val.length > 3) {
      setDropoff({ name: val, address: val, lat: 39.86, lng: -104.67 })
    } else {
      setDropoff(null)
    }
  }

  const clearPickup = () => {
    setPickup(null)
    setPickupText('')
    setEditingPickup(true)
  }

  return (
    <div className="p-4 animate-[fadeIn_0.3s_ease]">
      {/* Pickup context bar — shown when pickup is set (QR or geolocation). Whole card is clickable to edit. */}
      {hasPickup && !editingPickup && (
        <button
          onClick={clearPickup}
          className="w-full mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3 hover:bg-blue-100 transition-colors text-left"
          title="Tap to change pickup"
        >
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-lg shrink-0">
            {hasQR ? '🏨' : '📍'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900 truncate">{pickup.name}</p>
            <p className="text-xs text-blue-600">Pickup location — tap to change</p>
          </div>
          <svg className="w-5 h-5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      )}

      {/* Location denied notice */}
      {locationStatus === 'denied' && !hasPickup && !hasQR && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-xs text-amber-700">Location access denied. Please type your pickup address below.</p>
        </div>
      )}

      {/* Service area warning */}
      {(() => {
        const areas = settings.service_areas || []
        if (areas.length === 0) return null

        // Helpers
        const inBounds = (lat, lng, b) => b && b.south <= lat && lat <= b.north && b.west <= lng && lng <= b.east
        const locInAreas = (loc) => {
          if (!loc?.country) return true  // unknown country = don't warn
          const cc = loc.country.toUpperCase()
          return areas.some(a => {
            if (a.type === 'country') return (a.country || '').toUpperCase() === cc
            if (a.type === 'city' && loc.lat && loc.lng) return inBounds(loc.lat, loc.lng, a.bounds)
            return false
          })
        }
        const allowedDisplay = areas.map(a => a.type === 'city' ? `${a.name} (${a.country})` : a.name)

        const userOutside = userCountry && !areas.some(a => (a.country || '').toUpperCase() === userCountry.toUpperCase())
        const pickupOutside = pickup && !locInAreas(pickup)
        const dropoffOutside = dropoff && !locInAreas(dropoff)

        if (userOutside && !pickup?.country && !dropoff?.country) {
          // User just arrived and their location is outside service area
          return (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="text-xs text-amber-700">It looks like you're not in our service area. We currently operate in <strong>{allowedDisplay.join(', ')}</strong>. You can still browse, but pickup and destination must be within these countries.</p>
            </div>
          )
        }

        if (pickupOutside || dropoffOutside) {
          return (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="text-xs text-red-700">
                {pickupOutside && dropoffOutside
                  ? 'Both your pickup and destination are outside our service area.'
                  : pickupOutside ? 'Your pickup location is outside our service area.'
                  : 'Your destination is outside our service area.'}
                {' '}We only operate in <strong>{allowedDisplay.join(', ')}</strong>.
              </p>
            </div>
          )
        }

        return null
      })()}

      {/* Title */}
      <h1 className="text-2xl font-bold text-slate-900 mb-1">
        {hasPickup && !editingPickup ? 'Where are you going?' : 'Book a ride'}
      </h1>
      <p className="text-slate-500 text-sm mb-5">
        {hasPickup && !editingPickup ? 'Pick a destination below' : 'Enter your pickup and destination'}
      </p>

      {/* Pickup field — shown when no pickup set, or user is editing */}
      {(!hasPickup || editingPickup) && (
        <div className="mb-3">
          <AddressInput
            value={pickupText}
            onChange={(loc) => { setPickup(loc); setPickupText(loc.name); setEditingPickup(false) }}
            placeholder="Pickup location"
            googleApiKey={settings.google_maps_api_key}
            countries={settings.available_countries}
            serviceAreas={settings.service_areas}
            onUseCurrentLocation={() => { setEditingPickup(false); useCurrentLocation() }}
          />
          {locationStatus === 'requesting' && (
            <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1">
              <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2} className="opacity-25" /><path strokeWidth={2} d="M4 12a8 8 0 018-8" /></svg>
              Detecting your location...
            </p>
          )}
        </div>
      )}

      {/* Destination field — always shown */}
      <div className="mb-3">
        <AddressInput
          value={dropoffText}
          onChange={(loc) => { setDropoff(loc); setDropoffText(loc.name) }}
          placeholder="Where to?"
          googleApiKey={settings.google_maps_api_key}
          countries={settings.available_countries}
          serviceAreas={settings.service_areas}
        />
      </div>

      {/* Custom route submit — only when user typed a destination */}
      {dropoff && (hasPickup || pickup) && (
        <button
          onClick={handleCustomSubmit}
          disabled={loading}
          className="w-full mb-4 bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'See available rides'}
        </button>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-slate-200"></div>
        <span className="text-xs text-slate-400 font-medium">
          {nearbyRoutes && nearbyRoutes.length ? 'Popular routes near you' : 'Popular destinations'}
        </span>
        <div className="flex-1 h-px bg-slate-200"></div>
      </div>

      {/* Popular Routes — prefer location-sorted nearby options, else the plain list */}
      {routesLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (nearbyRoutes && nearbyRoutes.length) ? (
        <div className="space-y-2.5">
          {collapseByRoute(nearbyRoutes).map(opt => (
            <RouteCard
              key={opt.route_id}
              route={opt}
              floor={floorPriceFor(opt)}
              near={opt.near}
              distanceKm={opt.origin_distance_km}
              onBook={bookRoute}
              disabled={loading}
            />
          ))}
        </div>
      ) : routes.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No popular routes available. Type your destination above.</p>
      ) : (
        <div className="space-y-2.5">
          {routes.map(r => (
            <RouteCard
              key={r.id}
              route={r}
              floor={floorPriceFor(r)}
              onBook={bookRoute}
              disabled={loading}
            />
          ))}
        </div>
      )}
    </div>
  )
}
