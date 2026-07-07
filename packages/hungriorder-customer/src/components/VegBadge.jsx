// Standard Indian veg / non-veg marker.
// Renders nothing when the restaurant hasn't set veg/non-veg on the item.
export default function VegBadge({ isVeg, className = '' }) {
  if (isVeg === null || isVeg === undefined) return null;
  const color = isVeg ? '#16a34a' : '#b91c1c';
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center border-2 ${className}`}
      style={{ borderColor: color }}
      title={isVeg ? 'Veg' : 'Non-veg'}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}
