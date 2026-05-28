// Controlled editor for distance-pricing tiers. Used both per-vehicle
// (Pricing → Vehicle Rates) and globally (Settings → Default tiers).
//
// `value` is a list of {to, rate} where each value is a STRING (form-state)
// and the last row's `to` is null ("and beyond"). Use `buildTiersPayload`
// before sending to the API; use `tiersToForm` when loading from the API.

export function tiersToForm(tiers) {
  return (tiers || []).map(t => ({
    to: t.to == null ? null : String(t.to),
    rate: String(t.rate),
  }))
}

export function buildTiersPayload(tiers) {
  const clean = (tiers || [])
    .filter(t => t && t.rate !== '' && t.rate != null)
    .map(t => ({
      to: t.to === null || t.to === '' ? null : Number(t.to),
      rate: Number(t.rate),
    }))
  let prev = 0
  for (let i = 0; i < clean.length; i++) {
    const t = clean[i]
    if (t.to === null) {
      if (i !== clean.length - 1) throw new Error('Only the last tier can be "and up"')
    } else {
      if (t.to <= prev) throw new Error(`Tier ${i + 1}: "Up to ${t.to} mi" must be greater than the previous tier`)
      prev = t.to
    }
  }
  return clean
}

export default function TierEditor({ value, onChange, emptyText, addText = '+ Add distance tiers', helpText }) {
  const tiers = value || []

  const updateTier = (i, field, v) => onChange(tiers.map((t, j) => j === i ? { ...t, [field]: v } : t))
  const removeTier = (i) => onChange(tiers.filter((_, j) => j !== i))
  const addTier = () => {
    const next = [...tiers]
    const lastIdx = next.length - 1
    if (lastIdx >= 0 && next[lastIdx].to === null) {
      next.splice(lastIdx, 0, { to: '', rate: '' })
    } else {
      next.push({ to: '', rate: '' }, { to: null, rate: '' })
    }
    onChange(next)
  }

  return (
    <div>
      {helpText && <p className="text-xs text-slate-500 mb-2">{helpText}</p>}
      {tiers.length === 0 ? (
        <div>
          {emptyText && <p className="text-xs text-slate-500 mb-2">{emptyText}</p>}
          <button type="button" onClick={addTier}
            className="text-xs font-medium text-blue-600 hover:text-blue-700">{addText}</button>
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-2">
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-12 shrink-0">Up to</span>
                  {t.to === null ? (
                    <span className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-xs text-slate-600 italic">and beyond</span>
                  ) : (
                    <input type="number" step="any" min="0" value={t.to}
                      onChange={e => updateTier(i, 'to', e.target.value)}
                      placeholder="e.g. 10"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  )}
                  <span className="text-xs text-slate-500 shrink-0">mi @</span>
                  <input type="number" step="any" min="0" value={t.rate}
                    onChange={e => updateTier(i, 'rate', e.target.value)}
                    placeholder="$/mile"
                    className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-xs text-slate-500 shrink-0">$/mi</span>
                </div>
                {tiers.length > 1 && (
                  <button type="button" onClick={() => removeTier(i)}
                    className="px-2 py-1 text-slate-400 hover:text-red-600" title="Remove tier">✕</button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={addTier}
              className="text-xs font-medium text-blue-600 hover:text-blue-700">
              + Add another tier
            </button>
            <button type="button" onClick={() => onChange([])}
              className="text-xs text-slate-500 hover:text-red-600">Clear tiers</button>
          </div>
        </>
      )}
    </div>
  )
}
