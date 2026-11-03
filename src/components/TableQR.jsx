import { useState, useCallback, useEffect, useRef } from 'react'
import QRCodeStyling from 'qr-code-styling'
import toast from 'react-hot-toast'
import { Download, Link2, RefreshCw, ShieldAlert } from 'lucide-react'
import { invokeEdgeFunction, supabase } from '../lib/supabase'
import { buildQrUrl, copyToClipboard } from '../utils/qrGenerator'
import { useRateLimit } from '../hooks/useRateLimit'
import { useAuth } from '../contexts/AuthContext'

/**
 * Permanent signed QR code (HMAC token, never expires).
 * Supports 4 visual styles — pick before downloading for print.
 */

const QR_SIZE = 200

const QR_STYLES = [
  {
    id: 'classic',
    label: 'Classic',
    dot: '#111827',
    bg: '#ffffff',
    options: {
      dotsOptions:          { type: 'square',        color: '#111827' },
      cornersSquareOptions: { type: 'square',        color: '#111827' },
      cornersDotOptions:    { type: 'square',        color: '#111827' },
      backgroundOptions:    { color: '#ffffff' },
    },
  },
  {
    id: 'branded',
    label: 'Branded',
    dot: '#D4A373',
    bg: '#ffffff',
    options: {
      dotsOptions:          { type: 'rounded',       color: '#D4A373' },
      cornersSquareOptions: { type: 'extra-rounded', color: '#D4A373' },
      cornersDotOptions:    { type: 'dot',           color: '#D4A373' },
      backgroundOptions:    { color: '#ffffff' },
    },
  },
  {
    id: 'dark',
    label: 'Dark',
    dot: '#a5b4fc',
    bg: '#1e1b4b',
    options: {
      dotsOptions:          { type: 'dots',          color: '#e0e7ff' },
      cornersSquareOptions: { type: 'extra-rounded', color: '#a5b4fc' },
      cornersDotOptions:    { type: 'dot',           color: '#a5b4fc' },
      backgroundOptions:    { color: '#1e1b4b' },
    },
  },
  {
    id: 'elegant',
    label: 'Elegant',
    dot: '#1a1a2e',
    bg: '#fffbf5',
    options: {
      dotsOptions:          { type: 'classy-rounded', color: '#1a1a2e' },
      cornersSquareOptions: { type: 'extra-rounded',  color: '#D4A373' },
      cornersDotOptions:    { type: 'dot',            color: '#D4A373' },
      backgroundOptions:    { color: '#fffbf5' },
    },
  },
]

// Tiny swatch preview that shows how the style looks
function StyleSwatch({ style, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={style.label}
      style={{ background: style.bg }}
      className={`relative flex-1 h-10 rounded-xl border-2 transition-all duration-150 flex items-center justify-center gap-1.5 overflow-hidden
        ${selected ? 'border-primary-500 shadow-md scale-105' : 'border-transparent hover:border-gray-300'}`}
    >
      {/* Three fake QR dots */}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{ background: style.dot }}
          className={`w-2 h-2 ${style.id === 'classic' ? 'rounded-none' : style.id === 'dark' || style.id === 'branded' ? 'rounded-full' : 'rounded-sm'}`}
        />
      ))}
      {selected && (
        <span className="absolute inset-0 ring-2 ring-primary-500 ring-inset rounded-xl pointer-events-none" />
      )}
    </button>
  )
}

export default function TableQR({ table, restaurantId }) {
  const [qrUrl,      setQrUrl]      = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [styleId,    setStyleId]    = useState('branded')
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting,  setResetting]  = useState(false)
  const containerRef = useRef(null)
  const qrRef        = useRef(null)   // holds the QRCodeStyling instance

  const { checkAdminLimit } = useRateLimit()
  const { user } = useAuth()

  const selectedStyle = QR_STYLES.find((s) => s.id === styleId) ?? QR_STYLES[0]

  // Re-render QR whenever URL or style changes
  useEffect(() => {
    if (!qrUrl || !containerRef.current) return

    // Tear down previous instance
    containerRef.current.innerHTML = ''

    qrRef.current = new QRCodeStyling({
      width:  QR_SIZE,
      height: QR_SIZE,
      type:   'canvas',
      data:   qrUrl,
      margin: 10,
      qrOptions: { errorCorrectionLevel: 'M' },
      ...selectedStyle.options,
    })

    qrRef.current.append(containerRef.current)
  }, [qrUrl, styleId]) // eslint-disable-line react-hooks/exhaustive-deps

  const generate = useCallback(async () => {
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    setLoading(true)
    try {
      const result = await invokeEdgeFunction('generate-table-token', { restaurantId, tableId: table.id })
      setQrUrl(buildQrUrl(result.restaurantSlug, result.token))
    } catch (err) {
      toast.error(err.message || 'Failed to generate QR code')
    } finally {
      setLoading(false)
    }
  }, [restaurantId, table.id, checkAdminLimit, user?.id])

  // "Regenerate" makes a new code but every old one keeps working, so it does
  // not stop someone ordering from a photo. Reset revokes all previous codes
  // for this table, then issues the replacement to print.
  const resetQr = async () => {
    setResetting(true)
    try {
      const { error } = await supabase.rpc('reset_table_qr', { p_table_id: table.id })
      if (error) throw error
      await generate()
      toast.success(`Old QR codes for Table ${table.table_number} no longer work. Print this new one.`, { duration: 6000 })
    } catch (err) {
      toast.error(err.message || 'Could not reset the QR code')
    } finally {
      setResetting(false)
      setConfirmReset(false)
    }
  }

  const handleDownload = () => {
    if (!qrRef.current) return
    qrRef.current.download({ name: `table-${table.table_number}-qr-${styleId}`, extension: 'png' })
  }

  const handleCopy = async () => {
    if (!qrUrl) return
    try {
      await copyToClipboard(qrUrl)
      toast.success('Link copied to clipboard')
    } catch {
      toast.error('Could not copy link. Please copy it manually.')
    }
  }

  return (
    <div className="card flex flex-col items-center gap-3 text-center p-4">
      <p className="font-bold text-gray-900 text-sm">Table {table.table_number}</p>

      {confirmReset ? (
        <div className="w-full rounded-xl bg-red-50 border border-red-100 p-3 text-left">
          <p className="text-xs text-red-800 leading-relaxed">
            Every old copy and photo of this table&apos;s QR will stop working, and so will its
            NFC tag (it holds the same link). Print and stick up the new QR, write the new link
            to the NFC tag, and anyone seated here now will have to scan or tap again.
          </p>
          <div className="flex gap-2 mt-2.5">
            <button type="button" onClick={() => setConfirmReset(false)} disabled={resetting}
              className="flex-1 py-2 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-600">
              Cancel
            </button>
            <button type="button" onClick={resetQr} disabled={resetting}
              className="flex-1 py-2 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-50">
              {resetting ? 'Resetting…' : 'Reset QR'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmReset(true)}
          title="Use if someone is ordering from a photo of this table's QR"
          className="flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-700">
          <ShieldAlert className="w-3 h-3" /> Reset QR (stop old copies working)
        </button>
      )}

      {qrUrl ? (
        <>
          {/* QR canvas */}
          <div
            className="rounded-xl overflow-hidden shadow-md"
            style={{ background: selectedStyle.options.backgroundOptions.color, padding: 4 }}
          >
            <div ref={containerRef} style={{ width: QR_SIZE, height: QR_SIZE }} />
          </div>

          {/* Style picker */}
          <div className="w-full">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Style</p>
            <div className="flex gap-1.5">
              {QR_STYLES.map((s) => (
                <StyleSwatch
                  key={s.id}
                  style={s}
                  selected={styleId === s.id}
                  onClick={() => setStyleId(s.id)}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1 px-0.5">
              {QR_STYLES.map((s) => (
                <span key={s.id} className={`flex-1 text-center text-[9px] font-medium ${styleId === s.id ? 'text-primary-600' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex w-full gap-2">
            <button type="button" onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold transition-colors">
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button type="button" onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-semibold transition-colors">
              <Link2 className="w-3.5 h-3.5" /> Copy Link
            </button>
          </div>

          <button type="button" onClick={generate} disabled={loading}
            className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Regenerating…' : 'Regenerate'}
          </button>
        </>
      ) : (
        <button type="button" onClick={generate} disabled={loading} className="btn-primary w-full">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Generating…
            </span>
          ) : 'Generate QR Code'}
        </button>
      )}
    </div>
  )
}
