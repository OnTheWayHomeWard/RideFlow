import { useState, useEffect, useMemo } from 'react'
import { api } from '../../api/cashierClient'
import PhoneInput from '../../components/cashier/PhoneInput'
import AddressInput from '../../components/cashier/AddressInput'
import RouteCard, { collapseByRoute } from '../../components/cashier/RouteCard'

export default function BookForGuest() {
  const [profile, setProfile] = useState(null)
  const [hotel, setHotel] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [routes, setRoutes] = useState([])          // all common routes (fallback)
  const [nearbyRoutes, setNearbyRoutes] = useState(null)  // direction-aware nearby list
  const [vehicleRates, setVehicleRates] = useState([])
  const [extras, setExtras] = useState([])
  const [loading, setLoading] = useState(true)

  // Form state
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientRoom, setClientRoom] = useState('')
  const [editingPickup, setEditingPickup] = useState(false)
  const [customPickup, setCustomPickup] = useState(null)

  // Destination selection — one of:
  //   { kind: 'route', pickup, dropoff } — chosen from RouteCard (populates BOTH pickup + dropoff)
  //   { kind: 'custom', dropoff }        — cashier typed a custom destination
  const [pickedRoute, setPickedRoute] = useState(null)
  const [customDest, setCustomDest] = useState(null)
  const [customMode, setCustomMode] = useState(false)   // show custom-destination input

  const [googleApiKey, setGoogleApiKey] = useState('')
  const [serviceCountries, setServiceCountries] = useState([])
  const [serviceAreas, setServiceAreas] = useState([])
  const [vehicleType, setVehicleType] = useState('')
  const [pickupDate, setPickupDate] = useState('')
  const [pickupTime, setPickupTime] = useState('')
  const [selectedExtras, setSelectedExtras] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const showError = (msg) => { setError(msg); setTimeout(() => setError(''), 4000) }
  const [result, setResult] = useState(null)

  useEffect(() => {
    Promise.all([
      api.getMe(),
      api.getVehicleRates(),
      api.getCommonRoutes(),
      api.getExtras(),
      api.getPublicSettings(),
    ])
      .then(([p, v, r, e, s]) => {
        setProfile(p)
        setHotel(p?.hotel || null)
        const activeVehicles = v.filter(x => x.is_active)
        setVehicles(activeVehicles)
        setVehicleRates(activeVehicles)
        setRoutes(r)
        setExtras(e.filter(x => x.is_active))
        if (activeVehicles.length > 0) setVehicleType(activeVehicles[0]?.vehicle_type || '')
        if (s.google_maps_api_key) setGoogleApiKey(s.google_maps_api_key)
        if (s.available_countries) setServiceCountries(s.available_countries)
        if (s.service_areas) setServiceAreas(s.service_areas)
      })
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Effective pickup coords — used to sort popular routes nearest-first.
  // Order of preference: custom pickup (if the cashier is overriding) → hotel default.
  const pickupCoords = useMemo(() => {
    if (editingPickup && customPickup?.lat && customPickup?.lng) {
      return { lat: parseFloat(customPickup.lat), lng: parseFloat(customPickup.lng) }
    }
    if (profile?.hotel?.lat && profile?.hotel?.lng) {
      return { lat: parseFloat(profile.hotel.lat), lng: parseFloat(profile.hotel.lng) }
    }
    return null
  }, [editingPickup, customPickup, profile])

  // Fetch nearby routes whenever the effective pickup moves.
  useEffect(() => {
    if (!pickupCoords) { setNearbyRoutes(null); return }
    api.getNearbyRoutes(pickupCoords.lat, pickupCoords.lng)
      .then(res => setNearbyRoutes(res?.routes || []))
      .catch(() => setNearbyRoutes(null))
  }, [pickupCoords?.lat, pickupCoords?.lng])

  // Cheapest "from $X" for a popular route — same logic as the client screen so
  // the numbers match. Prefer backend-computed floor when present.
  const floorPriceFor = (route) => {
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

  const getDropoff = () => {
    if (pickedRoute?.kind === 'route') return pickedRoute.dropoff
    if (pickedRoute?.kind === 'custom' && customDest) return customDest
    return null
  }

  const getPickup = () => {
    // A chosen popular route always sets its own pickup — overrides everything.
    if (pickedRoute?.kind === 'route') return pickedRoute.pickup
    // Otherwise, custom pickup if the cashier is overriding; else fall back to
    // hotel (backend handles the hotel fallback if no pickup is sent).
    if (editingPickup && customPickup) return customPickup
    return null
  }

  const handleRouteSelect = (from, to) => {
    setPickedRoute({ kind: 'route', pickup: from, dropoff: to })
    setCustomMode(false)
    setCustomDest(null)
  }

  const handleClearDestination = () => {
    setPickedRoute(null)
    setCustomDest(null)
    setCustomMode(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const dropoff = getDropoff()
    if (!dropoff || !dropoff.name) { showError('Please pick a destination — a popular route or a custom address'); return }
    if (!clientName) { showError('Please enter guest name'); return }
    const phone = (clientPhone || '').trim()
    const email = (clientEmail || '').trim()
    if ((!phone || phone.length < 5) && !email) {
      showError('Enter a phone OR email for the guest — at least one is required')
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('That email address looks invalid')
      return
    }
    if (!vehicleType) { showError('Please select a vehicle'); return }
    if (!pickupDate) { showError('Please select a date'); return }
    if (!pickupTime) { showError('Please select a time'); return }

    setError(''); setSubmitting(true)
    try {
      const payload = {
        client_name: clientName,
        client_phone: phone || null,
        client_email: email || null,
        client_room: clientRoom || null,
        dropoff_name: dropoff.name,
        dropoff_address: dropoff.address || dropoff.name,
        dropoff_lat: parseFloat(dropoff.lat) || 0,
        dropoff_lng: parseFloat(dropoff.lng) || 0,
        vehicle_type: vehicleType,
        pickup_date: pickupDate,
        pickup_time: pickupTime.length === 5 ? pickupTime + ':00' : pickupTime,
        extras: selectedExtras.length > 0 ? selectedExtras : null,
      }
      const pickup = getPickup()
      if (pickup) {
        payload.pickup_name = pickup.name
        payload.pickup_address = pickup.address || pickup.name
        payload.pickup_lat = parseFloat(pickup.lat) || 0
        payload.pickup_lng = parseFloat(pickup.lng) || 0
      }
      const res = await api.bookForGuest(payload)
      setResult(res)
    } catch (err) { showError(typeof err.message === 'string' ? err.message : JSON.stringify(err.message)) }
    finally { setSubmitting(false) }
  }

  const toggleExtra = (slug) => {
    setSelectedExtras(prev => prev.includes(slug) ? prev.filter(e => e !== slug) : [...prev, slug])
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin"></div></div>

  // Success screen — mentions which channels actually delivered.
  if (result) {
    const sent = result.channels_sent || []
    const sentBoth = sent.includes('sms') && sent.includes('email')
    const sentSms = sent.includes('sms')
    const sentEmail = sent.includes('email')
    const sentNone = sent.length === 0
    return (
      <div className="p-4 pb-20">
        <div className={`${sentNone ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'} border rounded-2xl p-6 text-center`}>
          <div className={`w-14 h-14 ${sentNone ? 'bg-amber-100' : 'bg-green-100'} rounded-full flex items-center justify-center mx-auto mb-3`}>
            {sentNone ? (
              <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M4.93 19h14.14a1 1 0 00.87-1.5L12.87 5a1 1 0 00-1.74 0L4.06 17.5a1 1 0 00.87 1.5z" /></svg>
            ) : (
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            )}
          </div>
          <h2 className={`text-lg font-bold ${sentNone ? 'text-amber-900' : 'text-green-900'} mb-1`}>
            {sentNone ? 'Booking created — link not sent' : 'Payment Link Sent!'}
          </h2>
          <p className={`text-sm ${sentNone ? 'text-amber-700' : 'text-green-700'}`}>
            {sentBoth && <>Sent to <b>{result.client_phone}</b> and <b>{result.client_email}</b>.</>}
            {!sentBoth && sentSms && <>Sent by SMS to <b>{result.client_phone}</b>.</>}
            {!sentBoth && sentEmail && <>Emailed to <b>{result.client_email}</b>.</>}
            {sentNone && <>Neither SMS nor email went through. Share the link below with the guest manually.</>}
          </p>
          <div className={`mt-4 bg-white border ${sentNone ? 'border-amber-200' : 'border-green-200'} rounded-xl p-3`}>
            <p className="text-xs text-slate-400">Booking</p>
            <p className="font-mono font-bold text-sm">{result.booking_number}</p>
            <p className="text-xs text-slate-400 mt-2">Amount</p>
            <p className={`font-bold text-lg ${sentNone ? 'text-amber-700' : 'text-green-700'}`}>${result.total_amount.toFixed(2)}</p>
            {sentNone && result.payment_url && (
              <>
                <p className="text-xs text-slate-400 mt-2">Payment link</p>
                <a href={result.payment_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-purple-700 underline break-all">{result.payment_url}</a>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-4">
            {sentNone
              ? 'Check admin Settings for Twilio / Resend configuration if this keeps happening.'
              : 'Once the guest pays, the booking is confirmed and your commission is recorded.'}
          </p>
          <div className="flex gap-2 mt-4">
            <button onClick={() => {
              setResult(null); setClientName(''); setClientPhone(''); setClientEmail(''); setClientRoom('')
              setPickedRoute(null); setCustomDest(null); setCustomMode(false); setSelectedExtras([])
              setEditingPickup(false); setCustomPickup(null)
            }}
              className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700">
              Book Another
            </button>
            <a href="/reservations" className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold text-center hover:bg-slate-200">
              View Reservations
            </a>
          </div>
        </div>
      </div>
    )
  }

  const dropoffChosen = getDropoff()
  // Prefer nearby list (nearest-first); collapse forward/reverse to one card per route.
  const displayRoutes = (nearbyRoutes && nearbyRoutes.length)
    ? collapseByRoute(nearbyRoutes)
    : routes.map(r => ({ ...r, route_id: r.id }))

  return (
    <div className="p-4 pb-20">
      <h1 className="text-lg font-bold text-slate-900 mb-1">Book for Guest</h1>
      <p className="text-xs text-slate-500 mb-4">Create a reservation and send payment link to guest</p>

      {/* Error toast */}
      {error && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg animate-[slideDown_0.3s_ease]">
          <div className="bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-sm font-medium flex-1">{error}</p>
            <button onClick={() => setError('')} className="shrink-0 hover:opacity-80">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Pickup — hotel default with edit option. Hidden when a popular
            route is selected, since routes carry their own pickup. */}
        {pickedRoute?.kind === 'route' ? (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-purple-600 font-medium">Pickup (from route)</p>
              <p className="font-semibold text-sm text-purple-900 truncate">{pickedRoute.pickup?.name}</p>
            </div>
            <button type="button" onClick={handleClearDestination}
              className="text-xs text-purple-600 font-medium px-2 py-1 bg-purple-100 rounded-lg hover:bg-purple-200">
              Change route
            </button>
          </div>
        ) : !editingPickup ? (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-purple-600 font-medium">Pickup</p>
              <p className="font-semibold text-sm text-purple-900">{profile?.hotel_name || hotel?.name || 'Your Hotel'}</p>
            </div>
            <button type="button" onClick={() => setEditingPickup(true)} className="text-xs text-purple-600 font-medium px-2 py-1 bg-purple-100 rounded-lg hover:bg-purple-200">
              Edit
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-purple-600 font-medium">Custom Pickup</p>
              <button type="button" onClick={() => { setEditingPickup(false); setCustomPickup(null) }}
                className="text-xs text-slate-500 font-medium px-2 py-1 bg-slate-100 rounded-lg hover:bg-slate-200">
                Use Hotel
              </button>
            </div>
            <AddressInput
              value={customPickup?.name || ''}
              onChange={setCustomPickup}
              placeholder="Search pickup address..."
              googleApiKey={googleApiKey}
              countries={serviceCountries}
              serviceAreas={serviceAreas}
            />
          </div>
        )}

        {/* Destination — three modes: pick a popular route, use custom, or the
            "you picked X" summary once a choice is locked in. */}
        {dropoffChosen ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs text-green-700 font-medium">
                {pickedRoute?.kind === 'route' ? 'Destination (from route)' : 'Custom destination'}
              </p>
              <p className="font-semibold text-sm text-green-900 truncate">{dropoffChosen.name}</p>
            </div>
            <button type="button" onClick={handleClearDestination}
              className="text-xs text-green-700 font-medium px-2 py-1 bg-green-100 rounded-lg hover:bg-green-200 shrink-0 ml-2">
              Change
            </button>
          </div>
        ) : customMode ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">Custom destination</label>
              <button type="button" onClick={() => setCustomMode(false)}
                className="text-xs text-slate-500 font-medium px-2 py-1 bg-slate-100 rounded-lg hover:bg-slate-200">
                Back to popular routes
              </button>
            </div>
            <AddressInput
              value={customDest?.name || ''}
              onChange={(loc) => { setCustomDest(loc); setPickedRoute({ kind: 'custom' }) }}
              placeholder="Search destination address..."
              googleApiKey={googleApiKey}
              countries={serviceCountries}
              serviceAreas={serviceAreas}
            />
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">
                {nearbyRoutes && nearbyRoutes.length ? 'Popular routes near you' : 'Popular destinations'}
              </label>
              <button type="button" onClick={() => { setCustomMode(true); setPickedRoute(null) }}
                className="text-xs text-purple-600 font-medium px-2 py-1 bg-purple-50 rounded-lg hover:bg-purple-100">
                Custom destination
              </button>
            </div>
            {displayRoutes.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500 mb-2">No popular routes configured.</p>
                <button type="button" onClick={() => { setCustomMode(true); setPickedRoute(null) }}
                  className="text-xs font-semibold text-purple-700">Enter a custom destination →</button>
              </div>
            ) : (
              <div className="space-y-2">
                {displayRoutes.slice(0, 10).map(r => (
                  <RouteCard
                    key={r.route_id || r.id}
                    route={r}
                    floor={floorPriceFor(r)}
                    near={r.near}
                    distanceKm={r.origin_distance_km}
                    onSelect={handleRouteSelect}
                    disabled={submitting}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Vehicle type */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle</label>
          <div className="grid grid-cols-2 gap-2">
            {vehicles.map(v => (
              <button type="button" key={v.vehicle_type} onClick={() => setVehicleType(v.vehicle_type)}
                className={`p-3 border rounded-xl text-left transition-all ${vehicleType === v.vehicle_type ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <p className="font-semibold text-sm capitalize">{v.display_name || v.vehicle_type}</p>
                <p className="text-xs text-slate-500">Up to {v.max_passengers} pax</p>
              </button>
            ))}
          </div>
        </div>

        {/* Date + Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
            <input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)} min={new Date().toISOString().split('T')[0]} required
              className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
            <input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} required
              className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
        </div>

        {/* Guest info */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Guest Information</p>
          <input type="text" placeholder="Guest name" value={clientName} onChange={e => setClientName(e.target.value)} required
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <PhoneInput value={clientPhone} onChange={setClientPhone} placeholder="Guest phone number" />
          <input type="email" inputMode="email" placeholder="Guest email (optional if phone given)" value={clientEmail} onChange={e => setClientEmail(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <p className="text-[11px] text-slate-400 -mt-1">At least one contact method is required. If you provide both, we'll send the payment link to both.</p>
          <input type="text" placeholder="Room number (optional)" value={clientRoom} onChange={e => setClientRoom(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>

        {/* Extras */}
        {extras.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Add-ons</label>
            <div className="space-y-2">
              {extras.map(ex => (
                <label key={ex.slug} className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${selectedExtras.includes(ex.slug) ? 'border-purple-500 bg-purple-50' : 'border-slate-200 bg-white'}`}>
                  <input type="checkbox" checked={selectedExtras.includes(ex.slug)} onChange={() => toggleExtra(ex.slug)} className="sr-only" />
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${selectedExtras.includes(ex.slug) ? 'bg-purple-600 border-purple-600' : 'border-slate-300'}`}>
                    {selectedExtras.includes(ex.slug) && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{ex.name}</p>
                    <p className="text-xs text-slate-500">{ex.description}</p>
                  </div>
                  <span className="text-sm font-bold text-purple-700">{ex.price_type === 'flat' ? `$${ex.price}` : `${ex.price}%`}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        <button type="submit" disabled={submitting}
          className="w-full py-4 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 active:scale-[0.98] transition-all disabled:opacity-60">
          {submitting ? 'Sending...' : 'Send Payment Link to Guest'}
        </button>
      </form>
    </div>
  )
}
