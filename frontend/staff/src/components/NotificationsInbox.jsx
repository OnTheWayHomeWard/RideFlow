// Shared inbox component used by the admin / driver / cashier Notifications
// pages. Each role passes its own api client + a function that turns the
// stored link into a route inside that portal.
//
// Props:
//   api       role-specific api client exposing getInbox/markRead/markAllRead
//   resolveLink(notification) -> string  return the in-portal route to navigate
//                                        to when the card is tapped (or null
//                                        to disable navigation for this kind)
//   emptyHint string shown when the inbox is empty
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const KIND_ICONS = {
  new_booking:     { icon: '📅', color: 'bg-emerald-100 text-emerald-700' },
  driver_assigned: { icon: '🚐', color: 'bg-blue-100 text-blue-700' },
  driver_accepted: { icon: '✅', color: 'bg-blue-100 text-blue-700' },
  ride_started:    { icon: '🟢', color: 'bg-amber-100 text-amber-700' },
  ride_completed:  { icon: '🏁', color: 'bg-green-100 text-green-700' },
  contact_form:    { icon: '📨', color: 'bg-purple-100 text-purple-700' },
  payout_processed:{ icon: '💵', color: 'bg-emerald-100 text-emerald-700' },
  test:            { icon: '🔔', color: 'bg-slate-100 text-slate-700' },
}

function kindStyle(kind) {
  return KIND_ICONS[kind] || { icon: '🔔', color: 'bg-slate-100 text-slate-700' }
}

function timeAgo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Math.max(0, (Date.now() - d.getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function NotificationsInbox({ api, resolveLink, emptyHint }) {
  const navigate = useNavigate()
  const [data, setData] = useState({ notifications: [], total: 0, page: 1, total_pages: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('all') // 'all' | 'unread'
  const [marking, setMarking] = useState(false)

  const load = useCallback((p = page, f = filter) => {
    setLoading(true)
    api.getInbox(p, 20, f === 'unread')
      .then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [api, page, filter])

  useEffect(() => { load(1, filter); setPage(1) }, [filter])
  useEffect(() => { load(page, filter) }, [page])
  // Auto-refresh every 30s so new pushes show up without manual refresh
  useEffect(() => {
    const id = setInterval(() => load(page, filter), 30_000)
    return () => clearInterval(id)
  }, [load, page, filter])

  const handleClick = async (n) => {
    if (!n.is_read) {
      try { await api.markRead(n.id) } catch {}
      setData(prev => ({
        ...prev,
        notifications: prev.notifications.map(x => x.id === n.id ? { ...x, is_read: true } : x),
      }))
    }
    const route = resolveLink ? resolveLink(n) : n.link
    if (route) navigate(route)
  }

  const handleMarkAll = async () => {
    if (marking) return
    setMarking(true)
    try {
      await api.markAllRead()
      setData(prev => ({
        ...prev,
        notifications: prev.notifications.map(x => ({ ...x, is_read: true })),
      }))
    } catch (e) { alert(e.message) }
    finally { setMarking(false) }
  }

  const items = data.notifications || []
  const unreadCount = items.filter(n => !n.is_read).length

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 lg:mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {data.total} total{unreadCount > 0 && ` · ${unreadCount} unread on this page`}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden">
            {['all', 'unread'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  filter === f ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}>
                {f}
              </button>
            ))}
          </div>
          <button onClick={handleMarkAll} disabled={marking}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium disabled:opacity-60">
            Mark all read
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <div className="text-3xl mb-2">🔔</div>
          <p className="text-slate-500">{filter === 'unread' ? 'No unread notifications.' : (emptyHint || 'No notifications yet.')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(n => {
            const s = kindStyle(n.kind)
            return (
              <button key={n.id} onClick={() => handleClick(n)}
                className={`w-full text-left bg-white border rounded-xl p-3 lg:p-4 flex items-start gap-3 hover:border-blue-300 hover:shadow-sm active:scale-[0.997] transition-all ${
                  n.is_read ? 'border-slate-200' : 'border-blue-200 bg-blue-50/30'
                }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${s.color}`}>
                  {s.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm truncate ${n.is_read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>
                      {n.title}
                    </p>
                    {!n.is_read && <span className="w-2 h-2 bg-blue-600 rounded-full shrink-0" title="Unread"></span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {data.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            Previous
          </button>
          <span className="text-xs text-slate-500">Page {page} of {data.total_pages}</span>
          <button onClick={() => setPage(p => Math.min(data.total_pages, p + 1))} disabled={page >= data.total_pages}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  )
}
