export default function Spinner({ full = false }) {
  const ring = (
    <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-gold-light border-t-gold" />
  );
  if (!full) return ring;
  return <div className="flex min-h-screen items-center justify-center">{ring}</div>;
}
