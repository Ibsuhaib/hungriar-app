import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Layout from './Layout'
import { AGREEMENT_VERSION } from './AgreementModal'

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/billing', label: 'Billing' },
  { to: '/admin/history', label: 'History' },
  { to: '/admin/menu', label: 'Menu Items' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/tables', label: 'Tables & QR' },
  { to: '/admin/analytics', label: 'Analytics' },
  { to: '/admin/settings', label: 'Settings' },
]

const PAGE_TITLES = {
  '/admin': 'Dashboard',
  '/admin/orders': 'Orders',
  '/admin/billing': 'Billing',
  '/admin/history': 'Order History',
  '/admin/menu': 'Menu Management',
  '/admin/categories': 'Categories',
  '/admin/tables': 'Tables & QR Codes',
  '/admin/analytics': 'Analytics',
  '/admin/settings': 'Settings',
}

/**
 * Guards all /admin/* routes: requires an authenticated user with the
 * 'admin' role and a linked restaurant_admins row, and enforces acceptance
 * of the latest agreement (AGREEMENT_VERSION) before granting access to the
 * rest of the dashboard.
 */
export default function ProtectedRoute() {
  const { user, role, restaurantAdmin, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-sand-100">
        <div className="skeleton h-10 w-40 rounded-lg" />
      </div>
    )
  }

  if (!user || role !== 'admin') {
    return <Navigate to="/admin/login" replace state={{ from: location }} />
  }

  if (!restaurantAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-sand-100 p-4 text-center">
        <p className="max-w-sm text-gray-600">
          Your account is not yet linked to a restaurant. Please contact Goana AR support to finish
          setting up your account.
        </p>
      </div>
    )
  }

  const needsAgreement =
    !restaurantAdmin.agreement_accepted_at || restaurantAdmin.agreement_version !== AGREEMENT_VERSION

  if (needsAgreement && location.pathname !== '/admin/agreement') {
    return <Navigate to="/admin/agreement" replace />
  }

  if (!needsAgreement && location.pathname === '/admin/agreement') {
    return <Navigate to="/admin" replace />
  }

  if (location.pathname === '/admin/agreement') {
    return <Outlet />
  }

  const title = PAGE_TITLES[location.pathname] || 'Goana AR'

  return (
    <Layout title={title} navItems={NAV_ITEMS} signOutPath="/admin/login">
      <Outlet />
    </Layout>
  )
}
