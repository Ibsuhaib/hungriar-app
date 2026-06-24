import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Store, CreditCard, FileText } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Layout from './Layout'

const NAV_ITEMS = [
  { to: '/superadmin', label: 'Restaurants', icon: Store, end: true },
  { to: '/superadmin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/superadmin/payments', label: 'Payment Log', icon: FileText },
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
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 animate-pulse" />
          <div className="skeleton h-2 w-24 rounded-full" />
        </div>
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
