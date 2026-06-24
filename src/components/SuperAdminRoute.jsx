import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Layout from './Layout'

const NAV_ITEMS = [
  { to: '/superadmin', label: 'Restaurants', end: true },
  { to: '/superadmin/subscriptions', label: 'Subscriptions' },
  { to: '/superadmin/payments', label: 'Payment Log' },
]

const PAGE_TITLES = {
  '/superadmin': 'Restaurants',
  '/superadmin/subscriptions': 'Subscription Manager',
  '/superadmin/payments': 'Payment Log',
}

/**
 * Guards all /superadmin/* routes: requires an authenticated user with the
 * 'super_admin' role. No agreement gate applies to this role.
 */
export default function SuperAdminRoute() {
  const { user, role, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-sand-100">
        <div className="skeleton h-10 w-40 rounded-lg" />
      </div>
    )
  }

  if (!user || role !== 'super_admin') {
    return <Navigate to="/superadmin/login" replace state={{ from: location }} />
  }

  const title = PAGE_TITLES[location.pathname] || 'Super Admin'

  return (
    <Layout title={title} navItems={NAV_ITEMS} signOutPath="/superadmin/login">
      <Outlet />
    </Layout>
  )
}
