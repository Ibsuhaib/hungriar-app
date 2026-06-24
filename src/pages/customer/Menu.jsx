import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { useCart } from '../../contexts/CartContext'
import CartDrawer from '../../components/CartDrawer'
import ARViewer from '../../components/ARViewer'
import { formatCurrency, truncate } from '../../utils/formatters'

function pillClass(active) {
  return `flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
    active ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-primary-50'
  }`
}

function MenuSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="skeleton h-12 w-full rounded-xl" />
      <div className="flex gap-2">
        <div className="skeleton h-8 w-20 rounded-full" />
        <div className="skeleton h-8 w-24 rounded-full" />
        <div className="skeleton h-8 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-28 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

export default function Menu() {
  const { restaurantSlug } = useParams()
  const { restaurant, categories, menuItems, table, loading, error } = useRestaurant()
  const { addItem, itemCount } = useCart()
  const navigate = useNavigate()

  const [activeCategory, setActiveCategory] = useState('all')
  const [cartOpen, setCartOpen] = useState(false)
  const [arModel, setArModel] = useState(null)

  const availableItems = useMemo(() => menuItems.filter((item) => item.available), [menuItems])

  const filteredItems = useMemo(() => {
    if (activeCategory === 'all') return availableItems
    return availableItems.filter((item) => item.category_id === activeCategory)
  }, [availableItems, activeCategory])

  const usedCategories = useMemo(() => {
    const usedIds = new Set(availableItems.map((item) => item.category_id))
    return categories.filter((cat) => usedIds.has(cat.id))
  }, [categories, availableItems])

  if (loading) return <MenuSkeleton />

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-sand-100 p-6 text-center">
        <p className="text-3xl">📷</p>
        <p className="mt-3 max-w-sm text-lg font-semibold text-gray-800">{error}</p>
      </div>
    )
  }

  const handleAdd = (item) => {
    addItem(item, 1)
    toast.success(`${item.name} added to cart`)
  }

  return (
    <div className="min-h-screen bg-sand-100 pb-10">
      <header className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            {restaurant?.logo_url ? (
              <img src={restaurant.logo_url} alt={restaurant.name} className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-600">
                {restaurant?.name?.charAt(0) ?? 'G'}
              </div>
            )}
            <div>
              <h1 className="text-base font-bold text-gray-900">{restaurant?.name}</h1>
              {table && <p className="text-xs text-gray-500">Table {table.number}</p>}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label="Open cart"
            className="relative flex h-11 w-11 items-center justify-center rounded-full bg-primary-600 text-xl text-white shadow hover:bg-primary-700"
          >
            🛒
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-secondary-600 text-[10px] font-bold text-white">
                {itemCount}
              </span>
            )}
          </button>
        </div>

        {usedCategories.length > 0 && (
          <div className="mx-auto flex max-w-4xl gap-2 overflow-x-auto px-4 pb-3">
            <button type="button" onClick={() => setActiveCategory('all')} className={pillClass(activeCategory === 'all')}>
              All
            </button>
            {usedCategories.map((cat) => (
              <button key={cat.id} type="button" onClick={() => setActiveCategory(cat.id)} className={pillClass(activeCategory === cat.id)}>
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-4xl px-4 py-4">
        {filteredItems.length === 0 ? (
          <p className="py-16 text-center text-gray-500">No items available in this category yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {filteredItems.map((item) => (
              <div key={item.id} className="card flex gap-3 p-3">
                <button
                  type="button"
                  onClick={() => navigate(`/r/${restaurantSlug}/item/${item.id}`)}
                  className="flex flex-1 gap-3 text-left"
                >
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="h-20 w-20 flex-shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-sand-200 text-2xl">🍽</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    {item.description && <p className="mt-0.5 text-xs text-gray-500">{truncate(item.description, 70)}</p>}
                    <p className="mt-1 font-semibold text-primary-700">{formatCurrency(item.price, restaurant?.currency)}</p>
                  </div>
                </button>

                <div className="flex flex-shrink-0 flex-col items-end justify-between gap-2">
                  {item.ar_model_url && (
                    <button
                      type="button"
                      onClick={() => setArModel(item.ar_model_url)}
                      className="rounded-full border border-secondary-300 px-2 py-1 text-[11px] font-semibold text-secondary-700 hover:bg-secondary-50"
                    >
                      View in AR
                    </button>
                  )}
                  <button type="button" onClick={() => handleAdd(item)} className="btn-primary px-3 py-1.5 text-xs">
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />
      {arModel && <ARViewer src={arModel} alt="3D dish preview" onClose={() => setArModel(null)} />}
    </div>
  )
}
