const BASE = '/api'

function getToken() { return localStorage.getItem('cashier_token') }

async function request(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (res.status === 401 && path !== '/auth/cashier/login') { localStorage.removeItem('cashier_token'); window.location.href = '/cashier/login'; return }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    const detail = err.detail
    const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(d => d.msg || d.message || JSON.stringify(d)).join(', ') : 'Request failed'
    throw new Error(msg)
  }
  return res.json()
}

export const api = {
  login: (data) => request('/auth/cashier/login', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request('/cashiers/me'),
  getReferrals: () => request('/cashiers/referrals'),
  getEarnings: () => request('/cashiers/earnings'),
  changePassword: (data) => request('/cashiers/change-password', { method: 'POST', body: JSON.stringify(data) }),
  getPublicSettings: () => request('/settings/public'),

  // Stripe Connect
  stripeConnect: () => request('/cashiers/stripe/connect', { method: 'POST' }),
  stripeStatus: () => request('/cashiers/stripe/status'),
  stripeOnboardingLink: () => request('/cashiers/stripe/onboarding-link', { method: 'POST' }),

  // Guest reservation
  bookForGuest: (data) => request('/cashiers/book-for-guest', { method: 'POST', body: JSON.stringify(data) }),
  getReservations: () => request('/cashiers/reservations'),

  // Public pricing data
  getVehicleRates: () => request('/vehicle-rates'),
  getCommonRoutes: () => request('/common-routes'),
  getNearbyRoutes: (lat, lng) => request(`/common-routes/nearby?lat=${lat}&lng=${lng}`),
  calculatePrice: (payload) => request('/pricing/calculate', { method: 'POST', body: JSON.stringify(payload) }),
  getExtras: () => request('/extras'),

  // Persisted in-app inbox + FCM token registration (shared /api/notifications/*)
  getInbox: (page = 1, perPage = 20, unreadOnly = false) =>
    request(`/notifications?page=${page}&per_page=${perPage}${unreadOnly ? '&unread_only=true' : ''}`),
  getUnreadCount: () => request('/notifications/unread-count'),
  markRead: (id) => request(`/notifications/${id}/read`, { method: 'PUT' }),
  markAllRead: () => request('/notifications/read-all', { method: 'PUT' }),
  registerFcm: (token, userAgent) =>
    request('/notifications/register-fcm', { method: 'POST', body: JSON.stringify({ token, user_agent: userAgent || null }) }),
  deleteFcm: (token) =>
    request('/notifications/fcm', { method: 'DELETE', body: JSON.stringify({ token }) }),
}
