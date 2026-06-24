import { useMemo } from 'react'
import { daysBetween } from '../utils/formatters'

/**
 * Derives a human-friendly subscription status from a `restaurants` row.
 * Returns { status, label, isExpired, isTrial, daysRemaining, validUntil }
 */
export function useSubscriptionStatus(restaurant) {
  return useMemo(() => {
    if (!restaurant) {
      return {
        status: 'unknown',
        label: 'Unknown',
        isExpired: false,
        isTrial: false,
        daysRemaining: null,
        validUntil: null,
      }
    }

    const now = new Date()
    const trialEndsAt = restaurant.trial_ends_at ? new Date(restaurant.trial_ends_at) : null
    const paidUntilAt = restaurant.paid_until_at ? new Date(restaurant.paid_until_at) : null

    let validUntil = null
    let isTrial = false

    if (restaurant.subscription_status === 'trial' && trialEndsAt) {
      validUntil = trialEndsAt
      isTrial = true
    } else if (paidUntilAt) {
      validUntil = paidUntilAt
    }

    const isExpired = restaurant.subscription_status === 'expired' || (validUntil ? validUntil < now : false)
    const daysRemaining = validUntil ? daysBetween(now, validUntil) : null

    let label
    if (restaurant.subscription_status === 'inactive') {
      label = 'Deactivated by HungriAR'
    } else if (isExpired) {
      label = 'Subscription expired'
    } else if (isTrial) {
      label = `Free trial - ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`
    } else {
      label = `Active until ${validUntil ? validUntil.toLocaleDateString('en-IN') : 'N/A'}`
    }

    return {
      status: restaurant.subscription_status,
      label,
      isExpired,
      isTrial,
      daysRemaining,
      validUntil,
    }
  }, [restaurant])
}
