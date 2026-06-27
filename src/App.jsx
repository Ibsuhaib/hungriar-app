import { Routes, Route, Outlet, useParams } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { RateLimitProvider } from './contexts/RateLimitContext'
import { RestaurantProvider } from './contexts/RestaurantContext'
import { CartProvider } from './contexts/CartContext'
import ProtectedRoute from './components/ProtectedRoute'
import SuperAdminRoute from './components/SuperAdminRoute'

import Home from './pages/Home'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import NotFound from './pages/NotFound'

import Menu from './pages/customer/Menu'
import FoodDetail from './pages/customer/FoodDetail'
import Cart from './pages/customer/Cart'
import OrderStatus from './pages/customer/OrderStatus'

import AdminLogin from './pages/admin/Login'
import AdminAgreement from './pages/admin/Agreement'
import Dashboard from './pages/admin/Dashboard'
import Settings from './pages/admin/Settings'
import Categories from './pages/admin/Categories'
import Tables from './pages/admin/Tables'
import MenuManagement from './pages/admin/MenuManagement'
import Orders from './pages/admin/Orders'
import Chef from './pages/admin/Chef'
import Expired from './pages/admin/Expired'
import Billing from './pages/admin/Billing'
import History from './pages/admin/History'
import Analytics from './pages/admin/Analytics'
import TakeOrder from './pages/admin/TakeOrder'
import DayEnd from './pages/admin/DayEnd'

import SuperAdminLogin from './pages/superadmin/Login'
import Restaurants from './pages/superadmin/Restaurants'
import SubscriptionManager from './pages/superadmin/SubscriptionManager'
import PaymentLog from './pages/superadmin/PaymentLog'

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
          </Route>

          <Route path="/superadmin/login" element={<SuperAdminLogin />} />
          <Route path="/superadmin" element={<SuperAdminRoute />}>
            <Route index element={<Restaurants />} />
            <Route path="subscriptions" element={<SubscriptionManager />} />
            <Route path="payments" element={<PaymentLog />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </RateLimitProvider>
    </AuthProvider>
  )
}
