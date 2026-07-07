export function rupees(n) {
  const num = Number(n ?? 0);
  return `₹${num % 1 === 0 ? num.toLocaleString('en-IN') : num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export function hoursToday(openingHours) {
  if (!openingHours) return null;
  return openingHours[DAY_KEYS[new Date().getDay()]] ?? null;
}

export function isOpenNow(openingHours) {
  const range = hoursToday(openingHours);
  if (!range || typeof range !== 'string' || !range.includes('-')) return true; // unknown → assume open
  const [start, end] = range.split('-');
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMins = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const s = toMins(start);
  const e = toMins(end);
  return e > s ? mins >= s && mins < e : mins >= s || mins < e; // handles past-midnight closing
}

export function formatHours(openingHours) {
  if (!openingHours) return [];
  return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    .filter((d) => openingHours[d])
    .map((d) => ({ day: DAY_LABELS[d], hours: openingHours[d] }));
}

export function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
