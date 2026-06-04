import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Wallet, Package, Globe } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useT } from '../i18n'
import { Field } from '../components/ui'
import LanguageSwitcher from '../components/LanguageSwitcher'

function Feature({ icon: Icon, title, desc }) {
  return (
    <div className="flex gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-clay"><Icon size={20} /></div>
      <div>
        <div className="font-semibold text-white">{title}</div>
        <div className="text-sm text-white/55">{desc}</div>
      </div>
    </div>
  )
}

function AuthShell({ children }) {
  const { t } = useT()
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* marketing panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-moss-800 p-12 text-white lg:flex">
        <div className="flex items-center justify-between">
          <div className="font-display text-3xl font-700">Bill<span className="text-clay">&</span>Pays</div>
          <div className="flex items-center gap-2">
            <Link to="/features" className="hidden rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 sm:block">{t('nav_features')}</Link>
            <Link to="/why-us" className="hidden rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 sm:block">{t('nav_whyus')}</Link>
            <Link to="/pricing" className="rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10">{t('nav_pricing')}</Link>
            <LanguageSwitcher dark />
          </div>
        </div>
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-white/70"><Globe size={13} /> {t('owner_badge')}</span>
          <h1 className="mt-5 font-display text-5xl leading-tight">{t('hero_h1')}</h1>
          <p className="mt-4 max-w-md text-white/60">{t('hero_sub')}</p>
          <div className="mt-9 space-y-5 max-w-md">
            <Feature icon={FileText} title={t('feat_quote_t')} desc={t('feat_quote_d')} />
            <Feature icon={Wallet} title={t('feat_pay_t')} desc={t('feat_pay_d')} />
            <Feature icon={Package} title={t('feat_inv_t')} desc={t('feat_inv_d')} />
            <Feature icon={Globe} title={t('feat_multi_t')} desc={t('feat_multi_d')} />
          </div>
        </div>
        <div className="text-sm text-white/40">© {new Date().getFullYear()} Bill&Pays · {t('owner_badge')}</div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-clay/20 blur-3xl" />
      </div>
      {/* form panel */}
      <div className="relative flex min-h-screen items-center justify-center bg-sand p-6 lg:min-h-0">
        <div className="absolute right-4 top-4 lg:hidden"><LanguageSwitcher /></div>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}

export function Login() {
  const { signIn } = useAuth()
  const { t } = useT()
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
    <AuthShell>
      <div className="mb-8 font-display text-2xl text-ink lg:hidden">Bill<span className="text-clay">&</span>Pays</div>
      <h2 className="font-display text-3xl text-ink">{t('signin_welcome')}</h2>
      <p className="mt-1 text-sm text-ink/55">{t('signin_sub')}</p>
      <div className="mt-7 space-y-4">
        <Field label={t('email')}>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} placeholder="you@company.com"
            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
        </Field>
        <Field label={t('password')}>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} placeholder="••••••••"
            autoComplete="new-password" />
        </Field>
        {err && <p className="text-sm text-clay">{err}</p>}
        <button className="btn-primary w-full" onClick={submit} disabled={busy}>
          {busy ? t('signing_in') : t('signin')}
        </button>
      </div>
      <p className="mt-6 text-center text-sm text-ink/55">
        <Link to="/pricing" className="font-semibold text-moss-700 hover:underline">{t('nav_pricing')}</Link>
        <span className="mx-2 text-ink/30">·</span>
        <Link to="/get-started" className="font-semibold text-moss-700 hover:underline">{t('get_started')}</Link>
      </p>
    </AuthShell>
  )
}

export function Register() {
  const { signUp } = useAuth()
  const { t } = useT()
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
    if (data.session) navigate('/')
    else setMsg('Check your email to confirm your account, then sign in.')
  }

  return (
    <AuthShell>
      <h2 className="font-display text-3xl text-ink">{t('create_company')}</h2>
      <div className="mt-7 space-y-4">
        <Field label={t('email')}>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
        </Field>
        <Field label={t('password')}>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} placeholder="••••••••" />
        </Field>
        {err && <p className="text-sm text-clay">{err}</p>}
        {msg && <p className="text-sm text-moss-700">{msg}</p>}
        <button className="btn-primary w-full" onClick={submit} disabled={busy}>
          {busy ? t('creating') : t('signin')}
        </button>
      </div>
    </AuthShell>
  )
}

export function CreateCompany() {
  const { createCompany, signOut } = useAuth()
  const { t } = useT()
  const [name, setName] = useState('')
  const [fullName, setFullName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim()) return setErr('!')
    setErr(''); setBusy(true)
    const { error } = await createCompany(name.trim(), fullName.trim())
    setBusy(false)
    if (error) setErr(error.message)
  }

  return (
    <AuthShell>
      <h2 className="font-display text-3xl text-ink">{t('setup_company')}</h2>
      <p className="mt-1 text-sm text-ink/55">{t('setup_sub')}</p>
      <div className="mt-7 space-y-4">
        <Field label={t('company_name')}>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Acme Inc." />
        </Field>
        <Field label={t('your_name')}>
          <input className="input" value={fullName} onChange={e => setFullName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </Field>
        {err && <p className="text-sm text-clay">{err}</p>}
        <button className="btn-primary w-full" onClick={submit} disabled={busy}>
          {busy ? t('creating') : t('create_company')}
        </button>
        <button className="btn-ghost w-full" onClick={signOut}>{t('signout')}</button>
      </div>
    </AuthShell>
  )
}
