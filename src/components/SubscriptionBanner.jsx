import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus'

const SUPPORT_EMAIL = 'hungriar.app@gmail.com'
const SUPPORT_PHONE = '+91-92252-49945'

const TONE_CONFIG = {
  active: {
    icon: CheckCircle2,
    className: 'border-secondary-200 bg-secondary-50',
    iconClass: 'text-secondary-500',
    titleClass: 'text-secondary-800',
    textClass: 'text-secondary-700',
  },
  trial: {
    icon: Clock,
    className: 'border-amber-200 bg-amber-50',
    iconClass: 'text-amber-500',
    titleClass: 'text-amber-800',
    textClass: 'text-amber-700',
  },
  expired: {
    icon: AlertTriangle,
    className: 'border-red-200 bg-red-50',
    iconClass: 'text-red-500',
    titleClass: 'text-red-800',
    textClass: 'text-red-700',
  },
  inactive: {
    icon: XCircle,
    className: 'border-red-200 bg-red-50',
    iconClass: 'text-red-500',
    titleClass: 'text-red-800',
    textClass: 'text-red-700',
  },
}

/**
 * Shows the restaurant's subscription status with contextual icon and contact
 * details for renewal. Non-blocking — only displays a styled banner.
 */
export default function SubscriptionBanner({ restaurant }) {
  const { label, isExpired, isTrial, status } = useSubscriptionStatus(restaurant)

  if (!restaurant) return null

  const toneKey = isExpired || status === 'inactive' ? (status === 'inactive' ? 'inactive' : 'expired') : isTrial ? 'trial' : 'active'
  const config = TONE_CONFIG[toneKey] || TONE_CONFIG.active
  const Icon = config.icon

  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 ${config.className}`} role="status">
      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${config.iconClass}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${config.titleClass}`}>{label}</p>
        {isExpired || status === 'inactive' ? (
          <p className={`mt-0.5 text-xs ${config.textClass}`}>
            To renew, contact us at{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>{' '}
            or <span className="font-semibold">{SUPPORT_PHONE}</span>.
          </p>
        ) : (
          <p className={`mt-0.5 text-xs opacity-75 ${config.textClass}`}>
            For renewals, contact{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>{' '}
            · {SUPPORT_PHONE}
          </p>
        )}
      </div>
    </div>
  )
}
