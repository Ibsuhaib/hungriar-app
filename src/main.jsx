// Capture install prompt BEFORE React renders — the event fires early
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__pwaInstallPrompt = e
  window.dispatchEvent(new CustomEvent('pwa-install-ready'))
})

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

// Register the service worker. When a new version is ready, show a toast
// so the user can refresh to get the latest update.
const updateSW = registerSW({
  onNeedRefresh() {
    toast(
      (t) => (
        <span className="flex items-center gap-3">
          <span>App updated — reload for the latest version.</span>
          <button
            onClick={() => {
              toast.dismiss(t.id)
              updateSW(true)
            }}
            className="flex-shrink-0 px-3 py-1 rounded-lg bg-primary-600 text-white text-xs font-bold"
          >
            Reload
          </button>
        </span>
      ),
      { duration: Infinity, id: 'sw-update' },
    )
  },
  onOfflineReady() {
    toast.success('App ready for offline use', { id: 'sw-offline-ready', duration: 3000 })
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-center"
        gutter={8}
        toastOptions={{
          duration: 3500,
          style: {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '13px',
            fontWeight: '500',
            borderRadius: '12px',
            padding: '12px 16px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            maxWidth: '380px',
          },
          success: {
            style: {
              background: '#f0fdf4',
              color: '#166534',
              border: '1px solid #bbf7d0',
            },
            iconTheme: { primary: '#16a34a', secondary: '#fff' },
          },
          error: {
            style: {
              background: '#fef2f2',
              color: '#991b1b',
              border: '1px solid #fecaca',
            },
            iconTheme: { primary: '#dc2626', secondary: '#fff' },
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>,
)
