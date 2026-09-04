import { useEffect, useState } from 'react'
import { Package, Plus, Search, Pencil, Trash2, History } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate } from '../lib/format'
import { PageHeader, Spinner, EmptyState, Modal, Field } from '../components/ui'
import { TemplateButton, ImportButton } from '../components/ImportExport'
import { TextCombo } from '../components/Combo'
import { adjustStock } from '../lib/inventory'
import { useT } from '../i18n'

const blank = { name: '', sku: '', description: '', unit_price: 0, cost: 0, category: '', subcategory: '', tax_rate_id: '', preferred_vendor_id: '', track_inventory: true, stock_quantity: 0, reorder_point: '', reorder_qty: '', units_per_ctn: '', is_active: true }

const productFields = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'sku', label: 'SKU', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'subcategory', label: 'Subcategory', type: 'text' },
  { key: 'cost', label: 'Cost', type: 'number' },
  { key: 'unit_price', label: 'Selling price', type: 'number' },
  { key: 'track_inventory', label: 'Track inventory (yes/no)', type: 'bool' },
  { key: 'stock_quantity', label: 'Stock qty', type: 'number' },
  { key: 'reorder_point', label: 'Reorder point', type: 'number' },
  { key: 'tax_rate_name', label: 'Tax rate (optional)', type: 'text' },
]
const productExample = ['Widget A', 'SKU-001', 'Sample item', 'Beverages', 'Coffee', 5, 9.99, 'yes', 100, 10, '(leave blank = default tax)']

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
      supabase.from('tax_rates').select('id, name, rate, is_default').order('name'),
      supabase.from('vendors').select('id, name').order('name'),
      supabase.from('categories').select('*').order('name'),
    ])
    setRows(p || []); setTaxes(t || []); setVendors(v || []); setCats(cats || [])
  }
  useEffect(() => { load() }, [])

  const refreshCats = async () => { const { data } = await supabase.from('categories').select('*').order('name'); setCats(data || []) }

  // categories reference sheet for the export template (so you can see existing categories while filling)
  const catSheet = (() => {
    const tops = cats.filter(c => !c.parent_id)
    const rows = []
    tops.forEach(tc => {
      const subs = cats.filter(c => c.parent_id === tc.id)
      if (subs.length === 0) rows.push([tc.name, ''])
      else subs.forEach(s => rows.push([tc.name, s.name]))
    })
    return rows.length ? [{ name: 'Categories', headers: ['Category', 'Sub-category'], rows }] : []
  })()

  // --- batch import helpers ---
  const defaultTaxId = taxes.find(t => t.is_default)?.id || null
  const importTransform = (rec) => {
    let taxId = defaultTaxId
    if (rec.tax_rate_name) {
      const found = taxes.find(t => (t.name || '').toLowerCase() === String(rec.tax_rate_name).toLowerCase())
      if (found) taxId = found.id
    }
    delete rec.tax_rate_name
    rec.tax_rate_id = taxId
    return rec
  }
  const importCategories = async (records) => {
    const { data: existing } = await supabase.from('categories').select('id, name, parent_id')
    const all = existing || []
    const findTop = (name) => all.find(c => !c.parent_id && c.name.toLowerCase() === String(name).toLowerCase())
    const findSub = (pid, name) => all.find(c => c.parent_id === pid && c.name.toLowerCase() === String(name).toLowerCase())
    for (const r of records) {
      if (!r.category) continue
      let top = findTop(r.category)
      if (!top) {
        const { data } = await supabase.from('categories').insert({ company_id: company.id, name: r.category }).select().single()
        if (data) { top = data; all.push(data) }
      }
      if (r.subcategory && top && !findSub(top.id, r.subcategory)) {
        const { data } = await supabase.from('categories').insert({ company_id: company.id, name: r.subcategory, parent_id: top.id }).select().single()
        if (data) all.push(data)
      }
    }
    refreshCats()
    return records
  }
  const openNew = () => { setEditing(null); setForm({ ...blank, tax_rate_id: defaultTaxId || '' }); refreshCats(); setOpen(true) }
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
      reorder_qty: form.reorder_qty === '' || form.reorder_qty == null ? null : Number(form.reorder_qty),
      units_per_ctn: form.units_per_ctn === '' || form.units_per_ctn == null ? null : Number(form.units_per_ctn),
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
  const [hist, setHist] = useState(null)
  const [histRows, setHistRows] = useState(null)
  const openHistory = async (p) => {
    setHist(p); setHistRows(null)
    const { data } = await supabase.from('inventory_movements')
      .select('*').eq('product_id', p.id).order('created_at', { ascending: false })
    setHistRows(data || [])
  }
  const moveLabel = (m) => {
    if (m.reason === 'receiving') return t('mv_received')
    if (m.reason === 'invoice') return t('mv_sold')
    return t('mv_adjusted')
  }
  const saveAdjust = async () => {
    const delta = Number(adjForm.delta)
    if (!delta) return
    setBusy(true)
    await adjustStock(company.id, adj.id, delta, adjForm.note)
    setBusy(false); setAdj(null); load()
  }

  const isLow = (p) => p.track_inventory && p.reorder_point != null && Number(p.stock_quantity) <= Number(p.reorder_point)

  // category dropdowns sourced from the categories table (single source of truth)
  const topCats = cats.filter(c => !c.parent_id)
  const selectedTop = topCats.find(c => c.name === form.category)
  const subCats = selectedTop ? cats.filter(c => c.parent_id === selectedTop.id) : []
  // hierarchical filter options: each main category + its sub-categories
  const filterOptions = []
  topCats.forEach(tc => {
    filterOptions.push({ value: `c|||${tc.name}`, label: tc.name })
    cats.filter(c => c.parent_id === tc.id).forEach(s => filterOptions.push({ value: `s|||${tc.name}|||${s.name}`, label: `↳ ${s.name}` }))
  })
  const known = new Set(topCats.map(t => t.name))
  ;[...new Set((rows || []).map(r => r.category).filter(Boolean))].forEach(name => { if (!known.has(name)) filterOptions.push({ value: `c|||${name}`, label: name }) })
  const matchCat = (p) => {
    if (!catFilter) return true
    const parts = catFilter.split('|||')
    if (parts[0] === 'c') return p.category === parts[1]
    if (parts[0] === 's') return p.category === parts[1] && p.subcategory === parts[2]
    return true
  }

  const filtered = (rows || [])
    .filter(p => [p.name, p.sku, p.category, p.subcategory].join(' ').toLowerCase().includes(q.toLowerCase()))
    .filter(matchCat)
    .filter(p => !lowOnly || isLow(p))
  const lowCount = (rows || []).filter(isLow).length

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
        <TemplateButton filename="products_template.xlsx" fields={productFields} example={productExample} sheets={catSheet} />
        <ImportButton table="products" fields={productFields} companyId={company.id} transform={importTransform} beforeInsert={importCategories} onDone={load} />
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
              {filterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                        <button className="rounded-md p-2 text-ink/50 hover:bg-black/5 hover:text-ink" title={t('prod_history')} onClick={() => openHistory(p)}><History size={16} /></button>
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
            <Field label={t('f_units_per_ctn') || 'Units per box (CTN)'}><input className="input" type="number" step="1" min="0" value={form.units_per_ctn} onChange={e => setForm({ ...form, units_per_ctn: e.target.value })} placeholder={t('f_units_per_ctn_ph') || 'e.g. 20 · leave blank if sold loose'} /></Field>
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
                <Field label={t('f_reorder_qty') || 'Default order qty'}><input className="input" type="number" step="1" value={form.reorder_qty} onChange={e => setForm({ ...form, reorder_qty: e.target.value })} placeholder="e.g. 20" /></Field>
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
      <Modal open={!!hist} onClose={() => setHist(null)} title={`${t('prod_history')} · ${hist?.name || ''}`} wide>
        {histRows === null ? <Spinner /> : histRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink/50">{t('mv_none')}</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="py-2 pr-2 font-semibold">{t('th_date')}</th>
                  <th className="py-2 px-2 font-semibold">{t('th_status')}</th>
                  <th className="py-2 px-2 text-right font-semibold">{t('th_change')}</th>
                  <th className="py-2 pl-2 font-semibold">{t('f_note')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.05]">
                {histRows.map(m => (
                  <tr key={m.id}>
                    <td className="py-2 pr-2 text-ink/70">{fmtDate(m.created_at)}</td>
                    <td className="py-2 px-2"><span className="badge bg-black/5 text-ink/70">{moveLabel(m)}</span></td>
                    <td className={`py-2 px-2 text-right font-semibold tabular-nums ${Number(m.change) >= 0 ? 'text-moss-700' : 'text-clay'}`}>{Number(m.change) >= 0 ? '+' : ''}{Number(m.change)}</td>
                    <td className="py-2 pl-2 text-ink/55">{m.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </>
  )
}
