import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, AlertTriangle, Plus, ClipboardList, History } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate } from '../lib/format'
import { PageHeader, Spinner, EmptyState } from '../components/ui'
import { useT } from '../i18n'

const PO_BADGE = {
  draft: 'bg-black/8 text-ink/50',
  ordered: 'bg-moss-50 text-moss-700',
  partial: 'bg-clay/15 text-clay',
  received: 'bg-moss-600 text-white',
  cancelled: 'bg-black/8 text-ink/40 line-through',
}

export default function Purchasing() {
  const { company } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [tab, setTab] = useState('suggest')
  const [products, setProducts] = useState(null)
  const [vendors, setVendors] = useState([])
  const [pos, setPos] = useState(null)
  const [sel, setSel] = useState({}) // productId -> { checked, qty, vendor_id }
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

  useEffect(() => {
    // initialise selection rows for low-stock items
    const init = {}
    for (const p of lowStock) {
      const suggested = p.reorder_qty != null ? Number(p.reorder_qty) : Math.max(Number(p.reorder_point) - Number(p.stock_quantity), 0) || Number(p.reorder_point) || 1
      init[p.id] = { checked: true, qty: String(suggested), vendor_id: p.preferred_vendor_id || '' }
    }
    setSel(init)
  }, [products]) // eslint-disable-line

  const setRow = (id, patch) => setSel(s => ({ ...s, [id]: { ...s[id], ...patch } }))
  const vendorName = (id) => vendors.find(v => v.id === id)?.name || '—'

  const createPOs = async () => {
    const chosen = lowStock.filter(p => sel[p.id]?.checked && Number(sel[p.id]?.qty) > 0)
    if (chosen.length === 0) { alert(t('po_pick_items') || 'Select at least one item with a quantity.'); return }
    // group by vendor
    const groups = {}
    for (const p of chosen) {
      const vid = sel[p.id].vendor_id || ''
      if (!groups[vid]) groups[vid] = []
      groups[vid].push(p)
    }
    setBusy(true)
    let firstPo = null
    let seq = (pos?.length || 0) + 1
    for (const [vid, list] of Object.entries(groups)) {
      const { data: po, error } = await supabase.from('purchase_orders').insert({
        company_id: company.id, vendor_id: vid || null, status: 'draft',
        po_number: `PO-${String(seq).padStart(4, '0')}`,
      }).select('id').single()
      if (error) { alert(error.message); setBusy(false); return }
      seq += 1
      if (!firstPo) firstPo = po.id
      const items = list.map((p, idx) => ({
        po_id: po.id, product_id: p.id, description: p.name,
        qty_ordered: Number(sel[p.id].qty) || 0, qty_received: 0,
        unit_cost: Number(p.cost) || 0, units_per_ctn: p.units_per_ctn || null, sort_order: idx,
      }))
      await supabase.from('purchase_order_items').insert(items)
      const subtotal = Math.round(items.reduce((s, i) => s + i.qty_ordered * i.unit_cost, 0) * 100) / 100
      await supabase.from('purchase_orders').update({ subtotal, total: subtotal }).eq('id', po.id)
    }
    setBusy(false)
    const n = Object.keys(groups).length
    if (n === 1 && firstPo) { navigate(`/purchasing/${firstPo}`); return }
    setTab('pending'); load()
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
              <td className="px-4 py-3 text-right tabular-nums">{money(o.total, company?.default_currency)}</td>
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
        {[['suggest', t('po_tab_suggest') || 'Reorder suggestions', lowStock.length], ['pending', t('po_tab_pending') || 'Pending POs', pending.length], ['history', t('po_tab_history') || 'History', history.length]].map(([k, lbl, n]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === k ? 'bg-moss-600 text-white' : 'bg-black/5 text-ink/60 hover:bg-black/10'}`}>{lbl}{n > 0 ? ` (${n})` : ''}</button>
        ))}
      </div>

      {tab === 'suggest' && (
        lowStock.length === 0 ? (
          <EmptyState icon={ShoppingCart} title={t('po_no_low') || 'Nothing to reorder'} hint={t('po_no_low_h') || 'Products at or below their reorder point will show up here.'} />
        ) : (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-black/10 bg-clay/[.06] px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-clay"><AlertTriangle size={16} /> {lowStock.length} {t('po_low_count') || 'items at/below reorder point'}</div>
              <button className="btn-primary" onClick={createPOs} disabled={busy}><Plus size={16} /> {busy ? t('saving') : (t('po_create') || 'Create PO')}</button>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-black/10 bg-sand/40 text-left text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="w-10 px-3 py-3"></th>
                  <th className="px-3 py-3 font-semibold">{t('c_name')}</th>
                  <th className="px-3 py-3 text-right font-semibold">{t('f_stock_qty') || 'Stock'}</th>
                  <th className="px-3 py-3 text-right font-semibold">{t('f_reorder_point') || 'Reorder pt'}</th>
                  <th className="w-28 px-3 py-3 text-right font-semibold">{t('po_order_qty') || 'Order qty'}</th>
                  <th className="w-48 px-3 py-3 font-semibold">{t('th_vendor') || 'Vendor'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.06]">
                {lowStock.map(p => {
                  const r = sel[p.id] || {}
                  return (
                    <tr key={p.id} className={r.checked ? '' : 'opacity-50'}>
                      <td className="px-3 py-2 text-center"><input type="checkbox" checked={!!r.checked} onChange={e => setRow(p.id, { checked: e.target.checked })} /></td>
                      <td className="px-3 py-2"><div className="font-medium text-ink">{p.name}</div>{p.sku && <div className="text-xs text-ink/45">{p.sku}</div>}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-clay">{Number(p.stock_quantity)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink/50">{Number(p.reorder_point)}</td>
                      <td className="px-3 py-2"><input className="input py-1.5 text-right" type="number" step="1" min="0" value={r.qty ?? ''} onChange={e => setRow(p.id, { qty: e.target.value })} /></td>
                      <td className="px-3 py-2">
                        <select className="input py-1.5" value={r.vendor_id || ''} onChange={e => setRow(p.id, { vendor_id: e.target.value })}>
                          <option value="">{t('po_no_vendor') || '— No vendor —'}</option>
                          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="border-t border-black/10 px-4 py-3 text-xs text-ink/50">{t('po_group_note') || 'Items are grouped into one PO per vendor.'}</div>
          </div>
        )
      )}

      {tab === 'pending' && <POList list={pending} />}
      {tab === 'history' && <POList list={history} />}
    </>
  )
}
