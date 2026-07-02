import { useState } from 'react'

// Cashier-side clone of client/src/components/RouteCard.jsx. Kept as a
// separate file so the cashier can adopt purple accents without affecting
// the rider-facing card. Behavior is identical: expandable card, direction
// buttons for bidirectional routes, "Near you" badge, distance hint.

const DESTINATION_ICONS = [
  ['airport', '✈️'],
  ['cruise', '🚢'], ['port', '⚓'], ['harbor', '⚓'], ['harbour', '⚓'], ['pier', '⚓'], ['dock', '⚓'], ['marina', '⚓'], ['cape', '⚓'],
  ['beach', '🏖️'],
  ['theme park', '🎢'], ['studios', '🎢'], ['universal', '🎢'], ['disney', '🎢'], ['magic kingdom', '🎢'], ['epcot', '🎢'], ['adventure', '🎢'],
  ['seaworld', '🐳'], ['sea world', '🐳'], ['aquarium', '🐠'], ['zoo', '🦁'],
  ['resort', '🏨'], ['hotel', '🏨'], ['motel', '🏨'], ['lodge', '🏨'], ['suites', '🏨'], ['hostel', '🏨'],
  ['marriott', '🏨'], ['hyatt', '🏨'], ['hilton', '🏨'], ['sheraton', '🏨'], ['westin', '🏨'], ['regency', '🏨'], ['waldorf', '🏨'], ['ritz', '🏨'], ['carlton', '🏨'], ['signia', '🏨'],
  ['outlet', '🛍️'], ['mall', '🛍️'], ['shopping', '🛍️'], ['plaza', '🛍️'], ['market', '🛒'],
  ['downtown', '🏙️'], ['city center', '🏙️'], ['city centre', '🏙️'], ['square', '🏙️'],
  ['train station', '🚉'], ['railway', '🚉'], ['rail station', '🚉'], ['metro', '🚇'], ['subway', '🚇'],
  ['bus station', '🚌'], ['bus terminal', '🚌'], ['greyhound', '🚌'],
  ['hospital', '🏥'], ['clinic', '🏥'], ['medical center', '🏥'],
  ['university', '🎓'], ['college', '🎓'], ['campus', '🎓'], ['academy', '🎓'], ['school', '🏫'],
  ['stadium', '🏟️'], ['arena', '🏟️'],
  ['golf', '⛳'], ['country club', '⛳'],
  ['national park', '🏞️'], ['lake', '🏞️'], ['garden', '🌳'], ['park', '🌳'],
  ['cathedral', '⛪'], ['church', '⛪'], ['chapel', '⛪'], ['mosque', '🕌'], ['temple', '🛕'],
  ['museum', '🏛️'], ['gallery', '🏛️'],
  ['convention', '🏢'], ['conference', '🏢'], ['expo', '🏢'], ['office', '🏢'], ['tower', '🏢'],
  ['casino', '🎰'],
  ['restaurant', '🍽️'], ['cafe', '☕'],
  ['apartment', '🏠'], ['residence', '🏠'], ['villa', '🏠'], ['condo', '🏠'], ['estate', '🏠'],
]

export function getIcon(name) {
  const n = (name || '').toLowerCase()
  for (const [key, icon] of DESTINATION_ICONS) {
    if (n.includes(key)) return icon
  }
  return '📍'
}

export function shortName(name) {
  if (!name) return ''
  let s = String(name).trim()
  s = s.replace(/^[A-Z0-9]{4,}\+[A-Z0-9]{2,}\s*,?\s*/i, '')
  const comma = s.indexOf(',')
  if (comma > 0) s = s.slice(0, comma)
  return s.trim() || String(name).trim()
}

export function collapseByRoute(options) {
  const byId = new Map()
  for (const o of options) {
    const dist = typeof o.origin_distance_km === 'number' ? o.origin_distance_km : Infinity
    const cur = byId.get(o.route_id)
    if (!cur) {
      byId.set(o.route_id, { forward: o.direction === 'forward' ? o : null, any: o, near: !!o.near, minDist: dist })
    } else {
      cur.near = cur.near || !!o.near
      cur.minDist = Math.min(cur.minDist, dist)
      if (o.direction === 'forward') cur.forward = o
      if (!cur.any) cur.any = o
    }
  }
  const out = []
  for (const v of byId.values()) {
    const base = v.forward || v.any
    out.push({ ...base, near: v.near, origin_distance_km: v.minDist === Infinity ? base.origin_distance_km : v.minDist })
  }
  out.sort((a, b) => (a.origin_distance_km ?? Infinity) - (b.origin_distance_km ?? Infinity))
  return out
}

// Expandable popular-route card for the cashier flow. `onSelect(from, to)`
// receives the two endpoint objects — cashier UI uses these to fill the
// booking payload just like a manually-typed destination.
export default function RouteCard({ route, floor, near, distanceKm, onSelect, disabled }) {
  const [expanded, setExpanded] = useState(false)
  const bidir = route.bidirectional !== false
  const fromShort = shortName(route.from_name)
  const toShort = shortName(route.to_name)
  const a = { name: route.from_name, address: route.from_address, lat: route.from_lat, lng: route.from_lng }
  const b = { name: route.to_name, address: route.to_address, lat: route.to_lat, lng: route.to_lng }
  const showDistance = near && typeof distanceKm === 'number'
  const hasBadges = near || showDistance || bidir

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${
      near ? 'border-green-300' : 'border-slate-200'
    }`}>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full p-4 flex items-start gap-3 text-left hover:bg-slate-50/70 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-purple-50 ring-1 ring-purple-200 flex items-center justify-center text-xs shrink-0">{getIcon(route.from_name)}</span>
            <span className="font-semibold text-slate-900 text-sm break-words min-w-0">{fromShort}</span>
          </div>
          <div className="ml-[11px] h-3 w-px bg-slate-300"></div>
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-green-50 ring-1 ring-green-200 flex items-center justify-center text-xs shrink-0">{getIcon(route.to_name)}</span>
            <span className="font-semibold text-slate-900 text-sm break-words min-w-0">{toShort}</span>
          </div>
          {hasBadges && (
            <div className="flex items-center flex-wrap gap-1.5 mt-2">
              {near && <span className="text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Near you</span>}
              {bidir && <span className="text-[10px] font-bold bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded" title="Available both ways at the same price">↕ Both ways</span>}
              {showDistance && (
                <span className="text-[10px] text-slate-400">
                  {distanceKm < 1 ? 'Starts near you' : `~${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km away`}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          {floor != null && <p className="text-sm font-bold text-slate-900">from ${floor}</p>}
          {route.distance_miles && <p className="text-xs text-slate-400">{route.distance_miles} mi</p>}
        </div>
        <svg className={`w-5 h-5 text-slate-300 shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3 animate-[fadeIn_0.2s_ease]">
          <div className="text-xs text-slate-500 space-y-1">
            <p><span className="text-slate-400">Pickup:</span> <span className="text-slate-700">{a.name}</span></p>
            <p><span className="text-slate-400">Drop-off:</span> <span className="text-slate-700">{b.name}</span></p>
          </div>
          {bidir ? (
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => onSelect(a, b)}
                disabled={disabled}
                className="w-full py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 active:scale-[0.98] transition-all disabled:opacity-60"
              >
                Go to <b>{shortName(b.name)}</b>
              </button>
              <button
                type="button"
                onClick={() => onSelect(b, a)}
                disabled={disabled}
                className="w-full py-2.5 bg-white border border-purple-600 text-purple-700 rounded-xl text-sm font-semibold hover:bg-purple-50 active:scale-[0.98] transition-all disabled:opacity-60"
              >
                Go to <b>{shortName(a.name)}</b>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onSelect(a, b)}
              disabled={disabled}
              className="w-full py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              Select this route
            </button>
          )}
        </div>
      )}
    </div>
  )
}
