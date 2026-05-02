import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/adminClient'
import Pagination from '../../components/admin/Pagination'

export default function Reviews() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, total_pages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getReviews(page, 10).then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [page])

  return (
    <div className="p-4 lg:p-6 pb-24">
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Reviews & Ratings</h1>
        <span className="text-xs text-slate-400">{data.total} reviews</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : data.items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-slate-400">No reviews with comments yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map(r => (
            <Link key={r.id} to={`/admin/runs/${r.booking_id}`}
              className={`block bg-white border rounded-xl p-4 hover:shadow-sm transition-all ${r.rating <= 2 ? 'border-red-200' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-mono text-xs text-slate-400">{r.booking_number}</p>
                  <p className="text-sm font-medium text-slate-900">{r.client_name}</p>
                  <p className="text-xs text-slate-500">{r.route}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <svg key={s} className={`w-3.5 h-3.5 ${s <= r.rating ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    ))}
                  </div>
                  {r.rating <= 2 && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">Low</span>}
                </div>
              </div>
              <p className="text-sm text-slate-700 italic">"{r.comment}"</p>
              <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                <span>Driver: {r.driver_name}</span>
                <span>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="h-16"></div>
      <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPageChange={setPage} />
    </div>
  )
}
