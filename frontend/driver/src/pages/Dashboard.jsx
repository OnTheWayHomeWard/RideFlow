import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'

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
        <Link key={r.id} to={`/ride/${r.id}`} className="block bg-blue-600 text-white rounded-xl p-4 mb-4 hover:bg-blue-700 transition-all">
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
            {runs.map(r => {
              const hasExtras = r.extras_chosen && r.extras_chosen.length > 0
              return (
                <Link key={r.id} to={`/run-detail/${r.id}`} state={r}
                  className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm active:scale-[0.99] transition-all">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{r.pickup_name} → {r.dropoff_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{fmtDate(r.pickup_date)} at {r.pickup_time?.slice(0, 5)}</p>
                    </div>
                    <p className="text-lg font-bold text-green-700">${r.driver_earnings.toFixed(0)}</p>
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
            })}
          </div>
        )}
      </div>

      {/* My schedule preview */}
      {schedule.filter(s => s.status === 'assigned').length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-900">My Upcoming</h2>
            <Link to="/schedule" className="text-xs text-blue-600 font-medium">View all</Link>
          </div>
          <div className="space-y-2">
            {schedule.filter(s => s.status === 'assigned').slice(0, 3).map(r => (
              <Link key={r.id} to={`/ride/${r.id}`} className="block bg-white border border-slate-200 rounded-xl p-3 hover:border-blue-300 transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{r.pickup_name} → {r.dropoff_name}</p>
                    <p className="text-xs text-slate-500">{fmtDate(r.pickup_date)} at {r.pickup_time?.slice(0, 5)}</p>
                  </div>
                  <p className="text-sm font-bold text-green-700">${r.driver_earnings.toFixed(0)}</p>
                </div>
              </Link>
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
