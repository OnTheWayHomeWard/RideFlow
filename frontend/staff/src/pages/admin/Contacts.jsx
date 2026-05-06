import { useState, useEffect } from 'react'
import { api } from '../../api/adminClient'
import Pagination from '../../components/admin/Pagination'

const STATUS_TABS = [
  { key: 'new', label: 'New' },
  { key: 'read', label: 'Read' },
  { key: 'replied', label: 'Replied' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
]

const STATUS_PILL = {
  new: 'bg-amber-100 text-amber-700',
  read: 'bg-blue-100 text-blue-700',
  replied: 'bg-green-100 text-green-700',
  archived: 'bg-slate-200 text-slate-600',
}

export default function Contacts() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, total_pages: 0 })
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('new')
  const [loading, setLoading] = useState(true)
  const [opened, setOpened] = useState(null)

  const load = () => {
    setLoading(true)
    api.listContacts(statusFilter === 'all' ? null : statusFilter, page)
      .then(setData).catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [page, statusFilter])

  const handleOpen = async (c) => {
    setOpened(c)
    if (c.status === 'new') {
      try {
        await api.setContactStatus(c.id, 'read')
        // reflect locally
        setData(prev => ({ ...prev, items: prev.items.map(i => i.id === c.id ? { ...i, status: 'read' } : i) }))
      } catch {}
    }
  }

  return (
    <div className="p-4 lg:p-6 pb-24">
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Contacts</h1>
          <p className="text-xs text-slate-500 mt-0.5">Messages submitted from the website's contact form.</p>
        </div>
        <span className="text-xs text-slate-400">{data.total} total</span>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => { setStatusFilter(t.key); setPage(1) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
              statusFilter === t.key ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : data.items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-slate-400">No contacts in this view yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.items.map(c => (
            <button key={c.id} onClick={() => handleOpen(c)}
              className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all">
              <div className="flex items-center justify-between mb-1 gap-2">
                <p className="font-semibold text-sm text-slate-900 truncate">{c.name}</p>
                <span className={`text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded shrink-0 ${STATUS_PILL[c.status]}`}>{c.status}</span>
              </div>
              <p className="text-xs text-slate-500 truncate mb-1">
                {c.email || '—'}{c.email && c.phone ? ' · ' : ''}{c.phone || ''}
              </p>
              <p className="text-sm text-slate-700 line-clamp-2">{c.message}</p>
              <p className="text-xs text-slate-400 mt-1">{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</p>
            </button>
          ))}
        </div>
      )}

      <div className="h-16"></div>
      <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPageChange={setPage} />

      {opened && <ContactModal contact={opened} onClose={() => setOpened(null)} onChanged={load} />}
    </div>
  )
}


function ContactModal({ contact: c, onClose, onChanged }) {
  const [notes, setNotes] = useState(c.admin_notes || '')
  const [saving, setSaving] = useState(false)

  const handleStatus = async (status) => {
    try { await api.setContactStatus(c.id, status); onClose(); onChanged() } catch (e) { alert(e.message) }
  }
  const handleSaveNotes = async () => {
    setSaving(true)
    try { await api.setContactNotes(c.id, notes) } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end lg:items-center justify-center p-0 lg:p-4" onClick={onClose}>
      <div className="bg-white w-full lg:max-w-xl rounded-t-2xl lg:rounded-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900">{c.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
          {c.email && (
            <a href={`mailto:${c.email}`} className="bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg p-3 flex items-center gap-2 truncate">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              <span className="truncate">{c.email}</span>
            </a>
          )}
          {c.phone && (
            <a href={`tel:${c.phone}`} className="bg-green-50 hover:bg-green-100 text-green-700 rounded-lg p-3 flex items-center gap-2 truncate">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              <span className="truncate">{c.phone}</span>
            </a>
          )}
        </div>

        <div className="bg-slate-50 rounded-lg p-3 mb-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1 font-medium">Message</p>
          <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.message}</p>
        </div>

        <div className="mb-4">
          <label className="text-xs text-slate-500">Admin notes (private)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" />
          <button onClick={handleSaveNotes} disabled={saving}
            className="mt-2 px-3 py-1.5 bg-slate-700 text-white rounded-lg text-xs font-medium hover:bg-slate-800 disabled:opacity-60">
            {saving ? 'Saving...' : 'Save notes'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={() => handleStatus('replied')} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">Mark replied</button>
          <button onClick={() => handleStatus('archived')} className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300">Archive</button>
        </div>
      </div>
    </div>
  )
}
