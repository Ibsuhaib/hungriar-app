import { useState } from 'react'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { Shield, CheckCircle2, LogOut, ArrowRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export const AGREEMENT_VERSION = '1.0'

const TERMS = [
  'Subscription fees (typically ₹3,000–₹7,500/month) and any one-time AR model creation fee are collected directly by HungriAR via UPI or cash, as agreed separately.',
  'Subscription payments are recorded manually by the HungriAR team. Your dashboard will always show your current plan status and paid-until date.',
  'You are responsible for keeping your menu, prices, descriptions and item availability accurate and up to date.',
  'AR models are created and uploaded by the HungriAR team using the photos and details you provide, and remain associated with your restaurant account.',
  'You will not upload content that is offensive, misleading, or infringes on someone else\'s rights, and will use the platform only for lawful restaurant operations.',
  'HungriAR may suspend access for accounts with overdue payments, after reasonable notice.',
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
        <div className="max-h-[min(280px,42vh)] overflow-y-auto px-6 py-4 space-y-3 bg-gray-50/60">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
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
