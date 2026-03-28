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

export default function StepVehicle({ prices, pickup, dropoff, onSelect }) {
  if (!prices || prices.length === 0) {
    return (
      <div className="p-4 text-center py-16">
        <p className="text-slate-500">No vehicles available for this route.</p>
        <p className="text-sm text-slate-400 mt-1">Call us at (555) 000-0000 for assistance.</p>
      </div>
    )
  }

  return (
    <div className="p-4 animate-[fadeIn_0.3s_ease]">
      {/* Route summary */}
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
      <p className="text-slate-500 text-sm mb-5">Select the vehicle that fits your group</p>

      {/* Vehicle cards — Yango style with large images */}
      <div className="space-y-3">
        {prices.map((v) => {
          const colors = VEHICLE_COLORS[v.vehicle_type] || VEHICLE_COLORS.sedan
          return (
            <button
              key={v.vehicle_type}
              onClick={() => onSelect(v)}
              className={`w-full bg-gradient-to-br ${colors.card} border rounded-2xl overflow-hidden hover:shadow-lg active:scale-[0.98] transition-all text-left`}
            >
              {/* Image area */}
              <div className="h-32 flex items-center justify-center px-6 pt-2">
                <img
                  src={VEHICLE_IMAGES[v.vehicle_type] || VEHICLE_IMAGES.sedan}
                  alt={v.display_name}
                  className="h-full object-contain drop-shadow-md"
                />
              </div>

              {/* Info bar */}
              <div className="px-4 pb-4 flex items-end justify-between">
                <div>
                  <p className="font-bold text-slate-900 text-lg">{v.display_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                      {v.max_passengers} passengers
                    </span>
                    <span className="text-xs text-slate-500">
                      {v.max_luggage} bags
                    </span>
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900">${v.total_amount}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
