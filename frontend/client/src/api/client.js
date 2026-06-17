const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  // Settings
  getPublicSettings: () => request('/settings/public'),

  // Pricing
  getVehicleRates: () => request('/vehicle-rates'),
  getExtras: () => request('/extras'),
  getCommonRoutes: () => request('/common-routes'),
  getNearbyRoutes: (lat, lng) => request(`/common-routes/nearby?lat=${lat}&lng=${lng}`),
  calculateAllPrices: (data) => request('/pricing/calculate-all', { method: 'POST', body: JSON.stringify(data) }),
  matchPickupGroup: (lat, lng) => request(`/pickup-groups/match?lat=${lat}&lng=${lng}`),

  // Cashier validation
  validateCashier: (refCode) => request(`/cashiers/${refCode}/validate`),

  // Bookings
  createBooking: (data) => request('/bookings', { method: 'POST', body: JSON.stringify(data) }),
  getBookingStatus: (bookingNumber) => request(`/bookings/${bookingNumber}/status`),
  getCancellationEligibility: (bookingNumber) => request(`/bookings/${bookingNumber}/cancellation-eligibility`),
  cancelBooking: (bookingNumber) => request(`/bookings/${bookingNumber}/cancel`, { method: 'POST' }),

  // Payments
  createCheckout: (bookingNumber) => request(`/payments/create-checkout?booking_number=${bookingNumber}`, { method: 'POST' }),

  // Ratings
  submitRating: (bookingNumber, data) => request(`/bookings/${bookingNumber}/rate`, { method: 'POST', body: JSON.stringify(data) }),
}
