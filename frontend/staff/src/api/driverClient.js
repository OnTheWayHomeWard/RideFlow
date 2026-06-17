const BASE = '/api'

function getToken() { return localStorage.getItem('driver_token') }

async function request(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (res.status === 401 && path !== '/auth/driver/login') {
    localStorage.removeItem('driver_token'); window.location.href = '/driver/login'; return
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  login: (data) => request('/auth/driver/login', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request('/drivers/me'),
  getAvailableRuns: () => request('/drivers/available-runs'),
  acceptRun: (id) => request(`/drivers/runs/${id}/accept`, { method: 'POST' }),
  startRide: (id, location) => request(`/drivers/runs/${id}/start`, { method: 'POST', body: JSON.stringify(location) }),
  completeRide: (id, location) => request(`/drivers/runs/${id}/complete`, { method: 'POST', body: JSON.stringify(location) }),
  driverOnWay: (id) => request(`/drivers/runs/${id}/on-way`, { method: 'POST' }),
  driverArrived: (id) => request(`/drivers/runs/${id}/arrived`, { method: 'POST' }),
  getMyRuns: (status) => request(`/drivers/my-runs${status ? `?status=${status}` : ''}`),
  getSchedule: () => request('/drivers/schedule'),
  getEarnings: () => request('/drivers/earnings'),
  changePassword: (data) => request('/drivers/me/change-password', { method: 'POST', body: JSON.stringify(data) }),
  getPublicSettings: () => request('/settings/public'),

  // Stripe Connect
  stripeConnect: () => request('/drivers/stripe/connect', { method: 'POST' }),
  stripeStatus: () => request('/drivers/stripe/status'),
  stripeOnboardingLink: () => request('/drivers/stripe/onboarding-link', { method: 'POST' }),

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
