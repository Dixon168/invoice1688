import { createClient } from '@supabase/supabase-js'

// Server-side only. Uses the Supabase service role key (set in Netlify env vars).
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
  try {
    // 1) who is calling? verify their Supabase session token
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, body: 'Not signed in' }
    const { data: { user }, error: ue } = await admin.auth.getUser(token)
    if (ue || !user) return { statusCode: 401, body: 'Invalid session' }

    // 2) is the caller a platform super admin?
    const { data: admins } = await admin.from('super_admin_emails').select('email')
    const ok = (admins || []).some(a => a.email.toLowerCase() === (user.email || '').toLowerCase())
    if (!ok) return { statusCode: 403, body: 'Not authorized' }

    // 3) set the target user's password
    const { userId, password } = JSON.parse(event.body || '{}')
    if (!userId || !password || password.length < 6) return { statusCode: 400, body: 'Password must be at least 6 characters.' }
    const { error: pe } = await admin.auth.admin.updateUserById(userId, { password })
    if (pe) return { statusCode: 500, body: pe.message }

    return { statusCode: 200, body: 'ok' }
  } catch (e) {
    return { statusCode: 500, body: e.message }
  }
}
