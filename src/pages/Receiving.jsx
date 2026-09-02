import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackagePlus, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, todayISO } from '../lib/format'
import { receiveStock } from '../lib/inventory'
import { recalcVendorBill, recalcVendor } from '../lib/calc'
import { PageHeader, Field, Spinner } from '../components/ui'
import { useT } from '../i18n'

const blankLine = () => ({ product_id: '', ctn: '', qty: 1, unit_cost: '' })

export default function Receiving() {
  const { company } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const cur = company?.default_currency || 'USD'
  const [vendors, setVendors] = useState(null)
  const [products, setProducts] = useState([])
  const [vendorId, setVendorId] = useState('')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([blankLine()])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: p }] = await Promise.all([
        supabase.from('vendors').select('id, name').order('name'),
        supabase.from('products').select('id, name, sku, cost, units_per_ctn').order('name'),
      ])
      setVendors(v || []); setProducts(p || [])
    })()
  }, [])

  const setLine = (i, patch) => setLines(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const onProduct = (i, pid) => {
    const p = products.find(x => x.id === pid)
    setLine(i, { product_id: pid, ctn: '', unit_cost: p && (p.cost ?? '') !== '' ? p.cost : '' })
  }
  const addLine = () => setLines([...lines, blankLine()])
  const removeLine = (i) => setLines(lines.length > 1 ? lines.filter((_, idx) => idx !== i) : lines)

  const validLines = lines.filter(l => l.product_id && Number(l.qty) > 0)
  const total = validLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0)

  const submit = async () => {
    setErr('')
    if (!vendorId) return setErr(t('rcv_need_vendor'))
    if (validLines.length === 0) return setErr(t('rcv_need_lines'))
    setBusy(true)
    // build a readable summary for the bill (no separate items table)
    const summary = validLines.map(l => {
      const p = products.find(x => x.id === l.product_id)
      return `${l.qty} × ${p?.name || 'item'} @ ${money(Number(l.unit_cost) || 0, cur)}`
    }).join('\n')
    const billNotes = [notes, '— Received —', summary].filter(Boolean).join('\n')

    const { data: bill, error: be } = await supabase.from('vendor_bills').insert({
      company_id: company.id, vendor_id: vendorId, bill_number: reference || null,
      bill_date: date || todayISO(), status: 'unpaid', total, amount_due: total, amount_paid: 0, notes: billNotes,
    }).select('id').single()
    if (be) { setBusy(false); return setErr(be.message) }

    await receiveStock(company.id, bill.id, validLines)
    await recalcVendorBill(bill.id)
    await recalcVendor(vendorId)
    setBusy(false)
    navigate(`/vendors/${vendorId}`)
  }

  if (vendors === null) return <Spinner />

  return (
    <>
      <PageHeader title={t('rcv_title')} subtitle={t('rcv_sub')} />

      <div className="card max-w-3xl space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <Field label={t('rcv_vendor')}>
              <select className="input" value={vendorId} onChange={e => setVendorId(e.target.value)}>
                <option value="">{t('rcv_pick_vendor')}</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label={t('rcv_ref')}><input className="input" value={reference} onChange={e => setReference(e.target.value)} /></Field>
          <Field label={t('f_bill_date')}><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="py-2 pr-2 font-semibold">{t('th_item')}</th>
                <th className="w-24 py-2 px-2 text-right font-semibold">{t('th_ctn') || 'Boxes'}</th>
                <th className="w-20 py-2 px-2 text-right font-semibold">{t('th_qty')}</th>
                <th className="w-28 py-2 px-2 text-right font-semibold">{t('rcv_unit_cost')}</th>
                <th className="w-28 py-2 px-2 text-right font-semibold">{t('th_total')}</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const prod = products.find(x => x.id === l.product_id)
                const upc = prod && prod.units_per_ctn ? Number(prod.units_per_ctn) : 0
                return (
                <tr key={i} className="border-t border-black/[.05]">
                  <td className="py-2 pr-2">
                    <select className="input py-1.5" value={l.product_id} onChange={e => onProduct(i, e.target.value)}>
                      <option value="">{t('rcv_pick_product')}</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    {upc ? (
                      <input className="input py-1.5 text-right" type="number" step="1" min="0" value={l.ctn}
                        onChange={e => { const c = e.target.value; setLine(i, { ctn: c, qty: c === '' ? l.qty : Math.round(Number(c) * upc) }) }} />
                    ) : <span className="block text-center text-xs text-ink/30">—</span>}
                  </td>
                  <td className="py-2 px-2">
                    <input className="input py-1.5 text-right" type="number" step="1" value={l.qty} onChange={e => setLine(i, { qty: e.target.value, ctn: '' })} />
                    {upc ? <div className="mt-0.5 text-right text-[10px] text-ink/40">1 box = {upc}</div> : null}
                  </td>
                  <td className="py-2 px-2"><input className="input py-1.5 text-right" type="number" step="0.01" value={l.unit_cost} onChange={e => setLine(i, { unit_cost: e.target.value })} /></td>
                  <td className="py-2 px-2 text-right tabular-nums text-ink/70">{money((Number(l.qty) || 0) * (Number(l.unit_cost) || 0), cur)}</td>
                  <td className="py-2 text-right"><button className="rounded p-1 text-ink/40 hover:text-clay" onClick={() => removeLine(i)}><Trash2 size={15} /></button></td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
        <button className="btn-ghost text-sm" onClick={addLine}><Plus size={15} /> {t('rcv_add_line')}</button>

        <Field label={t('f_notes')}><textarea className="input min-h-[60px]" value={notes} onChange={e => setNotes(e.target.value)} /></Field>

        <div className="flex items-center justify-between border-t border-black/[.07] pt-4">
          <div className="text-sm text-ink/60">{t('m_total')}: <span className="font-display text-xl text-ink tabular-nums">{money(total, cur)}</span></div>
          <button className="btn-primary" onClick={submit} disabled={busy}><PackagePlus size={18} /> {busy ? t('saving') : t('rcv_save')}</button>
        </div>
        {err && <p className="text-sm text-clay">{err}</p>}
      </div>
    </>
  )
}
