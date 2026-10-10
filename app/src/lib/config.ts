// Reads the farm's connection details from public/config.js (loaded before the app).

export type FarmConfig = {
  supabaseUrl: string
  supabasePublishableKey: string
  // The built-in demo farm: no database, nothing leaves the phone.
  demo?: boolean
}

declare global {
  interface Window {
    FARM_CONFIG?: FarmConfig
  }
}

export function loadConfig(): FarmConfig | null {
  const c = window.FARM_CONFIG
  if (c?.demo || devDemo()) return { ...c, demo: true, supabaseUrl: '', supabasePublishableKey: '' }
  if (!c || !c.supabaseUrl || !c.supabasePublishableKey || c.supabaseUrl.includes('YOUR-PROJECT-REF')) {
    return null
  }
  return c
}

// Development only: localStorage 'fr-demo' = '1' opens the demo farm instead
// of the farm in config.js. Ignored in the built app.
function devDemo(): boolean {
  try { return import.meta.env.DEV && localStorage.getItem('fr-demo') === '1' } catch { return false }
}
