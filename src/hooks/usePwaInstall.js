import { useState, useEffect } from 'react'

export function usePwaInstall() {
  const [prompt, setPrompt] = useState(null)
  const [installed, setInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches,
  )

  useEffect(() => {
    if (installed) return

    // Event may have already fired before React mounted — read it from window
    if (window.__pwaInstallPrompt) {
      setPrompt(window.__pwaInstallPrompt)
    }

    // Also handle the case where it fires after mount
    const onReady = () => {
      if (window.__pwaInstallPrompt) setPrompt(window.__pwaInstallPrompt)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPrompt(null)
      window.__pwaInstallPrompt = null
    }

    window.addEventListener('pwa-install-ready', onReady)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('pwa-install-ready', onReady)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [installed])

  const install = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      setInstalled(true)
      window.__pwaInstallPrompt = null
    }
    setPrompt(null)
  }

  return { canInstall: !!prompt && !installed, installed, install }
}
