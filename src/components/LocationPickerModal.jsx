import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { X, LocateFixed, Search, MapPin, Loader2 } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Draggable-pin map picker (Leaflet + OpenStreetMap tiles — no API key).
// Search an address to jump close, then drag the pin (or tap the map) to the
// exact spot. Returns { lat, lng } via onSave.

const INDIA_CENTER = [20.5937, 78.9629]

const PIN_ICON = L.divIcon({
  className: '',
  html: `<svg width="34" height="46" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35))">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#d4a373" stroke="#7f5030" stroke-width="1"/>
    <circle cx="12" cy="9" r="2.6" fill="#ffffff"/>
  </svg>`,
  iconSize: [34, 46],
  iconAnchor: [17, 44],
})

async function searchNominatim(q) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=6&countrycodes=in`,
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) throw new Error('search failed')
  return res.json()
}

export default function LocationPickerModal({ open, onClose, onSave, initialLat = null, initialLng = null }) {
  const mapElRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const debounceRef = useRef(null)
  const [pos, setPos] = useState(null) // { lat, lng }
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)

  const placePin = (lat, lng, zoom) => {
    setPos({ lat, lng })
    if (markerRef.current) markerRef.current.setLatLng([lat, lng])
    if (mapRef.current) mapRef.current.setView([lat, lng], zoom ?? mapRef.current.getZoom())
  }

  // Build/destroy the map when the modal opens/closes
  useEffect(() => {
    if (!open || !mapElRef.current) return

    const hasInitial = initialLat != null && initialLng != null
    const center = hasInitial ? [Number(initialLat), Number(initialLng)] : INDIA_CENTER
    const zoom = hasInitial ? 17 : 5

    const map = L.map(mapElRef.current, { center, zoom, zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    const marker = L.marker(center, { draggable: true, icon: PIN_ICON, autoPan: true }).addTo(map)
    marker.on('dragend', () => {
      const p = marker.getLatLng()
      setPos({ lat: p.lat, lng: p.lng })
    })
    map.on('click', (e) => {
      marker.setLatLng(e.latlng)
      setPos({ lat: e.latlng.lat, lng: e.latlng.lng })
    })

    mapRef.current = map
    markerRef.current = marker
    if (hasInitial) setPos({ lat: Number(initialLat), lng: Number(initialLng) })

    // Leaflet miscalculates size inside animated modals — recalc after paint
    setTimeout(() => map.invalidateSize(), 60)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      setPos(null)
      setQuery('')
      setResults(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced address search
  useEffect(() => {
    if (!open) return
    clearTimeout(debounceRef.current)
    if (query.trim().length < 3) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        setResults(await searchNominatim(query))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 500)
    return () => clearTimeout(debounceRef.current)
  }, [query, open])

  const useMyLocation = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { placePin(p.coords.latitude, p.coords.longitude, 17); setLocating(false) },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  if (!open) return null

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-3"
      >
        <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <h3 className="text-base font-bold text-gray-900">Set exact restaurant location</h3>
              <p className="text-xs text-gray-400 mt-0.5">Search to get close, then drag the pin to your door</p>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 flex-shrink-0">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Search + locate */}
          <div className="px-4 pt-3 pb-2 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your address, area or landmark…"
                  className="input pl-9 w-full text-sm"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-300" />}
              </div>
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                title="Center on my current location"
                className="btn-outline px-3 flex-shrink-0"
              >
                {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
              </button>
            </div>

            {results !== null && (
              <div className="max-h-36 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-50">
                {results.length === 0 && !searching ? (
                  <p className="px-3 py-2 text-xs text-gray-400">No places found — try a broader name.</p>
                ) : (
                  results.map((r, i) => (
                    <button
                      key={`${r.lat}-${r.lon}-${i}`}
                      type="button"
                      onClick={() => { placePin(Number(r.lat), Number(r.lon), 17); setResults(null); setQuery('') }}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-gray-50"
                    >
                      <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary-500" />
                      <span className="text-xs text-gray-700 leading-snug">{r.display_name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Map */}
          <div ref={mapElRef} className="h-[42vh] min-h-[260px] w-full bg-gray-100" />

          {/* Footer */}
          <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100">
            <p className="flex-1 min-w-0 truncate text-xs text-gray-500 font-mono">
              {pos ? `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}` : 'Tap the map or drag the pin to set the spot'}
            </p>
            <button type="button" onClick={onClose} className="btn-outline text-sm flex-shrink-0">Cancel</button>
            <button
              type="button"
              disabled={!pos}
              onClick={() => { onSave({ lat: pos.lat, lng: pos.lng }); onClose() }}
              className="btn-primary text-sm flex-shrink-0 disabled:opacity-40"
            >
              Use This Location
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}
