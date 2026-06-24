import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * Shared shell for the Admin and Super Admin areas: a collapsible sidebar
 * with nav links, a mobile top bar, and a sign-out button. `navItems` is an
 * array of { to, label, end? }.
 */
export default function Layout({ title, navItems, signOutPath = '/admin/login', children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { signOut, user } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate(signOutPath)
  }

  return (
    <div className="min-h-screen bg-sand-100 lg:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-white shadow-lg transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b px-4 py-4">
          <span className="text-lg font-bold text-primary-600">Goana AR</span>
          <button type="button" className="text-gray-400 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            ✕
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-3">
          <p className="mb-2 truncate text-xs text-gray-500" title={user?.email}>
            {user?.email}
          </p>
          <button type="button" onClick={handleSignOut} className="btn-outline w-full text-sm">
            Sign Out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-white px-4 py-3 lg:hidden">
          <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="text-gray-500">
            <span className="text-2xl leading-none">&#9776;</span>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:p-8">
          <h1 className="mb-6 hidden text-2xl font-bold text-gray-900 lg:block">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  )
}
