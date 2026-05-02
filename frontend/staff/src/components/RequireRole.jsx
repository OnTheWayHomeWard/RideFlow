import { Navigate } from 'react-router-dom'

const TOKEN_KEY = {
  admin: 'admin_token',
  driver: 'driver_token',
  cashier: 'cashier_token',
}

export default function RequireRole({ role, children }) {
  const token = localStorage.getItem(TOKEN_KEY[role])
  if (!token) return <Navigate to={`/${role}/login`} replace />
  return children
}
