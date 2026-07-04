import { lazy, Suspense } from 'react'
import { Routes, Route, Outlet, useParams } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { RateLimitProvider } from './contexts/RateLimitContext'
import { RestaurantProvider } from './contexts/RestaurantContext'
import { CartProvider } from './contexts/CartContext'
import ProtectedRoute from './components/ProtectedRoute'
import SuperAdminRoute from './components/SuperAdminRoute'
import StaffRoute from './components/StaffRoute'

// Public pages — small, always needed
import Home from './pages/Home'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import NotFound from './pages/NotFound'

// Station + staff — lazy: only needed on kiosk devices
const StationLogin = lazy(() => import('./pages/StationLogin'))
const StaffPanel   = lazy(() => import('./pages/staff/StaffPanel'))

// Customer pages — lazy: only needed when scanning a QR code
const Menu         = lazy(() => import('./pages/customer/Menu'))
const FoodDetail   = lazy(() => import('./pages/customer/FoodDetail'))
const Cart         = lazy(() => import('./pages/customer/Cart'))
const OrderStatus  = lazy(() => import('./pages/customer/OrderStatus'))

// Admin pages — lazy: only needed when logged in as admin
const AdminLogin     = lazy(() => import('./pages/admin/Login'))
const AdminAgreement = lazy(() => import('./pages/admin/Agreement'))
const Dashboard      = lazy(() => import('./pages/admin/Dashboard'))
const Settings       = lazy(() => import('./pages/admin/Settings'))
const Categories     = lazy(() => import('./pages/admin/Categories'))
const Tables         = lazy(() => import('./pages/admin/Tables'))
const MenuManagement = lazy(() => import('./pages/admin/MenuManagement'))
const Orders         = lazy(() => import('./pages/admin/Orders'))
const Chef           = lazy(() => import('./pages/admin/Chef'))
const Expired        = lazy(() => import('./pages/admin/Expired'))
const Billing        = lazy(() => import('./pages/admin/Billing'))
const History        = lazy(() => import('./pages/admin/History'))
const Analytics      = lazy(() => import('./pages/admin/Analytics'))
const TakeOrder      = lazy(() => import('./pages/admin/TakeOrder'))
const DayEnd         = lazy(() => import('./pages/admin/DayEnd'))
const Floor          = lazy(() => import('./pages/admin/Floor'))

// Super-admin pages — lazy: only needed for super-admin
const SuperAdminLogin       = lazy(() => import('./pages/superadmin/Login'))
const Restaurants           = lazy(() => import('./pages/superadmin/Restaurants'))
const SubscriptionManager   = lazy(() => import('./pages/superadmin/SubscriptionManager'))
const PaymentLog            = lazy(() => import('./pages/superadmin/PaymentLog'))

// Minimal full-screen spinner shown while a lazy chunk is loading
function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
    </div>
  )
}

/**
 * Resolves :restaurantSlug from the URL and provides the customer-facing
 * RestaurantContext + CartContext to the nested Menu/FoodDetail/Cart/
 * OrderStatus routes.
 */
function CustomerArea() {
  const { restaurantSlug } = useParams()

  return (
    <RestaurantProvider restaurantSlug={restaurantSlug}>
      <CartProvider restaurantSlug={restaurantSlug}>
        <Outlet />
      </CartProvider>
    </RestaurantProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <RateLimitProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />

            <Route path="/r/:restaurantSlug" element={<CustomerArea />}>
              <Route index element={<Menu />} />
              <Route path="item/:itemId" element={<FoodDetail />} />
              <Route path="cart" element={<Cart />} />
              <Route path="order/:orderId" element={<OrderStatus />} />
            </Route>

            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<ProtectedRoute />}>
              <Route index element={<Dashboard />} />
              <Route path="agreement" element={<AdminAgreement />} />
              <Route path="chef" element={<Chef />} />
              <Route path="expired" element={<Expired />} />
              <Route path="orders" element={<Orders />} />
              <Route path="billing" element={<Billing />} />
              <Route path="history" element={<History />} />
              <Route path="menu" element={<MenuManagement />} />
              <Route path="categories" element={<Categories />} />
              <Route path="tables" element={<Tables />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="settings" element={<Settings />} />
              <Route path="take-order" element={<TakeOrder />} />
              <Route path="day-end" element={<DayEnd />} />
              <Route path="floor" element={<Floor />} />
            </Route>

            <Route path="/station/:stationId" element={<StationLogin />} />

            <Route path="/staff" element={<StaffRoute />}>
              <Route index element={<StaffPanel />} />
            </Route>

            <Route path="/superadmin/login" element={<SuperAdminLogin />} />
            <Route path="/superadmin" element={<SuperAdminRoute />}>
              <Route index element={<Restaurants />} />
              <Route path="subscriptions" element={<SubscriptionManager />} />
              <Route path="payments" element={<PaymentLog />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </RateLimitProvider>
    </AuthProvider>
  )
}
