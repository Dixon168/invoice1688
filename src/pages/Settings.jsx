import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Field } from '../components/ui'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'HKD', 'CNY', 'JPY', 'KRW', 'VND']

export default function Settings() {
  const { company, refreshCompany } = useAuth()
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (company) setForm({ ...company }) }, [company])
  if (!form) return null

  const set = (patch) => setForm({ ...form, ...patch })

  const save = async () => {
    setBusy(true); setSaved(false)
    await supabase.from('companies').update({
      name: form.name, email: form.email, phone: form.phone, address: form.address,
      city: form.city, state: form.state, country: form.country, postal_code: form.postal_code,
      default_currency: form.default_currency, invoice_prefix: form.invoice_prefix,
    }).eq('id', company.id)
    await refreshCompany()
    setBusy(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Your company details, shown on invoices." />
      <div className="card max-w-2xl p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Company name"><input className="input" value={form.name || ''} onChange={e => set({ name: e.target.value })} /></Field></div>
          <Field label="Email"><input className="input" value={form.email || ''} onChange={e => set({ email: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={form.phone || ''} onChange={e => set({ phone: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Address"><input className="input" value={form.address || ''} onChange={e => set({ address: e.target.value })} /></Field></div>
          <Field label="City"><input className="input" value={form.city || ''} onChange={e => set({ city: e.target.value })} /></Field>
          <Field label="State"><input className="input" value={form.state || ''} onChange={e => set({ state: e.target.value })} /></Field>
          <Field label="Postal code"><input className="input" value={form.postal_code || ''} onChange={e => set({ postal_code: e.target.value })} /></Field>
          <Field label="Country"><input className="input" value={form.country || ''} onChange={e => set({ country: e.target.value })} /></Field>
          <Field label="Default currency">
            <select className="input" value={form.default_currency} onChange={e => set({ default_currency: e.target.value })}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Invoice prefix"><input className="input" value={form.invoice_prefix || ''} onChange={e => set({ invoice_prefix: e.target.value })} placeholder="INV-" /></Field>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          {saved && <span className="text-sm text-moss-700">Saved ✓</span>}
        </div>
      </div>
    </>
  )
}
