import { useState, useCallback } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import toast from 'react-hot-toast'
import { invokeEdgeFunction } from '../lib/supabase'
import { buildQrUrl, downloadQrCanvas, copyToClipboard } from '../utils/qrGenerator'
import { useRateLimit } from '../hooks/useRateLimit'
import { useAuth } from '../contexts/AuthContext'

/**
 * Generates and displays a permanent signed QR code for a single table.
 * Token is HMAC-signed (never expires). Regenerate only if a sticker is lost.
 */
export default function TableQR({ table, restaurantId }) {
  const [qrUrl, setQrUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const { checkAdminLimit } = useRateLimit()
  const { user } = useAuth()

  const canvasId = `qr-canvas-${table.id}`

  const generate = useCallback(async () => {
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    setLoading(true)
    try {
      const result = await invokeEdgeFunction('generate-table-token', {
        restaurantId,
        tableId: table.id,
      })
      setQrUrl(buildQrUrl(result.restaurantSlug, result.token))
    } catch (err) {
      toast.error(err.message || 'Failed to generate QR code')
    } finally {
      setLoading(false)
    }
  }, [restaurantId, table.id, checkAdminLimit, user?.id])

  const handleDownload = () => {
    try {
      downloadQrCanvas(canvasId, `table-${table.table_number}-qr.png`)
    } catch (err) {
      toast.error(err.message)
    }
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
    <div className="card flex flex-col items-center gap-3 text-center">
      <p className="font-semibold text-gray-900">Table {table.table_number}</p>

      {qrUrl ? (
        <>
          <div className="rounded-lg border border-gray-200 p-3">
            <QRCodeCanvas id={canvasId} value={qrUrl} size={160} includeMargin level="M" />
          </div>
          <div className="flex w-full gap-2">
            <button type="button" onClick={handleDownload} className="btn-outline flex-1 text-xs">
              Download PNG
            </button>
            <button type="button" onClick={handleCopy} className="btn-outline flex-1 text-xs">
              Copy Link
            </button>
          </div>
          <button type="button" onClick={generate} disabled={loading} className="text-xs font-medium text-secondary-600 hover:underline disabled:opacity-50">
            {loading ? 'Regenerating...' : 'Regenerate QR'}
          </button>
        </>
      ) : (
        <button type="button" onClick={generate} disabled={loading} className="btn-primary w-full">
          {loading ? 'Generating...' : 'Generate QR Code'}
        </button>
      )}
    </div>
  )
}
