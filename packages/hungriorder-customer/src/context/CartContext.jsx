import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';

const CartContext = createContext(null);
const STORAGE_KEY = 'ho-cart-v1';

const empty = { restaurantId: null, slug: null, restaurantName: null, items: [] };

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return empty;
    return parsed;
  } catch {
    return empty;
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'add': {
      const { restaurant, item } = action;
      // Cart holds one restaurant at a time; switching restaurants resets it.
      const sameRestaurant = state.restaurantId === restaurant.id;
      const items = sameRestaurant ? state.items : [];
      const existing = items.find((i) => i.id === item.id);
      const next = existing
        ? items.map((i) => (i.id === item.id ? { ...i, qty: Math.min(i.qty + 1, 50) } : i))
        : [...items, { id: item.id, name: item.name, price: Number(item.price), is_veg: item.is_veg, image_url: item.image_url, qty: 1 }];
      return {
        restaurantId: restaurant.id,
        slug: restaurant.slug,
        restaurantName: restaurant.name,
        items: next,
      };
    }
    case 'setQty': {
      const items = state.items
        .map((i) => (i.id === action.id ? { ...i, qty: action.qty } : i))
        .filter((i) => i.qty > 0);
      return items.length ? { ...state, items } : empty;
    }
    case 'replace':
      return action.cart;
    case 'clear':
      return empty;
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [cart, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      /* storage full/unavailable — cart just won't persist */
    }
  }, [cart]);

  const value = useMemo(() => {
    const count = cart.items.reduce((n, i) => n + i.qty, 0);
    const subtotal = Math.round(cart.items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
    return {
      cart,
      count,
      subtotal,
      add: (restaurant, item) => dispatch({ type: 'add', restaurant, item }),
      setQty: (id, qty) => dispatch({ type: 'setQty', id, qty }),
      replace: (newCart) => dispatch({ type: 'replace', cart: newCart }),
      clear: () => dispatch({ type: 'clear' }),
    };
  }, [cart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
