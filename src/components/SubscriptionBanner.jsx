import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus'

const SUPPORT_EMAIL = 'support@goanaar.example'
const SUPPORT_PHONE = '+91-90000-00000'

/**
 * Shows the restaurant's subscription status (trial / active / expired /
 * deactivated) with contact details for renewal. Displayed but never
 * blocking - even an expired subscription only shows a warning banner.
 */
export default function SubscriptionBanner({ restaurant }) {
  const { label, isExpired, isTrial, status } = useSubscriptionStatus(restaurant)

  if (!restaurant) return null

  let tone = 'border-secondary-200 bg-secondary-50 text-secondary-800'
  if (status === 'inactive' || isExpired) {
    tone = 'border-red-200 bg-red-50 text-red-800'
  } else if (isTrial) {
    tone = 'border-amber-200 bg-amber-50 text-amber-800'
  }

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tone}`} role="status">
      <p className="font-medium">{label}</p>
      {(isExpired || status === 'inactive') ? (
        <p className="mt-1">
          To renew or reactivate your subscription, please contact Goana AR at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline">
            {SUPPORT_EMAIL}
          </a>{' '}
          or call <span className="font-semibold">{SUPPORT_PHONE}</span>.
        </p>
      ) : (
        <p className="mt-1 text-xs opacity-80">
          For renewals or upgrades, contact{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>{' '}
          or call {SUPPORT_PHONE}.
        </p>
      )}
    </div>
  )
}
