import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadConfig } from './config'

export const config = loadConfig()

// The built-in demo farm (config.js says demo: true).
export const isDemo = !!config?.demo

// null when config.js is missing, still has the example values, or is the demo.
export const supabase: SupabaseClient | null = config && !isDemo
  ? createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
