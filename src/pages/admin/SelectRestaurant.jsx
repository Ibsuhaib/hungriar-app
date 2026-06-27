import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Utensils, ChevronRight, Store } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function SelectRestaurant() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const { selectRestaurant, allRestaurantAdmins } = useAuth()

  // Prefer restaurants from navigation state (available immediately after OTP verify),
  // fall back to context (available after loadProfile completes on refresh)
  const restaurants = (state?.restaurants ?? allRestaurantAdmins ?? []).filter(
    (r) => r.restaurants,
  )

  const handleSelect = (adminRow) => {
    selectRestaurant(adminRow)
    navigate('/admin', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        <div className="flex items-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg">
            <Utensils className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900 font-display">HungriAR</span>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 font-display mb-1">Select Restaurant</h2>
        <p className="text-sm text-gray-500 mb-6">Choose which restaurant to manage</p>

        {restaurants.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Loading restaurants…</div>
        ) : (
          <div className="space-y-3">
            {restaurants.map((row) => {
              const r = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants
              return (
                <button
                  key={row.id}
                  onClick={() => handleSelect(row)}
                  className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <Store className="w-5 h-5 text-primary-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{r?.name ?? 'Restaurant'}</p>
                    <p className="text-xs text-gray-400 truncate">{r?.slug ?? ''}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </motion.div>
    </div>
  )
}
