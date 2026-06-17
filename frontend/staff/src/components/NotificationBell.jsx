// Shared bell icon with an unread-count badge. Polls the role's
// notifications/unread-count endpoint every 30s.
//
// Props:
//   api      role-specific api client object exposing getUnreadCount()
//   to       route path the bell should link to (e.g. "/admin/notifications")
//   variant  "sidebar" | "header" — tweaks layout, defaults to "header"
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function NotificationBell({ api, to, variant = 'header' }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const tick = () => {
      api.getUnreadCount()
        .then(r => { if (!cancelled) setCount(r?.count || 0) })
        .catch(() => {})
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [api])

  // Refetch when the page is shown again after a tab/visibility change
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        api.getUnreadCount().then(r => setCount(r?.count || 0)).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [api])

  const displayCount = count > 99 ? '99+' : String(count)

  return (
    <Link to={to}
      title={count ? `${count} unread notification${count === 1 ? '' : 's'}` : 'Notifications'}
      className={`relative inline-flex items-center justify-center rounded-lg transition-colors ${
        variant === 'sidebar'
          ? 'w-10 h-10 text-slate-300 hover:text-white hover:bg-white/10'
          : 'w-10 h-10 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
      }`}>
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
          {displayCount}
        </span>
      )}
    </Link>
  )
}
