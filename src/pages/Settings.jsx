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
      logo_url: form.logo_url || null,
      default_notes: form.default_notes || null,
      default_terms: form.default_terms || null,
      payment_instructions: form.payment_instructions || null,
    }).eq('id', company.id)
    await refreshCompany()
    setBusy(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const onLogo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 400
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        set({ logo_url: canvas.toDataURL('image/png') })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Your company details, shown on invoices." />
      <div className="card max-w-2xl p-6">
        <div className="mb-5">
          <span className="label">Logo</span>
          <div className="flex items-center gap-4">
            {form.logo_url
              ? <img src={form.logo_url} alt="logo" className="h-16 w-16 rounded-lg border border-black/10 object-contain bg-white" />
              : <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-black/20 text-xs text-ink/40">No logo</div>}
            <div className="flex gap-2">
              <label className="btn-outline cursor-pointer">
                Upload<input type="file" accept="image/*" className="hidden" onChange={onLogo} />
              </label>
              {form.logo_url && <button className="btn-ghost" onClick={() => set({ logo_url: '' })}>Remove</button>}
            </div>
          </div>
          <p className="mt-1 text-xs text-ink/45">Shown on your invoices and PDFs.</p>
        </div>

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

        <div className="mt-6 space-y-4 border-t border-black/[.07] pt-5">
          <h2 className="font-display text-lg text-ink">Invoice defaults</h2>
          <p className="-mt-2 text-xs text-ink/45">These auto-fill every new invoice/estimate so you don't retype them.</p>
          <Field label="Default notes"><textarea className="input min-h-[60px]" value={form.default_notes || ''} onChange={e => set({ default_notes: e.target.value })} placeholder="Thanks for your business!" /></Field>
          <Field label="Default terms"><textarea className="input min-h-[60px]" value={form.default_terms || ''} onChange={e => set({ default_terms: e.target.value })} placeholder="Payment due within 30 days." /></Field>
          <Field label="Payment instructions (shown on invoice PDF)"><textarea className="input min-h-[60px]" value={form.payment_instructions || ''} onChange={e => set({ payment_instructions: e.target.value })} placeholder="Bank: ... / Account: ... / Zelle: ..." /></Field>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          {saved && <span className="text-sm text-moss-700">Saved ✓</span>}
        </div>
      </div>
    </>
  )
}
