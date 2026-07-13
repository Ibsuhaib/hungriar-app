import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { Shield, CheckCircle2, LogOut, ArrowRight, Eraser, ChevronDown, PenLine } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { AGREEMENT_VERSION, AGREEMENT_SECTIONS, buildAgreementText } from '../legal/agreement'

// Re-exported for ProtectedRoute / Agreement page compatibility.
export { AGREEMENT_VERSION }

const PLANS_SUMMARY = [
  { name: 'Starter',    yearly: '₹8,400', monthly: '₹700',   features: 'Waiter app · KOT · Billing · Analytics · Telegram report' },
  { name: 'Standard',   yearly: '₹18,000', monthly: '₹1,500', features: 'Everything in Starter + QR menu · Menu images · Customer self-ordering' },
  { name: 'AR Premium', yearly: '₹30,000', monthly: '₹2,500', features: 'Everything in Standard + AR 3D dish viewer' },
]

/**
 * Signature pad — plain canvas with pointer events. Reports ink state up so
 * the parent can gate the submit button, and exposes the PNG via ref.
 */
function SignaturePad({ onInkChange, padRef }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const dpr = window.devicePixelRatio || 1
    const { offsetWidth: w, offsetHeight: h } = canvas
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#1e2d45'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  // Parent reads the signature / clears the pad through this ref
  useEffect(() => {
    padRef.current = {
      toDataURL: () => (hasInk.current ? canvasRef.current.toDataURL('image/png') : null),
      clear: () => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)
        hasInk.current = false
        onInkChange(false)
      },
    }
  }, [padRef, onInkChange])

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!hasInk.current) {
      hasInk.current = true
      onInkChange(true)
    }
  }

  const end = () => { drawing.current = false }

  return (
    <canvas
      ref={canvasRef}
      className="h-32 w-full rounded-xl border-2 border-dashed border-gray-300 bg-white touch-none cursor-crosshair"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={end}
    />
  )
}

/**
 * First-login agreement gate for restaurant admins. Full agreement text
 * (scroll to the end to unlock), typed name + drawn signature, and an
 * immutable signed record saved to `signed_agreements`.
 */
export default function AgreementModal() {
  const { acceptAgreement, signOut, restaurant, restaurantAdmin, user } = useAuth()
  const [checked, setChecked] = useState(false)
  const [scrolledToEnd, setScrolledToEnd] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [hasInk, setHasInk] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const scrollRef = useRef(null)
  const padRef = useRef(null)

  // If the text happens to fit without scrolling (large screens), unlock immediately
  useEffect(() => {
    const el = scrollRef.current
    if (el && el.scrollHeight <= el.clientHeight + 8) setScrolledToEnd(true)
  }, [])

  const handleScroll = (e) => {
    const el = e.target
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setScrolledToEnd(true)
  }

  const canSign = checked && scrolledToEnd && signerName.trim().length >= 3 && hasInk

  const handleAccept = async () => {
    if (!canSign || submitting) return
    setSubmitting(true)
    try {
      const signature = padRef.current?.toDataURL()
      if (!signature) throw new Error('Please draw your signature')

      // 1. Immutable evidence record — the exact text, name, signature, time
      const { error: insertError } = await supabase.from('signed_agreements').insert({
        restaurant_id: restaurantAdmin.restaurant_id,
        user_id: user.id,
        agreement_version: AGREEMENT_VERSION,
        agreement_text: buildAgreementText(),
        signer_name: signerName.trim(),
        signature_data_url: signature,
      })
      if (insertError) throw insertError

      // 2. Access gate — same mechanism as before
      await acceptAgreement(AGREEMENT_VERSION)
      toast.success('Agreement signed! Redirecting to your dashboard…')
    } catch (err) {
      toast.error(err.message || 'Failed to record your signature. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #1c1c1c 0%, #2d1a10 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(231,111,81,0.12), transparent)' }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl max-h-[94vh]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 flex-shrink-0">
            <Shield className="w-5 h-5 text-primary-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 font-display truncate">
              Subscription &amp; Service Agreement
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {restaurant ? `${restaurant.name} · ` : ''}Version {AGREEMENT_VERSION} — please read fully, then sign below.
            </p>
          </div>
        </div>

        {/* Scrollable agreement text */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4 bg-gray-50/60"
        >
          {/* Plan summary — informational, outside the contract text */}
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Current Plans (summary — your fee is as agreed at signup)
            </p>
            <div className="space-y-2">
              {PLANS_SUMMARY.map((plan) => (
                <div key={plan.name} className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-gray-800">{plan.name}</span>
                    <span className="text-xs font-semibold text-primary-600 whitespace-nowrap">
                      {plan.yearly}/yr + GST · {plan.monthly}/mo
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{plan.features}</p>
                </div>
              ))}
              <p className="text-[11px] text-gray-400 pl-1">+ One-time setup service charge (quoted per restaurant)</p>
            </div>
          </div>

          <div className="border-t border-gray-200 mb-4" />

          {AGREEMENT_SECTIONS.map((section) => (
            <section key={section.title} className="mb-4">
              <h2 className="text-sm font-bold text-gray-900">{section.title}</h2>
              {section.body.map((para, i) => (
                <p key={i} className="mt-1.5 text-sm leading-relaxed text-gray-600">{para}</p>
              ))}
            </section>
          ))}

          <p className="text-xs text-gray-400 pb-1">
            See also our{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="font-medium text-primary-600 underline underline-offset-2">Terms of Service</a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="font-medium text-primary-600 underline underline-offset-2">Privacy Policy</a>.
          </p>
        </div>

        {/* Scroll nudge */}
        {!scrolledToEnd && (
          <div className="flex items-center justify-center gap-1.5 border-t border-gray-100 bg-amber-50 px-6 py-2 text-xs font-medium text-amber-700">
            <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
            Scroll to the end of the agreement to sign
          </div>
        )}

        {/* Signing area */}
        <div className="border-t border-gray-100 px-6 py-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                Your full name (authorised signatory)
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="e.g. Mohammed Suhaib"
                maxLength={80}
                className="input"
                disabled={!scrolledToEnd}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                  <PenLine className="w-3 h-3" /> Draw your signature
                </label>
                <button
                  type="button"
                  onClick={() => padRef.current?.clear()}
                  className="flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Eraser className="w-3 h-3" /> Clear
                </button>
              </div>
              <div className={!scrolledToEnd ? 'pointer-events-none opacity-50' : ''}>
                <SignaturePad onInkChange={setHasInk} padRef={padRef} />
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                disabled={!scrolledToEnd}
              />
              <div className="h-5 w-5 rounded-md border-2 border-gray-300 peer-checked:border-primary-500 peer-checked:bg-primary-500 transition-all flex items-center justify-center">
                {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
            </div>
            <span className="text-sm text-gray-700 leading-snug">
              I have read this agreement and sign it on behalf of the Restaurant. I understand my
              signature, name, and the date will be recorded.
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
              disabled={!canSign || submitting}
              className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
            >
              {submitting ? 'Recording signature…' : 'Sign & Continue'}
              {!submitting && <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
