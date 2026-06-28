import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import {
  Check, X, ChefHat, QrCode, BarChart3,
  Smartphone, Box, ArrowRight, ChevronDown,
} from 'lucide-react'

const SUPPORT_EMAIL = 'bgo83418@gmail.com'

// ── Animation helpers ──────────────────────────────────────────────────────────

function FadeUp({ children, delay = 0, className = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ── Data ───────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Smartphone,
    color: 'bg-gradient-to-br from-primary-400 to-primary-600',
    title: 'Scan & Order',
    desc: 'Guests scan the table QR — no app needed. Browse menu, view photos, place orders directly.',
  },
  {
    icon: Box,
    color: 'bg-gradient-to-br from-secondary-400 to-secondary-600',
    title: 'View in AR',
    desc: 'See dishes in augmented reality before ordering — right on your actual table. Only on AR Premium.',
  },
  {
    icon: ChefHat,
    color: 'bg-gradient-to-br from-accent-400 to-accent-500',
    title: 'Live Kitchen Display',
    desc: 'Orders appear on the chef screen the moment they are placed. No shouting, no lost KOTs.',
  },
  {
    icon: QrCode,
    color: 'bg-gradient-to-br from-violet-400 to-violet-600',
    title: 'Waiter Tablet Mode',
    desc: 'Waiters take orders on a tablet — faster than writing, synced to kitchen in real time.',
  },
  {
    icon: BarChart3,
    color: 'bg-gradient-to-br from-rose-400 to-rose-600',
    title: 'Owner Analytics',
    desc: 'Track cash, UPI and card separately. Daily Telegram report sent to the owner automatically.',
  },
  {
    icon: ArrowRight,
    color: 'bg-gradient-to-br from-teal-400 to-teal-600',
    title: 'Instant Billing',
    desc: 'Settle tables, apply discounts, print bills — and see exactly what is in the restaurant right now.',
  },
]

const PLANS = [
  {
    name: 'Starter',
    price: 8400,
    gst: 1512,
    monthly: 700,
    badge: null,
    description: 'Digital order management for small restaurants & cafes',
    cardClass: 'border-gray-200 bg-white',
    badgeClass: '',
    btnClass: 'bg-gray-900 hover:bg-gray-700 text-white',
    features: [
      { label: 'Table ordering (waiter app)', yes: true },
      { label: 'KOT + Chef / Kitchen panel', yes: true },
      { label: 'Billing, settle & print', yes: true },
      { label: 'Analytics & payment tracking', yes: true },
      { label: 'Daily Telegram report to owner', yes: true },
      { label: 'QR menu for customers', yes: false },
      { label: 'Menu images', yes: false },
      { label: 'Customer self-ordering via QR', yes: false },
      { label: 'AR / 3D dish viewer', yes: false },
    ],
  },
  {
    name: 'Standard',
    price: 18000,
    gst: 3240,
    monthly: 1500,
    badge: 'Most Popular',
    description: 'Full digital experience — QR menu, images & customer self-ordering',
    cardClass: 'border-primary-500 bg-white ring-2 ring-primary-500 ring-offset-2',
    badgeClass: 'bg-primary-500',
    btnClass: 'bg-primary-600 hover:bg-primary-500 text-white',
    features: [
      { label: 'Table ordering (waiter app)', yes: true },
      { label: 'KOT + Chef / Kitchen panel', yes: true },
      { label: 'Billing, settle & print', yes: true },
      { label: 'Analytics & payment tracking', yes: true },
      { label: 'Daily Telegram report to owner', yes: true },
      { label: 'QR menu for customers', yes: true },
      { label: 'Menu images', yes: true },
      { label: 'Customer self-ordering via QR', yes: true },
      { label: 'AR / 3D dish viewer', yes: false },
    ],
  },
  {
    name: 'AR Premium',
    price: 30000,
    gst: 5400,
    monthly: 2500,
    badge: 'Only in Goa',
    description: 'Everything + AR 3D dish viewer that impresses every tourist',
    cardClass: 'border-orange-400 bg-gradient-to-b from-[#0f0f0f] to-[#1a1008] text-white',
    badgeClass: 'bg-gradient-to-r from-orange-500 to-red-500',
    btnClass: 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white',
    features: [
      { label: 'Table ordering (waiter app)', yes: true },
      { label: 'KOT + Chef / Kitchen panel', yes: true },
      { label: 'Billing, settle & print', yes: true },
      { label: 'Analytics & payment tracking', yes: true },
      { label: 'Daily Telegram report to owner', yes: true },
      { label: 'QR menu for customers', yes: true },
      { label: 'Menu images', yes: true },
      { label: 'Customer self-ordering via QR', yes: true },
      { label: 'AR / 3D dish viewer', yes: true },
    ],
  },
]

const COMPARE_ROWS = [
  { label: 'Price per year (excl. GST)', values: ['₹8,400', '₹18,000', '₹30,000', '~₹10,000', '~₹20,000'] },
  { label: 'Table ordering / POS',         values: [true, true, true, true, true] },
  { label: 'KOT + Chef panel',             values: [true, true, true, true, true] },
  { label: 'Billing & analytics',          values: [true, true, true, true, true] },
  { label: 'Daily owner report',           values: [true, true, true, false, false] },
  { label: 'QR customer menu',             values: [false, true, true, false, true] },
  { label: 'Customer self-ordering',       values: [false, true, true, 'Add-on', 'Add-on'] },
  { label: 'AR / 3D dish viewer',          values: [false, false, true, false, false] },
  { label: 'No per-order charges',         values: [true, true, true, false, false] },
]

const COMPARE_COLS = ['Starter', 'Standard', 'AR Premium', 'Petpooja Basic*', 'Petpooja Std*']

function CmpCell({ value, ours }) {
  if (value === true)  return <Check className={`w-4 h-4 mx-auto ${ours ? 'text-green-500' : 'text-green-400'}`} />
  if (value === false) return <X className="w-4 h-4 mx-auto text-gray-300" />
  return <span className={`text-xs ${ours ? 'text-primary-600 font-semibold' : 'text-gray-500'}`}>{value}</span>
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Home() {
  const [hoveredPlan, setHoveredPlan] = useState(null)

  return (
    <div className="flex min-h-screen flex-col font-sans">

      {/* ── Sticky header ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0f0f0f]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img src="/pwa-64x64.png" alt="hungriAR" className="w-8 h-8 rounded-lg" />
            <span className="text-lg font-bold text-white tracking-tight">
              hungri<span className="text-primary-400">AR</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="#pricing"
              className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block"
            >
              Pricing
            </a>
            <Link
              to="/admin/login"
              className="text-sm font-semibold bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-xl transition-colors"
            >
              Restaurant Login
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative bg-[#0f0f0f] overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary-600/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex justify-center mb-8"
          >
            <img
              src="/pwa-512x512.png"
              alt="hungriAR"
              className="w-36 h-36 sm:w-44 sm:h-44 rounded-3xl shadow-2xl"
            />
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-primary-400 text-sm font-bold tracking-[0.25em] uppercase mb-3"
          >
            Order · Preview · Enjoy
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-4xl sm:text-5xl font-bold text-white leading-tight font-display"
          >
            Smart Restaurant Management<br />
            <span className="text-primary-400">Built for Goa</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-5 text-gray-400 text-base max-w-xl mx-auto leading-relaxed"
          >
            From KOT to kitchen display to QR ordering — and the only platform in Goa
            where customers can see dishes in AR before they order.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="mt-8 flex flex-col sm:flex-row gap-3 justify-center"
          >
            <a
              href="#pricing"
              className="bg-primary-600 hover:bg-primary-500 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
            >
              View Pricing <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=hungriAR Demo Request`}
              className="border border-white/20 hover:border-white/40 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
            >
              Request a Demo
            </a>
          </motion.div>

          {/* Scroll hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="mt-16 flex justify-center"
          >
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
            >
              <ChevronDown className="w-5 h-5 text-gray-600" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <section className="bg-sand-100 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <FadeUp className="text-center mb-12">
            <h2 className="font-display text-2xl font-bold text-gray-900 sm:text-3xl">
              Everything your restaurant needs
            </h2>
            <p className="mt-2 text-gray-500 text-sm max-w-lg mx-auto">
              One platform for your kitchen, your waiters, and your customers.
            </p>
          </FadeUp>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <FadeUp key={f.title} delay={i * 0.07}>
                <motion.div
                  whileHover={{ y: -4, boxShadow: '0 12px 32px -4px rgba(0,0,0,0.12)' }}
                  transition={{ duration: 0.2 }}
                  className="bg-white rounded-2xl p-5 border border-gray-100 cursor-default"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${f.color} shadow-sm mb-3`}>
                    <f.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm">{f.title}</h3>
                  <p className="mt-1 text-xs text-gray-500 leading-relaxed">{f.desc}</p>
                </motion.div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <FadeUp className="text-center mb-12">
            <h2 className="font-display text-2xl font-bold text-gray-900 sm:text-3xl">
              Yearly Pricing
            </h2>
            <p className="mt-2 text-gray-500 text-sm">
              All prices exclude 18% GST. Yearly plan = 2 months free vs monthly billing.
            </p>
          </FadeUp>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {PLANS.map((plan, i) => {
              const isDark = plan.name === 'AR Premium'
              return (
                <FadeUp key={plan.name} delay={i * 0.1}>
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.99 }}
                    transition={{ duration: 0.2 }}
                    onHoverStart={() => setHoveredPlan(plan.name)}
                    onHoverEnd={() => setHoveredPlan(null)}
                    className={`relative rounded-2xl border-2 p-6 flex flex-col h-full ${plan.cardClass}`}
                  >
                    {plan.badge && (
                      <div className={`absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white ${plan.badgeClass}`}>
                        {plan.badge}
                      </div>
                    )}

                    <p className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{plan.name}</p>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-orange-200' : 'text-gray-400'}`}>{plan.description}</p>

                    <div className="mt-5">
                      <div className="flex items-baseline gap-1">
                        <span className={`text-4xl font-bold font-display ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          ₹{plan.price.toLocaleString('en-IN')}
                        </span>
                        <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>/year</span>
                      </div>
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>
                        + ₹{plan.gst.toLocaleString('en-IN')} GST &nbsp;·&nbsp; ₹{plan.monthly.toLocaleString('en-IN')}/mo equivalent
                      </p>
                    </div>

                    <ul className="mt-6 space-y-3 flex-1">
                      {plan.features.map((f) => (
                        <li key={f.label} className="flex items-center gap-2.5 text-xs">
                          {f.yes
                            ? <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                            : <X className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                          }
                          <span className={f.yes
                            ? (isDark ? 'text-gray-200' : 'text-gray-700')
                            : (isDark ? 'text-gray-600' : 'text-gray-400')
                          }>
                            {f.label}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <a
                      href={`mailto:${SUPPORT_EMAIL}?subject=hungriAR ${plan.name} Plan Enquiry`}
                      className={`mt-7 block text-center py-3 rounded-xl text-sm font-bold transition-all ${plan.btnClass}`}
                    >
                      Get Started
                    </a>
                  </motion.div>
                </FadeUp>
              )
            })}
          </div>

          {/* Setup charge */}
          <FadeUp delay={0.3}>
            <div className="mt-8 mx-auto max-w-xl text-center bg-sand-100 border border-sand-300 rounded-2xl px-6 py-5">
              <p className="text-sm font-bold text-gray-800">One-time Setup Charge: ₹2,700 + GST</p>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                Includes full menu entry (up to 200 items), table setup, staff training and onboarding.
                Charged once — no recurring setup fees.
              </p>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── Comparison ───────────────────────────────────────────────────────── */}
      <section className="bg-sand-100 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <FadeUp className="text-center mb-10">
            <h2 className="font-display text-2xl font-bold text-gray-900 sm:text-3xl">How We Compare</h2>
            <p className="mt-2 text-sm text-gray-500">
              Same price as competitors. More features. The only AR menu in Goa.
            </p>
          </FadeUp>

          <FadeUp>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-card bg-white">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-4 text-xs font-semibold text-gray-400 w-44">Feature</th>
                    {COMPARE_COLS.map((col, i) => (
                      <th
                        key={col}
                        className={`text-center px-3 py-4 text-xs font-bold ${i < 3 ? 'text-primary-600 bg-primary-50' : 'text-gray-400'}`}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row, ri) => (
                    <motion.tr
                      key={row.label}
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: ri * 0.04 }}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-gray-600 text-xs font-medium">{row.label}</td>
                      {row.values.map((val, vi) => (
                        <td key={vi} className={`text-center px-3 py-3.5 ${vi < 3 ? 'bg-primary-50/50' : ''}`}>
                          <CmpCell value={val} ours={vi < 3} />
                        </td>
                      ))}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-400 text-center">
              * Petpooja prices are approximate based on publicly available information and may vary by plan and region.
            </p>
          </FadeUp>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="bg-[#0f0f0f] py-16 text-center">
        <FadeUp>
          <div className="mx-auto max-w-xl px-4">
            <p className="text-primary-400 text-xs font-bold tracking-widest uppercase mb-3">Ready to start?</p>
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
              Get your restaurant live in 48 hours
            </h2>
            <p className="mt-3 text-gray-400 text-sm">
              We handle the full setup — menu, tables, training. You just run your restaurant.
            </p>
            <motion.a
              href={`mailto:${SUPPORT_EMAIL}?subject=hungriAR Restaurant Enquiry`}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="mt-7 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white font-bold text-sm px-7 py-3.5 rounded-xl transition-colors"
            >
              Contact Us <ArrowRight className="w-4 h-4" />
            </motion.a>
            <p className="mt-3 text-xs text-gray-600">{SUPPORT_EMAIL}</p>
          </div>
        </FadeUp>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="bg-[#0a0a0a] border-t border-white/5 py-5">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 text-xs text-gray-600 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/pwa-64x64.png" alt="hungriAR" className="w-5 h-5 rounded" />
            <p>&copy; {new Date().getFullYear()} hungriAR. All rights reserved.</p>
          </div>
          <div className="flex gap-5">
            <Link to="/terms" className="hover:text-gray-400 transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-gray-400 transition-colors">Privacy</Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-gray-400 transition-colors">{SUPPORT_EMAIL}</a>
          </div>
        </div>
      </footer>

    </div>
  )
}
