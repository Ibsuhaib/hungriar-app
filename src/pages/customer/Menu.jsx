import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Check, Scan, Search, X, ClipboardList, ArrowRight } from 'lucide-react'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { useCart } from '../../contexts/CartContext'
import CartDrawer from '../../components/CartDrawer'
import ARViewer from '../../components/ARViewer'
import { formatCurrency, truncate } from '../../utils/formatters'
import { getOptimizedImageUrl } from '../../utils/imageOptimizer'

const spring = { type: 'spring', stiffness: 500, damping: 30, mass: 0.5 }

// ── Ambient background layer ──────────────────────────────────────────
// No CSS filter here — radial-gradient already has a soft edge and
// filter:blur() on large fixed elements is very expensive on mobile GPUs.
function AmbientBg() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: '-15%', left: '50%', transform: 'translateX(-50%)',
        width: '600px', height: '600px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(211,85,47,0.15) 0%, transparent 60%)',
      }} />
      <div style={{
        position: 'absolute', top: '55%', right: '-18%',
        width: '380px', height: '380px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(100,60,255,0.09) 0%, transparent 60%)',
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', left: '-10%',
        width: '320px', height: '320px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(211,85,47,0.08) 0%, transparent 60%)',
      }} />
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────
function MenuSkeleton() {
  return (
    <div style={{ background: '#07070f', minHeight: '100vh' }}>
      <div style={{ height: '60px', background: 'rgba(7,7,15,0.9)', borderBottom: '1px solid rgba(255,255,255,0.07)' }} />
      <div style={{
        height: '220px',
        background: 'linear-gradient(180deg, rgba(211,85,47,0.1) 0%, rgba(7,7,15,0) 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px',
      }}>
        <div className="animate-pulse" style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
        <div className="animate-pulse" style={{ width: 140, height: 20, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
        <div className="animate-pulse" style={{ width: 80, height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.04)' }} />
      </div>
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {[72, 96, 80, 88].map((w, i) => (
            <div key={i} className="animate-pulse" style={{ width: w, height: 36, borderRadius: 100, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse" style={{ height: 96, borderRadius: 20, background: 'rgba(255,255,255,0.04)', marginBottom: '12px' }} />
        ))}
      </div>
    </div>
  )
}

// ── Category Pill ─────────────────────────────────────────────────────
function CategoryPill({ label, active, onClick }) {
  return (
    <motion.button
      layout
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.95 }}
      style={{
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '7px 18px',
        borderRadius: 100,
        border: active ? '1px solid rgba(211,85,47,0.5)' : '1px solid rgba(255,255,255,0.09)',
        background: active
          ? 'linear-gradient(135deg, rgba(211,85,47,0.22), rgba(211,85,47,0.12))'
          : 'rgba(255,255,255,0.04)',
        color: active ? '#ff8060' : 'rgba(255,255,255,0.45)',
        fontSize: '0.8rem',
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        letterSpacing: '0.2px',
        boxShadow: active ? '0 0 18px rgba(211,85,47,0.12)' : 'none',
        transition: 'box-shadow 0.2s',
      }}
    >
      {active && (
        <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={spring}>
          <Check size={11} strokeWidth={3} />
        </motion.span>
      )}
      {label}
    </motion.button>
  )
}

// ── Hero Banner ───────────────────────────────────────────────────────
function HeroBanner({ restaurant, table }) {
  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(180deg, #0e0e1c 0%, #07070f 100%)',
      paddingTop: '52px',
      paddingBottom: '72px',
    }}>
      {/* Subtle grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)
        `,
        backgroundSize: '44px 44px',
      }} />
      {/* Radial accent glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 55% at 50% -5%, rgba(211,85,47,0.22) 0%, transparent 70%)',
      }} />
      {/* Bottom fade */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '100px',
        background: 'linear-gradient(to bottom, transparent, #07070f)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 20px' }}>
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.65, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{ marginBottom: '18px' }}
        >
          {restaurant?.logo_url ? (
            <img
              src={restaurant.logo_url}
              alt={restaurant.name}
              style={{
                width: 76, height: 76, borderRadius: '50%',
                objectFit: 'cover', margin: '0 auto',
                boxShadow: '0 0 0 2px rgba(211,85,47,0.45), 0 0 0 6px rgba(211,85,47,0.1), 0 12px 40px rgba(211,85,47,0.3)',
              }}
            />
          ) : (
            <div style={{
              width: 76, height: 76, borderRadius: '50%',
              background: 'linear-gradient(135deg, #d3552f 0%, #ff7a4d 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto',
              fontSize: '28px', fontWeight: 900, color: 'white',
              boxShadow: '0 0 0 2px rgba(211,85,47,0.45), 0 0 0 6px rgba(211,85,47,0.1), 0 12px 40px rgba(211,85,47,0.35)',
            }}>
              {restaurant?.name?.charAt(0)?.toUpperCase() ?? '🍽'}
            </div>
          )}
        </motion.div>

        {/* Name — gradient text */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          style={{
            fontSize: 'clamp(1.75rem, 6vw, 2.6rem)',
            fontWeight: 900,
            letterSpacing: '-1.5px',
            lineHeight: 1.1,
            background: 'linear-gradient(135deg, #ffffff 20%, rgba(255,255,255,0.65) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '10px',
          }}
        >
          {restaurant?.name}
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.35 }}
          style={{
            fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)',
            letterSpacing: '3px', textTransform: 'uppercase',
          }}
        >
          Browse · Select · Enjoy
        </motion.p>

        {/* Table badge */}
        {table && (
          <motion.div
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.28, type: 'spring', stiffness: 420, damping: 26 }}
            style={{ marginTop: '18px' }}
          >
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '6px 20px', borderRadius: 100,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.11)',
              fontSize: '0.75rem', fontWeight: 700,
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: '0.5px',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff8060', display: 'inline-block' }} />
              Table {table.number}
            </span>
          </motion.div>
        )}
      </div>
    </div>
  )
}

// ── Featured Horizontal Strip ──────────────────────────────────────────
function FeaturedStrip({ items, currency, onNavigate }) {
  const featured = items.filter((item) => item.image_url).slice(0, 8)
  if (featured.length < 3) return null

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '18px 16px 10px' }}>
        <div style={{ width: 16, height: 2, borderRadius: 1, background: '#d3552f' }} />
        <p style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2.5px', color: '#d3552f' }}>
          Featured
        </p>
      </div>
      <div
        style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '0 16px 16px', scrollbarWidth: 'none' }}
      >
        {featured.map((item, i) => (
          <motion.button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.04, y: -3 }}
            whileTap={{ scale: 0.96 }}
            style={{
              flexShrink: 0, width: 128, borderRadius: '18px',
              overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ position: 'relative', height: '86px', overflow: 'hidden' }}>
              <img src={getOptimizedImageUrl(item.image_url, { width: 160, quality: 75 })} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(7,7,15,0.88), transparent 55%)' }} />
              {item.ar_model_url && (
                <span style={{
                  position: 'absolute', top: 6, right: 6,
                  fontSize: '7px', fontWeight: 900, letterSpacing: '0.5px',
                  background: 'rgba(211,85,47,0.9)', color: 'white',
                  padding: '2px 7px', borderRadius: 100,
                }}>AR</span>
              )}
            </div>
            <div style={{ padding: '8px 10px 10px' }}>
              <p style={{
                fontSize: '0.72rem', fontWeight: 700,
                color: 'rgba(255,255,255,0.88)', lineHeight: 1.3, marginBottom: '3px',
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
              }}>
                {item.name}
              </p>
              <p style={{
                fontSize: '0.7rem', fontWeight: 800,
                background: 'linear-gradient(135deg, #ff8060, #d3552f)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                {formatCurrency(item.price, currency)}
              </p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

// ── Menu Item Card ────────────────────────────────────────────────────
function MenuItemCard({ item, currency, onAdd, onNavigate, onAR }) {
  const [hovered, setHovered] = useState(false)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: '20px',
        overflow: 'hidden',
        background: hovered ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.038)',
        border: hovered ? '1px solid rgba(211,85,47,0.28)' : '1px solid rgba(255,255,255,0.07)',
        boxShadow: hovered ? '0 8px 40px rgba(211,85,47,0.1)' : '0 2px 12px rgba(0,0,0,0.25)',
        transition: 'background 0.2s, border-color 0.2s, box-shadow 0.25s',
        position: 'relative',
      }}
    >
      {/* Top shimmer accent on hover */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
        background: 'linear-gradient(90deg, transparent 0%, rgba(211,85,47,0.7) 50%, transparent 100%)',
        opacity: hovered ? 1 : 0, transition: 'opacity 0.25s',
        pointerEvents: 'none',
      }} />

      <button
        type="button"
        onClick={onNavigate}
        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 14px 10px' }}
      >
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
          {/* Image */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {item.image_url ? (
              <div style={{
                width: 82, height: 82, borderRadius: '15px', overflow: 'hidden',
                boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
              }}>
                <img
                  src={getOptimizedImageUrl(item.image_url, { width: 200, quality: 75 })} alt={item.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  loading="lazy"
                />
              </div>
            ) : (
              <div style={{
                width: 82, height: 82, borderRadius: '15px',
                background: 'rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '26px',
              }}>🍽</div>
            )}
            {item.ar_model_url && (
              <span style={{
                position: 'absolute', bottom: -4, right: -4,
                fontSize: '7px', fontWeight: 900, letterSpacing: '0.4px',
                background: 'linear-gradient(135deg, #d3552f, #ff6b3d)',
                color: 'white', padding: '2px 7px', borderRadius: 100,
                boxShadow: '0 2px 10px rgba(211,85,47,0.5)',
              }}>AR</span>
            )}
          </div>

          {/* Details */}
          <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>
            <p style={{
              fontSize: '0.9rem', fontWeight: 700,
              color: 'rgba(255,255,255,0.92)', lineHeight: 1.3, marginBottom: '5px',
            }}>
              {item.name}
            </p>
            {item.description && (
              <p style={{
                fontSize: '0.74rem', color: 'rgba(255,255,255,0.38)',
                lineHeight: 1.55, marginBottom: '8px',
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {item.description}
              </p>
            )}
            <p style={{
              fontSize: '0.95rem', fontWeight: 900,
              background: 'linear-gradient(135deg, #ff8060 0%, #d3552f 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              {formatCurrency(item.price, currency)}
            </p>
          </div>
        </div>
      </button>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', padding: '0 14px 14px' }}>
        {item.ar_model_url && (
          <motion.button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAR() }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.93 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '6px 13px', borderRadius: 100,
              border: '1px solid rgba(211,85,47,0.3)',
              background: 'rgba(211,85,47,0.08)',
              color: '#ff8060', fontSize: '0.72rem', fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.2px',
            }}
          >
            <Scan size={11} /> AR View
          </motion.button>
        )}
        <motion.button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAdd() }}
          whileHover={{ scale: 1.07, boxShadow: '0 6px 24px rgba(211,85,47,0.45)' }}
          whileTap={{ scale: 0.91 }}
          style={{
            padding: '7px 22px', borderRadius: 100,
            background: 'linear-gradient(135deg, #d3552f 0%, #ff6b3d 100%)',
            border: 'none', color: 'white',
            fontSize: '0.8rem', fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 3px 14px rgba(211,85,47,0.38)',
            letterSpacing: '0.3px',
          }}
        >
          Add +
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Main Menu ─────────────────────────────────────────────────────────
export default function Menu() {
  const { restaurantSlug } = useParams()
  const { restaurant, categories, menuItems, table, loading, error } = useRestaurant()
  const { addItem, itemCount, subtotal } = useCart()
  const navigate = useNavigate()

  const [activeCategory, setActiveCategory] = useState('all')
  const [cartOpen, setCartOpen] = useState(false)
  const [arModel, setArModel] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [recentOrderId, setRecentOrderId] = useState(null)

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`hungriar_orders_${restaurantSlug}`) || '[]')
      if (stored.length > 0) setRecentOrderId(stored[0])
    } catch { /* ignore */ }
  }, [restaurantSlug])

  const availableItems = useMemo(() => menuItems.filter((item) => item.available), [menuItems])

  const filteredItems = useMemo(() => {
    let items = activeCategory === 'all'
      ? availableItems
      : availableItems.filter((item) => item.category_id === activeCategory)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(
        (item) => item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q),
      )
    }
    return items
  }, [availableItems, activeCategory, searchQuery])

  const usedCategories = useMemo(() => {
    const usedIds = new Set(availableItems.map((item) => item.category_id))
    return categories.filter((cat) => usedIds.has(cat.id))
  }, [categories, availableItems])

  const currency = restaurant?.currency || '₹'
  const showFeatured = activeCategory === 'all' && !searchQuery.trim() && availableItems.length >= 3

  if (loading) return <MenuSkeleton />

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#07070f', padding: '24px', textAlign: 'center',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 65% 45% at 50% 0%, rgba(211,85,47,0.12), transparent)',
        }} />
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', margin: '0 auto 20px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '30px',
          }}>📷</div>
          <p style={{ fontSize: '1.15rem', fontWeight: 800, color: 'rgba(255,255,255,0.9)', marginBottom: '10px' }}>
            Scan the QR Code
          </p>
          <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.35)', maxWidth: '260px', lineHeight: 1.65 }}>
            {error}
          </p>
        </motion.div>
      </div>
    )
  }

  const handleAdd = (item) => {
    addItem(item, 1)
    toast.success(`${item.name} added!`, { duration: 1800 })
  }

  const sectionLabel = activeCategory === 'all'
    ? 'Full Menu'
    : (usedCategories.find((c) => c.id === activeCategory)?.name ?? 'Items')

  return (
    <div style={{ minHeight: '100vh', background: '#07070f', color: '#f0f0ff' }}>
      <AmbientBg />

      {/* ── Sticky glass nav ─────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(7,7,15,0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{
          maxWidth: '768px', margin: '0 auto',
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 16px',
        }}>
          {/* Restaurant name */}
          <AnimatePresence mode="wait">
            {!showSearch && (
              <motion.p
                key="name"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{
                  flex: 1, minWidth: 0,
                  fontSize: '0.88rem', fontWeight: 700,
                  color: 'rgba(255,255,255,0.82)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {restaurant?.name}
              </motion.p>
            )}
          </AnimatePresence>

          {showSearch && <div style={{ flex: 1 }} />}

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {/* Search input or icon */}
            <AnimatePresence mode="wait">
              {showSearch ? (
                <motion.div
                  key="search-open"
                  initial={{ opacity: 0, width: 36 }}
                  animate={{ opacity: 1, width: '200px' }}
                  exit={{ opacity: 0, width: 36 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}
                >
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search dishes…"
                    autoFocus
                    style={{
                      flex: 1, padding: '7px 14px', borderRadius: 100,
                      border: '1px solid rgba(255,255,255,0.14)',
                      background: 'rgba(255,255,255,0.07)',
                      color: 'rgba(255,255,255,0.9)', fontSize: '0.82rem',
                      outline: 'none', minWidth: 0,
                    }}
                  />
                  <motion.button
                    type="button"
                    onClick={() => { setShowSearch(false); setSearchQuery('') }}
                    whileTap={{ scale: 0.88 }}
                    style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <X size={14} />
                  </motion.button>
                </motion.div>
              ) : (
                <motion.button
                  key="search-icon"
                  type="button"
                  onClick={() => setShowSearch(true)}
                  whileTap={{ scale: 0.88 }}
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
                    color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Search size={15} />
                </motion.button>
              )}
            </AnimatePresence>

            {/* Track order icon */}
            {recentOrderId && !showSearch && (
              <motion.button
                type="button"
                onClick={() => navigate(`/r/${restaurantSlug}/order/${recentOrderId}`)}
                whileTap={{ scale: 0.88 }}
                aria-label="Track order"
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(211,85,47,0.1)', border: '1px solid rgba(211,85,47,0.25)',
                  color: '#ff8060', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ClipboardList size={15} />
              </motion.button>
            )}

            {/* Cart icon */}
            <motion.button
              type="button"
              onClick={() => setCartOpen(true)}
              whileTap={{ scale: 0.88 }}
              aria-label="Open cart"
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: itemCount > 0 ? 'linear-gradient(135deg, #d3552f, #ff6b3d)' : 'rgba(211,85,47,0.1)',
                border: '1px solid rgba(211,85,47,0.28)',
                color: itemCount > 0 ? 'white' : '#ff8060',
                cursor: 'pointer', position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: itemCount > 0 ? '0 4px 18px rgba(211,85,47,0.4)' : 'none',
                transition: 'background 0.2s, box-shadow 0.2s',
              }}
            >
              <ShoppingCart size={15} />
              <AnimatePresence>
                {itemCount > 0 && (
                  <motion.span
                    key="badge"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={spring}
                    style={{
                      position: 'absolute', top: -4, right: -4,
                      width: 16, height: 16, borderRadius: '50%',
                      background: '#ffffff', color: '#d3552f',
                      fontSize: '9px', fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                    }}
                  >
                    {itemCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main style={{ maxWidth: '768px', margin: '0 auto', position: 'relative', zIndex: 1, paddingBottom: '120px' }}>
        <HeroBanner restaurant={restaurant} table={table} />

        {/* Category chips */}
        {usedCategories.length > 0 && (
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '14px 0' }}>
            <div
              style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '0 16px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <CategoryPill label="All" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
              {usedCategories.map((cat) => (
                <CategoryPill
                  key={cat.id}
                  label={cat.name}
                  active={activeCategory === cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Featured strip */}
        <AnimatePresence>
          {showFeatured && (
            <motion.div
              key="featured"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <FeaturedStrip
                items={availableItems}
                currency={currency}
                onNavigate={(id) => navigate(`/r/${restaurantSlug}/item/${id}`)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Menu list */}
        <div style={{ padding: '20px 16px 8px' }}>
          {/* Section label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <div style={{ width: 16, height: 2, borderRadius: 1, background: 'linear-gradient(90deg, #d3552f, transparent)' }} />
            <p style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2.5px', color: 'rgba(211,85,47,0.85)' }}>
              {searchQuery ? `Results for "${searchQuery}"` : sectionLabel}
            </p>
          </div>

          {filteredItems.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ textAlign: 'center', padding: '64px 0', color: 'rgba(255,255,255,0.25)' }}
            >
              <p style={{ fontSize: '3.5rem', marginBottom: '14px' }}>🍽</p>
              <p style={{ fontWeight: 700, color: 'rgba(255,255,255,0.45)', fontSize: '0.95rem' }}>No items found</p>
              {searchQuery && <p style={{ fontSize: '0.8rem', marginTop: '6px', color: 'rgba(255,255,255,0.3)' }}>Try a different search term</p>}
            </motion.div>
          ) : (
            <motion.div
              layout
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <AnimatePresence>
                {filteredItems.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    currency={currency}
                    onAdd={() => handleAdd(item)}
                    onNavigate={() => navigate(`/r/${restaurantSlug}/item/${item.id}`)}
                    onAR={() => setArModel(item.ar_model_url)}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </main>

      {/* ── Track order floating bar ──────────────────────────────── */}
      <AnimatePresence>
        {itemCount === 0 && recentOrderId && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={spring}
            style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, padding: '0 16px 20px' }}
          >
            <div style={{ maxWidth: '480px', margin: '0 auto' }}>
              <motion.button
                type="button"
                onClick={() => navigate(`/r/${restaurantSlug}/order/${recentOrderId}`)}
                whileHover={{ scale: 1.015, boxShadow: '0 16px 48px rgba(100,60,255,0.25)' }}
                whileTap={{ scale: 0.98 }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                  background: 'rgba(18,16,40,0.92)',
                  border: '1px solid rgba(120,80,255,0.28)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  borderRadius: '18px',
                  padding: '14px 20px',
                  color: 'white', cursor: 'pointer',
                  boxShadow: '0 8px 36px rgba(0,0,0,0.55)',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(120,80,255,0.15)', border: '1px solid rgba(120,80,255,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <ClipboardList size={16} style={{ color: '#a78bfa' }} />
                </div>
                <span style={{ fontWeight: 700, flex: 1, textAlign: 'left', fontSize: '0.9rem' }}>Track Your Order</span>
                <ArrowRight size={16} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cart floating bar ─────────────────────────────────────── */}
      <AnimatePresence>
        {itemCount > 0 && !cartOpen && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={spring}
            style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, padding: '0 16px 20px' }}
          >
            <div style={{ maxWidth: '480px', margin: '0 auto' }}>
              <motion.button
                type="button"
                onClick={() => setCartOpen(true)}
                whileHover={{ scale: 1.015, boxShadow: '0 16px 48px rgba(211,85,47,0.5)' }}
                whileTap={{ scale: 0.98 }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'linear-gradient(135deg, #c04020 0%, #d3552f 50%, #e8673f 100%)',
                  borderRadius: '18px',
                  padding: '14px 20px',
                  color: 'white', cursor: 'pointer', border: 'none',
                  boxShadow: '0 8px 36px rgba(211,85,47,0.5)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    background: 'rgba(255,255,255,0.22)',
                    borderRadius: '50%', width: 26, height: 26, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 900,
                  }}>{itemCount}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.92rem', letterSpacing: '0.2px' }}>View Cart</span>
                </span>
                <span style={{ fontWeight: 900, fontSize: '0.95rem' }}>
                  {formatCurrency(subtotal, currency)}
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />
      {arModel && <ARViewer src={arModel} alt="3D dish preview" onClose={() => setArModel(null)} />}
    </div>
  )
}
