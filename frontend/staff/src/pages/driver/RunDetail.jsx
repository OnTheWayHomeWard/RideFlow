import { useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../../api/driverClient'

const EXTRA_LABELS = {
  room_pickup: 'Room Pickup',
  extra_luggage: 'Extra Luggage (3+)',
  child_seat: 'Child Seat',
}

export default function RunDetail() {
  const { state: run } = useLocation()
  const navigate = useNavigate()
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')

  if (!run) return <div className="p-4 text-center text-slate-400 py-16">Run not found. Go back and try again.</div>

  const hasExtras = run.extras_chosen && run.extras_chosen.length > 0

  const handleAccept = async () => {
    setAccepting(true)
    try { await api.acceptRun(run.id); navigate('/driver') }
    catch (e) { setError(e.message) }
    finally { setAccepting(false) }
  }

  return (
    <div className="p-4 pb-28">
      <button onClick={() => navigate('/driver')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back
      </button>

      <h1 className="text-xl font-bold text-slate-900 mb-4">Run Details</h1>

      {/* Route */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1 mt-1">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <div className="w-px h-8 bg-slate-300"></div>
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          </div>
          <div>
            <div className="mb-3">
              <p className="text-xs text-slate-400">Pickup</p>
              <p className="font-semibold text-sm">{run.pickup_name}</p>
              <p className="text-xs text-slate-500">{run.pickup_address}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Destination</p>
              <p className="font-semibold text-sm">{run.dropoff_name}</p>
              <p className="text-xs text-slate-500">{run.dropoff_address}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <InfoCard label="Date" value={fmtDate(run.pickup_date)} />
        <InfoCard label="Time" value={run.pickup_time?.slice(0, 5)} />
        <InfoCard label="Vehicle" value={run.vehicle_type?.toUpperCase()} />
      </div>

      {/* Client info */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
        <h3 className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-2">Client</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">{run.client_name}</p>
            {run.client_room && <p className="text-xs text-slate-500">Room {run.client_room}</p>}
          </div>
          {run.client_phone && (
            <a href={`tel:${run.client_phone}`} className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Add-ons */}
      {hasExtras && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
          <h3 className="text-xs text-amber-700 uppercase tracking-wide font-medium mb-2">Add-ons / Special Requests</h3>
          <div className="space-y-1.5">
            {run.extras_chosen.map(e => (
              <div key={e} className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-amber-900 font-medium">{EXTRA_LABELS[e] || e.replace('_', ' ')}</p>
              </div>
            ))}
          </div>
          {run.extras_chosen.includes('room_pickup') && run.client_room && (
            <p className="text-xs text-amber-700 mt-2">Pick up client from Room {run.client_room}</p>
          )}
        </div>
      )}

      {/* Earnings */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
        <p className="text-xs text-green-600">You earn</p>
        <p className="text-2xl font-bold text-green-700">${run.driver_earnings.toFixed(2)}</p>
      </div>

      {/* Accept button — fixed */}
      <div className="fixed bottom-14 left-0 right-0 z-10">
        <div className="max-w-lg mx-auto px-4">
          {error && (
            <div className="mb-2 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          <button onClick={handleAccept} disabled={accepting}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-base hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-60 shadow-lg">
            {accepting ? 'Accepting...' : 'Accept This Run'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoCard({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-900">{value}</p>
    </div>
  )
}

function fmtDate(d) {
  const today = new Date().toISOString().split('T')[0]
  const tmrw = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  if (d === today) return 'Today'
  if (d === tmrw) return 'Tomorrow'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
