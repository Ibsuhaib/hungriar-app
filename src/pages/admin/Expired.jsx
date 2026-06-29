import { Lock, Mail, Phone } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useSubscriptionStatus } from '../../hooks/useSubscriptionStatus'

const SUPPORT_EMAIL = 'hungriar.app@gmail.com'
const SUPPORT_PHONE = '+91-81970-02978'

export default function Expired() {
  const { restaurant, signOut } = useAuth()
  const { status, label, daysRemaining } = useSubscriptionStatus(restaurant)

  const isInactive = status === 'inactive'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card max-w-sm w-full space-y-5 text-center">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8 text-red-400" />
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-900 font-display">
            {isInactive ? 'Account Deactivated' : 'Subscription Expired'}
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            {isInactive
              ? `${restaurant?.name || 'Your restaurant'} has been deactivated. Contact HungriAR to restore access.`
              : `Your subscription for ${restaurant?.name || 'this restaurant'} has expired. The admin panel and all features are locked until payment is confirmed.`}
          </p>
          <p className="text-xs font-medium text-red-500">{label}</p>
        </div>

        {/* Contact box */}
        <div className="rounded-2xl bg-gray-50 border border-gray-200 px-4 py-4 text-left space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Contact HungriAR to renew
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center gap-2.5 text-sm text-primary-600 font-medium hover:underline"
          >
            <Mail className="w-4 h-4 flex-shrink-0" />
            {SUPPORT_EMAIL}
          </a>
          <a
            href={`tel:${SUPPORT_PHONE.replace(/[^+\d]/g, '')}`}
            className="flex items-center gap-2.5 text-sm text-gray-700 font-medium hover:underline"
          >
            <Phone className="w-4 h-4 flex-shrink-0" />
            {SUPPORT_PHONE}
          </a>
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          Once payment is confirmed, HungriAR will reactivate your account and you can log in again.
        </p>

        <button
          type="button"
          onClick={signOut}
          className="btn-outline w-full text-sm"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
