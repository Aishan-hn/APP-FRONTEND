import { createClient } from '@supabase/supabase-js'

// Public project URL and publishable key; Row Level Security protects the data
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { flowType: 'pkce' },
})
