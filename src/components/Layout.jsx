import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, Menu, X, ChevronRight, ExternalLink } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const STOREFRONT_BASE_URL = import.meta.env.VITE_HUNGRIORDER_URL || 'https://hungriorder.com'

export default function Layout({ title, navItems, signOutPath = '/admin/login', children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { signOut, user, restaurant } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate(signOutPath)
  }

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'U'

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      {/* Mobile backdrop — properly animated via AnimatePresence */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Sidebar — always in DOM; CSS transform controls mobile visibility */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-navy-800 border-r border-navy-700
          shadow-xl transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0 lg:shadow-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
              {/* Brand */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-navy-700">
                <div className="flex items-center gap-3">
                  <img
                    src="/logo.svg"
                    alt="hungriAR"
                    className="w-8 h-8 rounded-xl"
                  />
                  <span className="text-base font-bold text-white font-display tracking-tight">
                    hungri<span className="text-primary-400">AR</span>
                  </span>
                </div>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 hover:bg-white/10 hover:text-white/70 transition-colors lg:hidden"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Close menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Nav */}
              <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
                {navItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                          isActive
                            ? 'bg-primary-500/15 text-primary-400 border border-primary-500/20'
                            : 'text-white/50 hover:bg-white/5 hover:text-white/80 border border-transparent'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {Icon && (
                            <span className={`flex-shrink-0 transition-colors ${isActive ? 'text-primary-400' : 'text-white/30 group-hover:text-white/60'}`}>
                              <Icon className="w-4 h-4" />
                            </span>
                          )}
                          <span className="flex-1 leading-none">{item.label}</span>
                          {isActive && <ChevronRight className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />}
                        </>
                      )}
                    </NavLink>
                  )
                })}

                {/* Online storefront (hungriOrder) — external link, admin panel only */}
                {restaurant?.slug && (
                  <a
                    href={`${STOREFRONT_BASE_URL}/r/${restaurant.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setSidebarOpen(false)}
                    className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white/80 border border-transparent transition-all duration-150"
                  >
                    <span className="flex-shrink-0 text-white/30 group-hover:text-white/60 transition-colors">
                      <ExternalLink className="w-4 h-4" />
                    </span>
                    <span className="flex-1 leading-none">Online Store</span>
                  </a>
                )}
              </nav>

              {/* Footer */}
              <div className="border-t border-navy-700 p-3 space-y-2">
                <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-500/20 border border-primary-500/30 flex items-center justify-center">
                    <span className="text-primary-400 text-[10px] font-bold">{initials}</span>
                  </div>
                  <p className="text-xs text-white/30 truncate flex-1 min-w-0" title={user?.email}>
                    {user?.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-white/30 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 shadow-sm lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="hungriAR" className="w-6 h-6 rounded-lg" />
            <h1 className="text-base font-semibold text-gray-900 font-display">{title}</h1>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:p-8">
          <h1 className="mb-6 hidden text-2xl font-bold text-gray-900 font-display lg:block">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  )
}
