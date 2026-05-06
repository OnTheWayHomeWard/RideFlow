import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/adminClient'
import Pagination from '../../components/admin/Pagination'

export default function Reviews() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, total_pages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api.getReviews(page, 10).then(setData).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [page])

  const updateInPlace = (id, patch) => {
    setData(prev => ({ ...prev, items: prev.items.map(r => r.id === id ? { ...r, ...patch } : r) }))
  }

  return (
    <div className="p-4 lg:p-6 pb-24">
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Reviews & Ratings</h1>
          <p className="text-xs text-slate-500 mt-0.5">Star (★) a review to feature it on the public website. Edit display lets you polish the wording.</p>
        </div>
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
            <ReviewCard key={r.id} review={r} onChange={(patch) => updateInPlace(r.id, patch)} />
          ))}
        </div>
      )}

      <div className="h-16"></div>
      <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPageChange={setPage} />
    </div>
  )
}


function ReviewCard({ review: r, onChange }) {
  const [editing, setEditing] = useState(false)
  const [nameOverride, setNameOverride] = useState(r.display_name_override || '')
  const [commentOverride, setCommentOverride] = useState(r.display_comment_override || '')
  const [saving, setSaving] = useState(false)

  const handleToggleFeatured = async (e) => {
    e.preventDefault(); e.stopPropagation()
    try {
      const next = !r.is_featured
      await api.featureReview(r.id, next)
      onChange({ is_featured: next })
    } catch (err) { alert(err.message) }
  }

  const handleSaveDisplay = async () => {
    setSaving(true)
    try {
      await api.setReviewDisplay(r.id, {
        display_name_override: nameOverride,
        display_comment_override: commentOverride,
      })
      onChange({
        display_name_override: nameOverride.trim() || null,
        display_comment_override: commentOverride.trim() || null,
      })
      setEditing(false)
    } catch (err) { alert(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className={`bg-white border rounded-xl p-4 transition-all ${
      r.is_featured ? 'border-amber-300 bg-amber-50/30' : (r.rating <= 2 ? 'border-red-200' : 'border-slate-200')
    }`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-mono text-xs text-slate-400">{r.booking_number}</p>
            {r.is_featured && <span className="text-[10px] uppercase tracking-wide font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Featured</span>}
          </div>
          <p className="text-sm font-medium text-slate-900">{r.client_name}</p>
          <p className="text-xs text-slate-500 truncate">{r.route}</p>
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

      {editing && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
          <p className="text-xs text-slate-500">These overrides are used when this review appears on the public website. Leave empty to use the original.</p>
          <div>
            <label className="text-xs text-slate-500">Public display name (optional)</label>
            <input value={nameOverride} onChange={e => setNameOverride(e.target.value)}
              placeholder={`(default: ${r.client_name?.split(' ')[0] || 'Anonymous'} ${(r.client_name?.split(' ').slice(-1)[0] || '')[0] || ''}.)`}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Public comment (optional)</label>
            <textarea value={commentOverride} onChange={e => setCommentOverride(e.target.value)}
              rows={2}
              placeholder="Leave empty to show the original comment"
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveDisplay} disabled={saving}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save display'}
            </button>
            <button onClick={() => { setEditing(false); setNameOverride(r.display_name_override || ''); setCommentOverride(r.display_comment_override || '') }}
              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
        <button onClick={handleToggleFeatured}
          className={`px-2.5 py-1 rounded text-xs font-medium ${r.is_featured ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-slate-100 text-slate-700 hover:bg-amber-100'}`}>
          {r.is_featured ? '★ Featured on website' : '☆ Feature on website'}
        </button>
        {!editing && (
          <button onClick={() => setEditing(true)} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium hover:bg-slate-200">
            Edit display
          </button>
        )}
        <Link to={`/admin/runs/${r.booking_id}`} className="ml-auto text-xs text-blue-600 hover:underline">
          View ride →
        </Link>
      </div>
    </div>
  )
}
