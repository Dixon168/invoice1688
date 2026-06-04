import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { useT } from '../i18n'
import { supabase } from '../lib/supabase'
import { Field } from '../components/ui'
import LanguageSwitcher from '../components/LanguageSwitcher'

const blank = {
  company_name: '', contact_name: '', email: '', phone: '',
  billing_address: '', city: '', state: '', postal_code: '', country: '', notes: '',
}

const encode = (data) => Object.keys(data).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k])).join('&')

export default function GetStarted() {
  const { t } = useT()
  const [params] = useSearchParams()
  const [plan, setPlan] = useState(params.get('plan') === 'annual' ? 'annual' : 'monthly')
  const planLabel = plan === 'annual' ? 'Invoice168 $199.99/12 months' : 'Invoice168 $19.99/month'
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const set = (patch) => setForm({ ...form, ...patch })

  const submit = async () => {
    if (!form.company_name.trim() || !form.email.trim()) { setErr('!'); return }
    setErr(''); setBusy(true)
    try {
      // 1) save to the admin's pending list in Supabase
      await supabase.from('signups').insert({
        company_name: form.company_name, contact_name: form.contact_name, email: form.email, phone: form.phone,
        billing_address: form.billing_address, city: form.city, state: form.state,
        postal_code: form.postal_code, country: form.country, notes: form.notes,
        plan: planLabel,
      })
      // 2) also email the details via Netlify Forms
      await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encode({ 'form-name': 'signup', 'bot-field': '', plan: planLabel, ...form }),
      })
      setDone(true)
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }

  if (done) {
    return (
      <div className="grid min-h-screen place-items-center bg-sand p-6">
        <div className="card max-w-md p-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-moss-100 text-moss-700"><CheckCircle2 size={28} /></div>
          <h1 className="font-display text-3xl text-ink">{t('gs_thanks_t')}</h1>
          <p className="mt-3 text-sm text-ink/60">{t('gs_thanks_d')}</p>
          <Link to="/login" className="btn-primary mt-6 w-full justify-center">{t('gs_back_home')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sand">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-6 py-5">
        <Link to="/pricing" className="flex items-center gap-1 text-sm text-ink/60 hover:text-ink"><ArrowLeft size={16} /> {t('nav_pricing')}</Link>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto max-w-2xl px-6 pb-16">
        <h1 className="font-display text-3xl text-ink">{t('gs_title')}</h1>
        <p className="mt-2 text-sm text-ink/60">{t('gs_sub')}</p>

        <div className="mt-5">
          <div className="label">{t('gs_choose_plan')}</div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setPlan('monthly')}
              className={`rounded-xl border-2 p-4 text-left transition ${plan === 'monthly' ? 'border-moss-700 bg-moss-50' : 'border-black/10 hover:border-black/20'}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">{t('pr_monthly')}</div>
              <div className="mt-1 font-display text-2xl text-ink">$19.99<span className="text-sm text-ink/50">{t('pr_per_month')}</span></div>
            </button>
            <button type="button" onClick={() => setPlan('annual')}
              className={`relative rounded-xl border-2 p-4 text-left transition ${plan === 'annual' ? 'border-moss-700 bg-moss-50' : 'border-black/10 hover:border-black/20'}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-moss-700">{t('pr_annual')}</div>
              <div className="mt-1 font-display text-2xl text-ink">$199.99<span className="text-sm text-ink/50">{t('pr_per_year')}</span></div>
            </button>
          </div>
        </div>

        <div className="card mt-4 space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('f_company_name_req')}><input className="input" value={form.company_name} onChange={e => set({ company_name: e.target.value })} /></Field>
            <Field label={t('f_contact_name')}><input className="input" value={form.contact_name} onChange={e => set({ contact_name: e.target.value })} /></Field>
            <Field label={t('f_business_email')}><input className="input" type="email" value={form.email} onChange={e => set({ email: e.target.value })} /></Field>
            <Field label={t('f_phone')}><input className="input" value={form.phone} onChange={e => set({ phone: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label={t('f_billing_address')}><input className="input" value={form.billing_address} onChange={e => set({ billing_address: e.target.value })} /></Field></div>
            <Field label={t('f_city')}><input className="input" value={form.city} onChange={e => set({ city: e.target.value })} /></Field>
            <Field label={t('f_state')}><input className="input" value={form.state} onChange={e => set({ state: e.target.value })} /></Field>
            <Field label={t('f_postal_code')}><input className="input" value={form.postal_code} onChange={e => set({ postal_code: e.target.value })} /></Field>
            <Field label={t('f_country')}><input className="input" value={form.country} onChange={e => set({ country: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label={t('f_anything_else')}><textarea className="input min-h-[70px]" value={form.notes} onChange={e => set({ notes: e.target.value })} /></Field></div>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-clay/10 p-3 text-xs text-ink/70">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-clay" /> {t('gs_card_note')}
          </div>

          {err && <p className="text-sm text-clay">{err}</p>}
          <button className="btn-primary w-full justify-center" onClick={submit} disabled={busy}>
            {busy ? t('gs_sending') : t('gs_submit')}
          </button>
        </div>
      </main>
    </div>
  )
}
