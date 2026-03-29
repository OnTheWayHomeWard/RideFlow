import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

const ICONS = {
  dollar: { path: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  booking: { path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  check: { path: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  user: { path: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
}

const COLORS = {
  amber: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', light: 'bg-amber-50' },
  blue: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', light: 'bg-blue-50' },
  green: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', light: 'bg-green-50' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', light: 'bg-purple-50' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200', light: 'bg-indigo-50' },
}

const TYPE_LABELS = {
  payout_request: 'Payout Request',
  new_booking: 'New Booking',
  driver_accepted: 'Driver Accepted',
  driver_registration: 'Driver Registration',
  cashier_registration: 'Cashier Registration',
}

export default function Notifications() {
  const [data, setData] = useState({ notifications: [], total: 0, page: 1, total_pages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = (p) => {
    setLoading(true)
    api.getNotifications(p, 10)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(page) }, [page])

  // Auto-refresh current page every 30s
  useEffect(() => {
    const interval = setInterval(() => load(page), 30000)
    return () => clearInterval(interval)
  }, [page])

  const timeAgo = (isoStr) => {
    const diff = Date.now() - new Date(isoStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const formatTime = (isoStr) => {
    return new Date(isoStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500">{data.total} total events</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          Live — refreshes every 30s
        </div>
      </div>

      {loading && data.notifications.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : data.notifications.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <p className="text-slate-500 font-medium">No notifications yet</p>
          <p className="text-sm text-slate-400 mt-1">Events will appear here as they happen</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {data.notifications.map(n => {
              const color = COLORS[n.color] || COLORS.blue
              const icon = ICONS[n.icon] || ICONS.booking
              return (
                <button
                  key={n.id}
                  onClick={() => navigate(n.link)}
                  className={`w-full bg-white border ${color.border} rounded-xl p-4 flex items-start gap-4 hover:shadow-md transition-all text-left`}
                >
                  {/* Icon */}
                  <div className={`w-10 h-10 ${color.bg} rounded-full flex items-center justify-center shrink-0 ${color.text}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon.path} />
                    </svg>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color.bg} ${color.text}`}>
                        {TYPE_LABELS[n.type] || n.type}
                      </span>
                      <span className="text-xs text-slate-400">{timeAgo(n.time)}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{n.message}</p>
                    <p className="text-xs text-slate-400 mt-1">{formatTime(n.time)}</p>
                  </div>

                  {/* Arrow */}
                  <svg className="w-5 h-5 text-slate-300 shrink-0 mt-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )
            })}
          </div>

          {/* Spacer for fixed pagination */}
          <div className="h-20"></div>

          {/* Pagination — always fixed at bottom */}
          {data.total > 0 && (
            <div className="fixed bottom-0 left-0 lg:left-56 right-0 bg-white border-t border-slate-200 px-4 lg:px-6 py-3 flex items-center justify-between z-20">
              <p className="text-sm text-slate-500">
                Page {data.page} of {data.total_pages} ({data.total} events)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {/* Page numbers */}
                {Array.from({ length: Math.min(data.total_pages, 5) }, (_, i) => {
                  let p
                  if (data.total_pages <= 5) {
                    p = i + 1
                  } else if (page <= 3) {
                    p = i + 1
                  } else if (page >= data.total_pages - 2) {
                    p = data.total_pages - 4 + i
                  } else {
                    p = page - 2 + i
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 text-sm font-medium rounded-lg ${
                        page === p ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage(p => Math.min(data.total_pages, p + 1))}
                  disabled={page >= data.total_pages}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
