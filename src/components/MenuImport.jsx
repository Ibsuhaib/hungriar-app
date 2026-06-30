import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  X, Download, Upload, CheckCircle2, AlertTriangle,
  ChevronRight, ImageIcon, SkipForward,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { uploadAsset } from '../lib/storage'
import { formatCurrency } from '../utils/formatters'

// ─── Robust RFC-4180 CSV parser ───────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  const parseRow = (line) => {
    const fields = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        i++
        let field = ''
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2 }
          else if (line[i] === '"') { i++; break }
          else field += line[i++]
        }
        fields.push(field)
        if (line[i] === ',') i++
      } else {
        const end = line.indexOf(',', i)
        if (end === -1) { fields.push(line.slice(i).trim()); break }
        fields.push(line.slice(i, end).trim())
        i = end + 1
      }
    }
    // handle trailing comma producing an extra empty field
    return fields
  }

  const nonEmpty = lines.filter(l => l.trim())
  if (nonEmpty.length < 2) return []

  const headers = parseRow(nonEmpty[0]).map(h =>
    h.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '').trim()
  )
  return nonEmpty.slice(1).map(line => {
    const vals = parseRow(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] !== undefined ? vals[i] : '' })
    return obj
  })
}

// ─── Filename → item-name normaliser for auto-match ──────────────────────────

function normalizeStr(str) {
  return str
    .toLowerCase()
    .replace(/\.[^.]+$/, '')       // strip extension
    .replace(/[-_]+/g, ' ')        // hyphens/underscores → space
    .replace(/[^a-z0-9 ]/g, '')    // strip special chars
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Template CSV (header + 2 example rows) ──────────────────────────────────

const TEMPLATE = [
  'name,description,price,category,image_url,ar_model_url',
  '"Butter Chicken","Rich tomato gravy, served with rice",320,"Main Course",,',
  '"Garlic Naan","Fresh tandoor bread",60,"Breads",,',
].join('\n')

function downloadTemplate() {
  const blob = new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'menu_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MenuImport({
  restaurantId,
  currency,
  existingCategories,
  userId,
  checkAdminLimit,
  onSuccess,
  onClose,
}) {
  // phases: csv | preview | importing | images | done
  const [phase, setPhase]               = useState('csv')

  // preview phase
  const [validRows, setValidRows]       = useState([])
  const [skippedCount, setSkippedCount] = useState(0)
  const [newCatNames, setNewCatNames]   = useState([])

  // importing phase
  const [importProgress, setImportProgress] = useState(0)
  const [importTotal,    setImportTotal]     = useState(0)

  // image queue phase
  const [imageQueue, setImageQueue]     = useState([]) // [{id, name}] items without images
  const [queueIdx,   setQueueIdx]       = useState(0)
  const [queueFile,  setQueueFile]      = useState(null)
  const [queuePreview, setQueuePreview] = useState(null)
  const [queueUploading, setQueueUploading] = useState(false)

  // bulk upload
  const [bulkUploading, setBulkUploading]   = useState(false)
  const [bulkProgress,  setBulkProgress]    = useState({ done: 0, total: 0 })

  const csvInputRef    = useRef(null)
  const queueInputRef  = useRef(null)
  const bulkInputRef   = useRef(null)

  // ─ Step 1: parse uploaded CSV ─────────────────────────────────────────────

  const handleCSVFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result)
      const valid = []; let skipped = 0
      for (const row of rows) {
        const name  = (row.name  || '').trim()
        const price = parseFloat(row.price)
        if (!name || isNaN(price) || price < 0) { skipped++; continue }
        valid.push({
          name,
          description:  (row.description  || '').trim() || null,
          price,
          category:     (row.category     || '').trim() || null,
          image_url:    (row.image_url    || '').trim() || null,
          ar_model_url: (row.ar_model_url || '').trim() || null,
        })
      }

      const existingNames = new Set(existingCategories.map(c => c.name.toLowerCase()))
      const csvCatNames   = [...new Set(valid.map(r => r.category).filter(Boolean))]
      const newCats       = csvCatNames.filter(n => !existingNames.has(n.toLowerCase()))

      setValidRows(valid)
      setSkippedCount(skipped)
      setNewCatNames(newCats)
      setPhase('preview')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ─ Step 2: run the import ─────────────────────────────────────────────────

  const handleImport = async () => {
    const allowed = await checkAdminLimit(userId)
    if (!allowed) return
    setPhase('importing')
    setImportTotal(validRows.length)
    setImportProgress(0)

    try {
      // Build category id map (existing + newly created)
      const catMap = Object.fromEntries(
        existingCategories.map(c => [c.name.toLowerCase(), c.id])
      )
      let maxOrder = existingCategories.reduce((m, c) => Math.max(m, c.display_order || 0), 0)

      for (const catName of newCatNames) {
        maxOrder++
        const { data, error } = await supabase
          .from('categories')
          .insert({ restaurant_id: restaurantId, name: catName, display_order: maxOrder })
          .select('id, name')
          .single()
        if (!error && data) catMap[catName.toLowerCase()] = data.id
      }

      // Insert in chunks of 50
      const CHUNK = 50
      let done = 0
      const inserted = []
      const allItems = validRows.map((row, i) => ({
        restaurant_id: restaurantId,
        name:          row.name,
        description:   row.description,
        price:         row.price,
        category_id:   row.category ? (catMap[row.category.toLowerCase()] || null) : null,
        image_url:     row.image_url    || null,
        ar_model_url:  row.ar_model_url || null,
        available:     true,
        display_order: 1000 + i,
      }))

      for (let i = 0; i < allItems.length; i += CHUNK) {
        const { data, error } = await supabase
          .from('menu_items')
          .insert(allItems.slice(i, i + CHUNK))
          .select('id, name, image_url')
        if (error) throw error
        inserted.push(...(data || []))
        done += Math.min(CHUNK, allItems.length - i)
        setImportProgress(done)
      }

      const noImage = inserted.filter(item => !item.image_url)
      setImageQueue(noImage)
      setQueueIdx(0)
      onSuccess()
      setPhase('images')
    } catch (err) {
      toast.error(err.message || 'Import failed')
      setPhase('csv')
    }
  }

  // ─ Bulk filename-match upload ─────────────────────────────────────────────

  const handleBulkImages = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const allowed = await checkAdminLimit(userId)
    if (!allowed) { e.target.value = ''; return }

    setBulkUploading(true)
    setBulkProgress({ done: 0, total: files.length })

    const updatedIds = new Set()
    let done = 0

    for (const file of files) {
      const normalizedFile = normalizeStr(file.name)
      const matchedItem = imageQueue.find(item =>
        !updatedIds.has(item.id) && normalizeStr(item.name) === normalizedFile
      )

      if (matchedItem) {
        try {
          const url = await uploadAsset(restaurantId, 'images', file)
          await supabase.from('menu_items').update({ image_url: url }).eq('id', matchedItem.id)
          updatedIds.add(matchedItem.id)
        } catch { /* skip this file, leave item in queue */ }
      }

      done++
      setBulkProgress({ done, total: files.length })
    }

    const remaining = imageQueue.filter(item => !updatedIds.has(item.id))
    setImageQueue(remaining)
    setQueueIdx(0)

    const matched = updatedIds.size
    const unmatched = files.length - matched
    if (matched > 0) toast.success(`${matched} image${matched !== 1 ? 's' : ''} matched and uploaded!`)
    if (unmatched > 0) toast(`${unmatched} file${unmatched !== 1 ? 's' : ''} had no matching item name`, { icon: 'ℹ️' })

    setBulkUploading(false)
    e.target.value = ''
    onSuccess()
  }

  // ─ One-by-one queue ───────────────────────────────────────────────────────

  const handleQueueFilePick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (queuePreview) URL.revokeObjectURL(queuePreview)
    setQueueFile(file)
    setQueuePreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  const advanceQueue = () => {
    if (queuePreview) URL.revokeObjectURL(queuePreview)
    setQueueFile(null)
    setQueuePreview(null)
    if (queueIdx + 1 >= imageQueue.length) setPhase('done')
    else setQueueIdx(i => i + 1)
  }

  const handleQueueSave = async () => {
    if (!queueFile || queueUploading) return
    const allowed = await checkAdminLimit(userId)
    if (!allowed) return
    setQueueUploading(true)
    try {
      const url = await uploadAsset(restaurantId, 'images', queueFile)
      await supabase.from('menu_items').update({ image_url: url }).eq('id', imageQueue[queueIdx].id)
      toast.success(`Image saved for ${imageQueue[queueIdx].name}`)
      onSuccess()
    } catch (err) {
      toast.error(err.message || 'Upload failed')
      setQueueUploading(false)
      return
    }
    setQueueUploading(false)
    advanceQueue()
  }

  const currentItem = imageQueue[queueIdx]

  // ─ Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={['csv', 'done'].includes(phase) ? onClose : undefined}
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ pointerEvents: 'none' }}
      >
        <div
          className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >

          {/* ── Modal header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {phase === 'csv'       && 'Import Menu from CSV'}
                {phase === 'preview'   && `Review — ${validRows.length} items found`}
                {phase === 'importing' && 'Importing items…'}
                {phase === 'images'    && `Add Images — ${imageQueue.length} remaining`}
                {phase === 'done'      && 'Import Complete ✅'}
              </h2>
              {phase === 'preview' && (
                <p className="text-xs text-gray-400 mt-0.5">Check the list then click Import</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={phase === 'importing'}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-30"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Scrollable body ── */}
          <div className="overflow-y-auto flex-1">

            {/* ── CSV upload ── */}
            {phase === 'csv' && (
              <div className="px-6 py-6 space-y-5">
                <div className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3 space-y-1.5">
                  <p className="text-sm font-semibold text-blue-900">How it works</p>
                  <ol className="text-xs text-blue-700 space-y-0.5 list-decimal list-inside leading-relaxed">
                    <li>Download the template below</li>
                    <li>Fill in your items — delete the 2 example rows first</li>
                    <li>Upload the file — items are created instantly</li>
                    <li>Add photos after (optional, one by one or auto-matched)</li>
                  </ol>
                </div>

                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-semibold text-gray-700"
                >
                  <Download className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  Download CSV Template (menu_template.csv)
                </button>

                <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 hover:border-primary-300 hover:bg-primary-50 transition-colors cursor-pointer min-h-[120px] px-4 py-6 text-center">
                  <Upload className="w-8 h-8 text-gray-300" />
                  <div>
                    <p className="text-sm font-semibold text-gray-600">Click to upload your CSV file</p>
                    <p className="text-xs text-gray-400 mt-0.5">.csv files only</p>
                  </div>
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={handleCSVFile}
                  />
                </label>

                <p className="text-xs text-gray-400 text-center">
                  Categories in the CSV are created automatically if they don't exist yet
                </p>
              </div>
            )}

            {/* ── Preview ── */}
            {phase === 'preview' && (
              <div className="px-6 py-4 space-y-3">
                {(skippedCount > 0 || newCatNames.length > 0) && (
                  <div className="space-y-2">
                    {skippedCount > 0 && (
                      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        {skippedCount} row{skippedCount !== 1 ? 's' : ''} skipped — missing name or invalid price
                      </div>
                    )}
                    {newCatNames.length > 0 && (
                      <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-500" />
                        <span>
                          New categories will be created:{' '}
                          <span className="font-semibold">{newCatNames.join(', ')}</span>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-500 font-semibold">Name</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-semibold whitespace-nowrap">Price</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-semibold hidden sm:table-cell">Category</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-semibold hidden sm:table-cell">Image</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {validRows.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50/50">
                          <td className="px-3 py-2 text-gray-800 font-medium">
                            <span className="line-clamp-1">{row.name}</span>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600 tabular-nums whitespace-nowrap">
                            {formatCurrency(row.price, currency)}
                          </td>
                          <td className="px-3 py-2 text-gray-400 hidden sm:table-cell">{row.category || '—'}</td>
                          <td className="px-3 py-2 hidden sm:table-cell">
                            {row.image_url
                              ? <span className="text-green-600 font-medium">✓ URL</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Importing progress ── */}
            {phase === 'importing' && (
              <div className="px-6 py-14 flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" />
                </div>
                <p className="text-sm font-semibold text-gray-700">
                  Adding items… {importProgress} / {importTotal}
                </p>
                <div className="w-full max-w-xs h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-300"
                    style={{ width: `${importTotal ? (importProgress / importTotal) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* ── Image queue ── */}
            {phase === 'images' && (
              <div className="px-6 py-5 space-y-5">
                {imageQueue.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <CheckCircle2 className="w-10 h-10 text-secondary-400 mx-auto" />
                    <p className="text-sm font-semibold text-gray-700">All items imported!</p>
                    <p className="text-xs text-gray-400">No items need images — they had URLs in the CSV, or you can add photos later.</p>
                  </div>
                ) : (
                  <>
                    {/* Bulk auto-match */}
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
                      <div>
                        <p className="text-sm font-bold text-gray-800">Option 1 — Upload all images at once (auto-match)</p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          Name each image file exactly like the item name —
                          e.g. <span className="font-mono bg-white px-1 rounded border border-gray-200">butter-chicken.jpg</span> for "Butter Chicken".
                          Spaces, hyphens and underscores are treated the same.
                        </p>
                      </div>

                      {bulkUploading ? (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-gray-600">
                            Uploading {bulkProgress.done} / {bulkProgress.total}…
                          </p>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-500 rounded-full transition-all duration-200"
                              style={{ width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 w-fit px-4 py-2.5 rounded-xl bg-white border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                          <Upload className="w-4 h-4 text-gray-500" />
                          <span className="text-sm font-semibold text-gray-700">
                            Select all images ({imageQueue.length} items need photos)
                          </span>
                          <input
                            ref={bulkInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            onChange={handleBulkImages}
                          />
                        </label>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs text-gray-400 font-medium">or add one at a time</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>

                    {/* One-by-one queue */}
                    {currentItem && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Option 2 — One by one
                          </p>
                          <p className="text-xs text-gray-400 font-medium">
                            {queueIdx + 1} of {imageQueue.length}
                          </p>
                        </div>

                        {/* Image preview / pick zone */}
                        <div
                          className="relative rounded-2xl overflow-hidden bg-gray-100 cursor-pointer border-2 border-dashed border-gray-200 hover:border-primary-300 transition-colors"
                          style={{ aspectRatio: '16/9' }}
                          onClick={() => queueInputRef.current?.click()}
                        >
                          {queuePreview ? (
                            <img src={queuePreview} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 select-none">
                              <ImageIcon className="w-10 h-10 text-gray-300" />
                              <p className="text-xs text-gray-400 font-medium">Tap to pick photo</p>
                            </div>
                          )}
                          <input
                            ref={queueInputRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={handleQueueFilePick}
                          />
                        </div>

                        {/* Item name chip */}
                        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-2.5">
                          <div className="w-2 h-2 rounded-full bg-primary-400 flex-shrink-0" />
                          <p className="text-sm font-bold text-gray-900 truncate">{currentItem.name}</p>
                          {queuePreview && (
                            <span className="ml-auto text-xs text-green-600 font-semibold flex-shrink-0">✓ ready to save</span>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Done ── */}
            {phase === 'done' && (
              <div className="px-6 py-14 flex flex-col items-center gap-3 text-center">
                <CheckCircle2 className="w-12 h-12 text-secondary-500" />
                <p className="text-base font-bold text-gray-900">All done!</p>
                <p className="text-sm text-gray-500 max-w-xs">
                  Items are live on your menu. Add remaining images anytime from Menu Management.
                </p>
              </div>
            )}
          </div>

          {/* ── Footer actions ── */}
          <div className="border-t border-gray-100 px-6 py-4 flex-shrink-0">
            {phase === 'csv' && (
              <button type="button" onClick={onClose} className="btn-outline w-full">Cancel</button>
            )}

            {phase === 'preview' && (
              <div className="flex gap-3">
                <button type="button" onClick={() => setPhase('csv')} className="btn-outline flex-1">Back</button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={validRows.length === 0}
                  className="btn-primary flex-1 gap-1.5 disabled:opacity-40"
                >
                  Import {validRows.length} Items
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {phase === 'images' && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPhase('done')}
                  className="btn-outline flex-1 text-sm"
                >
                  Done — add images later
                </button>
                {currentItem && imageQueue.length > 0 && (
                  <button
                    type="button"
                    onClick={queueFile ? handleQueueSave : advanceQueue}
                    disabled={queueUploading}
                    className="btn-primary flex-1 text-sm gap-1.5 disabled:opacity-40"
                  >
                    {queueUploading ? (
                      <>
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Saving…
                      </>
                    ) : queueFile ? (
                      <>Save & Next <ChevronRight className="w-3.5 h-3.5" /></>
                    ) : (
                      <>Skip <SkipForward className="w-3.5 h-3.5" /></>
                    )}
                  </button>
                )}
              </div>
            )}

            {(phase === 'done' || (phase === 'images' && imageQueue.length === 0)) && (
              <button type="button" onClick={onClose} className="btn-primary w-full">
                Go to Menu Management
              </button>
            )}
          </div>

        </div>
      </motion.div>
    </>
  )
}
