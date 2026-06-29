import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, useScroll, useTransform } from 'framer-motion'
import {
  Check, X, ArrowRight, ChevronDown,
  Smartphone, ChefHat, QrCode, BarChart3,
  Box, Receipt, Bell, Zap, Star,
} from 'lucide-react'

const SUPPORT_EMAIL = 'hungriar.app@gmail.com'

// ─── Retro Grid ───────────────────────────────────────────────────────────────
function RetroGrid({ opacity = 0.35 }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ perspective: '200px', opacity }}
    >
      <div
        className="absolute inset-0"
        style={{ transform: 'rotateX(65deg)', transformOrigin: 'top center' }}
      >
        <div
          className="absolute animate-grid"
          style={{
            height: '300vh', width: '600vw',
            left: '-100%', top: 0,
            backgroundImage:
              'linear-gradient(to right, rgba(212,163,115,0.14) 1px, transparent 1px),' +
              'linear-gradient(to bottom, rgba(212,163,115,0.14) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/60 to-transparent" />
    </div>
  )
}

// ─── Marquee ─────────────────────────────────────────────────────────────────
function Marquee({ children, reverse = false, duration = 35 }) {
  return (
    <div className="flex overflow-hidden gap-3" style={{ '--marquee-duration': `${duration}s` }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`flex shrink-0 gap-3 ${reverse ? 'animate-marquee-reverse' : 'animate-marquee'}`}
        >
          {children}
        </div>
      ))}
    </div>
  )
}

// ─── Spotlight / Glow Card ────────────────────────────────────────────────────
function GlowCard({ children, className = '' }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState(false)

  const onMove = (e) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative rounded-2xl border border-white/10 overflow-hidden transition-all duration-300 ${className}`}
      style={{
        background: hovered
          ? `radial-gradient(400px circle at ${pos.x}px ${pos.y}px, rgba(212,163,115,0.14), transparent 60%), rgba(255,255,255,0.03)`
          : 'rgba(255,255,255,0.03)',
        boxShadow: hovered ? '0 0 0 1px rgba(212,163,115,0.35), 0 20px 40px -12px rgba(0,0,0,0.6)' : '0 1px 3px rgba(0,0,0,0.3)',
      }}
    >
      {hovered && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background: `radial-gradient(250px circle at ${pos.x}px ${pos.y}px, rgba(212,163,115,0.22), transparent 60%)`,
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  )
}

// ─── Phone Mockup ─────────────────────────────────────────────────────────────
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[220px]">
      {/* Phone shell */}
      <div className="relative rounded-[36px] border-4 border-white/10 bg-navy-800 shadow-2xl overflow-hidden" style={{ height: 440 }}>
        {/* Status bar */}
        <div className="flex items-center justify-between px-5 pt-3 pb-1">
          <span className="text-[9px] text-white/50">9:41</span>
          <div className="w-16 h-4 bg-black rounded-full" />
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
          </div>
        </div>
        {/* App header */}
        <div className="px-4 pt-2 pb-3 border-b border-white/5">
          <p className="text-[10px] text-primary-400 font-bold tracking-wide uppercase">hungriAR</p>
          <p className="text-sm font-bold text-white mt-0.5">Pasta Arrabiata</p>
        </div>
        {/* Food image area with AR glow */}
        <div className="relative mx-4 mt-3 rounded-2xl overflow-hidden" style={{ height: 160 }}>
          <div className="absolute inset-0 bg-gradient-to-br from-orange-900/40 to-red-900/40" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-5xl">🍝</div>
          </div>
          {/* AR scan lines */}
          <div className="absolute inset-0 border-2 border-primary-500/40 rounded-2xl" />
          <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-primary-400 rounded-tl" />
          <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-primary-400 rounded-tr" />
          <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-primary-400 rounded-bl" />
          <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-primary-400 rounded-br" />
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-primary-600/90 rounded-lg px-2 py-1">
            <Box className="w-3 h-3 text-white" />
            <span className="text-[9px] text-white font-bold">View in AR</span>
          </div>
        </div>
        {/* Item details */}
        <div className="px-4 mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/60">Serves 1 · Spicy</p>
            <p className="text-sm font-bold text-primary-400">₹380</p>
          </div>
          <p className="text-[10px] text-white/40 leading-relaxed">
            Rich tomato sauce, garlic, chilli flakes, fresh basil…
          </p>
          <motion.div
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="w-full rounded-xl bg-primary-600 py-2 text-center text-xs font-bold text-white"
          >
            Add to Order
          </motion.div>
        </div>
      </div>
      {/* Glow under phone */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-32 h-8 bg-primary-500/30 blur-2xl rounded-full" />
    </div>
  )
}

// ─── Fade-up helper ───────────────────────────────────────────────────────────
function FadeUp({ children, delay = 0, className = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-50px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const MARQUEE_ITEMS = [
  { icon: QrCode,    label: 'QR Ordering' },
  { icon: ChefHat,   label: 'Live Kitchen Display' },
  { icon: Box,       label: 'AR 3D Menu' },
  { icon: Bell,      label: 'Instant KOT' },
  { icon: BarChart3, label: 'Owner Analytics' },
  { icon: Receipt,   label: 'Smart Billing' },
  { icon: Smartphone,label: 'Waiter App' },
  { icon: Zap,       label: 'Real-time Updates' },
  { icon: Star,      label: 'Telegram Reports' },
]

const GLOW_FEATURES = [
  {
    icon: ChefHat,
    iconBg: 'bg-gradient-to-br from-primary-400 to-primary-600',
    tag: 'Operations',
    title: 'Full Kitchen & Order Management',
    desc: 'Waiters take orders on any tablet, KOTs fire instantly to the kitchen display, chefs mark items ready — all synced in real time. Billing, discounts, settlement and printing, all in one place.',
    points: ['Table ordering (waiter app)', 'Live KOT + Chef panel', 'Billing, settle & print', 'Daily Telegram report to owner'],
  },
  {
    icon: QrCode,
    iconBg: 'bg-gradient-to-br from-secondary-400 to-secondary-600',
    tag: 'Customer Experience',
    title: 'QR Menu & Customer Self-Ordering',
    desc: 'Guests scan the table QR on any phone — no app download needed. They browse a beautiful image-rich menu, read descriptions and prices, and place orders directly from their seat.',
    points: ['Works on any smartphone', 'Full menu with images', 'Customer places order themselves', 'Orders go straight to kitchen'],
  },
  {
    icon: Box,
    iconBg: 'bg-gradient-to-br from-orange-400 to-red-500',
    tag: 'AR Premium',
    title: 'Augmented Reality Dish Previews',
    desc: 'The industry\'s first AR menu experience. Customers tap "View in AR" and see the actual dish rendered at real scale on their table through their phone camera — before they order.',
    points: ['3D dish viewer via phone camera', 'See food on your actual table', 'No app download required', 'Unique feature no competitor offers'],
  },
]

const STEPS = [
  { n: '01', title: 'We set up your restaurant', desc: 'We handle menu entry (up to 200 items), table setup, and QR code generation. You\'re live within 48 hours.' },
  { n: '02', title: 'Waiters take orders on any device', desc: 'Staff use any phone or tablet to take table orders. KOTs fire to the kitchen display instantly — no paper, no shouting.' },
  { n: '03', title: 'Customers order via QR', desc: 'Guests scan the QR on their table, browse the menu with photos, and place orders themselves. No waiter needed for ordering.' },
  { n: '04', title: 'Owner tracks everything remotely', desc: 'Analytics dashboard shows revenue per payment method, expenses, and what cash is physically in the restaurant. Daily Telegram report sent automatically.' },
]

const PLANS = [
  {
    name: 'Starter',
    price: 8400,
    gst: 1512,
    monthly: 700,
    badge: null,
    dark: false,
    desc: 'Essential digital tools for small restaurants and cafes',
    features: [
      { t: 'Table ordering — waiter app', y: true },
      { t: 'KOT + Live Chef / Kitchen panel', y: true },
      { t: 'Billing, settle & print', y: true },
      { t: 'Analytics & per-method tracking', y: true },
      { t: 'Daily Telegram report to owner', y: true },
      { t: 'QR menu for customers', y: false },
      { t: 'Menu images', y: false },
      { t: 'Customer self-ordering via QR', y: false },
      { t: 'AR / 3D dish viewer', y: false },
    ],
  },
  {
    name: 'Standard',
    price: 18000,
    gst: 3240,
    monthly: 1500,
    badge: 'Most Popular',
    dark: false,
    desc: 'Full digital experience — QR menu, images & self-ordering',
    features: [
      { t: 'Table ordering — waiter app', y: true },
      { t: 'KOT + Live Chef / Kitchen panel', y: true },
      { t: 'Billing, settle & print', y: true },
      { t: 'Analytics & per-method tracking', y: true },
      { t: 'Daily Telegram report to owner', y: true },
      { t: 'QR menu for customers', y: true },
      { t: 'Menu images', y: true },
      { t: 'Customer self-ordering via QR', y: true },
      { t: 'AR / 3D dish viewer', y: false },
    ],
  },
  {
    name: 'AR Premium',
    price: 30000,
    gst: 5400,
    monthly: 2500,
    badge: 'Exclusive Feature',
    dark: true,
    desc: 'Everything + AR 3D dish viewer — the future of restaurant menus',
    features: [
      { t: 'Table ordering — waiter app', y: true },
      { t: 'KOT + Live Chef / Kitchen panel', y: true },
      { t: 'Billing, settle & print', y: true },
      { t: 'Analytics & per-method tracking', y: true },
      { t: 'Daily Telegram report to owner', y: true },
      { t: 'QR menu for customers', y: true },
      { t: 'Menu images', y: true },
      { t: 'Customer self-ordering via QR', y: true },
      { t: 'AR / 3D dish viewer', y: true },
    ],
  },
]


// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const heroRef = useRef(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '30%'])

  return (
    <div className="flex min-h-screen flex-col bg-navy-800 text-white font-sans">

      {/* ── Sticky Nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/5" style={{ background: 'rgba(15,23,42,0.90)', backdropFilter: 'blur(16px)' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="hungriAR" className="w-8 h-8 rounded-xl" />
            <span className="text-lg font-bold tracking-tight">
              hungri<span className="text-primary-400">AR</span>
            </span>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-sm text-white/50">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/admin/login" className="text-sm text-white/50 hover:text-white transition-colors hidden sm:block px-3 py-1.5">
              Login
            </Link>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=hungriAR Enquiry`}
              className="text-sm font-semibold bg-primary-500 hover:bg-primary-400 text-navy-900 px-4 py-2 rounded-xl transition-colors"
            >
              Get Started
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden bg-navy-800">
        <RetroGrid opacity={0.4} />

        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-2/3 w-[700px] h-[700px] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(212,163,115,0.10) 0%, transparent 70%)' }} />
        </div>

        <motion.div
          style={{ y: heroY }}
          className="relative mx-auto max-w-5xl px-4 py-24 text-center w-full"
        >
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="flex justify-center mb-8"
          >
            <div className="relative">
              <img src="/logo.svg" alt="hungriAR" className="w-28 h-28 rounded-3xl shadow-2xl" />
              <div className="absolute inset-0 rounded-3xl shadow-2xl" style={{ boxShadow: '0 0 60px rgba(212,163,115,0.40)' }} />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-white/60 font-medium">Smart Order Management for Restaurants</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6 }}
            className="text-5xl sm:text-6xl font-bold leading-tight font-display"
          >
            Restaurant Management<br />
            <span className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #D4A373 0%, #e6c69a 50%, #f7ebd6 100%)' }}>
              Reimagined with AR
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6 }}
            className="mt-5 text-white/50 text-lg max-w-2xl mx-auto leading-relaxed"
          >
            From table ordering to kitchen display to QR menus — and the only platform where
            customers see dishes in <span className="text-primary-400 font-semibold">augmented reality</span> before they order.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.6 }}
            className="mt-9 flex flex-col sm:flex-row gap-3 justify-center"
          >
            <a href="#pricing"
              className="group inline-flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-400 text-navy-900 font-bold px-7 py-3.5 rounded-xl transition-all text-sm shadow-lg"
            >
              View Plans <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=hungriAR Demo Request`}
              className="inline-flex items-center justify-center gap-2 border border-white/15 hover:border-white/30 text-white/70 hover:text-white font-semibold px-7 py-3.5 rounded-xl transition-all text-sm"
            >
              Request a Demo
            </a>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="mt-14 grid grid-cols-3 gap-4 max-w-sm mx-auto"
          >
            {[['48h', 'Setup time'], ['200+', 'Menu items'], ['Real-time', 'Kitchen sync']].map(([val, lbl]) => (
              <div key={lbl} className="text-center">
                <p className="text-xl font-bold text-primary-400">{val}</p>
                <p className="text-xs text-white/40 mt-0.5">{lbl}</p>
              </div>
            ))}
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="mt-16 flex flex-col items-center gap-1"
          >
            <motion.div animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}>
              <ChevronDown className="w-5 h-5 text-white/20" />
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Marquee Strip ──────────────────────────────────────────────────── */}
      <section className="py-5 border-y border-white/5 bg-white/[0.02] overflow-hidden">
        <Marquee duration={30}>
          {MARQUEE_ITEMS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 whitespace-nowrap">
              <Icon className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" />
              <span className="text-xs font-medium text-white/60">{label}</span>
            </div>
          ))}
        </Marquee>
      </section>

      {/* ── Features (Glow Cards) ──────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-navy-800">
        <div className="mx-auto max-w-6xl px-4">
          <FadeUp className="text-center mb-14">
            <p className="text-primary-400 text-xs font-bold tracking-widest uppercase mb-3">Everything you need</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold">
              One platform. Total control.
            </h2>
            <p className="mt-3 text-white/40 max-w-lg mx-auto text-sm leading-relaxed">
              Built specifically for restaurants — from solo cafes to multi-table fine dining.
            </p>
          </FadeUp>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {GLOW_FEATURES.map((f, i) => (
              <FadeUp key={f.title} delay={i * 0.1}>
                <GlowCard className="h-full p-6">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${f.iconBg} shadow-sm mb-4`}>
                    <f.icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-primary-400/70 mb-2">{f.tag}</p>
                  <h3 className="text-base font-bold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed mb-4">{f.desc}</p>
                  <ul className="space-y-1.5">
                    {f.points.map((pt) => (
                      <li key={pt} className="flex items-center gap-2 text-xs text-white/50">
                        <Check className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </GlowCard>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it Works ──────────────────────────────────────────────────── */}
      <section className="py-24 bg-navy-900 border-t border-white/5">
        <div className="mx-auto max-w-6xl px-4">
          <FadeUp className="text-center mb-14">
            <p className="text-primary-400 text-xs font-bold tracking-widest uppercase mb-3">Simple Setup</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold">Up and running in 48 hours</h2>
          </FadeUp>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <FadeUp key={s.n} delay={i * 0.1}>
                <div className="relative p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
                  <p className="text-5xl font-bold font-display text-white/5 mb-3">{s.n}</p>
                  <h3 className="text-sm font-bold text-white mb-2">{s.title}</h3>
                  <p className="text-xs text-white/40 leading-relaxed">{s.desc}</p>
                  {i < STEPS.length - 1 && (
                    <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px bg-white/10" />
                  )}
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── AR Differentiator ─────────────────────────────────────────────── */}
      <section className="py-24 bg-navy-800 border-t border-white/5 overflow-hidden">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Text */}
            <FadeUp>
              <p className="text-primary-400 text-xs font-bold tracking-widest uppercase mb-4">AR Premium — Exclusive</p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold leading-tight mb-5">
                Let customers see the food<br />
                <span className="text-primary-400">before they order it</span>
              </h2>
              <p className="text-white/40 text-sm leading-relaxed mb-7">
                hungriAR is the only restaurant management platform with a built-in AR dish viewer.
                Customers tap "View in AR" on any menu item and see it rendered at real scale on
                their actual table — through their phone camera, no app download needed.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Works on any modern smartphone — iOS and Android',
                  'No app download required for customers',
                  'Dramatically increases order confidence and average order value',
                  'Upload 3D models directly from Menu Management',
                ].map((pt) => (
                  <li key={pt} className="flex items-start gap-3 text-sm text-white/60">
                    <div className="w-5 h-5 rounded-full bg-primary-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-primary-400" />
                    </div>
                    {pt}
                  </li>
                ))}
              </ul>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=AR Premium Enquiry`}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-primary-600 to-primary-400 hover:from-primary-500 hover:to-primary-300 text-navy-800 font-bold px-6 py-3 rounded-xl transition-all text-sm"
              >
                Ask about AR Premium <ArrowRight className="w-4 h-4" />
              </a>
            </FadeUp>

            {/* Phone mockup */}
            <FadeUp delay={0.15} className="flex justify-center">
              <div className="relative">
                {/* Background glow */}
                <div className="absolute inset-0 -m-8 rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(212,163,115,0.18) 0%, transparent 70%)' }} />
                <motion.div
                  animate={{ y: [-6, 6, -6] }}
                  transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                >
                  <PhoneMockup />
                </motion.div>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 bg-navy-900 border-t border-white/5">
        <div className="mx-auto max-w-6xl px-4">
          <FadeUp className="text-center mb-14">
            <p className="text-primary-400 text-xs font-bold tracking-widest uppercase mb-3">Pricing</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold">Simple yearly plans</h2>
            <p className="mt-3 text-white/40 text-sm max-w-md mx-auto">
              All prices exclude 18% GST. Yearly billing = 2 months free vs monthly.
            </p>
          </FadeUp>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {PLANS.map((plan, i) => (
              <FadeUp key={plan.name} delay={i * 0.1}>
                <motion.div
                  whileHover={{ y: -6 }}
                  transition={{ duration: 0.25 }}
                  className={`relative rounded-2xl border p-7 flex flex-col h-full ${
                    plan.dark
                      ? 'border-primary-500/50 bg-gradient-to-b from-[#1c1608] to-[#110f06]'
                      : plan.badge === 'Most Popular'
                      ? 'border-primary-600/50 bg-white/[0.04]'
                      : 'border-white/8 bg-white/[0.02]'
                  }`}
                >
                  {plan.badge && (
                    <div className={`absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold text-white ${
                      plan.dark ? 'bg-gradient-to-r from-primary-500 to-primary-300' : 'bg-primary-600'
                    }`}>
                      {plan.badge}
                    </div>
                  )}

                  <p className="text-base font-bold text-white">{plan.name}</p>
                  <p className="text-xs text-white/40 mt-1">{plan.desc}</p>

                  <div className="mt-5 mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold font-display text-white">
                        ₹{plan.price.toLocaleString('en-IN')}
                      </span>
                      <span className="text-sm text-white/30">/year</span>
                    </div>
                    <p className="text-xs text-white/30 mt-1">
                      + ₹{plan.gst.toLocaleString('en-IN')} GST · ₹{plan.monthly.toLocaleString('en-IN')}/mo equivalent
                    </p>
                  </div>

                  <ul className="space-y-2.5 flex-1 mb-7">
                    {plan.features.map((f) => (
                      <li key={f.t} className="flex items-center gap-2.5 text-xs">
                        {f.y
                          ? <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                          : <X className="w-4 h-4 text-white/15 flex-shrink-0" />
                        }
                        <span className={f.y ? 'text-white/70' : 'text-white/25'}>{f.t}</span>
                      </li>
                    ))}
                  </ul>

                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=hungriAR ${plan.name} Enquiry`}
                    className={`block text-center py-3 rounded-xl text-sm font-bold transition-all ${
                      plan.dark
                        ? 'bg-gradient-to-r from-primary-500 to-primary-300 hover:from-primary-400 hover:to-primary-200 text-navy-900 font-bold'
                        : plan.badge === 'Most Popular'
                        ? 'bg-primary-600 hover:bg-primary-500 text-white'
                        : 'bg-white/8 hover:bg-white/12 text-white/80'
                    }`}
                  >
                    Get Started
                  </a>
                </motion.div>
              </FadeUp>
            ))}
          </div>

          {/* Setup fee */}
          <FadeUp delay={0.3} className="mt-8">
            <div className="mx-auto max-w-lg text-center border border-white/8 rounded-2xl px-6 py-5 bg-white/[0.02]">
              <p className="text-sm font-bold text-white">One-time Setup Service Charge</p>
              <p className="text-xs text-white/35 mt-1.5 leading-relaxed">
                Covers full menu entry, table & QR setup, and staff onboarding. Quoted individually based on restaurant size. Charged once only.
              </p>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-24 bg-navy-900 border-t border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px]"
            style={{ background: 'radial-gradient(ellipse, rgba(212,163,115,0.09) 0%, transparent 70%)' }} />
        </div>
        <FadeUp className="relative text-center">
          <div className="mx-auto max-w-xl px-4">
            <p className="text-primary-400 text-xs font-bold tracking-widest uppercase mb-4">Ready to start?</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
              Get your restaurant live<br />in 48 hours
            </h2>
            <p className="text-white/40 text-sm mb-8 leading-relaxed">
              We handle the full setup — menu entry, tables, QR codes, and staff training.
              You focus on the food.
            </p>
            <motion.a
              href={`mailto:${SUPPORT_EMAIL}?subject=hungriAR Restaurant Enquiry`}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-400 text-navy-900 font-bold px-8 py-4 rounded-xl transition-colors text-sm shadow-xl"
            >
              Contact Us — Get Started Today <ArrowRight className="w-4 h-4" />
            </motion.a>
            <p className="mt-4 text-xs text-white/25">{SUPPORT_EMAIL}</p>
          </div>
        </FadeUp>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="bg-navy-900 border-t border-white/5 py-10">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 mb-10">
            {/* Brand */}
            <div className="col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <img src="/logo.svg" alt="hungriAR" className="w-7 h-7 rounded-lg" />
                <span className="font-bold text-white">hungri<span className="text-primary-400">AR</span></span>
              </div>
              <p className="text-xs text-white/30 leading-relaxed">
                Restaurant Management · QR Ordering · AR Dish Preview
              </p>
              <p className="text-[10px] text-primary-500/70 mt-2 font-semibold tracking-widest uppercase">Manage · Order · Preview · Delight</p>
            </div>
            {/* Product */}
            <div>
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-4">Product</p>
              <ul className="space-y-2.5">
                {[['Features', '#features'], ['Pricing', '#pricing']].map(([t, h]) => (
                  <li key={t}><a href={h} className="text-xs text-white/30 hover:text-white/70 transition-colors">{t}</a></li>
                ))}
              </ul>
            </div>
            {/* Company */}
            <div>
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-4">Legal</p>
              <ul className="space-y-2.5">
                <li><Link to="/terms" className="text-xs text-white/30 hover:text-white/70 transition-colors">Terms of Service</Link></li>
                <li><Link to="/privacy" className="text-xs text-white/30 hover:text-white/70 transition-colors">Privacy Policy</Link></li>
              </ul>
            </div>
            {/* Contact */}
            <div>
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-4">Contact</p>
              <ul className="space-y-2.5">
                <li><a href={`mailto:${SUPPORT_EMAIL}`} className="text-xs text-white/30 hover:text-primary-400 transition-colors break-all">{SUPPORT_EMAIL}</a></li>
                <li><Link to="/admin/login" className="text-xs text-white/30 hover:text-white/70 transition-colors">Restaurant Login</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-xs text-white/20">&copy; {new Date().getFullYear()} hungriAR. All rights reserved.</p>
            <p className="text-xs text-white/15">Built with React · Supabase · Cloudflare R2</p>
          </div>
        </div>
      </footer>

    </div>
  )
}
