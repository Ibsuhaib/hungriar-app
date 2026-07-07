import { motion } from 'framer-motion';
import { Plus, Minus, ImageOff } from 'lucide-react';
import VegBadge from './VegBadge.jsx';
import { rupees } from '../lib/format.js';

export default function MenuItemCard({ item, qty, onAdd, onSetQty }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
    >
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <ImageOff className="h-6 w-6 text-slate-300" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-2">
          <VegBadge isVeg={item.is_veg} className="mt-1" />
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</h3>
        </div>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-sm font-semibold">{rupees(item.price)}</span>
          {qty > 0 ? (
            <div className="flex items-center gap-2 rounded-full bg-navy px-1.5 py-1 text-white">
              <button
                aria-label={`Remove one ${item.name}`}
                onClick={() => onSetQty(item.id, qty - 1)}
                className="rounded-full p-0.5 hover:bg-navy-light"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[1.2rem] text-center text-sm font-semibold">{qty}</span>
              <button
                aria-label={`Add one ${item.name}`}
                onClick={() => onSetQty(item.id, Math.min(qty + 1, 50))}
                className="rounded-full p-0.5 hover:bg-navy-light"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onAdd}
              className="flex items-center gap-1 rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-navy shadow-sm hover:bg-gold-dark"
            >
              <Plus className="h-4 w-4" /> Add
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
