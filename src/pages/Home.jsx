import { Link } from 'react-router-dom'

const SUPPORT_EMAIL = 'support@goanaar.example'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-sand-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <span className="text-xl font-bold text-primary-600">Goana AR</span>
          <Link to="/admin/login" className="btn-outline text-sm">
            Restaurant Admin
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h1 className="font-display text-3xl font-bold text-gray-900 sm:text-4xl">
            Digital menus your guests can see, touch, and order from
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-gray-600">
            Goana AR turns any table into a contactless ordering point - guests scan a QR code, browse a beautiful
            menu with photos and AR / 3D previews of your dishes, and place orders that land on your kitchen
            dashboard in real time.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card text-left">
              <p className="text-2xl">📱</p>
              <h2 className="mt-2 font-semibold text-gray-900">Scan &amp; Browse</h2>
              <p className="mt-1 text-sm text-gray-500">No app to download - guests scan the table QR code and the menu opens instantly.</p>
            </div>
            <div className="card text-left">
              <p className="text-2xl">🥘</p>
              <h2 className="mt-2 font-semibold text-gray-900">View in AR</h2>
              <p className="mt-1 text-sm text-gray-500">See dishes in augmented reality before ordering, right on the table.</p>
            </div>
            <div className="card text-left">
              <p className="text-2xl">🔔</p>
              <h2 className="mt-2 font-semibold text-gray-900">Live Kitchen Updates</h2>
              <p className="mt-1 text-sm text-gray-500">Orders appear on your dashboard the moment they're placed, with live status updates for guests.</p>
            </div>
          </div>

          <p className="mt-10 text-sm text-gray-500">
            Already a Goana AR restaurant?{' '}
            <Link to="/admin/login" className="font-medium text-primary-600 underline">
              Sign in to your dashboard
            </Link>
            .
          </p>
        </div>
      </main>

      <footer className="border-t bg-white py-4">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-2 px-4 text-xs text-gray-400 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Goana AR. All rights reserved.</p>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-gray-600">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-gray-600">
              Privacy
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-gray-600">
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
