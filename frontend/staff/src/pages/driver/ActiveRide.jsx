import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../api/driverClient'

const EXTRA_LABELS = {
  room_pickup: 'Room Pickup',
  extra_luggage: 'Extra Luggage (3+)',
  child_seat: 'Child Seat',
}

function fmtDate(d) {
  if (!d) return ''
  const today = new Date().toISOString().split('T')[0]
  const tmrw = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  if (d === today) return 'Today'
  if (d === tmrw) return 'Tomorrow'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function InfoCard({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-900">{value}</p>
    </div>
  )
}

export default function ActiveRide({ settings }) {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const [runs, setRuns] = useState([])
  const [ride, setRide] = useState(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    api.getMyRuns().then(r => { setRuns(r); setRide(r.find(x => x.id === bookingId)); setLoading(false) }).catch(() => setLoading(false))
  }, [bookingId])

  const getLocation = () => new Promise((resolve) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: 0, lng: 0 })
      )
    } else resolve({ lat: 0, lng: 0 })
  })

  const handleStart = async () => {
    setActing(true)
    const loc = await getLocation()
    try { await api.startRide(bookingId, loc); navigate('/driver') } catch (e) { alert(e.message) }
    finally { setActing(false) }
  }

  const handleComplete = async () => {
    if (!confirm('Complete this ride?')) return
    setActing(true)
    const loc = await getLocation()
    try { await api.completeRide(bookingId, loc); navigate('/driver') } catch (e) { alert(e.message) }
    finally { setActing(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
  if (!ride) return <div className="p-4 text-center text-slate-400 py-16">Ride not found</div>

  const isAssigned = ride.status === 'assigned'
  const isInProgress = ride.status === 'in_progress'

  return (
    <div className="p-4 pb-32">
      {/* Back */}
      <button onClick={() => navigate('/driver')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back
      </button>

      {/* Status */}
      <div className={`text-center py-2 px-4 rounded-xl mb-4 text-sm font-medium ${
        isInProgress ? 'bg-amber-100 text-amber-800' : isAssigned ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
      }`}>
        {isInProgress ? 'Ride in Progress' : isAssigned ? 'Upcoming Ride' : ride.status === 'completed' ? 'Ride Completed' : ride.status}
      </div>

      {/* Route */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex flex-col items-center gap-1 mt-1">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <div className="w-px h-8 bg-slate-300"></div>
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          </div>
          <div>
            <div className="mb-3">
              <p className="text-xs text-slate-400">Pickup</p>
              <p className="font-semibold text-sm">{ride.pickup_name}</p>
              <p className="text-xs text-slate-500">{ride.pickup_address}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Destination</p>
              <p className="font-semibold text-sm">{ride.dropoff_name}</p>
              <p className="text-xs text-slate-500">{ride.dropoff_address}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <InfoCard label="Date" value={fmtDate(ride.pickup_date)} />
        <InfoCard label="Time" value={ride.pickup_time?.slice(0, 5)} />
        <InfoCard label="Vehicle" value={ride.vehicle_type?.toUpperCase()} />
      </div>

      {/* Trip details */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <InfoCard label="Passengers" value={ride.passengers || 1} />
        <InfoCard label="Luggage" value={(ride.luggage || 'none').replace('_', ' ')} />
      </div>

      {/* Add-ons / Special Requests */}
      {ride.extras_chosen && ride.extras_chosen.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <h3 className="text-xs text-amber-700 uppercase tracking-wide font-medium mb-2">Add-ons / Special Requests</h3>
          <div className="space-y-1.5">
            {ride.extras_chosen.map(e => (
              <div key={e} className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-amber-900 font-medium">{EXTRA_LABELS[e] || e.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
          {ride.extras_chosen.includes('room_pickup') && ride.client_room && (
            <p className="text-xs text-amber-700 mt-2">Pick up client from Room {ride.client_room}</p>
          )}
        </div>
      )}

      {/* Client notes */}
      {ride.notes && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <h3 className="text-xs text-blue-700 uppercase tracking-wide font-medium mb-1">Client notes</h3>
          <p className="text-sm text-blue-900 whitespace-pre-wrap">{ride.notes}</p>
        </div>
      )}

      {/* Client info */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <h3 className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-2">Client</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm text-slate-900">{ride.client_name}</p>
            {ride.client_room && <p className="text-xs text-slate-500">Room {ride.client_room}</p>}
          </div>
          <a href={`tel:${ride.client_phone}`} className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </a>
        </div>
      </div>

      {/* Earnings */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
        <p className="text-xs text-green-600">You earn</p>
        <p className="text-2xl font-bold text-green-700">${ride.driver_earnings.toFixed(2)}</p>
        {ride.payout_status && <p className="text-xs text-green-500 mt-0.5 capitalize">{ride.payout_status.replace('_', ' ')}</p>}
      </div>

      {/* Pre-pickup courtesy notifications — visible within 1h of pickup, only while assigned */}
      <PrePickupNotifications ride={ride} onUpdated={(updated) => setRide(updated)} />

      {/* Action buttons — fixed bottom */}
      {(isAssigned || isInProgress) && (
        <div className="fixed bottom-14 left-0 right-0 z-10">
          <div className="max-w-lg mx-auto px-4">
            {isAssigned && (
              <button onClick={handleStart} disabled={acting}
                className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-base hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-60 shadow-lg flex items-center justify-center gap-2">
                {acting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (
                  <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Start Ride</>
                )}
              </button>
            )}
            {isInProgress && (
              <button onClick={handleComplete} disabled={acting}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-base hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-60 shadow-lg flex items-center justify-center gap-2">
                {acting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (
                  <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Complete Ride</>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Help */}
      {settings.company_phone && (
        <p className="text-center text-xs text-slate-400 mt-4">
          Need help? Call <a href={`tel:${settings.company_phone}`} className="text-blue-600 font-medium">{settings.company_phone}</a>
        </p>
      )}
    </div>
  )
}

function PrePickupNotifications({ ride, onUpdated }) {
  const [busy, setBusy] = useState(null)  // 'on-way' | 'arrived' | null

  // Compute pickup datetime to gate visibility (within 1 hour before pickup,
  // or any time after — driver might be late and still want to notify client).
  // pickup_time is stored as a tz-naive value the user entered as their local
  // time, so parse without the Z suffix to interpret in the browser's local tz.
  const pickupDt = (() => {
    if (!ride.pickup_date || !ride.pickup_time) return null
    const t = ride.pickup_time.length === 5 ? ride.pickup_time + ':00' : ride.pickup_time
    return new Date(`${ride.pickup_date}T${t}`)
  })()
  const minutesUntilPickup = pickupDt ? (pickupDt.getTime() - Date.now()) / 60000 : null
  // Show within 1 hour BEFORE pickup; also keep showing after pickup time
  // (driver running late may still want to ping the client).
  const withinWindow = minutesUntilPickup !== null && minutesUntilPickup <= 60

  // Don't show on completed/cancelled or while ride is in progress
  if (ride.status !== 'assigned' && ride.status !== 'paid') return null
  if (!withinWindow) return null

  const onWaySent = !!ride.driver_on_way_at
  const arrivedSent = !!ride.driver_arrived_at

  const fmtTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const handleOnWay = async () => {
    if (onWaySent || busy) return
    setBusy('on-way')
    try {
      const res = await api.driverOnWay(ride.id)
      onUpdated({ ...ride, driver_on_way_at: res.sent_at || new Date().toISOString() })
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(null)
    }
  }

  const handleArrived = async () => {
    if (arrivedSent || busy) return
    setBusy('arrived')
    try {
      const res = await api.driverArrived(ride.id)
      onUpdated({ ...ride, driver_arrived_at: res.sent_at || new Date().toISOString() })
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4 space-y-2">
      <p className="text-xs text-slate-500 font-medium px-1">Notify the client</p>
      <button
        onClick={handleOnWay}
        disabled={onWaySent || !!busy}
        className={`w-full py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
          onWaySent
            ? 'bg-slate-100 text-slate-500 cursor-default'
            : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60'
        }`}
      >
        {busy === 'on-way' ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        ) : onWaySent ? (
          <>✓ On the way notification sent at {fmtTime(ride.driver_on_way_at)}</>
        ) : (
          <>🚗 On my way</>
        )}
      </button>
      <button
        onClick={handleArrived}
        disabled={arrivedSent || !!busy}
        className={`w-full py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
          arrivedSent
            ? 'bg-slate-100 text-slate-500 cursor-default'
            : 'bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98] disabled:opacity-60'
        }`}
      >
        {busy === 'arrived' ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        ) : arrivedSent ? (
          <>✓ Arrived notification sent at {fmtTime(ride.driver_arrived_at)}</>
        ) : (
          <>📍 I've arrived</>
        )}
      </button>
    </div>
  )
}
