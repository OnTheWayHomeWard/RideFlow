export default function Pagination({ page, totalPages, total, onPageChange }) {
  if (!total || total === 0) return null

  return (
    <div className="fixed bottom-0 left-0 lg:left-56 right-0 bg-white border-t border-slate-200 px-4 lg:px-6 py-3 flex items-center justify-between z-20">
      <p className="text-xs lg:text-sm text-slate-500">
        Page {page} of {totalPages} <span className="hidden sm:inline">({total} total)</span>
      </p>
      <div className="flex gap-1.5">
        <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}
          className="px-3 py-1.5 text-xs lg:text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
          Prev
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let p
          if (totalPages <= 5) p = i + 1
          else if (page <= 3) p = i + 1
          else if (page >= totalPages - 2) p = totalPages - 4 + i
          else p = page - 2 + i
          return (
            <button key={p} onClick={() => onPageChange(p)}
              className={`w-8 h-8 text-xs lg:text-sm font-medium rounded-lg ${
                page === p ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}>{p}</button>
          )
        })}
        <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
          className="px-3 py-1.5 text-xs lg:text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
          Next
        </button>
      </div>
    </div>
  )
}
