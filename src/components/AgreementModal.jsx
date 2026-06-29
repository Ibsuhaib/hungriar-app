import { useState } from 'react'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { Shield, CheckCircle2, LogOut, ArrowRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export const AGREEMENT_VERSION = '1.1'

const PLANS_SUMMARY = [
  { name: 'Starter',    yearly: '₹8,400', gst: '₹1,512', monthly: '₹700',   features: 'Waiter app · KOT · Billing · Analytics · Telegram report' },
  { name: 'Standard',   yearly: '₹18,000', gst: '₹3,240', monthly: '₹1,500', features: 'Everything in Starter + QR menu · Menu images · Customer self-ordering' },
  { name: 'AR Premium', yearly: '₹30,000', gst: '₹5,400', monthly: '₹2,500', features: 'Everything in Standard + AR 3D dish viewer' },
]

const TERMS = [
  'A one-time setup fee of ₹2,700 + 18% GST (₹486) = ₹3,186 covers full menu entry (up to 200 items), table & QR setup, and staff onboarding. This is charged once only.',
  'Annual subscription fees (excluding 18% GST) are: Starter — ₹8,400/year (₹700/mo equivalent); Standard — ₹18,000/year (₹1,500/mo equivalent); AR Premium — ₹30,000/year (₹2,500/mo equivalent). All payments are collected directly by HungriAR via UPI or cash and recorded manually — no payment is processed through the app.',
  'Your plan determines which features are available: Starter includes the waiter ordering app, live kitchen display (KOT), billing, analytics, and daily Telegram reports. Standard adds QR menu for customers, food images, and customer self-ordering. AR Premium adds 3D dish previews viewable in augmented reality.',
  'Subscription status and paid-until date are managed manually by the HungriAR team. Your dashboard always shows your current plan and access level.',
  'You are responsible for keeping your menu, prices, descriptions, and item availability accurate and up to date at all times.',
  'For AR Premium accounts, 3D dish models are created and uploaded by the HungriAR team using photos and details you provide. These models remain associated with your restaurant account.',
  'You will not upload content that is offensive, misleading, or infringes on third-party rights, and will use the platform solely for lawful restaurant operations.',
  'HungriAR may suspend or downgrade access for accounts with overdue payments or violations of these terms, after reasonable notice.',
]

/**
 * First-login agreement gate for restaurant admins. Full-screen overlay with
 * scrollable terms and prominent Accept CTA.
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
      toast.success('Welcome aboard! Redirecting to your dashboard…')
    } catch (err) {
      toast.error(err.message || 'Failed to record acceptance. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #1c1c1c 0%, #2d1a10 100%)' }}
    >
      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(231,111,81,0.12), transparent)' }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        {/* Top header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 flex-shrink-0">
            <Shield className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 font-display">
              Welcome{restaurant ? `, ${restaurant.name}` : ' to HungriAR'}!
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Please review and accept before continuing.
            </p>
          </div>
        </div>

        {/* Scrollable terms */}
        <div className="max-h-[min(340px,48vh)] overflow-y-auto px-6 py-4 space-y-4 bg-gray-50/60">
          {/* Plan summary */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Subscription Plans
            </p>
            <div className="space-y-2">
              {PLANS_SUMMARY.map((plan) => (
                <div key={plan.name} className="rounded-xl border border-gray-100 bg-white px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-gray-800">{plan.name}</span>
                    <span className="text-xs font-semibold text-primary-600 whitespace-nowrap">
                      {plan.yearly}/yr + GST · {plan.monthly}/mo
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{plan.features}</p>
                </div>
              ))}
              <p className="text-[11px] text-gray-400 pl-1">+ One-time setup: ₹2,700 + GST</p>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Terms of Use
            </p>
            <ul className="space-y-2.5">
              {TERMS.map((term, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-secondary-400 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{term}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-gray-400 pt-1">
            For full details, read our{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="font-medium text-primary-600 underline underline-offset-2">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="font-medium text-primary-600 underline underline-offset-2">
              Privacy Policy
            </a>
            .
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 space-y-4 border-t border-gray-100">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <div className="h-5 w-5 rounded-md border-2 border-gray-300 peer-checked:border-primary-500 peer-checked:bg-primary-500 transition-all flex items-center justify-center">
                {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
            </div>
            <span className="text-sm text-gray-700 leading-relaxed">
              I have read and agree to the <span className="font-medium">Terms of Service</span> and <span className="font-medium">Privacy Policy</span>.
            </span>
          </label>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={signOut}
              className="btn-outline flex items-center gap-2 text-sm"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
            <button
              type="button"
              onClick={handleAccept}
              disabled={!checked || submitting}
              className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
            >
              {submitting ? 'Saving…' : 'Accept & Continue'}
              {!submitting && <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
