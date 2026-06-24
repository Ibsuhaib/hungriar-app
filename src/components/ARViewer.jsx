import { useEffect, useState } from 'react'

/**
 * Fullscreen modal that lazy-loads @google/model-viewer and renders a
 * .glb (via `src`) or .usdz (via `ios-src`, for AR Quick Look on iOS) model
 * with rotate/zoom/AR support.
 */
export default function ARViewer({ src, alt = '3D preview', poster, onClose }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    import('@google/model-viewer').then(() => {
      if (mounted) setReady(true)
    })
    return () => {
      mounted = false
    }
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close 3D viewer"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow hover:bg-white"
        >
          ✕
        </button>

        {!ready && (
          <div className="flex flex-1 items-center justify-center">
            <div className="skeleton h-24 w-24 rounded-full" />
          </div>
        )}

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

        <div className="border-t bg-white px-4 py-2 text-center text-xs text-gray-500">
          Drag to rotate &middot; Pinch or scroll to zoom &middot; Tap the AR icon on a supported phone to view in your space
        </div>
      </div>
    </div>
  )
}
