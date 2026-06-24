import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useTableToken } from '../hooks/useTableToken'
import { useRateLimit } from '../hooks/useRateLimit'

const RestaurantContext = createContext(null)

/**
 * Customer-facing restaurant/table context. Wraps useTableToken to resolve
 * a verified { restaurantId, tableId } session for the given slug, then
 * loads the restaurant's public settings, categories and menu items.
 */
export function RestaurantProvider({ restaurantSlug, children }) {
  const { session, loading: tokenLoading, error: tokenError } = useTableToken(restaurantSlug)
  const { checkCustomerLimit } = useRateLimit()

  const [restaurant, setRestaurant] = useState(null)
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchMenu = useCallback(async () => {
    if (!session?.restaurantId) return

    setLoading(true)
    setError(null)

    const allowed = await checkCustomerLimit()
    if (!allowed) {
      setLoading(false)
      return
    }

    try {
      const [restaurantRes, categoryRes, menuRes] = await Promise.all([
        supabase.from('restaurants').select('*').eq('id', session.restaurantId).maybeSingle(),
        supabase.from('categories').select('*').eq('restaurant_id', session.restaurantId).order('display_order'),
        supabase.from('menu_items').select('*').eq('restaurant_id', session.restaurantId).order('display_order'),
      ])

      if (restaurantRes.error) throw restaurantRes.error
      if (categoryRes.error) throw categoryRes.error
      if (menuRes.error) throw menuRes.error

      setRestaurant(restaurantRes.data)
      setCategories(categoryRes.data || [])
      setMenuItems(menuRes.data || [])
    } catch (err) {
      setError(err.message || 'Failed to load menu')
    } finally {
      setLoading(false)
    }
  }, [session?.restaurantId, checkCustomerLimit])

  useEffect(() => {
    if (session?.restaurantId) fetchMenu()
  }, [session?.restaurantId, fetchMenu])

  const getMenuItemById = useCallback((id) => menuItems.find((item) => item.id === id) ?? null, [menuItems])

  const value = {
    session,
    table: session ? { id: session.tableId, number: session.tableNumber } : null,
    restaurant,
    categories,
    menuItems,
    getMenuItemById,
    loading: tokenLoading || (Boolean(session) && loading),
    error: tokenError || error,
    refetchMenu: fetchMenu,
  }

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>
}

export function useRestaurant() {
  const ctx = useContext(RestaurantContext)
  if (!ctx) throw new Error('useRestaurant must be used within RestaurantProvider')
  return ctx
}
