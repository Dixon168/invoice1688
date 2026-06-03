import { createClient } from '@supabase/supabase-js'

// Anon key is public by design — data is protected by Supabase Row Level Security.
// Values can be overridden by Netlify env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
const url = import.meta.env.VITE_SUPABASE_URL || 'https://jyunfonumxdkzmceqnja.supabase.co'
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dW5mb251bXhka3ptY2VxbmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTk1NjUsImV4cCI6MjA5NjA5NTU2NX0.QBIhGrikvD3FWCUlAE6nJvp96wYEPUoVZovBi05smd0'

export const supabase = createClient(url, anon)

// Isolated client (no session persistence) — used by admin to create client accounts
// without disturbing the admin's own logged-in session.
export const makeTempClient = () =>
  createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
