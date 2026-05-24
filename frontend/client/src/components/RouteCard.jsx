import { useState } from 'react'

// Keyword → emoji. First match wins, so order specific before generic
// (e.g. "airport" before "port", which is a substring of it).
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

// Friendly short label from a long formatted address: drop a leading Plus Code
// token (e.g. "QXR8+9F") and keep the text before the first comma.
export function shortName(name) {
  if (!name) return ''
  let s = String(name).trim()
  s = s.replace(/^[A-Z0-9]{4,}\+[A-Z0-9]{2,}\s*,?\s*/i, '')
  const comma = s.indexOf(',')
  if (comma > 0) s = s.slice(0, comma)
  return s.trim() || String(name).trim()
}

// Open a location in Google Maps (new tab). Prefer exact coords, fall back to name.
export function mapUrl(lat, lng, name) {
  if (lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name || '')}`
}

export function MapLink({ lat, lng, name }) {
  return (
    <a
      href={mapUrl(lat, lng, name)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="View on map"
      className="shrink-0 w-9 h-9 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 flex items-center justify-center transition-colors"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </a>
  )
}

// One pickup/destination row inside an expanded card: full name + address
// (no truncation) and a map-pin button.
function LocationRow({ color, label, name, address, lat, lng }) {
  const ring = color === 'blue' ? 'bg-blue-50 ring-blue-200' : 'bg-green-50 ring-green-200'
  const showAddr = address && address !== name
  return (
    <div className="flex items-start gap-2.5">
      <div className={`w-7 h-7 rounded-full ${ring} ring-1 flex items-center justify-center text-sm shrink-0`}>{getIcon(name)}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm text-slate-800 break-words">{name}</p>
        {showAddr && <p className="text-xs text-slate-500 break-words mt-0.5">{address}</p>}
      </div>
      <MapLink lat={lat} lng={lng} name={name} />
    </div>
  )
}

// The /nearby endpoint returns one entry per bookable direction (forward + a
// reverse for bidirectional routes), each sorted by how close its origin is.
// Collapse them to one card per route — keeping the forward (A->B) orientation —
// but flag "near" if EITHER direction starts nearby, and use the nearest origin
// for the distance label. Both directions stay bookable from the expanded view.
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

// Arrow shown between the two endpoint names in a route title:
// double-headed for two-way routes, single for one-way.
function ArrowBetween({ bidir }) {
  return (
    <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d={bidir ? 'M3 12h18M15 6l6 6-6 6M9 18l-6-6 6-6' : 'M3 12h18M15 6l6 6-6 6'} />
    </svg>
  )
}

// Expandable popular-route card. Tap the header to reveal the full pickup +
// destination (with map links) and direction-aware booking buttons.
// `onBook(from, to)` receives {name, address, lat, lng} endpoints.
export default function RouteCard({ route, floor, near, distanceKm, onBook, disabled }) {
  const [expanded, setExpanded] = useState(false)
  const bidir = route.bidirectional !== false
  // Build the title from the two endpoint fields (e.g. "Goro ⇄ Kazanchise")
  // rather than the manually-typed name, so it always reflects the actual
  // pickup/destination and the direction.
  const fromShort = shortName(route.from_name)
  const toShort = shortName(route.to_name)
  const a = { name: route.from_name, address: route.from_address, lat: route.from_lat, lng: route.from_lng }
  const b = { name: route.to_name, address: route.to_address, lat: route.to_lat, lng: route.to_lng }
  // Only surface the distance for routes that are actually nearby — "~120 km
  // away" on a far route is noise.
  const showDistance = near && typeof distanceKm === 'number'
  const hasBadges = near || showDistance

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${
      near ? 'border-green-300' : 'border-slate-200'
    }`}>
      {/* Header — tap to expand. The route name gets the full width; badges sit
          on their own row below so long names aren't squeezed. */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full p-4 flex items-start gap-3 text-left hover:bg-slate-50/70 transition-colors"
      >
        <div className="flex-1 min-w-0">
          {/* Title built from the two endpoints, each with its own location icon */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-semibold text-slate-900 text-sm leading-snug">
            <span className="inline-flex items-center gap-1"><span className="text-base leading-none">{getIcon(route.from_name)}</span>{fromShort}</span>
            <ArrowBetween bidir={bidir} />
            <span className="inline-flex items-center gap-1"><span className="text-base leading-none">{getIcon(route.to_name)}</span>{toShort}</span>
          </div>
          {hasBadges && (
            <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
              {near && <span className="text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Near you</span>}
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

      {/* Expanded: full from/to names, map links, and direction-aware booking */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3 animate-[fadeIn_0.2s_ease]">
          <LocationRow color="blue" label="Pickup" name={a.name} address={a.address} lat={a.lat} lng={a.lng} />
          <LocationRow color="green" label="Destination" name={b.name} address={b.address} lat={b.lat} lng={b.lng} />
          {bidir ? (
            <>
              <p className="text-[11px] text-blue-600 bg-blue-50 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                <span className="font-bold">↔</span>
                <span>This route runs both ways at the same price — pick your direction.</span>
              </p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => onBook(a, b)}
                  disabled={disabled}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {disabled ? '…' : <>Go to <b>{shortName(b.name)}</b></>}
                </button>
                <button
                  onClick={() => onBook(b, a)}
                  disabled={disabled}
                  className="w-full py-2.5 bg-white border border-blue-600 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-50 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {disabled ? '…' : <>Go to <b>{shortName(a.name)}</b></>}
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => onBook(a, b)}
              disabled={disabled}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {disabled
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Select this route'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
