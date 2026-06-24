import { useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'

// Bump this whenever the terms materially change. Existing admins will be
// prompted to re-accept because ProtectedRoute compares this against each
// restaurant_admins.agreement_version.
export const AGREEMENT_VERSION = '1.0'

/**
 * First-login (and re-acceptance) agreement gate for restaurant admins.
 * Rendered full-screen by the /admin/agreement route until the admin
 * checks the box and accepts.
 */
export default function AgreementModal() {
  const { acceptAgreement, signOut, restaurant } = useAuth()
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleAccept = async () => {
    if (!checked || submitting) return
    setSubmitting(true)
    try {
      await acceptAgreement(AGREEMENT_VERSION)
      toast.success('Thanks! Redirecting to your dashboard...')
    } catch (err) {
      toast.error(err.message || 'Failed to record your acceptance. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sand-100 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-bold text-gray-900">
          Welcome to Goana AR{restaurant ? `, ${restaurant.name}` : ''}!
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Please review and accept our terms before continuing to your dashboard.
        </p>

        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          <p>By using the Goana AR platform, you agree that:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Subscription fees (typically &#8377;3,000-&#8377;7,500/month) and any one-time AR model
              creation fee are collected directly by Goana AR via UPI or cash, as agreed separately.
            </li>
            <li>
              Subscription payments are recorded manually by the Goana AR team. Your dashboard will
              always show your current plan status and paid-until date.
            </li>
            <li>
              You are responsible for keeping your menu, prices, descriptions and item availability
              accurate and up to date.
            </li>
            <li>
              AR models are created and uploaded by the Goana AR team using the photos and details you
              provide, and remain associated with your restaurant account.
            </li>
            <li>
              You will not upload content that is offensive, misleading, or infringes on someone
              else's rights, and will use the platform only for lawful restaurant operations.
            </li>
            <li>
              Goana AR may suspend access for accounts with overdue payments, after reasonable notice.
            </li>
          </ul>
          <p>
            For full details, read our{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="font-medium text-primary-600 underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="font-medium text-primary-600 underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>I have read and agree to the Terms of Service and Privacy Policy.</span>
        </label>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={handleSignOut} className="btn-outline flex-1">
            Sign Out
          </button>
          <button type="button" onClick={handleAccept} disabled={!checked || submitting} className="btn-primary flex-1">
            {submitting ? 'Saving...' : 'Accept & Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
