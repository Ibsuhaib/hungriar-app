import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

export default function OrderSuccess() {
  const { slug, orderId } = useParams();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 12 }}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100"
      >
        <Check className="h-10 w-10 text-green-600" strokeWidth={3} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h1 className="mt-6 text-2xl font-bold">Order placed!</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          The restaurant has received your order and will confirm it shortly. Typical time to your door
          is 30–45 minutes.
        </p>
        <p className="mt-3 text-xs text-slate-400">
          Order ID: <span className="font-mono">{orderId?.slice(0, 8)}</span>
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            to={`/order/${orderId}`}
            className="rounded-2xl bg-navy px-8 py-3.5 font-semibold text-white shadow-lg"
          >
            Track your order
          </Link>
          <Link to={`/r/${slug}`} className="text-sm font-medium text-slate-500 underline">
            Back to {slug?.replaceAll('-', ' ')}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
