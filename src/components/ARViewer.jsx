import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RotateCcw, ZoomIn } from 'lucide-react'

/**
 * Fullscreen modal with glassmorphism backdrop — lazy-loads @google/model-viewer
 * and renders a .glb (via `src`) or .usdz (via `ios-src`, for AR Quick Look on
 * iOS) model with rotate/zoom/AR support.
 */
export default function ARViewer({ src, alt = '3D preview', poster, onClose }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    import('@google/model-viewer').then(() => {
      if (mounted) setReady(true)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  const isUsdz = (src || '').toLowerCase().endsWith('.usdz')

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl"
          style={{ height: 'min(75vh, 600px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Glass-effect header bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
            style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(255,255,255,0))', backdropFilter: 'blur(4px)' }}
          >
            <span className="text-sm font-semibold text-gray-700">{alt}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close 3D viewer"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-sm hover:bg-white hover:shadow-md transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Loading state */}
          {!ready && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-sand-50">
              <div className="w-12 h-12 rounded-2xl bg-sand-200 animate-pulse" />
              <p className="text-sm text-gray-400">Loading 3D model…</p>
            </div>
          )}

          {/* Model viewer */}
          {ready && (
            // eslint-disable-next-line react/no-unknown-property
            <model-viewer
              src={isUsdz ? undefined : src}
              ios-src={isUsdz ? src : undefined}
              poster={poster}
              alt={alt}
              camera-controls
              auto-rotate
              ar
              ar-modes="webxr scene-viewer quick-look"
              shadow-intensity="1"
              style={{ width: '100%', height: '100%', backgroundColor: '#fff8f0', flex: '1 1 auto' }}
            >
              <div slot="progress-bar" />
              {isUsdz && (
                <div slot="poster" className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-gray-600">
                  <p>This 3D model is optimised for AR Quick Look.</p>
                  <p>Open this page on an iPhone or iPad and tap &quot;View in your space&quot; below.</p>
                </div>
              )}
            </model-viewer>
          )}

          {/* Footer hint */}
          <div className="border-t border-gray-100 bg-white/95 px-4 py-2.5 text-center">
            <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Drag to rotate</span>
              <span className="text-gray-200">·</span>
              <span className="flex items-center gap-1"><ZoomIn className="w-3 h-3" /> Pinch to zoom</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
