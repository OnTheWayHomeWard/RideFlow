import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import StatusBadge, { STATUS_LABELS } from '../components/StatusBadge'
import Pagination from '../components/Pagination'

const STATUSES = ['', 'pending', 'paid', 'assigned', 'in_progress', 'completed', 'cancelled']

function Stars({ rating }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1,2,3,4,5].map(s => (
        <svg key={s} className={`w-3 h-3 ${s <= rating ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  )
}

export default function Runs() {
  const [data, setData] = useState({ bookings: [], total: 0, page: 1, total_pages: 0 })
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = (p, s) => {
    setLoading(true)
    api.getBookings(p, 10, s)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { setPage(1); load(1, status) }, [status])
  useEffect(() => { load(page, status) }, [page])

  const bookings = data.bookings || []

  return (
    <div className="p-4 lg:p-6 pb-24">
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900">All Runs</h1>
        <span className="text-xs text-slate-400">{data.total} total</span>
      </div>

      {/* Filters — single scrollable row */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium whitespace-nowrap shrink-0 transition-all ${
              status === s ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Booking</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Client</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Route</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Vehicle</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Amount</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Driver</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Rating</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.map(b => (
                    <tr key={b.id} onClick={() => window.location.href = `/runs/${b.id}`} className={`hover:bg-slate-50 cursor-pointer ${b.client_rating && b.client_rating <= 2 ? 'bg-red-50/50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs">{b.booking_number}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{b.client_name}</p>
                        <p className="text-xs text-slate-400">{b.client_phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">{b.pickup_name} → {b.dropoff_name}</td>
                      <td className="px-4 py-3 text-xs">{b.pickup_date}<br/>{b.pickup_time}</td>
                      <td className="px-4 py-3 uppercase text-xs font-medium">{b.vehicle_type}</td>
                      <td className="px-4 py-3 font-semibold">${b.total_amount}</td>
                      <td className="px-4 py-3 text-xs">{b.driver_name || '—'}</td>
                      <td className="px-4 py-3">
                        {b.client_rating ? (
                          <div>
                            <Stars rating={b.client_rating} />
                            {b.client_comment && (
                              <p className="text-xs text-slate-500 mt-0.5 max-w-[150px] truncate" title={b.client_comment}>"{b.client_comment}"</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bookings.length === 0 && (
              <p className="text-center text-slate-400 py-8">No bookings found</p>
            )}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {bookings.map(b => (
              <Link key={b.id} to={`/runs/${b.id}`} className={`block bg-white border rounded-xl overflow-hidden hover:shadow-sm transition-all ${b.client_rating && b.client_rating <= 2 ? 'border-red-200' : 'border-slate-200'}`}>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-slate-500">{b.booking_number}</span>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="font-semibold text-sm text-slate-900">{b.client_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{b.pickup_name} → {b.dropoff_name}</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{b.pickup_date}</span>
                      <span className="uppercase font-medium">{b.vehicle_type}</span>
                    </div>
                    <span className="font-bold text-sm">${b.total_amount}</span>
                  </div>
                  {b.driver_name && (
                    <p className="text-xs text-blue-600 mt-1.5">Driver: {b.driver_name}</p>
                  )}
                </div>

                {/* Rating/feedback section */}
                {(b.client_rating || b.client_comment) && (
                  <div className={`px-4 py-2.5 border-t ${b.client_rating <= 2 ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                    <div className="flex items-center gap-2">
                      {b.client_rating && <Stars rating={b.client_rating} />}
                      {b.client_rating && <span className="text-xs text-slate-500">{b.client_rating}/5</span>}
                      {b.client_rating && b.client_rating <= 2 && (
                        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">Low</span>
                      )}
                    </div>
                    {b.client_comment && (
                      <p className="text-xs text-slate-600 mt-1 italic">"{b.client_comment}"</p>
                    )}
                  </div>
                )}
              </Link>
            ))}
            {bookings.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                <p className="text-slate-400">No bookings found</p>
              </div>
            )}
          </div>
        </>
      )}

      <div className="h-16"></div>
      <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPageChange={setPage} />
    </div>
  )
}
