import { useEffect, useState } from 'react'
import { Package, Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money } from '../lib/format'
import { PageHeader, Spinner, EmptyState, Modal, Field } from '../components/ui'
import { TextCombo } from '../components/Combo'

const blank = { name: '', sku: '', description: '', unit_price: 0, cost: 0, category: '', subcategory: '', tax_rate_id: '', preferred_vendor_id: '', track_inventory: false, stock_quantity: 0, is_active: true }

export default function Products() {
  const { company } = useAuth()
  const [rows, setRows] = useState(null)
  const [taxes, setTaxes] = useState([])
  const [vendors, setVendors] = useState([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const cur = company?.default_currency || 'USD'

  const load = async () => {
    const [{ data: p }, { data: t }, { data: v }] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('tax_rates').select('id, name, rate').order('name'),
      supabase.from('vendors').select('id, name').order('name'),
    ])
    setRows(p || []); setTaxes(t || []); setVendors(v || [])
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
      cost: Number(form.cost) || 0,
      category: form.category || null,
      subcategory: form.subcategory || null,
      tax_rate_id: form.tax_rate_id || null,
      preferred_vendor_id: form.preferred_vendor_id || null,
      track_inventory: !!form.track_inventory,
      stock_quantity: Number(form.stock_quantity) || 0,
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

  const filtered = (rows || []).filter(p => [p.name, p.sku, p.category, p.subcategory].join(' ').toLowerCase().includes(q.toLowerCase()))
  const catSuggestions = [...new Set((rows || []).map(r => r.category).filter(Boolean))]
  const subcatSuggestions = [...new Set((rows || [])
    .filter(r => !form.category || r.category === form.category)
    .map(r => r.subcategory).filter(Boolean))]

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
                <tr><th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 font-semibold">Category</th><th className="px-4 py-3 text-right font-semibold">Cost</th><th className="px-4 py-3 text-right font-semibold">Price</th><th className="px-4 py-3 text-right font-semibold">Stock</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-black/[.05]">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-sand/40">
                    <td className="px-4 py-3"><div className="font-semibold text-ink">{p.name}</div>{p.sku && <div className="text-xs text-ink/45">{p.sku}</div>}</td>
                    <td className="px-4 py-3 text-ink/70">{p.category || '—'}{p.subcategory ? <span className="text-ink/40"> › {p.subcategory}</span> : null}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink/60">{p.cost ? money(p.cost, cur) : '—'}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{money(p.unit_price, cur)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink/70">{p.track_inventory ? Number(p.stock_quantity) : '—'}</td>
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
            <Field label="Category"><TextCombo value={form.category} onChange={v => setForm({ ...form, category: v })} suggestions={catSuggestions} placeholder="e.g. Beverages" /></Field>
            <Field label="Sub-category"><TextCombo value={form.subcategory} onChange={v => setForm({ ...form, subcategory: v })} suggestions={subcatSuggestions} placeholder="e.g. Coffee" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="SKU"><input className="input" value={form.sku || ''} onChange={e => setForm({ ...form, sku: e.target.value })} /></Field>
            <Field label="Cost"><input className="input" type="number" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Selling price"><input className="input" type="number" step="0.01" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} /></Field>
            <Field label="Default tax rate">
              <select className="input" value={form.tax_rate_id || ''} onChange={e => setForm({ ...form, tax_rate_id: e.target.value })}>
                <option value="">No tax</option>
                {taxes.map(t => <option key={t.id} value={t.id}>{t.name} ({Number(t.rate)}%)</option>)}
              </select>
            </Field>
          </div>
          <Field label="Preferred vendor (where you buy it)">
            <select className="input" value={form.preferred_vendor_id || ''} onChange={e => setForm({ ...form, preferred_vendor_id: e.target.value })}>
              <option value="">None</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <div className="rounded-lg border border-black/10 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-ink/80">
              <input type="checkbox" checked={form.track_inventory} onChange={e => setForm({ ...form, track_inventory: e.target.checked })} /> Track inventory / stock
            </label>
            {form.track_inventory && (
              <div className="mt-3"><Field label="Stock quantity"><input className="input" type="number" step="1" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} /></Field></div>
            )}
          </div>
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
