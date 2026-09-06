import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Fail loudly at startup rather than showing an empty shelf later. A blank
  // collection and a missing configuration must never look the same.
  throw new Error(
    'Supabase configuration is missing. VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_ANON_KEY must be set at build time (see .env).',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // The app is served from a static host with no server-side callback, so
    // there is no OAuth redirect to detect in the URL.
    detectSessionInUrl: false,
  },
})
