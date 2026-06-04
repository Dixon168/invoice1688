import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Field } from '../components/ui'

function AuthShell({ children }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-moss-800 p-12 text-white lg:flex">
        <div className="font-display text-3xl font-700">invoice<span className="text-clay">168</span></div>
        <div>
          <h1 className="font-display text-5xl leading-tight">Get paid,<br />without the chaos.</h1>
          <p className="mt-5 max-w-sm text-white/60">Create invoices, track customers and record payments — one clean place for your whole business.</p>
        </div>
        <div className="text-sm text-white/40">Multi-company · Secure · Built on Supabase</div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-clay/20 blur-3xl" />
      </div>
      <div className="flex min-h-screen items-center justify-center bg-sand p-6 lg:min-h-0">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr(''); setBusy(true)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setErr(error.message)
    else navigate('/')
  }

  return (
    <>
    <AuthShell>
      <div className="mb-8 font-display text-2xl text-ink lg:hidden">invoice<span className="text-clay">168</span></div>
      <h2 className="font-display text-3xl text-ink">Welcome back</h2>
      <p className="mt-1 text-sm text-ink/55">Sign in to your account.</p>
      <div className="mt-7 space-y-4">
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} placeholder="you@company.com"
            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
        </Field>
        <Field label="Password">
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} placeholder="••••••••"
            autoComplete="new-password" />
        </Field>
        {err && <p className="text-sm text-clay">{err}</p>}
        <button className="btn-primary w-full" onClick={submit} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </AuthShell>
    <Link to="/admin/login" className="fixed bottom-3 right-4 z-10 text-xs text-ink/35 transition hover:text-ink/70">Admin</Link>
    </>
  )
}

export function Register() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr(''); setMsg(''); setBusy(true)
    const { data, error } = await signUp(email.trim(), password)
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (data.session) navigate('/')                 // auto-confirmed
    else setMsg('Check your email to confirm your account, then sign in.')
  }

  return (
    <AuthShell>
      <div className="mb-8 font-display text-2xl text-ink lg:hidden">invoice<span className="text-clay">168</span></div>
      <h2 className="font-display text-3xl text-ink">Create your account</h2>
      <p className="mt-1 text-sm text-ink/55">Start invoicing in minutes.</p>
      <div className="mt-7 space-y-4">
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
        </Field>
        <Field label="Password">
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} placeholder="At least 6 characters" />
        </Field>
        {err && <p className="text-sm text-clay">{err}</p>}
        {msg && <p className="text-sm text-moss-700">{msg}</p>}
        <button className="btn-primary w-full" onClick={submit} disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </div>
      <p className="mt-6 text-center text-sm text-ink/55">
        Already have an account? <Link to="/login" className="font-semibold text-moss-700 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}

export function CreateCompany() {
  const { createCompany, signOut } = useAuth()
  const [name, setName] = useState('')
  const [fullName, setFullName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim()) return setErr('Company name is required')
    setErr(''); setBusy(true)
    const { error } = await createCompany(name.trim(), fullName.trim())
    setBusy(false)
    if (error) setErr(error.message)
  }

  return (
    <AuthShell>
      <h2 className="font-display text-3xl text-ink">Set up your company</h2>
      <p className="mt-1 text-sm text-ink/55">One last step before you start.</p>
      <div className="mt-7 space-y-4">
        <Field label="Company name">
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Acme Inc." />
        </Field>
        <Field label="Your name (optional)">
          <input className="input" value={fullName} onChange={e => setFullName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Dixon" />
        </Field>
        {err && <p className="text-sm text-clay">{err}</p>}
        <button className="btn-primary w-full" onClick={submit} disabled={busy}>
          {busy ? 'Creating…' : 'Create company'}
        </button>
        <button className="btn-ghost w-full" onClick={signOut}>Sign out</button>
      </div>
    </AuthShell>
  )
}
