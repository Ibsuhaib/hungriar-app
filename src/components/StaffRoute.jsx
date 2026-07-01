import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * Route guard for the /staff panel.
 * Only staff station accounts (role === 'staff') may enter.
 * Anyone else is redirected to the appropriate login.
 */
export default function StaffRoute() {
  const { user, role, restaurantAdmin, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 animate-pulse" />
          <div className="skeleton h-2 w-24 rounded-full" />
        </div>
      </div>
    )
  }

  if (!user || role !== 'staff') {
    return <Navigate to="/admin/login" replace state={{ from: location }} />
  }

  if (!restaurantAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 p-4 text-center">
        <div className="card max-w-sm">
          <p className="text-gray-600 text-sm">
            This station is not linked to a restaurant. Please contact your manager.
          </p>
        </div>
      </div>
    )
  }

  return <Outlet />
}
