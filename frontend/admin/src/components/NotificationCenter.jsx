import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

const ICONS = {
  dollar: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  booking: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  user: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
}

const COLORS = {
  amber: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  blue: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  green: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
}

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('notif_seen') || '[]') } catch { return [] }
  })
  const ref = useRef(null)
  const navigate = useNavigate()

  const load = () => {
    api.getNotifications(1, 10).then(data => setNotifications(data.notifications || [])).catch(() => {})
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 15000) // refresh every 15s
    return () => clearInterval(interval)
  }, [])

  // Close on click outside
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unseenCount = notifications.filter(n => !seen.includes(n.id)).length

  const markAllSeen = () => {
    const ids = notifications.map(n => n.id)
    setSeen(ids)
    localStorage.setItem('notif_seen', JSON.stringify(ids))
  }

  const handleClick = (notif) => {
    // Mark as seen
    if (!seen.includes(notif.id)) {
      const newSeen = [...seen, notif.id]
      setSeen(newSeen)
      localStorage.setItem('notif_seen', JSON.stringify(newSeen))
    }
    setOpen(false)
    navigate(notif.link)
  }

  const timeAgo = (isoStr) => {
    const diff = Date.now() - new Date(isoStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => { setOpen(!open); if (!open) markAllSeen() }}
        className="relative p-2 text-slate-500 hover:text-slate-900 transition-colors rounded-lg hover:bg-slate-100"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unseenCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
            {unseenCount > 9 ? '9+' : unseenCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">Notifications</h3>
            {notifications.length > 0 && (
              <button onClick={markAllSeen} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-slate-400">No notifications</p>
              </div>
            ) : (
              notifications.map(n => {
                const color = COLORS[n.color] || COLORS.blue
                const isUnseen = !seen.includes(n.id)
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 ${isUnseen ? 'bg-blue-50/30' : ''}`}
                  >
                    <div className={`w-8 h-8 ${color.bg} rounded-full flex items-center justify-center shrink-0 mt-0.5 ${color.text}`}>
                      {ICONS[n.icon] || ICONS.booking}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">{n.title}</p>
                        {isUnseen && <div className={`w-2 h-2 ${color.dot} rounded-full shrink-0`}></div>}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{n.message}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{timeAgo(n.time)}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
