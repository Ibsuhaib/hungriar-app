import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, Menu, X, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

/**
 * Shared admin shell: collapsible sidebar with icons + labels, mobile top-bar,
 * and sign-out. `navItems` = array of { to, label, icon: LucideComponent, end? }.
 */
export default function Layout({ title, navItems, signOutPath = '/admin/login', children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { signOut, user } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate(signOutPath)
  }

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'U'

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      {/* Sidebar */}
      <AnimatePresence>
        {(sidebarOpen || true) && (
          <>
            {/* Mobile backdrop */}
            {sidebarOpen && (
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden"
                onClick={() => setSidebarOpen(false)}
                aria-hidden="true"
              />
            )}

            <motion.aside
              key="sidebar"
              initial={false}
              className={`
                fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-white border-r border-gray-100
                shadow-card-lg transition-transform duration-200 ease-in-out
                lg:static lg:translate-x-0 lg:shadow-none
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
              `}
            >
              {/* Brand */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-sm">
                    <span className="text-white font-bold text-sm">H</span>
                  </div>
                  <span className="text-base font-bold text-gray-900 font-display">HungriAR</span>
                </div>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors lg:hidden"
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
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {Icon && (
                            <span className={`flex-shrink-0 transition-colors ${isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'}`}>
                              <Icon className="w-4 h-4" />
                            </span>
                          )}
                          <span className="flex-1 leading-none">{item.label}</span>
                          {isActive && <ChevronRight className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" />}
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </nav>

              {/* Footer */}
              <div className="border-t border-gray-100 p-3 space-y-2">
                <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">{initials}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate flex-1 min-w-0" title={user?.email}>
                    {user?.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

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
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">H</span>
            </div>
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
