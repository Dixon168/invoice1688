import { useEffect, useState } from 'react'
import { Package, Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money } from '../lib/format'
import { PageHeader, Spinner, EmptyState, Modal, Field } from '../components/ui'
import { TextCombo } from '../components/Combo'
import { adjustStock } from '../lib/inventory'
import { useT } from '../i18n'

const blank = { name: '', sku: '', description: '', unit_price: 0, cost: 0, category: '', subcategory: '', tax_rate_id: '', preferred_vendor_id: '', track_inventory: true, stock_quantity: 0, reorder_point: '', is_active: true }

export default function Products() {
  const { company } = useAuth()
  const { t } = useT()
  const [rows, setRows] = useState(null)
  const [taxes, setTaxes] = useState([])
  const [vendors, setVendors] = useState([])
  const [cats, setCats] = useState([])
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [adj, setAdj] = useState(null)
  const [adjForm, setAdjForm] = useState({ delta: '', note: '' })
  const cur = company?.default_currency || 'USD'

  const load = async () => {
    const [{ data: p }, { data: t }, { data: v }, { data: cats }] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('tax_rates').select('id, name, rate').order('name'),
      supabase.from('vendors').select('id, name').order('name'),
      supabase.from('categories').select('*').order('name'),
    ])
    setRows(p || []); setTaxes(t || []); setVendors(v || []); setCats(cats || [])
  }
  useEffect(() => { load() }, [])

  const refreshCats = async () => { const { data } = await supabase.from('categories').select('*').order('name'); setCats(data || []) }
  const openNew = () => { setEditing(null); setForm(blank); refreshCats(); setOpen(true) }
  const openEdit = (p) => { setEditing(p); setForm({ ...blank, ...p, tax_rate_id: p.tax_rate_id || '' }); refreshCats(); setOpen(true) }

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
      reorder_point: form.reorder_point === '' || form.reorder_point == null ? null : Number(form.reorder_point),
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
  const openAdjust = (p) => { setAdj(p); setAdjForm({ delta: '', note: '' }) }
  const saveAdjust = async () => {
    const delta = Number(adjForm.delta)
    if (!delta) return
    setBusy(true)
    await adjustStock(company.id, adj.id, delta, adjForm.note)
    setBusy(false); setAdj(null); load()
  }

  const isLow = (p) => p.track_inventory && p.reorder_point != null && Number(p.stock_quantity) <= Number(p.reorder_point)
  const filtered = (rows || [])
    .filter(p => [p.name, p.sku, p.category, p.subcategory].join(' ').toLowerCase().includes(q.toLowerCase()))
    .filter(p => !catFilter || p.category === catFilter)
    .filter(p => !lowOnly || isLow(p))
  const lowCount = (rows || []).filter(isLow).length

  // category dropdowns sourced from the categories table (single source of truth)
  const topCats = cats.filter(c => !c.parent_id)
  const selectedTop = topCats.find(c => c.name === form.category)
  const subCats = selectedTop ? cats.filter(c => c.parent_id === selectedTop.id) : []
  const filterCatNames = [...new Set([...topCats.map(c => c.name), ...(rows || []).map(r => r.category).filter(Boolean)])]

  const createCat = async (name, parentId) => {
    const { data, error } = await supabase.from('categories')
      .insert({ company_id: company.id, name, parent_id: parentId || null }).select('*').single()
    if (error) { alert('Could not add category: ' + error.message); return null }
    await load(); return data
  }
  const onCategory = async (val) => {
    if (val === '__new__') {
      const name = (prompt('New category name') || '').trim()
      if (!name) return
      const c = await createCat(name, null)
      if (c) setForm(f => ({ ...f, category: name, subcategory: '' }))
      return
    }
    setForm(f => ({ ...f, category: val, subcategory: '' }))
  }
  const onSubcategory = async (val) => {
    if (val === '__new__') {
      if (!selectedTop) { alert('Pick a category first.'); return }
      const name = (prompt('New sub-category name') || '').trim()
      if (!name) return
      const s = await createCat(name, selectedTop.id)
      if (s) setForm(f => ({ ...f, subcategory: name }))
      return
    }
    setForm(f => ({ ...f, subcategory: val }))
  }

  // quick "move to category" for a product straight from the list
  const [moveCat, setMoveCat] = useState(null)
  const [moveForm, setMoveForm] = useState({ category: '', subcategory: '' })
  const openMove = (p) => { setMoveCat(p); setMoveForm({ category: p.category || '', subcategory: p.subcategory || '' }) }
  const moveTop = topCats.find(c => c.name === moveForm.category)
  const moveSubs = moveTop ? cats.filter(c => c.parent_id === moveTop.id) : []
  const onMoveCategory = async (val) => {
    if (val === '__new__') {
      const name = (prompt('New category name') || '').trim()
      if (!name) return
      const c = await createCat(name, null)
      if (c) setMoveForm(f => ({ ...f, category: name, subcategory: '' }))
      return
    }
    setMoveForm(f => ({ ...f, category: val, subcategory: '' }))
  }
  const onMoveSubcategory = async (val) => {
    if (val === '__new__') {
      const top = topCats.find(c => c.name === moveForm.category)
      if (!top) { alert('Pick a category first.'); return }
      const name = (prompt('New sub-category name') || '').trim()
      if (!name) return
      const s = await createCat(name, top.id)
      if (s) setMoveForm(f => ({ ...f, subcategory: name }))
      return
    }
    setMoveForm(f => ({ ...f, subcategory: val }))
  }
  const saveMove = async () => {
    await supabase.from('products').update({ category: moveForm.category || null, subcategory: moveForm.subcategory || null }).eq('id', moveCat.id)
    setMoveCat(null); load()
  }

  return (
    <>
      <PageHeader title={t('products_title')} subtitle={t('products_sub')}>
        <button className="btn-primary" onClick={openNew}><Plus size={18} /> {t('new_item')}</button>
      </PageHeader>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={Package} title={t('es_no_items')} hint={t('es_no_items_h')}
          action={<button className="btn-primary" onClick={openNew}><Plus size={18} /> {t('new_item')}</button>} />
      ) : (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-black/[.07] px-4 py-3">
            <div className="flex min-w-[180px] flex-1 items-center gap-2">
              <Search size={18} className="text-ink/40" />
              <input className="w-full bg-transparent text-sm outline-none placeholder:text-black/30" placeholder={t('ph_search_items')} value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <select className="input max-w-[200px] py-1.5 text-sm" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="">All categories</option>
              {filterCatNames.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => setLowOnly(v => !v)}
              className={`badge px-3 py-1.5 ${lowOnly ? 'bg-red-600 text-white' : 'bg-white text-ink/60 hover:bg-black/5'}`}>
              Low stock{lowCount > 0 ? ` (${lowCount})` : ''}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
                <tr><th className="px-4 py-3 font-semibold">{t('th_name')}</th><th className="px-4 py-3 font-semibold">{t('th_category')}</th><th className="px-4 py-3 text-right font-semibold">{t('th_cost')}</th><th className="px-4 py-3 text-right font-semibold">{t('th_price')}</th><th className="px-4 py-3 text-right font-semibold">{t('th_stock')}</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-black/[.05]">
                {filtered.map(p => (
                  <tr key={p.id} className="cursor-pointer hover:bg-sand/40" onClick={() => openEdit(p)}>
                    <td className="px-4 py-3"><div className="font-semibold text-ink">{p.name}</div>{p.sku && <div className="text-xs text-ink/45">{p.sku}</div>}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => openMove(p)} className="text-left text-ink/70 hover:text-moss-700" title={t('cat_move_to')}>
                        {p.category || '—'}{p.subcategory ? <span className="text-ink/40"> › {p.subcategory}</span> : null}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink/60">{p.cost ? money(p.cost, cur) : '—'}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{money(p.unit_price, cur)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink/70">
                      {p.track_inventory ? (
                        <span className="inline-flex items-center gap-1.5">
                          {p.reorder_point != null && Number(p.stock_quantity) <= Number(p.reorder_point) &&
                            <span className="badge bg-red-100 text-red-700">Low</span>}
                          {Number(p.stock_quantity)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {p.track_inventory && <button className="rounded-md p-2 text-ink/50 hover:bg-moss-50 hover:text-moss-700" title="Adjust stock" onClick={() => openAdjust(p)}><Package size={16} /></button>}
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `${t('edit')} ${t('th_item')}` : t('new_item')}>
        <div className="space-y-4">
          <Field label={t('f_name_req')}><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('f_category')}>
              <select className="input" value={form.category || ''} onChange={e => onCategory(e.target.value)}>
                <option value="">—</option>
                {topCats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                {form.category && !topCats.some(c => c.name === form.category) && <option value={form.category}>{form.category}</option>}
                <option value="__new__">+ {t('add')}…</option>
              </select>
            </Field>
            <Field label={t('f_subcategory')}>
              <select className="input" value={form.subcategory || ''} onChange={e => onSubcategory(e.target.value)} disabled={!form.category}>
                <option value="">—</option>
                {subCats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                {form.subcategory && !subCats.some(c => c.name === form.subcategory) && <option value={form.subcategory}>{form.subcategory}</option>}
                <option value="__new__">+ {t('add')}…</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('f_sku')}><input className="input" value={form.sku || ''} onChange={e => setForm({ ...form, sku: e.target.value })} /></Field>
            <Field label={t('f_cost')}><input className="input" type="number" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('f_selling_price')}><input className="input" type="number" step="0.01" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} /></Field>
            <Field label={t('f_default_tax')}>
              <select className="input" value={form.tax_rate_id || ''} onChange={e => setForm({ ...form, tax_rate_id: e.target.value })}>
                <option value="">No tax</option>
                {taxes.map(t => <option key={t.id} value={t.id}>{t.name} ({Number(t.rate)}%)</option>)}
              </select>
            </Field>
          </div>
          <Field label={t('f_preferred_vendor')}>
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
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label={t('f_stock_qty')}><input className="input" type="number" step="1" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} /></Field>
                <Field label={t('f_reorder_point')}><input className="input" type="number" step="1" value={form.reorder_point} onChange={e => setForm({ ...form, reorder_point: e.target.value })} placeholder="e.g. 5" /></Field>
              </div>
            )}
          </div>
          <Field label={t('f_description')}><textarea className="input min-h-[70px]" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setOpen(false)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>

      <Modal open={!!adj} onClose={() => setAdj(null)} title={`${t('adjust_stock')} · ${adj?.name || ''}`}>
        <p className="mb-3 text-sm text-ink/60">Current stock: <span className="font-semibold text-ink">{adj ? Number(adj.stock_quantity) : 0}</span>. Use a positive number to add (restock), negative to remove.</p>
        <div className="space-y-4">
          <Field label={t('f_change_inout')}><input className="input" type="number" step="1" value={adjForm.delta} onChange={e => setAdjForm({ ...adjForm, delta: e.target.value })} placeholder="e.g. 20 or -3" /></Field>
          <Field label={t('f_note')}><input className="input" value={adjForm.note} onChange={e => setAdjForm({ ...adjForm, note: e.target.value })} placeholder="e.g. Restock from Amazon" /></Field>
          {adjForm.delta !== '' && !isNaN(Number(adjForm.delta)) && (
            <p className="text-sm text-ink/60">New stock will be <span className="font-semibold text-moss-700">{Number(adj?.stock_quantity || 0) + Number(adjForm.delta)}</span></p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setAdj(null)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={saveAdjust} disabled={busy}>{busy ? 'Saving…' : 'Apply'}</button>
        </div>
      </Modal>

      <Modal open={!!moveCat} onClose={() => setMoveCat(null)} title={`${t('cat_move_to')} · ${moveCat?.name || ''}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('f_category')}>
            <select className="input" value={moveForm.category || ''} onChange={e => onMoveCategory(e.target.value)}>
              <option value="">—</option>
              {topCats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              {moveForm.category && !topCats.some(c => c.name === moveForm.category) && <option value={moveForm.category}>{moveForm.category}</option>}
              <option value="__new__">+ {t('add')}…</option>
            </select>
          </Field>
          <Field label={t('f_subcategory')}>
            <select className="input" value={moveForm.subcategory || ''} onChange={e => onMoveSubcategory(e.target.value)} disabled={!moveForm.category}>
              <option value="">—</option>
              {moveSubs.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              {moveForm.subcategory && !moveSubs.some(c => c.name === moveForm.subcategory) && <option value={moveForm.subcategory}>{moveForm.subcategory}</option>}
              <option value="__new__">+ {t('add')}…</option>
            </select>
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setMoveCat(null)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={saveMove}>{t('save')}</button>
        </div>
      </Modal>
    </>
  )
}
