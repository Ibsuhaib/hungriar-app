import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, Receipt, History, UtensilsCrossed, Tag, QrCode, BarChart2, Settings } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus'
import Layout from './Layout'
import { AGREEMENT_VERSION } from './AgreementModal'

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { to: '/admin/billing', label: 'Billing', icon: Receipt },
  { to: '/admin/history', label: 'History', icon: History },
  { to: '/admin/menu', label: 'Menu Items', icon: UtensilsCrossed },
  { to: '/admin/categories', label: 'Categories', icon: Tag },
  { to: '/admin/tables', label: 'Tables & QR', icon: QrCode },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart2 },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
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

const NO_LAYOUT_PATHS = ['/admin/agreement', '/admin/chef', '/admin/expired']

export default function ProtectedRoute() {
  const { user, role, restaurantAdmin, restaurant, loading } = useAuth()
  const { isExpired, status: subStatus } = useSubscriptionStatus(restaurant)
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

  if (!user || role !== 'admin') {
    return <Navigate to="/admin/login" replace state={{ from: location }} />
  }

  if (!restaurantAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 p-4 text-center">
        <div className="card max-w-sm">
          <p className="text-gray-600 text-sm">
            Your account is not yet linked to a restaurant. Please contact HungriAR support to finish
            setting up your account.
          </p>
        </div>
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

  // Subscription gate — block the entire panel when expired or deactivated
  const isBlocked = isExpired || subStatus === 'inactive'
  if (isBlocked && location.pathname !== '/admin/expired') {
    return <Navigate to="/admin/expired" replace />
  }
  if (!isBlocked && location.pathname === '/admin/expired') {
    return <Navigate to="/admin" replace />
  }

  // Chef-mode lock: if the chef session is active, pin to /admin/chef
  const chefKey = `hungriar_chef_auth_${restaurantAdmin.restaurant_id}`
  const isChefMode = sessionStorage.getItem(chefKey) === '1'
  if (isChefMode && location.pathname !== '/admin/chef') {
    return <Navigate to="/admin/chef" replace />
  }

  if (NO_LAYOUT_PATHS.includes(location.pathname)) {
    return <Outlet />
  }

  const title = PAGE_TITLES[location.pathname] || 'HungriAR'

  return (
    <Layout title={title} navItems={NAV_ITEMS} signOutPath="/admin/login">
      <Outlet />
    </Layout>
  )
}
