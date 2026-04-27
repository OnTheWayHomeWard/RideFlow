import { useState, useRef, useEffect } from 'react'

/**
 * Time picker that lists times in 30-minute intervals.
 * Times before `minTime` (HH:MM) are shown but disabled — user sees them grayed out.
 */
export default function TimeSelect({ value, onChange, minTime, intervalMinutes = 30 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const listRef = useRef(null)

  // Generate 24h of slots
  const slots = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += intervalMinutes) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      slots.push(`${hh}:${mm}`)
    }
  }

  const isDisabled = (slot) => minTime && slot < minTime

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Scroll selected/first-allowed into view when opening
  useEffect(() => {
    if (!open || !listRef.current) return
    const target = value || slots.find(s => !isDisabled(s)) || slots[0]
    const el = listRef.current.querySelector(`[data-slot="${target}"]`)
    if (el) el.scrollIntoView({ block: 'center' })
  }, [open])

  const formatDisplay = (t) => {
    if (!t) return 'Select time'
    const [h, m] = t.split(':')
    const hour = parseInt(h, 10)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return `${display}:${m} ${ampm}`
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between">
        <span className={value ? 'text-slate-900' : 'text-slate-400'}>{formatDisplay(value)}</span>
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto" ref={listRef}>
          {slots.map(slot => {
            const disabled = isDisabled(slot)
            const selected = slot === value
            return (
              <button key={slot} data-slot={slot} type="button"
                disabled={disabled}
                onClick={() => { if (!disabled) { onChange(slot); setOpen(false) } }}
                className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                  selected ? 'bg-blue-600 text-white' :
                  disabled ? 'text-slate-300 cursor-not-allowed' :
                  'text-slate-700 hover:bg-blue-50'
                }`}>
                <span className="inline-block w-20">{formatDisplay(slot)}</span>
                {disabled && <span className="text-xs text-slate-400">(too soon)</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
