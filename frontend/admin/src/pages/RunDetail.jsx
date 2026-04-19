import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'

export default function RunDetail() {
  const { bookingId } = useParams()
  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showPicker, setShowPicker] = useState(false)  // 'assign' | 'reassign' | false
  const [pickerData, setPickerData] = useState(null)

  const load = () => {
    setLoading(true)
    api.getBookingDetail(bookingId).then(setRun).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [bookingId])

  const openPicker = async (mode) => {
    try {
      const data = await api.getEligibleDrivers(bookingId)
      setPickerData(data)
      setShowPicker(mode)
    } catch (e) { alert(e.message) }
  }

  const handleAssign = async (driverId) => {
    try {
      await api.assignDriver(bookingId, driverId)
      setShowPicker(false)
      load()
    } catch (e) { alert(e.message) }
  }

  const handleReassign = async (driverId, reason) => {
    try {
      await api.reassignDriver(bookingId, driverId, reason)
      setShowPicker(false)
      load()
    } catch (e) { alert(e.message) }
  }

  const handleRefund = async () => {
    const reason = prompt(`Refund booking ${run.booking_number} for $${run.total_amount}?\n\nEnter the reason (will be sent to the client via SMS):`)
    if (!reason) return
    if (!confirm(`Confirm full refund of $${run.total_amount}? This cannot be undone.`)) return
    try {
      const res = await api.refundBooking(run.id, reason)
      alert(`Refund completed!\n\nStripe refund ID: ${res.stripe_refund_id}\nAmount: $${res.refund_amount}`)
      load()
    } catch (e) { alert(`Refund failed: ${e.message}`) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
  if (!run) return <div className="p-6 text-center text-slate-400">Run not found</div>

  return (
    <div className="p-4 lg:p-6">
      <Link to="/runs" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Runs
      </Link>

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 lg:p-5 mb-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-mono text-xs text-slate-400">{run.booking_number}</p>
            <h1 className="text-lg font-bold text-slate-900">{run.pickup_name} → {run.dropoff_name}</h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={run.status} />
            {['paid','assigned','in_progress','completed'].includes(run.status) && (
              <button onClick={handleRefund}
                className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">
                Refund
              </button>
            )}
          </div>
        </div>

        {/* Route */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex flex-col items-center gap-1 mt-1">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <div className="w-px h-8 bg-slate-300"></div>
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          </div>
          <div className="flex-1">
            <div className="mb-3">
              <p className="text-xs text-slate-400">Pickup</p>
              <p className="font-medium text-sm">{run.pickup_name}</p>
              <p className="text-xs text-slate-500">{run.pickup_address}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Destination</p>
              <p className="font-medium text-sm">{run.dropoff_name}</p>
              <p className="text-xs text-slate-500">{run.dropoff_address}</p>
            </div>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <Info label="Scheduled" value={`${run.pickup_date} at ${run.pickup_time?.slice(0, 5)}`} />
          <Info label="Vehicle" value={run.vehicle_type?.toUpperCase()} />
          <Info label="Total Paid" value={`$${run.total_amount}`} />
          {run.distance_miles && <Info label="Distance" value={`${run.distance_miles} mi`} />}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Client */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-2">Client</h3>
          <p className="font-semibold text-sm">{run.client_name}</p>
          <p className="text-xs text-slate-500">{run.client_phone}</p>
          {run.client_room && <p className="text-xs text-slate-500">Room {run.client_room}</p>}
          {run.hotel_name && <p className="text-xs text-blue-600 mt-1">Hotel: {run.hotel_name}</p>}
          {run.cashier_name && <p className="text-xs text-purple-600">Cashier: {run.cashier_name}</p>}
        </div>

        {/* Driver */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-xs text-slate-400 uppercase tracking-wide font-medium">Driver</h3>
            {run.status === 'paid' && !run.driver && (
              <button onClick={() => openPicker('assign')} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">Assign Driver</button>
            )}
            {run.driver && ['assigned', 'in_progress'].includes(run.status) && (
              <button onClick={() => openPicker('reassign')} className="px-3 py-1 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600">Reassign</button>
            )}
          </div>
          {run.driver ? (
            <>
              <p className="font-semibold text-sm">{run.driver.name}</p>
              <p className="text-xs text-slate-500">{run.driver.phone}</p>
              <p className="text-xs text-slate-500">{run.driver.vehicle_make} • {run.driver.vehicle_color} • {run.driver.vehicle_plate}</p>
              <Link to={`/drivers/${run.driver.id}`} className="text-xs text-blue-600 mt-1 inline-block">View driver profile</Link>
            </>
          ) : <p className="text-sm text-slate-400">No driver assigned</p>}
        </div>
      </div>

      {/* Driver picker modal */}
      {showPicker && pickerData && (
        <DriverPickerModal
          mode={showPicker}
          data={pickerData}
          currentDriverName={run.driver?.name}
          onClose={() => setShowPicker(false)}
          onAssign={handleAssign}
          onReassign={handleReassign}
        />
      )}

      {/* Timeline */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
        <h3 className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-3">Timeline</h3>
        <div className="space-y-3">
          <TimelineItem label="Ordered" time={run.created_at} />
          <TimelineItem label="Paid" time={run.paid_at} />
          <TimelineItem label="Driver Assigned" time={run.assigned_at} />
          <TimelineItem label="Ride Started" time={run.started_at} location={run.start_location} />
          <TimelineItem label="Ride Completed" time={run.completed_at} location={run.end_location} />
        </div>
      </div>

      {/* Extras */}
      {run.extras_chosen && run.extras_chosen.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <h3 className="text-xs text-amber-700 uppercase tracking-wide font-medium mb-2">Add-ons</h3>
          <div className="flex gap-2 flex-wrap">
            {run.extras_chosen.map(e => <span key={e} className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full capitalize">{e.replace('_', ' ')}</span>)}
          </div>
        </div>
      )}

      {/* Payment splits */}
      {run.splits && run.splits.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
          <h3 className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-2">Payment Breakdown</h3>
          <div className="space-y-1.5">
            {run.splits.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="capitalize text-slate-600">{s.type}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold">${s.amount.toFixed(2)}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${s.status === 'released' ? 'bg-green-100 text-green-700' : s.status === 'pending_review' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{s.status?.replace('_', ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rating */}
      {(run.rating || run.comment) && (
        <div className={`border rounded-xl p-4 mb-5 ${run.rating <= 2 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <h3 className="text-xs uppercase tracking-wide font-medium mb-2 text-slate-600">Client Review</h3>
          <div className="flex items-center gap-1 mb-1">
            {[1,2,3,4,5].map(s => (
              <svg key={s} className={`w-5 h-5 ${s <= run.rating ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            ))}
            <span className="text-sm text-slate-500 ml-1">{run.rating}/5</span>
            {run.rating <= 2 && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium ml-2">Low</span>}
          </div>
          {run.comment && <p className="text-sm text-slate-700 italic mt-1">"{run.comment}"</p>}
        </div>
      )}
    </div>
  )
}

function Info({ label, value }) {
  return <div><p className="text-xs text-slate-400">{label}</p><p className="font-medium text-slate-900">{value}</p></div>
}

function TimelineItem({ label, time, location }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${time ? 'bg-green-500' : 'bg-slate-200'}`}></div>
      <div>
        <p className={`text-sm ${time ? 'font-medium text-slate-900' : 'text-slate-400'}`}>{label}</p>
        {time && <p className="text-xs text-slate-500">{new Date(time).toLocaleString()}</p>}
        {location && <p className="text-xs text-slate-400 font-mono">{location.lat?.toFixed(4)}, {location.lng?.toFixed(4)}</p>}
      </div>
    </div>
  )
}

function DriverPickerModal({ mode, data, currentDriverName, onClose, onAssign, onReassign }) {
  const [selectedId, setSelectedId] = useState(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const PRIORITY_LABEL = { 1: 'High', 2: 'Normal', 3: 'Low' }
  const PRIORITY_COLOR = { 1: 'bg-red-100 text-red-700', 2: 'bg-slate-100 text-slate-600', 3: 'bg-blue-100 text-blue-700' }

  const filteredDrivers = data.drivers.filter(d => !d.is_current_driver)

  const handleSubmit = async () => {
    if (!selectedId) { alert('Please select a driver'); return }
    setSubmitting(true)
    try {
      if (mode === 'assign') await onAssign(selectedId)
      else await onReassign(selectedId, reason)
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-slate-200">
          <h2 className="text-lg font-bold">{mode === 'assign' ? 'Assign Driver' : 'Reassign Driver'}</h2>
          {mode === 'reassign' && currentDriverName && (
            <p className="text-xs text-slate-500 mt-1">Current driver: <span className="font-semibold text-slate-700">{currentDriverName}</span></p>
          )}
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {filteredDrivers.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No eligible drivers available</p>
          ) : (
            <div className="space-y-2">
              {filteredDrivers.map(d => (
                <label key={d.id}
                  className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${
                    selectedId === d.id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'
                  } ${d.is_at_capacity ? 'opacity-50' : ''}`}>
                  <input type="radio" checked={selectedId === d.id} onChange={() => setSelectedId(d.id)} disabled={d.is_at_capacity} className="sr-only" />
                  <div className={`w-4 h-4 rounded-full border-2 ${selectedId === d.id ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                    {selectedId === d.id && <div className="w-1.5 h-1.5 bg-white rounded-full m-auto mt-[3px]"></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{d.name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${PRIORITY_COLOR[d.priority_level]}`}>{PRIORITY_LABEL[d.priority_level]}</span>
                      {d.is_at_capacity && <span className="text-xs text-red-600">At capacity</span>}
                    </div>
                    <p className="text-xs text-slate-500">{d.phone} • {d.vehicle_plate}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p><span className="text-slate-400">Active:</span> <b>{d.active_run_count}/{data.max_runs}</b></p>
                    <p><span className="text-slate-400">Pay:</span> <b>{d.pay_percentage}%</b></p>
                    {d.rating_avg > 0 && <p><span className="text-slate-400">★</span> <b>{d.rating_avg}</b></p>}
                  </div>
                </label>
              ))}
            </div>
          )}

          {mode === 'reassign' && (
            <div className="mt-4">
              <label className="text-xs text-slate-500 font-medium">Reason for reassignment (sent to old driver)</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                placeholder="e.g. Driver unreachable, client request, etc."
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          <button onClick={handleSubmit} disabled={!selectedId || submitting}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
            {submitting ? 'Saving...' : mode === 'assign' ? 'Assign' : 'Reassign'}
          </button>
        </div>
      </div>
    </div>
  )
}
