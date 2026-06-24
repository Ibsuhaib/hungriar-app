import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sand-100 p-4 text-center">
      <h1 className="text-5xl font-bold text-primary-600">404</h1>
      <p className="mt-2 text-lg font-semibold text-gray-900">Page not found</p>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        The page you're looking for doesn't exist or may have been moved. If you scanned a QR code, please ask
        the restaurant staff to print a new one.
      </p>
      <Link to="/" className="btn-primary mt-6">
        Go to Homepage
      </Link>
    </div>
  )
}
