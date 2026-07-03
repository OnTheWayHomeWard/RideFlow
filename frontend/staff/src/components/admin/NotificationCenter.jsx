import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { api } from '../../api/adminClient'

// The admin bell is a simple link into the Notifications page — no dropdown.
// The page (/admin/notifications) is the source of truth for the inbox; the
// bell just surfaces an unread badge and takes you there. We poll every 15s
// so the badge stays fresh without needing WebSocket plumbing.
export default function NotificationCenter() {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let cancelled = false
    const tick = () => {
      api.getUnreadCount?.()
        .then(r => { if (!cancelled) setUnread(r?.count || 0) })
        .catch(() => {})
    }
    tick()
    const id = setInterval(tick, 15000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return (
    <NavLink
      to="/admin/notifications"
      className={({ isActive }) =>
        `relative p-2 rounded-lg transition-colors ${
          isActive ? 'text-blue-600 bg-blue-50' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
        }`
      }
      title="Notifications"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </NavLink>
  )
}
