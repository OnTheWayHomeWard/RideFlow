const BASE = '/api'

function getToken() {
  return localStorage.getItem('admin_token')
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (res.status === 401) {
    localStorage.removeItem('admin_token')
    window.location.href = '/admin/login'
    return
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  // Auth
  login: (data) => request('/auth/admin/login', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request('/admin/me'),
  changePassword: (data) => request('/admin/me/change-password', { method: 'POST', body: JSON.stringify(data) }),

  // Admin management (super-admin only)
  listAdmins: () => request('/admin/admins'),
  createAdmin: (data) => request('/admin/admins', { method: 'POST', body: JSON.stringify(data) }),
  resetAdminPassword: (id, newPassword) => request(`/admin/admins/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: newPassword }) }),
  deleteAdmin: (id) => request(`/admin/admins/${id}`, { method: 'DELETE' }),

  // Reviews — feature for website + display overrides
  featureReview: (id, isFeatured) => request(`/admin/reviews/${id}/feature`, { method: 'PUT', body: JSON.stringify({ is_featured: isFeatured }) }),
  setReviewDisplay: (id, data) => request(`/admin/reviews/${id}/display`, { method: 'PUT', body: JSON.stringify(data) }),

  // Contact form submissions from the marketing site
  listContacts: (status, page = 1) => request(`/admin/contacts?${status ? `status=${status}&` : ''}page=${page}&per_page=20`),
  unreadContactCount: () => request('/admin/contacts/unread-count'),
  setContactStatus: (id, status) => request(`/admin/contacts/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  setContactNotes: (id, notes) => request(`/admin/contacts/${id}/notes`, { method: 'PUT', body: JSON.stringify({ admin_notes: notes }) }),

  // Pickup groups (auto-applied add-ons by pickup location)
  listPickupGroups: () => request('/admin/pickup-groups'),
  createPickupGroup: (data) => request('/admin/pickup-groups', { method: 'POST', body: JSON.stringify(data) }),
  updatePickupGroup: (id, data) => request(`/admin/pickup-groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePickupGroup: (id) => request(`/admin/pickup-groups/${id}`, { method: 'DELETE' }),
  addPickupGroupLocation: (groupId, data) => request(`/admin/pickup-groups/${groupId}/locations`, { method: 'POST', body: JSON.stringify(data) }),
  deletePickupGroupLocation: (groupId, locId) => request(`/admin/pickup-groups/${groupId}/locations/${locId}`, { method: 'DELETE' }),

  // Dashboard
  getStats: () => request('/admin/dashboard/stats'),
  getNotifications: (page = 1, perPage = 10) => request(`/admin/notifications?page=${page}&per_page=${perPage}`),

  // Bookings
  getBookings: (page = 1, perPage = 10, status = '') =>
    request(`/admin/bookings?page=${page}&per_page=${perPage}${status ? `&status=${status}` : ''}`),
  getBookingDetail: (id) => request(`/admin/bookings/${id}`),
  refundBooking: (id, reason, amount = null) => request(`/admin/bookings/${id}/refund`, { method: 'POST', body: JSON.stringify({ reason, amount }) }),

  // Reviews
  getReviews: (page = 1, perPage = 10) => request(`/admin/reviews?page=${page}&per_page=${perPage}`),

  // Payouts
  getPayouts: (status = 'pending_review', page = 1, perPage = 10) => request(`/admin/payouts?status=${status}&page=${page}&per_page=${perPage}`),
  releasePayout: (id, note) => request(`/admin/payouts/${id}/release`, { method: 'PUT', body: JSON.stringify({ note }) }),
  flagPayout: (id, note) => request(`/admin/payouts/${id}/flag`, { method: 'PUT', body: JSON.stringify({ note }) }),
  rejectPayout: (id, note) => request(`/admin/payouts/${id}/reject`, { method: 'PUT', body: JSON.stringify({ note }) }),
  retryTransfer: (id) => request(`/admin/payouts/${id}/retry-transfer`, { method: 'PUT' }),
  markManualPayout: (id, note) => request(`/admin/payouts/${id}/mark-manual`, { method: 'PUT', body: JSON.stringify({ note }) }),

  // Concierges
  getConcierges: () => request('/admin/concierges'),
  getConciergeDetail: (id) => request(`/admin/concierges/${id}`),
  createConcierge: (data) => request('/admin/concierges', { method: 'POST', body: JSON.stringify(data) }),
  updateConcierge: (id, data) => request(`/admin/concierges/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteConcierge: (id) => request(`/admin/concierges/${id}`, { method: 'DELETE' }),
  getConciergePayoutPreview: (id) => request(`/admin/concierges/${id}/payout-preview`),
  executeConciergePayout: (id, data) => request(`/admin/concierges/${id}/payout`, { method: 'POST', body: JSON.stringify(data) }),
  conciergeStripeConnect: (id) => request(`/admin/concierges/${id}/stripe-connect`, { method: 'POST' }),
  conciergeStripeStatus: (id) => request(`/admin/concierges/${id}/stripe-status`),
  generateConciergeOnboardingLink: (id) => request(`/admin/concierges/${id}/generate-onboarding-link`, { method: 'POST' }),

  // Batched driver payouts
  getDriverPayoutPreview: (id) => request(`/admin/drivers/${id}/payout-preview`),
  executeDriverPayout: (id, data) => request(`/admin/drivers/${id}/payout`, { method: 'POST', body: JSON.stringify(data) }),
  getDriversWithPending: () => request('/admin/drivers-with-pending'),

  // Driver priority + assignment
  setDriverPriority: (id, level) => request(`/admin/drivers/${id}/priority`, { method: 'PATCH', body: JSON.stringify({ priority_level: level }) }),
  getEligibleDrivers: (bookingId) => request(`/admin/eligible-drivers?booking_id=${bookingId}`),
  assignDriver: (bookingId, driverId) => request(`/admin/bookings/${bookingId}/assign-driver`, { method: 'POST', body: JSON.stringify({ driver_id: driverId }) }),
  reassignDriver: (bookingId, newDriverId, reason) => request(`/admin/bookings/${bookingId}/reassign-driver`, { method: 'POST', body: JSON.stringify({ new_driver_id: newDriverId, reason }) }),

  // Payout batches
  getPayoutBatches: (params = '') => request(`/admin/payout-batches${params ? '?' + params : ''}`),
  getPayoutBatchDetail: (id) => request(`/admin/payout-batches/${id}`),
  getConciergeBatches: (conciergeId) => request(`/admin/concierges/${conciergeId}/batches`),
  retryBatch: (id) => request(`/admin/payout-batches/${id}/retry`, { method: 'POST' }),
  markBatchManual: (id, note) => request(`/admin/payout-batches/${id}/mark-manual`, { method: 'POST', body: JSON.stringify({ note }) }),

  // Drivers
  getDrivers: (status, page = 1, perPage = 10) => request(`/admin/drivers?page=${page}&per_page=${perPage}${status ? `&status=${status}` : ''}`),
  getDriverDetail: (id) => request(`/admin/drivers/${id}`),
  createDriver: (params) => request(`/admin/drivers?${new URLSearchParams(params)}`, { method: 'POST' }),
  updateDriver: (id, data) => request(`/admin/drivers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDriver: (id, permanent = false) => request(`/admin/drivers/${id}?permanent=${permanent}`, { method: 'DELETE' }),
  resetDriverPassword: (id) => request(`/admin/drivers/${id}/reset-password`, { method: 'PUT' }),

  // Cashiers
  getCashiers: (status, page = 1, perPage = 10) => request(`/admin/cashiers?page=${page}&per_page=${perPage}${status ? `&status=${status}` : ''}`),
  getCashierDetail: (id) => request(`/admin/cashiers/${id}`),
  createCashier: (params) => request(`/admin/cashiers?${new URLSearchParams(params)}`, { method: 'POST' }),
  toggleCashier: (id) => request(`/admin/cashiers/${id}/toggle`, { method: 'PUT' }),
  updateCashier: (id, params) => request(`/admin/cashiers/${id}?${new URLSearchParams(params)}`, { method: 'PUT' }),
  deleteCashier: (id, permanent = false) => request(`/admin/cashiers/${id}?permanent=${permanent}`, { method: 'DELETE' }),
  resetCashierPassword: (id) => request(`/admin/cashiers/${id}/reset-password`, { method: 'PUT' }),
  getCashierQR: (id) => request(`/admin/cashiers/${id}/qr`),

  // Hotels
  getHotels: (page = 1, perPage = 10) => request(`/admin/hotels?page=${page}&per_page=${perPage}`),
  createHotel: (data) => request('/admin/hotels', { method: 'POST', body: JSON.stringify(data) }),
  updateHotel: (id, data) => request(`/admin/hotels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  activateHotel: (id) => request(`/admin/hotels/${id}/activate`, { method: 'PUT' }),

  // Vehicle Rates
  getVehicleRates: () => request('/admin/vehicle-rates'),
  createRate: (params) => request(`/admin/vehicle-rates?${new URLSearchParams(params)}`, { method: 'POST' }),
  updateRate: (id, params) => request(`/admin/vehicle-rates/${id}?${new URLSearchParams(params)}`, { method: 'PUT' }),
  deleteRate: (id) => request(`/admin/vehicle-rates/${id}`, { method: 'DELETE' }),

  // Extras
  getExtras: () => request('/admin/extras'),
  createExtra: (params) => request(`/admin/extras?${new URLSearchParams(params)}`, { method: 'POST' }),
  updateExtra: (id, params) => request(`/admin/extras/${id}?${new URLSearchParams(params)}`, { method: 'PUT' }),
  deleteExtra: (id) => request(`/admin/extras/${id}`, { method: 'DELETE' }),

  // Routes
  getRoutes: () => request('/admin/common-routes'),
  createRoute: (data) => request('/admin/common-routes', { method: 'POST', body: JSON.stringify(data) }),
  updateRoute: (id, data) => request(`/admin/common-routes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRoute: (id) => request(`/admin/common-routes/${id}`, { method: 'DELETE' }),
  activateRoute: (id) => request(`/admin/common-routes/${id}/activate`, { method: 'PUT' }),

  // Upsales
  getUpsales: () => request('/admin/upsales'),
  createUpsale: (data) => request('/admin/upsales', { method: 'POST', body: JSON.stringify(data) }),
  updateUpsale: (id, data) => request(`/admin/upsales/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleUpsale: (id) => request(`/admin/upsales/${id}/toggle`, { method: 'PUT' }),
  deleteUpsale: (id) => request(`/admin/upsales/${id}`, { method: 'DELETE' }),

  // Settings
  getSettings: () => request('/admin/settings'),
  updateSetting: (key, value) => request('/admin/settings', { method: 'PUT', body: JSON.stringify({ key, value }) }),
}
