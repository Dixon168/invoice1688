import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, FileDown, PackageCheck, Send, Ban } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate, todayISO, ctnLabel } from '../lib/format'
import { recalcPO, recalcVendorBill, recalcVendor } from '../lib/calc'
import { receiveStock } from '../lib/inventory'
import { purchaseOrderPDF } from '../lib/pdf'
import { usePdfPreview, PdfPreview } from '../components/PdfPreview'
import { Spinner, Modal } from '../components/ui'
import { useT } from '../i18n'

const PO_BADGE = {
  draft: 'bg-black/8 text-ink/50', ordered: 'bg-moss-50 text-moss-700',
  partial: 'bg-clay/15 text-clay', received: 'bg-moss-600 text-white', cancelled: 'bg-black/8 text-ink/40 line-through',
}

export default function PurchaseOrderDetail() {
  const { id } = useParams()
  const { company } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const preview = usePdfPreview()
  const cur = company?.default_currency || 'USD'
  const [po, setPo] = useState(null)
  const [items, setItems] = useState([])
  const [vendor, setVendor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [recvOpen, setRecvOpen] = useState(false)
  const [recv, setRecv] = useState({}) // itemId -> qty to receive now

  const load = async () => {
    const { data: p } = await supabase.from('purchase_orders').select('*').eq('id', id).maybeSingle()
    if (!p) { setPo(false); return }
    setPo(p)
    const [{ data: its }, { data: v }] = await Promise.all([
      supabase.from('purchase_order_items').select('*').eq('po_id', id).order('sort_order'),
      p.vendor_id ? supabase.from('vendors').select('*').eq('id', p.vendor_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    setItems(its || []); setVendor(v || null)
  }
  useEffect(() => { load() }, [id])

  const markOrdered = async () => { await supabase.from('purchase_orders').update({ status: 'ordered' }).eq('id', id); load() }
  const cancelPO = async () => {
    if (!confirm(t('po_cancel_confirm') || 'Cancel this purchase order?')) return
    await supabase.from('purchase_orders').update({ status: 'cancelled' }).eq('id', id); load()
  }

  const openReceive = () => {
    const r = {}
    for (const it of items) {
      const remaining = Math.max((Number(it.qty_ordered) || 0) - (Number(it.qty_received) || 0), 0)
      r[it.id] = String(remaining)
    }
    setRecv(r); setRecvOpen(true)
  }

  const doReceive = async () => {
    const lines = items
      .map(it => ({ it, qty: Number(recv[it.id]) || 0 }))
      .filter(x => x.qty > 0)
      .map(x => ({ product_id: x.it.product_id, qty: x.qty, unit_cost: Number(x.it.unit_cost) || 0, name: x.it.description, units_per_ctn: x.it.units_per_ctn }))
    if (lines.length === 0) { alert(t('po_receive_none') || 'Enter quantities to receive.'); return }
    setBusy(true)
    // build a vendor bill for what is received (mirror the Receiving page)
    const total = Math.round(lines.reduce((s, l) => s + l.qty * (Number(l.unit_cost) || 0), 0) * 100) / 100
    const summary = lines.map(l => {
      const qtyLabel = l.units_per_ctn ? `${l.qty} (${ctnLabel(l.qty, l.units_per_ctn)})` : `${l.qty}`
      return `${qtyLabel} × ${l.name || 'item'} @ ${money(Number(l.unit_cost) || 0, cur)}`
    }).join('\n')
    const notes = [`PO ${po.po_number || ''}`.trim(), '— Received —', summary].filter(Boolean).join('\n')
    const { data: bill, error } = await supabase.from('vendor_bills').insert({
      company_id: company.id, vendor_id: po.vendor_id, po_id: po.id, bill_number: po.po_number || null,
      bill_date: todayISO(), status: 'unpaid', total, amount_due: total, amount_paid: 0, notes,
    }).select('id').single()
    if (error) { alert(error.message); setBusy(false); return }
    await receiveStock(company.id, bill.id, lines)
    // update received quantities
    for (const it of items) {
      const add = Number(recv[it.id]) || 0
      if (add > 0) await supabase.from('purchase_order_items').update({ qty_received: (Number(it.qty_received) || 0) + add }).eq('id', it.id)
    }
    await recalcPO(id)
    await recalcVendorBill(bill.id)
    if (po.vendor_id) await recalcVendor(po.vendor_id)
    setBusy(false); setRecvOpen(false); load()
  }

  if (po === null) return <Spinner />
  if (po === false) return <div className="card p-10 text-center text-ink/60">Not found. <Link className="text-moss-700 underline" to="/purchasing">{t('nav_purchasing') || 'Purchasing'}</Link></div>

  const canReceive = po.status === 'ordered' || po.status === 'partial' || po.status === 'draft'
  const totalOrdered = items.reduce((s, it) => s + (Number(it.qty_ordered) || 0) * (Number(it.unit_cost) || 0), 0)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate('/purchasing')} className="flex items-center gap-1 text-sm text-ink/60 hover:text-ink"><ArrowLeft size={16} /> {t('nav_purchasing') || 'Purchasing'}</button>
        <div className="flex flex-wrap gap-2">
          {po.status === 'draft' && <button className="btn-primary" onClick={markOrdered}><Send size={16} /> {t('po_mark_ordered') || 'Mark as ordered'}</button>}
          {canReceive && po.status !== 'received' && <button className="btn-primary" onClick={openReceive}><PackageCheck size={16} /> {t('po_receive') || 'Receive'}</button>}
          <button className="btn-outline" onClick={() => preview.open(() => purchaseOrderPDF({ po, items, vendor, company }, { preview: true }))}><FileDown size={16} /> PDF</button>
          {po.status !== 'cancelled' && po.status !== 'received' && <button className="btn-ghost" onClick={cancelPO}><Ban size={16} /> {t('cancel')}</button>}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[.07] bg-sand/50 p-6">
          <div>
            <h1 className="font-display text-3xl text-ink">{po.po_number || 'PO'}</h1>
            <div className="mt-1 text-sm text-ink/55">{t('f_date')}: {fmtDate(po.order_date)}{po.expected_date ? ` · ${t('po_expected') || 'Expected'}: ${fmtDate(po.expected_date)}` : ''}</div>
            <div className="mt-2"><span className={`badge ${PO_BADGE[po.status] || ''}`}>{t('po_st_' + po.status) || po.status}</span></div>
          </div>
          <div className="text-right">
            <div className="label">{t('th_vendor') || 'Vendor'}</div>
            <div className="font-semibold text-ink">{vendor?.name || '—'}</div>
            {vendor?.email && <div className="text-sm text-ink/55">{vendor.email}</div>}
          </div>
        </div>

        <div className="overflow-x-auto px-6">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-ink/45">
              <tr>
                <th className="py-2.5 font-semibold">{t('th_item') || 'Item'}</th>
                <th className="py-2.5 text-right font-semibold">{t('po_ordered') || 'Ordered'}</th>
                <th className="py-2.5 text-right font-semibold">{t('po_received') || 'Received'}</th>
                <th className="py-2.5 text-right font-semibold">{t('rcv_unit_cost') || 'Unit cost'}</th>
                <th className="py-2.5 text-right font-semibold">{t('th_total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.05]">
              {items.map(it => {
                const q = Number(it.qty_ordered) || 0, rq = Number(it.qty_received) || 0
                return (
                  <tr key={it.id}>
                    <td className="py-2.5 text-ink">{it.description}</td>
                    <td className="py-2.5 text-right tabular-nums">{q}{it.units_per_ctn ? <span className="ml-1 text-[11px] text-ink/45">({ctnLabel(q, it.units_per_ctn)})</span> : null}</td>
                    <td className={`py-2.5 text-right tabular-nums ${rq >= q ? 'text-moss-700' : rq > 0 ? 'text-clay' : 'text-ink/40'}`}>{rq}</td>
                    <td className="py-2.5 text-right tabular-nums text-ink/70">{money(it.unit_cost, cur)}</td>
                    <td className="py-2.5 text-right tabular-nums">{money(q * (Number(it.unit_cost) || 0), cur)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end p-6">
          <div className="w-full max-w-xs rounded-xl border border-black/10 bg-sand/30 p-4">
            <div className="flex justify-between font-display text-xl text-ink"><span>{t('th_total')}</span><span className="tabular-nums">{money(totalOrdered, cur)}</span></div>
          </div>
        </div>
      </div>

      <Modal open={recvOpen} onClose={() => setRecvOpen(false)} title={t('po_receive') || 'Receive'} wide>
        <p className="mb-3 text-sm text-ink/60">{t('po_receive_hint') || 'Enter how many of each item arrived. Stock and a vendor bill are updated automatically.'}</p>
        <div className="overflow-hidden rounded-lg border border-black/[.07]">
          <table className="w-full text-sm">
            <thead className="bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
              <tr><th className="px-3 py-2 font-semibold">{t('th_item') || 'Item'}</th><th className="px-3 py-2 text-right font-semibold">{t('po_remaining') || 'Remaining'}</th><th className="w-28 px-3 py-2 text-right font-semibold">{t('po_receive_now') || 'Receive'}</th></tr>
            </thead>
            <tbody className="divide-y divide-black/[.05]">
              {items.map(it => {
                const remaining = Math.max((Number(it.qty_ordered) || 0) - (Number(it.qty_received) || 0), 0)
                return (
                  <tr key={it.id}>
                    <td className="px-3 py-2 text-ink">{it.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink/60">{remaining}</td>
                    <td className="px-3 py-2"><input className="input py-1.5 text-right" type="number" step="1" min="0" value={recv[it.id] ?? ''} onChange={e => setRecv({ ...recv, [it.id]: e.target.value })} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setRecvOpen(false)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={doReceive} disabled={busy}>{busy ? t('saving') : (t('po_receive_confirm') || 'Receive & update stock')}</button>
        </div>
      </Modal>

      <PdfPreview preview={preview} />
    </div>
  )
}
