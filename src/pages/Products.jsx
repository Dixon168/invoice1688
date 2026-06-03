import { useEffect, useState } from 'react'
import { Package, Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money } from '../lib/format'
import { PageHeader, Spinner, EmptyState, Modal, Field } from '../components/ui'

const blank = { name: '', sku: '', description: '', unit_price: 0, tax_rate_id: '', is_active: true }

export default function Products() {
  const { company } = useAuth()
  const [rows, setRows] = useState(null)
  const [taxes, setTaxes] = useState([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const cur = company?.default_currency || 'USD'

  const load = async () => {
    const [{ data: p }, { data: t }] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('tax_rates').select('id, name, rate').order('name'),
    ])
    setRows(p || []); setTaxes(t || [])
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(blank); setOpen(true) }
  const openEdit = (p) => { setEditing(p); setForm({ ...blank, ...p, tax_rate_id: p.tax_rate_id || '' }); setOpen(true) }

  const save = async () => {
    if (!form.name.trim()) return
    setBusy(true)
    const payload = {
      name: form.name, sku: form.sku, description: form.description,
      unit_price: Number(form.unit_price) || 0,
      tax_rate_id: form.tax_rate_id || null,
      is_active: form.is_active, company_id: company.id,
    }
    if (editing) await supabase.from('products').update(payload).eq('id', editing.id)
    else await supabase.from('products').insert(payload)
    setBusy(false); setOpen(false); load()
  }
  const remove = async (p) => {
    if (!confirm(`Delete "${p.name}"?`)) return
    await supabase.from('products').delete().eq('id', p.id); load()
  }

  const filtered = (rows || []).filter(p => [p.name, p.sku].join(' ').toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <PageHeader title="Products & Services" subtitle="Items you put on invoices.">
        <button className="btn-primary" onClick={openNew}><Plus size={18} /> New item</button>
      </PageHeader>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={Package} title="No items yet" hint="Add products or services to drop onto invoices quickly."
          action={<button className="btn-primary" onClick={openNew}><Plus size={18} /> New item</button>} />
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-black/[.07] px-4 py-3">
            <Search size={18} className="text-ink/40" />
            <input className="w-full bg-transparent text-sm outline-none placeholder:text-black/30" placeholder="Search items…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
                <tr><th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 font-semibold">SKU</th><th className="px-4 py-3 text-right font-semibold">Price</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-black/[.05]">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-sand/40">
                    <td className="px-4 py-3 font-semibold text-ink">{p.name}</td>
                    <td className="px-4 py-3 text-ink/60">{p.sku || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{money(p.unit_price, cur)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="rounded-md p-2 text-ink/50 hover:bg-black/5 hover:text-ink" onClick={() => openEdit(p)}><Pencil size={16} /></button>
                        <button className="rounded-md p-2 text-ink/50 hover:bg-clay/10 hover:text-clay" onClick={() => remove(p)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit item' : 'New item'}>
        <div className="space-y-4">
          <Field label="Name *"><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="SKU"><input className="input" value={form.sku || ''} onChange={e => setForm({ ...form, sku: e.target.value })} /></Field>
            <Field label="Unit price"><input className="input" type="number" step="0.01" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} /></Field>
          </div>
          <Field label="Default tax rate">
            <select className="input" value={form.tax_rate_id || ''} onChange={e => setForm({ ...form, tax_rate_id: e.target.value })}>
              <option value="">No tax</option>
              {taxes.map(t => <option key={t.id} value={t.id}>{t.name} ({Number(t.rate)}%)</option>)}
            </select>
          </Field>
          <Field label="Description"><textarea className="input min-h-[70px]" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </>
  )
}
