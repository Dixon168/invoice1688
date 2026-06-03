import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Field } from '../components/ui'

// Friendly username -> real Supabase account (password is verified by Supabase, never stored in code)
const ADMIN_USERNAME = 'Dixon168'
const ADMIN_EMAIL = 'dixon168@icloud.com'

export default function AdminLogin() {
  const { signIn, signOut } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr(''); setBusy(true)
    if (username.trim() !== ADMIN_USERNAME) {
      setBusy(false); return setErr('Invalid admin credentials.')
    }
    const { error } = await signIn(ADMIN_EMAIL, password)
    if (error) { setBusy(false); return setErr('Invalid admin credentials.') }
    const { data: admin } = await supabase.rpc('is_super_admin')
    setBusy(false)
    if (admin) navigate('/admin')
    else { await signOut(); setErr('This account is not an administrator.') }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2 text-white">
          <ShieldCheck className="text-clay" />
          <span className="font-display text-2xl">Admin console</span>
        </div>
        <div className="card p-6">
          <div className="space-y-4">
            <Field label="Username">
              <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="Dixon168" autoComplete="off" />
            </Field>
            <Field label="Password">
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()} placeholder="••••••••" />
            </Field>
            {err && <p className="text-sm text-clay">{err}</p>}
            <button className="btn-primary w-full" onClick={submit} disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
          </div>
        </div>
        <Link to="/login" className="mt-5 block text-center text-sm text-white/50 hover:text-white">← Back to app</Link>
      </div>
    </div>
  )
}
