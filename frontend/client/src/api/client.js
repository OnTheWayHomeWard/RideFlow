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
  calculateAllPrices: (data) => request('/pricing/calculate-all', { method: 'POST', body: JSON.stringify(data) }),

  // Cashier validation
  validateCashier: (refCode) => request(`/cashiers/${refCode}/validate`),

  // Bookings
  createBooking: (data) => request('/bookings', { method: 'POST', body: JSON.stringify(data) }),
  getBookingStatus: (bookingNumber) => request(`/bookings/${bookingNumber}/status`),

  // Payments
  createCheckout: (bookingNumber) => request(`/payments/create-checkout?booking_number=${bookingNumber}`, { method: 'POST' }),

  // Ratings
  submitRating: (bookingNumber, data) => request(`/bookings/${bookingNumber}/rate`, { method: 'POST', body: JSON.stringify(data) }),
}
