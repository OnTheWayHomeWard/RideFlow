import { useState, useEffect } from 'react'
import { api } from '../api/client'
import PhoneInput from '../components/PhoneInput'
import AddressInput from '../components/AddressInput'

export default function BookForGuest() {
  const [profile, setProfile] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [routes, setRoutes] = useState([])
  const [extras, setExtras] = useState([])
  const [loading, setLoading] = useState(true)

  // Form state
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientRoom, setClientRoom] = useState('')
  const [editingPickup, setEditingPickup] = useState(false)
  const [customPickup, setCustomPickup] = useState(null)
  const [selectedRoute, setSelectedRoute] = useState('')
  const [customDest, setCustomDest] = useState(null)
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
    Promise.all([api.getMe(), api.getVehicleRates(), api.getCommonRoutes(), api.getExtras(), api.getPublicSettings()])
      .then(([p, v, r, e, s]) => {
        setProfile(p)
        setVehicles(v.filter(x => x.is_active))
        setRoutes(r)
        setExtras(e.filter(x => x.is_active))
        if (v.length > 0) setVehicleType(v.filter(x => x.is_active)[0]?.vehicle_type || '')
        if (s.google_maps_api_key) setGoogleApiKey(s.google_maps_api_key)
        if (s.available_countries) setServiceCountries(s.available_countries)
        if (s.service_areas) setServiceAreas(s.service_areas)
      })
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  const getDropoff = () => {
    if (selectedRoute === '_custom') return customDest
    const route = routes.find(r => r.id === selectedRoute)
    if (!route) return null
    return { name: route.to_name, address: route.to_address, lat: route.to_lat, lng: route.to_lng }
  }

  const getPickup = () => {
    if (editingPickup && customPickup) return customPickup
    return null // use hotel default
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const dropoff = getDropoff()
    if (!dropoff || !dropoff.name) { showError('Please select a destination'); return }
    if (!clientName) { showError('Please enter guest name'); return }
    if (!clientPhone || clientPhone.length < 5) { showError('Please enter guest phone number'); return }
    if (!vehicleType) { showError('Please select a vehicle'); return }
    if (!pickupDate) { showError('Please select a date'); return }
    if (!pickupTime) { showError('Please select a time'); return }

    setError(''); setSubmitting(true)
    try {
      const payload = {
        client_name: clientName,
        client_phone: clientPhone,
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

  // Success screen
  if (result) {
    return (
      <div className="p-4 pb-20">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-lg font-bold text-green-900 mb-1">Payment Link Sent!</h2>
          <p className="text-sm text-green-700">A payment link has been sent to</p>
          <p className="font-mono font-bold text-green-800 mt-1">{result.client_phone}</p>
          <div className="mt-4 bg-white border border-green-200 rounded-xl p-3">
            <p className="text-xs text-slate-400">Booking</p>
            <p className="font-mono font-bold text-sm">{result.booking_number}</p>
            <p className="text-xs text-slate-400 mt-2">Amount</p>
            <p className="font-bold text-lg text-green-700">${result.total_amount.toFixed(2)}</p>
          </div>
          <p className="text-xs text-slate-500 mt-4">The guest will receive an SMS with the payment link. Once they pay, the booking will be confirmed and you'll earn your commission.</p>
          <div className="flex gap-2 mt-4">
            <button onClick={() => { setResult(null); setClientName(''); setClientPhone(''); setClientRoom(''); setSelectedRoute(''); setSelectedExtras([]) }}
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

        {/* Pickup */}
        {!editingPickup ? (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-purple-600 font-medium">Pickup</p>
              <p className="font-semibold text-sm text-purple-900">{profile?.hotel_name || 'Your Hotel'}</p>
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

        {/* Destination */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Destination</label>
          <select value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
            <option value="">Select destination...</option>
            {routes.map(r => (
              <option key={r.id} value={r.id}>{r.to_name}</option>
            ))}
            <option value="_custom">Custom destination</option>
          </select>
        </div>

        {selectedRoute === '_custom' && (
          <AddressInput
            value={customDest?.name || ''}
            onChange={setCustomDest}
            placeholder="Search destination address..."
            googleApiKey={googleApiKey}
            countries={serviceCountries}
            serviceAreas={serviceAreas}
          />
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
