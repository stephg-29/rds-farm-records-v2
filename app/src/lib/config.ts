// Reads the farm's connection details from public/config.js (loaded before the app).

export type FarmConfig = {
  supabaseUrl: string
  supabasePublishableKey: string
}

declare global {
  interface Window {
    FARM_CONFIG?: FarmConfig
  }
}

export function loadConfig(): FarmConfig | null {
  const c = window.FARM_CONFIG
  if (!c || !c.supabaseUrl || !c.supabasePublishableKey || c.supabaseUrl.includes('YOUR-PROJECT-REF')) {
    return null
  }
  return c
}
