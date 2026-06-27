import { useState, useEffect } from 'react'

/**
 * Captures the browser's beforeinstallprompt event so we can trigger
 * the native "Add to Home Screen" dialog from our own button.
 */
export function usePwaInstall() {
  const [prompt, setPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }

    const handler = (e) => {
      e.preventDefault()
      setPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => { setInstalled(true); setPrompt(null) })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setPrompt(null)
  }

  return { canInstall: !!prompt && !installed, installed, install }
}
