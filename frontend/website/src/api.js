// Tiny helper — all calls go through nginx /api/ proxy.
const API = '/api'

async function get(path) {
  const r = await fetch(API + path)
  if (!r.ok) throw new Error(`Request failed: ${r.status}`)
  return r.json()
}

async function post(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data?.detail || `Request failed: ${r.status}`)
  return data
}

export const api = {
  getSettings: () => get('/settings/public'),
  getVehicles: () => get('/vehicle-rates'),
  getTestimonials: () => get('/public/testimonials'),
  submitContact: (data) => post('/public/contact', data),
}
