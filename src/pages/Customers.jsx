import { useEffect, useState } from 'react'
import { Users, Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money } from '../lib/format'
import { PageHeader, Spinner, EmptyState, Modal, Field } from '../components/ui'

const blank = {
  name: '', email: '', phone: '', payment_terms: 30, notes: '',
  billing_address: '', billing_city: '', billing_state: '', billing_postal_code: '', billing_country: '',
}

export default function Customers() {
  const { company } = useAuth()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const cur = company?.default_currency || 'USD'

  const load = async () => {
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(blank); setOpen(true) }
  const openEdit = (c) => { setEditing(c); setForm({ ...blank, ...c }); setOpen(true) }

  const save = async () => {
    if (!form.name.trim()) return
    setBusy(true)
    const payload = { ...form, payment_terms: Number(form.payment_terms) || 0, company_id: company.id }
    if (editing) await supabase.from('customers').update(payload).eq('id', editing.id)
    else await supabase.from('customers').insert(payload)
    setBusy(false); setOpen(false); load()
  }

  const remove = async (c) => {
    if (!confirm(`Delete customer "${c.name}"?`)) return
    await supabase.from('customers').delete().eq('id', c.id); load()
  }

  const filtered = (rows || []).filter(c =>
    [c.name, c.email, c.phone, c.billing_city].join(' ').toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <PageHeader title="Customers" subtitle="People and companies you invoice.">
        <button className="btn-primary" onClick={openNew}><Plus size={18} /> New customer</button>
      </PageHeader>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={Users} title="No customers yet" hint="Add your first customer to start invoicing."
          action={<button className="btn-primary" onClick={openNew}><Plus size={18} /> New customer</button>} />
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-black/[.07] px-4 py-3">
            <Search size={18} className="text-ink/40" />
            <input className="w-full bg-transparent text-sm outline-none placeholder:text-black/30"
              placeholder="Search by name, phone, city…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.05]">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-sand/40">
                    <td className="px-4 py-3 font-semibold text-ink">{c.name}</td>
                    <td className="px-4 py-3 text-ink/70">{c.email || c.phone || '—'}</td>
                    <td className="px-4 py-3 text-ink/70">{c.billing_city || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{money(c.balance, cur)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="rounded-md p-2 text-ink/50 hover:bg-black/5 hover:text-ink" onClick={() => openEdit(c)}><Pencil size={16} /></button>
                        <button className="rounded-md p-2 text-ink/50 hover:bg-clay/10 hover:text-clay" onClick={() => remove(c)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit customer' : 'New customer'} wide>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name *"><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Payment terms (days)"><input className="input" type="number" value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Billing address"><input className="input" value={form.billing_address || ''} onChange={e => setForm({ ...form, billing_address: e.target.value })} /></Field></div>
          <Field label="City"><input className="input" value={form.billing_city || ''} onChange={e => setForm({ ...form, billing_city: e.target.value })} /></Field>
          <Field label="State"><input className="input" value={form.billing_state || ''} onChange={e => setForm({ ...form, billing_state: e.target.value })} /></Field>
          <Field label="Postal code"><input className="input" value={form.billing_postal_code || ''} onChange={e => setForm({ ...form, billing_postal_code: e.target.value })} /></Field>
          <Field label="Country"><input className="input" value={form.billing_country || ''} onChange={e => setForm({ ...form, billing_country: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Notes"><textarea className="input min-h-[70px]" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </>
  )
}
