import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

const CartContext = createContext(null)

const MAX_QUANTITY = 50

function storageKey(restaurantSlug) {
  return `hungriar_cart_${restaurantSlug}`
}

/**
 * Per-restaurant cart, persisted to localStorage so it survives page
 * reloads / navigation between Menu, FoodDetail and Cart pages.
 */
export function CartProvider({ restaurantSlug, children }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    if (!restaurantSlug) {
      setItems([])
      return
    }
    try {
      const raw = localStorage.getItem(storageKey(restaurantSlug))
      setItems(raw ? JSON.parse(raw) : [])
    } catch {
      setItems([])
    }
  }, [restaurantSlug])

  useEffect(() => {
    if (!restaurantSlug) return
    localStorage.setItem(storageKey(restaurantSlug), JSON.stringify(items))
  }, [items, restaurantSlug])

  const addItem = useCallback((menuItem, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === menuItem.id)
      if (existing) {
        const newQuantity = Math.min(existing.quantity + quantity, MAX_QUANTITY)
        return prev.map((i) => (i.id === menuItem.id ? { ...i, quantity: newQuantity } : i))
      }
      return [
        ...prev,
        {
          id: menuItem.id,
          name: menuItem.name,
          price: Number(menuItem.price),
          image_url: menuItem.image_url ?? null,
          quantity: Math.min(quantity, MAX_QUANTITY),
          notes: '',
        },
      ]
    })
  }, [])

  const updateQuantity = useCallback((itemId, quantity) => {
    setItems((prev) => {
      if (quantity <= 0) return prev.filter((i) => i.id !== itemId)
      return prev.map((i) => (i.id === itemId ? { ...i, quantity: Math.min(quantity, MAX_QUANTITY) } : i))
    })
  }, [])

  const removeItem = useCallback((itemId) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }, [])

  const updateNotes = useCallback((itemId, notes) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, notes: notes.slice(0, 200) } : i)),
    )
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
  }, [])

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items])

  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items])

  const getTax = useCallback((taxPercentage) => (subtotal * (Number(taxPercentage) || 0)) / 100, [subtotal])

  const value = {
    items,
    addItem,
    updateQuantity,
    removeItem,
    updateNotes,
    clearCart,
    subtotal,
    itemCount,
    getTax,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
