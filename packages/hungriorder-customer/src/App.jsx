import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import Spinner from './components/Spinner.jsx';

const Landing = lazy(() => import('./pages/Landing.jsx'));
const Restaurant = lazy(() => import('./pages/Restaurant.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const OrderSuccess = lazy(() => import('./pages/OrderSuccess.jsx'));
const TrackOrder = lazy(() => import('./pages/TrackOrder.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Suspense fallback={<Spinner full />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/r/:slug" element={<Restaurant />} />
              <Route path="/r/:slug/checkout" element={<Checkout />} />
              <Route path="/r/:slug/success/:orderId" element={<OrderSuccess />} />
              <Route path="/order/:orderId" element={<TrackOrder />} />
              <Route path="/login" element={<Login />} />
              <Route path="/account" element={<Account />} />
              <Route path="*" element={<Landing />} />
            </Routes>
          </Suspense>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
