import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadConfig } from './config'

export const config = loadConfig()

// null when config.js is missing or still has the example values.
export const supabase: SupabaseClient | null = config
  ? createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
