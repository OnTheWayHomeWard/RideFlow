import { useState, useEffect } from 'react'
import { api } from '../api/client'
import Toast from './Toast'

const DESTINATION_ICONS = {
  'Airport': '✈️', 'Downtown': '🏙️', 'Beach': '🏖️',
  'Mall': '🛍️', 'Resort': '🏨',
}

function getIcon(name) {
  for (const [key, icon] of Object.entries(DESTINATION_ICONS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return icon
  }
  return '📍'
}

export default function StepRoute({ booking, cashierInfo, isQREntry, onSelect, onError }) {
  const [routes, setRoutes] = useState([])
  const [pickup, setPickup] = useState(booking.pickup)
  const [dropoff, setDropoff] = useState(booking.dropoff)
  const [pickupText, setPickupText] = useState(booking.pickup?.address || '')
  const [dropoffText, setDropoffText] = useState('')
  const [loading, setLoading] = useState(false)
  const [routesLoading, setRoutesLoading] = useState(true)
  const [editingPickup, setEditingPickup] = useState(false)
  const [locationStatus, setLocationStatus] = useState(null) // 'requesting', 'granted', 'denied'

  const hasQR = !!cashierInfo
  const hasPickup = !!pickup && !editingPickup

  useEffect(() => {
    api.getCommonRoutes()
      .then(setRoutes)
      .catch(() => {})
      .finally(() => setRoutesLoading(false))
  }, [])

  // When pickup comes from QR
  useEffect(() => {
    if (booking.pickup && !editingPickup) {
      setPickup(booking.pickup)
      setPickupText(booking.pickup.name || booking.pickup.address)
    }
  }, [booking.pickup])

  // Browser geolocation — only for direct visitors (no ?ref= in URL at all)
  useEffect(() => {
    if (isQREntry) return
    if (booking.pickup) return
    if (!navigator.geolocation) return

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
      },
      () => {
        setLocationStatus('denied')
      }
    )
  }, []) // run once on mount only

  const handlePopularRoute = (route) => {
    const to = {
      name: route.to_name,
      address: route.to_address,
      lat: route.to_lat,
      lng: route.to_lng,
    }
    if (pickup && !editingPickup) {
      setLoading(true)
      onSelect(pickup, to)
    } else {
      const from = {
        name: route.from_name,
        address: route.from_address,
        lat: route.from_lat,
        lng: route.from_lng,
      }
      setLoading(true)
      onSelect(from, to)
    }
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
      {/* Pickup context bar — shown when pickup is set (QR or geolocation) */}
      {hasPickup && !editingPickup && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-lg">
            {hasQR ? '🏨' : '📍'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900 truncate">{pickup.name}</p>
            <p className="text-xs text-blue-600">Pickup location</p>
          </div>
          <button
            onClick={clearPickup}
            className="text-blue-500 hover:text-blue-700 p-1"
            title="Change pickup"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>
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

      {/* Title */}
      <h1 className="text-2xl font-bold text-slate-900 mb-1">
        {hasPickup && !editingPickup ? 'Where are you going?' : 'Book a ride'}
      </h1>
      <p className="text-slate-500 text-sm mb-5">
        {hasPickup && !editingPickup ? 'Pick a destination below' : 'Enter your pickup and destination'}
      </p>

      {/* Pickup field — shown when no pickup set, or user is editing */}
      {(!hasPickup || editingPickup) && (
        <div className="relative mb-3">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full"></div>
          <input
            type="text"
            placeholder="Pickup location"
            value={pickupText}
            onChange={e => handlePickupChange(e.target.value)}
            autoFocus={editingPickup}
            className="w-full pl-9 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
          />
        </div>
      )}

      {/* Destination field — always shown */}
      <div className="relative mb-3">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 bg-green-500 rounded-full"></div>
        <input
          type="text"
          placeholder="Where to?"
          value={dropoffText}
          onChange={e => handleDropoffChange(e.target.value)}
          className="w-full pl-9 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
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
        <span className="text-xs text-slate-400 font-medium">Popular destinations</span>
        <div className="flex-1 h-px bg-slate-200"></div>
      </div>

      {/* Popular Routes */}
      {routesLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : routes.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No popular routes available. Type your destination above.</p>
      ) : (
        <div className="space-y-2.5">
          {routes.map(route => (
            <button
              key={route.id}
              onClick={() => handlePopularRoute(route)}
              disabled={loading}
              className="w-full bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-blue-300 hover:shadow-sm active:scale-[0.99] transition-all text-left disabled:opacity-60"
            >
              <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-2xl">
                {getIcon(route.to_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm">{route.to_name}</p>
                <p className="text-xs text-slate-500 truncate">{route.to_address}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900">
                  from ${Math.min(...Object.values(route.prices))}
                </p>
                {route.distance_miles && (
                  <p className="text-xs text-slate-400">{route.distance_miles} mi</p>
                )}
              </div>
              <svg className="w-5 h-5 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
