import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/driverClient'

export default function Dashboard() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [runs, setRuns] = useState([])
  const [schedule, setSchedule] = useState([])
  const [earnings, setEarnings] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    Promise.all([api.getMe(), api.getAvailableRuns(), api.getSchedule(), api.getEarnings()])
      .then(([p, r, s, e]) => { setProfile(p); setRuns(r); setSchedule(s); setEarnings(e) })
      .catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i) }, [])

  const handleAccept = async (id) => {
    try { await api.acceptRun(id); load() } catch (e) { alert(e.message) }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>

  return (
    <div className="p-4 pb-20">
      {/* Welcome */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Hi, {profile?.name?.split(' ')[0]}</h1>
          <p className="text-xs text-slate-500">{profile?.vehicle_type?.toUpperCase()} • {profile?.vehicle_plate || 'No plate'}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-green-700">${earnings?.today?.toFixed(0) || 0}</p>
          <p className="text-xs text-slate-400">today</p>
        </div>
      </div>

      {/* Active ride banner */}
      {schedule.filter(s => s.status === 'in_progress').map(r => (
        <Link key={r.id} to={`/driver/ride/${r.id}`} className="block bg-blue-600 text-white rounded-xl p-4 mb-4 hover:bg-blue-700 transition-all">
          <p className="text-xs text-blue-200 uppercase tracking-wide font-medium">Ride in Progress</p>
          <p className="font-semibold mt-1">{r.pickup_name} → {r.dropoff_name}</p>
          <p className="text-sm text-blue-200 mt-0.5">{r.client_name} • Tap to view</p>
        </Link>
      ))}

      {/* Available runs */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-900">Available Runs</h2>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            Live
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
            <p className="text-slate-400 text-sm">No available runs right now</p>
            <p className="text-xs text-slate-300 mt-1">New rides will appear here automatically</p>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map(r => <RunCard key={r.id} r={r} />)}
          </div>
        )}
      </div>

      {/* My schedule preview — includes recent cancellations too so the driver
          sees a ride was pulled from under them without having to dig into
          Schedule. Cancelled rows are visually flagged inside the card. */}
      {schedule.filter(s => s.status !== 'in_progress').length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-900">My Upcoming</h2>
            <Link to="/driver/schedule" className="text-xs text-blue-600 font-medium">View all</Link>
          </div>
          <div className="space-y-2">
            {schedule.filter(s => s.status !== 'in_progress').slice(0, 3).map(r => (
              <RunCard key={r.id} r={r} linkTo={`/driver/ride/${r.id}`} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function fmtDate(d) {
  const today = new Date().toISOString().split('T')[0]
  const tmrw = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  if (d === today) return 'Today'
  if (d === tmrw) return 'Tomorrow'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Two-row itinerary card, matches the client confirm summary + admin trip
// visual. Earnings sit under the date on their own line so they don't collide
// with long place names on narrow screens; the amount stays visually
// prominent thanks to the green colour + bold weight. Cancelled/refunded rides
// flip the whole card to red and strike through the earnings so a driver can
// scan the list and instantly see which rides are voided.
function RunCard({ r, linkTo, compact }) {
  const isCancelled = r.status === 'cancelled' || r.status === 'refunded'
  const to = linkTo || (isCancelled ? `/driver/ride/${r.id}` : `/driver/run-detail/${r.id}`)
  const hasExtras = !compact && r.extras_chosen && r.extras_chosen.length > 0
  const frame = isCancelled
    ? 'bg-red-50 border-red-200 hover:border-red-300'
    : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
  return (
    <Link
      to={to}
      state={r}
      className={`block border rounded-xl ${compact ? 'p-3' : 'p-4'} active:scale-[0.99] transition-all ${frame}`}
    >
      {isCancelled && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wide bg-red-600 text-white px-1.5 py-0.5 rounded">Cancelled</span>
          <span className="text-[10px] text-red-700">Rider cancelled — no earnings</span>
        </div>
      )}
      <div className="flex items-start gap-3">
        {/* Track: blue dot → dotted line → green dot */}
        <div className="flex flex-col items-center pt-[5px] shrink-0">
          <span className="w-2 h-2 rounded-full bg-blue-500 ring-2 ring-blue-100" />
          <span className="flex-1 my-1 border-l-2 border-dotted border-slate-300 min-h-[16px]" />
          <span className="w-2 h-2 rounded-full bg-green-500 ring-2 ring-green-100" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="truncate">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1">From</span>
            <span className="text-sm font-medium text-slate-900">{r.pickup_name}</span>
          </div>
          <div className="truncate">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1">To</span>
            <span className="text-sm font-medium text-slate-900">{r.dropoff_name}</span>
          </div>
        </div>
      </div>

      {/* Time + earnings row — separates the "when" and "how much" from the
          route so long place names don't squeeze the price into the corner. */}
      <div className={`${compact ? 'mt-2' : 'mt-3'} pt-2 border-t border-slate-100 flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
          <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="truncate">{fmtDate(r.pickup_date)} · {r.pickup_time?.slice(0, 5)}</span>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-[10px] font-semibold uppercase tracking-wide leading-none ${isCancelled ? 'text-red-500' : 'text-slate-400'}`}>Earn</p>
          {isCancelled ? (
            <p className={`${compact ? 'text-base' : 'text-lg'} font-bold text-red-500 leading-tight line-through decoration-2`}>${r.driver_earnings?.toFixed(2)}</p>
          ) : (
            <p className={`${compact ? 'text-base' : 'text-lg'} font-bold text-green-700 leading-tight`}>${r.driver_earnings?.toFixed(2)}</p>
          )}
        </div>
      </div>

      {hasExtras && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {r.extras_chosen.map(e => (
            <span key={e} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium capitalize">{e.replace('_', ' ')}</span>
          ))}
        </div>
      )}
    </Link>
  )
}
