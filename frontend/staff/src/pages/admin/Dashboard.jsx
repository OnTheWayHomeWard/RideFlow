import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts'
import { api } from '../../api/adminClient'
import StatusBadge from '../../components/admin/StatusBadge'

const REFRESH_INTERVAL = 30000

const TYPE_COLORS = {
  payout_request: 'bg-amber-100 text-amber-700',
  new_booking: 'bg-blue-100 text-blue-700',
  driver_accepted: 'bg-green-100 text-green-700',
  driver_registration: 'bg-purple-100 text-purple-700',
  cashier_registration: 'bg-indigo-100 text-indigo-700',
}
const TYPE_LABELS = {
  payout_request: 'Payout', new_booking: 'Booking', driver_accepted: 'Accepted',
  driver_registration: 'Driver', cashier_registration: 'Cashier',
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [notifs, setNotifs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    Promise.all([api.getStats(), api.getNotifications(1, 10)])
      .then(([s, n]) => { setStats(s); setNotifs(n.notifications || []) })
      .catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load(); const i = setInterval(load, REFRESH_INTERVAL); return () => clearInterval(i) }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
  if (!stats) return <div className="p-6 text-center text-slate-400">Failed to load dashboard</div>

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-xs text-slate-500">Real-time overview</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="hidden sm:inline">Refreshes every 30s</span>
          <span className="sm:hidden">Live</span>
        </div>
      </div>

      {/* ═══ DAILY REPORT — shown first, most important ═══ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 lg:p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📊</span>
          <h2 className="text-base lg:text-lg font-bold text-slate-900">Today's Report</h2>
        </div>

        {/* Big numbers — 2x2 on mobile, 4 cols on desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <DailyCard label="Rides" value={stats.today.rides} icon="🚐" />
          <DailyCard label="Collected" value={`$${stats.today.total_revenue.toFixed(0)}`} icon="💰" />
          <DailyCard label="Company Profit" value={`$${stats.today.company_revenue.toFixed(0)}`} icon="🏢" accent />
          <DailyCard label="Driver Payouts" value={`$${stats.today.driver_payouts.toFixed(0)}`} icon="🚗" />
          <DailyCard label="Cashier Payouts" value={`$${stats.today.cashier_payouts.toFixed(0)}`} icon="🏨" />
        </div>

        {/* Quick split bar */}
        {stats.today.total_revenue > 0 && (
          <div className="mb-3">
            <div className="flex h-3 rounded-full overflow-hidden">
              <div className="bg-green-500" style={{ width: `${(stats.today.company_revenue / stats.today.total_revenue) * 100}%` }} title="Company" />
              <div className="bg-blue-400" style={{ width: `${(stats.today.driver_payouts / stats.today.total_revenue) * 100}%` }} title="Drivers" />
              {stats.today.cashier_payouts > 0 && (
                <div className="bg-purple-400" style={{ width: `${(stats.today.cashier_payouts / stats.today.total_revenue) * 100}%` }} title="Cashiers" />
              )}
            </div>
            <div className="flex justify-between mt-1 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full"></span>Company</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-full"></span>Drivers</span>
              {stats.today.cashier_payouts > 0 && (
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-purple-400 rounded-full"></span>Cashiers</span>
              )}
            </div>
          </div>
        )}

        {/* Needs attention — inline */}
        {(stats.pending_payouts > 0 || stats.pending_driver_approvals > 0 || stats.paid_bookings > 0 || stats.failed_transfers > 0) && (
          <div className="flex gap-2 flex-wrap">
            {stats.pending_payouts > 0 && <AlertChip to="/admin/payouts" label={`${stats.pending_payouts} payouts pending`} color="amber" />}
            {stats.pending_driver_approvals > 0 && <AlertChip to="/admin/drivers" label={`${stats.pending_driver_approvals} driver approvals`} color="purple" />}
            {stats.failed_transfers > 0 && <AlertChip to="/admin/payouts" label={`${stats.failed_transfers} failed transfers`} color="red" />}
            {stats.paid_bookings > 0 && <AlertChip to="/admin/runs" label={`${stats.paid_bookings} unassigned rides`} color="orange" />}
          </div>
        )}
      </div>

      {/* ═══ PERIOD COMPARISON — week & month side by side ═══ */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <PeriodCard label="This Week" data={stats.this_week} />
        <PeriodCard label="This Month" data={stats.this_month} />
      </div>

      {/* ═══ FLEET + PIPELINE — side by side ═══ */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white border border-slate-200 rounded-xl p-3 lg:p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Fleet</p>
          <div className="space-y-1.5 text-sm">
            <Row label="Drivers" value={stats.active_drivers} total={stats.total_drivers} />
            <Row label="Cashiers" value={stats.total_cashiers} />
            <Row label="Hotels" value={stats.total_hotels} />
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 lg:p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Pipeline</p>
          <div className="space-y-1 text-xs">
            <PipeRow label="Awaiting Payment" count={stats.pending_bookings} color="bg-slate-300" />
            <PipeRow label="Unassigned" count={stats.paid_bookings} color="bg-orange-400" />
            <PipeRow label="Assigned" count={stats.assigned_bookings} color="bg-blue-400" />
            <PipeRow label="In Progress" count={stats.in_progress_bookings} color="bg-amber-400" />
            <PipeRow label="Completed" count={stats.completed_bookings} color="bg-green-400" />
          </div>
        </div>
      </div>

      {/* ═══ CHARTS ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Rides — Last 14 Days</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats.rides_per_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="rides" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Company Revenue — Last 14 Days</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={stats.revenue_per_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={v => `$${Number(v).toFixed(2)}`} />
              <Area type="monotone" dataKey="company" stroke="#16a34a" fill="#dcfce7" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ═══ TOP PERFORMERS + ACTIVITY ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        {/* Top drivers */}
        <SmallList title="Top Drivers" emptyText="No completed rides yet"
          items={stats.top_drivers.map((d, i) => ({
            rank: i + 1, label: d.name, sub: `${d.rides} rides`, value: `$${d.earnings.toFixed(0)}`,
          }))} />

        {/* Top hotels */}
        <SmallList title="Top Hotels" emptyText="No referrals yet"
          items={stats.top_hotels.map((h, i) => ({
            rank: i + 1, label: h.name, sub: `${h.rides} referrals`, value: `$${h.revenue.toFixed(0)}`,
          }))} />

        {/* Activity */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Activity</h3>
            <Link to="/admin/notifications" className="text-xs text-blue-600 font-medium">View all</Link>
          </div>
          {notifs.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No activity</p>
          ) : (
            <div className="space-y-2">
              {notifs.slice(0, 5).map(n => (
                <Link key={n.id} to={n.link} className="flex items-center gap-2 text-xs hover:bg-slate-50 rounded-lg p-1 -mx-1 transition-colors">
                  <span className={`px-1.5 py-0.5 rounded-full font-medium shrink-0 ${TYPE_COLORS[n.type] || 'bg-slate-100'}`}>
                    {TYPE_LABELS[n.type] || '•'}
                  </span>
                  <span className="text-slate-600 truncate flex-1">{n.title}</span>
                  <span className="text-slate-400 shrink-0">{timeAgo(n.time)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ RECENT BOOKINGS ═══ */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Recent Bookings</h3>
          <Link to="/admin/runs" className="text-xs text-blue-600 font-medium">View all</Link>
        </div>

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Booking</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Client</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Route</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Amount</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stats.recent_bookings.map(b => (
                <tr key={b.booking_number} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs">{b.booking_number}</td>
                  <td className="px-4 py-2.5 text-xs">{b.client_name}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{b.route}</td>
                  <td className="px-4 py-2.5 font-semibold">${b.amount}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-slate-100">
          {stats.recent_bookings.map(b => (
            <div key={b.booking_number} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs text-slate-500">{b.booking_number}</span>
                <StatusBadge status={b.status} />
              </div>
              <p className="text-sm font-medium">{b.client_name}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-slate-500 truncate">{b.route}</span>
                <span className="font-bold text-sm shrink-0 ml-2">${b.amount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Small components ──

function DailyCard({ label, value, icon, accent }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? 'bg-green-50 border border-green-200' : 'bg-slate-50'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className={`text-xl lg:text-2xl font-bold ${accent ? 'text-green-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function PeriodCard({ label, data }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 lg:p-4">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-lg lg:text-xl font-bold text-slate-900">{data.rides} <span className="text-sm font-normal text-slate-400">rides</span></p>
      <div className="mt-1.5 space-y-0.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Collected</span>
          <span className="font-medium">${data.total_revenue.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-green-600 font-medium">Profit</span>
          <span className="font-bold text-green-700">${data.company_revenue.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Drivers</span>
          <span className="font-medium">${data.driver_payouts.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Cashiers</span>
          <span className="font-medium">${data.cashier_payouts.toFixed(0)}</span>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, total }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-bold">{value}{total !== undefined && <span className="font-normal text-slate-400"> / {total}</span>}</span>
    </div>
  )
}

function PipeRow({ label, count, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${color}`}></span>
        <span className="text-slate-600">{label}</span>
      </span>
      <span className="font-bold">{count}</span>
    </div>
  )
}

function AlertChip({ to, label, color }) {
  const colors = { amber: 'bg-amber-100 text-amber-800 border-amber-200', purple: 'bg-purple-100 text-purple-800 border-purple-200', orange: 'bg-orange-100 text-orange-800 border-orange-200' }
  return (
    <Link to={to} className={`text-xs font-medium px-2.5 py-1 rounded-full border ${colors[color]} hover:shadow-sm transition-all`}>
      {label}
    </Link>
  )
}

function SmallList({ title, emptyText, items }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">{emptyText}</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{item.rank}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{item.label}</p>
                <p className="text-xs text-slate-400">{item.sub}</p>
              </div>
              <p className="text-sm font-bold text-green-700 shrink-0">{item.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function timeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
