import { useState, useRef, useEffect } from 'react'
import { useSettings } from '../hooks/useSettings.jsx'

const VEHICLE_IMAGES = {
  sedan: 'https://img.icons8.com/fluency/240/sedan.png',
  suv: 'https://img.icons8.com/fluency/240/suv.png',
  van: 'https://img.icons8.com/fluency/240/shuttle-bus.png',
  large_van: 'https://img.icons8.com/fluency/240/bus2.png',
}

const VEHICLE_COLORS = {
  sedan: { card: 'from-sky-50 to-white border-sky-100', badge: 'bg-sky-100 text-sky-700' },
  suv: { card: 'from-emerald-50 to-white border-emerald-100', badge: 'bg-emerald-100 text-emerald-700' },
  van: { card: 'from-amber-50 to-white border-amber-100', badge: 'bg-amber-100 text-amber-700' },
  large_van: { card: 'from-violet-50 to-white border-violet-100', badge: 'bg-violet-100 text-violet-700' },
}

const VEHICLE_DESCRIPTIONS = {
  sedan: 'Comfortable 4-door sedan. Ideal for 1-3 passengers with standard luggage.',
  suv: 'Spacious SUV with extra room. Great for families or groups with luggage.',
  van: 'Mid-size van for groups. Comfortable seating and plenty of luggage space.',
  large_van: 'Large passenger van for bigger groups. Maximum comfort and cargo capacity.',
}

export default function StepVehicle({ prices: rawPrices, pickup, dropoff, onSelect }) {
  const settings = useSettings()
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const scrollRef = useRef(null)

  // Always show vehicles cheapest → most expensive based on this route's total.
  const prices = (rawPrices || []).slice().sort((a, b) => (a.total_amount ?? 0) - (b.total_amount ?? 0))

  // Track which card is most visible for the dot indicators
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const cardWidth = el.scrollWidth / prices.length
      const idx = Math.round(el.scrollLeft / cardWidth)
      setActiveIdx(idx)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [prices])

  if (!prices || prices.length === 0) {
    return (
      <div className="p-4 text-center py-16">
        <p className="text-slate-500">No vehicles available for this route.</p>
        {settings.company_phone && <p className="text-sm text-slate-400 mt-1">Call us at {settings.company_phone} for assistance.</p>}
      </div>
    )
  }

  return (
    <div className="animate-[fadeIn_0.3s_ease]">
      {/* Route summary */}
      <div className="p-4 pb-0">
        <div className="bg-white border border-slate-200 rounded-xl p-3 mb-5 flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>
            <div className="w-px h-5 bg-slate-300"></div>
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{pickup?.name}</p>
            <p className="text-sm text-slate-500 truncate mt-1">{dropoff?.name}</p>
          </div>
          {prices[0]?.distance_miles && (
            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">
              {prices[0].distance_miles} mi
            </span>
          )}
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-1">Choose your ride</h2>
        <p className="text-slate-500 text-sm mb-4">Swipe to see more — tap to select</p>
      </div>

      {/* Horizontal carousel */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory gap-3 px-4 pb-4 scrollbar-hide"
        style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
      >
        {prices.map((v, idx) => {
          const colors = VEHICLE_COLORS[v.vehicle_type] || VEHICLE_COLORS.sedan
          const isExpanded = expandedIdx === idx
          return (
            <div key={v.vehicle_type} className="snap-center shrink-0 w-[72%]">
              <div className={`bg-gradient-to-br ${colors.card} border rounded-2xl overflow-hidden transition-all ${isExpanded ? 'shadow-lg' : ''}`}>
                {/* Image */}
                <button
                  onClick={() => onSelect(v)}
                  className="w-full h-40 flex items-center justify-center px-6 pt-3 active:scale-[0.98] transition-transform"
                >
                  <img
                    src={v.image_url || VEHICLE_IMAGES[v.vehicle_type] || VEHICLE_IMAGES.sedan}
                    alt={v.display_name}
                    className="h-full object-contain drop-shadow-md"
                    onError={(e) => { e.target.src = VEHICLE_IMAGES[v.vehicle_type] || VEHICLE_IMAGES.sedan }}
                  />
                </button>

                {/* Info */}
                <button onClick={() => onSelect(v)} className="w-full px-4 pb-3 flex items-end justify-between text-left">
                  <div>
                    <p className="font-bold text-slate-900 text-lg">{v.display_name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                        {v.max_passengers} passengers
                      </span>
                      <span className="text-xs text-slate-500">{v.max_luggage} bags</span>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">${v.total_amount}</p>
                </button>

                {/* Expandable details — swipe down handle */}
                <button
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  className="w-full px-4 py-2 border-t border-slate-200/60 flex items-center justify-center gap-1 text-xs text-slate-500 hover:bg-white/40"
                >
                  <span>{isExpanded ? 'Hide details' : 'Show details'}</span>
                  <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 text-sm text-slate-600 border-t border-slate-200/60 bg-white/40">
                    <p>{v.description || VEHICLE_DESCRIPTIONS[v.vehicle_type] || 'Comfortable transport for your ride.'}</p>
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                      <div className="flex justify-between"><span className="text-slate-400">Base fare</span><span className="font-medium">${v.base_amount}</span></div>
                      {v.distance_miles && <div className="flex justify-between"><span className="text-slate-400">Distance</span><span className="font-medium">{v.distance_miles} mi</span></div>}
                      <div className="flex justify-between pt-1 border-t border-slate-100"><span className="text-slate-600 font-medium">Total</span><span className="font-bold text-base">${v.total_amount}</span></div>
                    </div>
                    <button onClick={() => onSelect(v)}
                      className="w-full mt-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:scale-[0.98]">
                      Select {v.display_name}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Dots indicator */}
      {prices.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-4">
          {prices.map((_, idx) => (
            <div key={idx} className={`h-1.5 rounded-full transition-all ${activeIdx === idx ? 'w-6 bg-blue-600' : 'w-1.5 bg-slate-300'}`}></div>
          ))}
        </div>
      )}
    </div>
  )
}
