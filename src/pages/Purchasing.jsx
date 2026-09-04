import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, AlertTriangle, Plus, Trash2, ClipboardList } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate } from '../lib/format'
import { PageHeader, Spinner, EmptyState } from '../components/ui'
import { ItemCombo } from '../components/Combo'
import { useT } from '../i18n'

const PO_BADGE = {
  draft: 'bg-black/8 text-ink/50', ordered: 'bg-moss-50 text-moss-700',
  partial: 'bg-clay/15 text-clay', received: 'bg-moss-600 text-white', cancelled: 'bg-black/8 text-ink/40 line-through',
}

export default function Purchasing() {
  const { company } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const cur = company?.default_currency || 'USD'
  const [tab, setTab] = useState('build')
  const [products, setProducts] = useState(null)
  const [vendors, setVendors] = useState([])
  const [pos, setPos] = useState(null)
  const [cart, setCart] = useState([])
  const [vendorId, setVendorId] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [{ data: p }, { data: v }, { data: o }] = await Promise.all([
      supabase.from('products').select('id, name, sku, stock_quantity, reorder_point, reorder_qty, cost, preferred_vendor_id, units_per_ctn, track_inventory').order('name'),
      supabase.from('vendors').select('id, name').order('name'),
      supabase.from('purchase_orders').select('*, vendor:vendors(name)').order('order_date', { ascending: false }).order('created_at', { ascending: false }),
    ])
    setProducts(p || []); setVendors(v || []); setPos(o || [])
  }
  useEffect(() => { load() }, [])

  const lowStock = useMemo(() => (products || []).filter(p => p.track_inventory && Number(p.reorder_point) > 0 && Number(p.stock_quantity) <= Number(p.reorder_point)), [products])

  const rowFor = (p) => {
    const suggested = p.reorder_qty != null ? Number(p.reorder_qty) : Math.max(Number(p.reorder_point) - Number(p.stock_quantity), 0) || Number(p.reorder_point) || 1
    return { key: p.id, product_id: p.id, name: p.name, sku: p.sku, stock: Number(p.stock_quantity), reorder_point: p.reorder_point, units_per_ctn: p.units_per_ctn, qty: String(suggested), unit_cost: String(Number(p.cost) || 0) }
  }

  useEffect(() => { setCart(lowStock.map(rowFor)) }, [products]) // eslint-disable-line

  const addLowAll = () => {
    const have = new Set(cart.map(r => r.product_id))
    setCart([...cart, ...lowStock.filter(p => !have.has(p.id)).map(rowFor)])
  }
  const addProduct = (p) => {
    if (cart.some(r => r.product_id === p.id)) return
    setCart([...cart, { key: p.id + Math.random().toString(36).slice(2, 5), product_id: p.id, name: p.name, sku: p.sku, stock: Number(p.stock_quantity), reorder_point: p.reorder_point, units_per_ctn: p.units_per_ctn, qty: '1', unit_cost: String(Number(p.cost) || 0) }])
  }
  const setRow = (key, patch) => setCart(cart.map(r => r.key === key ? { ...r, ...patch } : r))
  const removeRow = (key) => setCart(cart.filter(r => r.key !== key))

  const cartTotal = cart.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unit_cost) || 0), 0)

  const createPO = async () => {
    const rows = cart.filter(r => Number(r.qty) > 0)
    if (rows.length === 0) { alert(t('po_pick_items') || 'Add at least one item with a quantity.'); return }
    if (!vendorId) { alert(t('po_need_vendor') || 'Please select a vendor.'); return }
    setBusy(true)
    const seq = (pos?.length || 0) + 1
    const { data: po, error } = await supabase.from('purchase_orders').insert({
      company_id: company.id, vendor_id: vendorId, status: 'draft', po_number: `PO-${String(seq).padStart(4, '0')}`,
    }).select('id').single()
    if (error) { alert(error.message); setBusy(false); return }
    const items = rows.map((r, idx) => ({
      po_id: po.id, product_id: r.product_id, description: r.name,
      qty_ordered: Number(r.qty) || 0, qty_received: 0, unit_cost: Number(r.unit_cost) || 0,
      units_per_ctn: r.units_per_ctn || null, sort_order: idx,
    }))
    await supabase.from('purchase_order_items').insert(items)
    const subtotal = Math.round(items.reduce((s, i) => s + i.qty_ordered * i.unit_cost, 0) * 100) / 100
    await supabase.from('purchase_orders').update({ subtotal, total: subtotal }).eq('id', po.id)
    setBusy(false)
    navigate(`/purchasing/${po.id}`)
  }

  if (products === null) return <Spinner />

  const pending = (pos || []).filter(o => ['draft', 'ordered', 'partial'].includes(o.status))
  const history = (pos || []).filter(o => ['received', 'cancelled'].includes(o.status))

  const POList = ({ list }) => list.length === 0 ? (
    <EmptyState icon={ClipboardList} title={t('po_none') || 'No purchase orders'} />
  ) : (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-black/10 bg-sand/40 text-left text-xs uppercase tracking-wide text-ink/50">
          <tr><th className="px-4 py-3 font-semibold">PO #</th><th className="px-4 py-3 font-semibold">{t('th_vendor') || 'Vendor'}</th><th className="px-4 py-3 font-semibold">{t('f_date')}</th><th className="px-4 py-3 font-semibold">{t('th_status') || 'Status'}</th><th className="px-4 py-3 text-right font-semibold">{t('th_total')}</th></tr>
        </thead>
        <tbody className="divide-y divide-black/[.06]">
          {list.map(o => (
            <tr key={o.id} className="cursor-pointer hover:bg-sand/40" onClick={() => navigate(`/purchasing/${o.id}`)}>
              <td className="px-4 py-3 font-semibold text-ink">{o.po_number || '—'}</td>
              <td className="px-4 py-3 text-ink/70">{o.vendor?.name || '—'}</td>
              <td className="px-4 py-3 text-ink/55">{fmtDate(o.order_date)}</td>
              <td className="px-4 py-3"><span className={`badge ${PO_BADGE[o.status] || ''}`}>{t('po_st_' + o.status) || o.status}</span></td>
              <td className="px-4 py-3 text-right tabular-nums">{money(o.total, cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <PageHeader title={t('nav_purchasing') || 'Purchasing'} subtitle={t('po_sub') || 'Reorder low stock and manage purchase orders'} />

      <div className="mb-4 flex gap-1">
        {[['build', t('po_tab_build') || 'Build PO', cart.length], ['pending', t('po_tab_pending') || 'Pending POs', pending.length], ['history', t('po_tab_history') || 'History', history.length]].map(([k, lbl, n]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === k ? 'bg-moss-600 text-white' : 'bg-black/5 text-ink/60 hover:bg-black/10'}`}>{lbl}{n > 0 ? ` (${n})` : ''}</button>
        ))}
      </div>

      {tab === 'build' && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-sand/40 px-4 py-3">
            <div className="min-w-[240px] flex-1">
              <ItemCombo value={q} products={products} currency={cur} onText={setQ} onPick={(p) => { addProduct(p); setQ('') }} placeholder={t('po_add_item') || 'Add an item to order…'} />
            </div>
            {lowStock.length > 0 && <button className="btn-outline text-sm" onClick={addLowAll}><AlertTriangle size={15} /> {t('po_add_low') || 'Add all low stock'} ({lowStock.length})</button>}
          </div>

          {cart.length === 0 ? (
            <EmptyState icon={ShoppingCart} title={t('po_cart_empty') || 'No items yet'} hint={t('po_cart_empty_h') || 'Add low-stock items or search for any product to start a purchase order.'} />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-black/10 bg-sand/40 text-left text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-3 py-3 font-semibold">{t('c_name')}</th>
                  <th className="px-3 py-3 text-right font-semibold">{t('f_stock_qty') || 'Stock'}</th>
                  <th className="w-24 px-3 py-3 text-right font-semibold">{t('po_order_qty') || 'Order qty'}</th>
                  <th className="w-28 px-3 py-3 text-right font-semibold">{t('rcv_unit_cost') || 'Unit cost'}</th>
                  <th className="w-28 px-3 py-3 text-right font-semibold">{t('th_total')}</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.06]">
                {cart.map(r => {
                  const low = Number(r.reorder_point) > 0 && r.stock <= Number(r.reorder_point)
                  return (
                    <tr key={r.key}>
                      <td className="px-3 py-2"><div className="font-medium text-ink">{r.name}{low && <span className="badge ml-2 bg-clay/15 text-clay">{t('low') || 'Low'}</span>}</div>{r.sku && <div className="text-xs text-ink/45">{r.sku}</div>}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${low ? 'text-clay' : 'text-ink/50'}`}>{r.stock}{Number(r.reorder_point) > 0 ? <span className="text-ink/35"> / {Number(r.reorder_point)}</span> : null}</td>
                      <td className="px-3 py-2"><input className="input py-1.5 text-right" type="number" step="1" min="0" value={r.qty} onChange={e => setRow(r.key, { qty: e.target.value })} /></td>
                      <td className="px-3 py-2"><input className="input py-1.5 text-right" type="number" step="0.01" min="0" value={r.unit_cost} onChange={e => setRow(r.key, { unit_cost: e.target.value })} /></td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink/70">{money((Number(r.qty) || 0) * (Number(r.unit_cost) || 0), cur)}</td>
                      <td className="px-3 py-2 text-right"><button className="rounded p-1 text-ink/40 hover:text-clay" onClick={() => removeRow(r.key)}><Trash2 size={15} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 p-4">
            <div className="flex items-center gap-2">
              <span className="label !mb-0">{t('th_vendor') || 'Vendor'}</span>
              <select className="input w-56" value={vendorId} onChange={e => setVendorId(e.target.value)}>
                <option value="">{t('po_select_vendor') || 'Select vendor…'}</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right"><span className="text-xs text-ink/50">{t('th_total')}: </span><span className="font-display text-xl text-ink tabular-nums">{money(cartTotal, cur)}</span></div>
              <button className="btn-primary" onClick={createPO} disabled={busy || cart.length === 0}><Plus size={16} /> {busy ? t('saving') : (t('po_create') || 'Create PO')}</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'pending' && <POList list={pending} />}
      {tab === 'history' && <POList list={history} />}
    </>
  )
}
