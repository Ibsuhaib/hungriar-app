import { motion } from 'framer-motion';
import { Check, Clock, ChefHat, PackageCheck, Bike, PartyPopper, XCircle } from 'lucide-react';

const DELIVERY_STEPS = [
  { key: 'pending', label: 'Order placed', icon: Clock },
  { key: 'confirmed', label: 'Confirmed', icon: Check },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready', label: 'Ready', icon: PackageCheck },
  { key: 'out_for_delivery', label: 'Out for delivery', icon: Bike },
  { key: 'delivered', label: 'Delivered', icon: PartyPopper },
];

const TAKEAWAY_STEPS = DELIVERY_STEPS.filter((s) => s.key !== 'out_for_delivery').map((s) =>
  s.key === 'delivered' ? { ...s, label: 'Picked up' } : s
);

export default function StatusTimeline({ status, orderType }) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-red-700">
        <XCircle className="h-6 w-6" />
        <div>
          <p className="font-semibold">Order cancelled</p>
          <p className="text-xs">Contact the restaurant if this seems wrong.</p>
        </div>
      </div>
    );
  }

  const steps = orderType === 'takeaway' ? TAKEAWAY_STEPS : DELIVERY_STEPS;
  const activeIdx = steps.findIndex((s) => s.key === status);

  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        const Icon = step.icon;
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <motion.div
                animate={active ? { scale: [1, 1.12, 1] } : {}}
                transition={active ? { repeat: Infinity, duration: 1.6 } : {}}
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                  done
                    ? 'border-gold bg-gold text-navy'
                    : active
                      ? 'border-gold bg-white text-gold'
                      : 'border-slate-200 bg-white text-slate-300'
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </motion.div>
              {i < steps.length - 1 && (
                <div className={`h-8 w-0.5 ${done ? 'bg-gold' : 'bg-slate-200'}`} />
              )}
            </div>
            <p
              className={`pt-1.5 text-sm ${
                active ? 'font-bold text-navy' : done ? 'font-medium text-slate-600' : 'text-slate-400'
              }`}
            >
              {step.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
