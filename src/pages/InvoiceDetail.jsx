import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, Plus, FileDown, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate, todayISO, STATUS } from '../lib/format'
import { recalcInvoice, recalcCustomer } from '../lib/calc'
import { reverseInvoiceInventory } from '../lib/inventory'
import { documentPDF, packingSlipPDF } from '../lib/pdf'
import { Spinner, Modal, Field } from '../components/ui'
import { useT } from '../i18n'

export default function InvoiceDetail() {
  const { id } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const { company } = useAuth()
  const cur = company?.default_currency || 'USD'

  const [inv, setInv] = useState(null)
  const [items, setItems] = useState([])
  const [customer, setCustomer] = useState(null)
  const [payments, setPayments] = useState([])
  const [payOpen, setPayOpen] = useState(false)
  const [pay, setPay] = useState({ amount: '', method: 'cash', payment_date: todayISO(), reference: '' })
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data: i } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle()
    if (!i) { setInv(false); return }
    setInv(i)
    const [{ data: its }, { data: cu }, { data: ps }] = await Promise.all([
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('sort_order'),
      supabase.from('customers').select('*').eq('id', i.customer_id).maybeSingle(),
      supabase.from('payments').select('*').eq('invoice_id', id).order('payment_date', { ascending: false }),
    ])
    setItems(its || []); setCustomer(cu || null); setPayments(ps || [])
  }
  useEffect(() => { load() }, [id])

  const recordPayment = async () => {
    const amt = Number(pay.amount)
    if (!amt || amt <= 0) return alert('Enter a valid amount.')
    setBusy(true)
    await supabase.from('payments').insert({
      company_id: company.id, invoice_id: id, customer_id: inv.customer_id,
      amount: amt, method: pay.method, payment_date: pay.payment_date, reference: pay.reference,
    })
    await recalcInvoice(id)
    await recalcCustomer(inv.customer_id)
    setBusy(false); setPayOpen(false)
    setPay({ amount: '', method: 'cash', payment_date: todayISO(), reference: '' })
    load()
  }

  const setStatus = async (status) => {
    if (status === 'cancelled') await reverseInvoiceInventory(id)
    await supabase.from('invoices').update({ status }).eq('id', id)
    await recalcCustomer(inv.customer_id); load()
  }
  const removeInvoice = async () => {
    if (!confirm(`Delete invoice ${inv.invoice_number}? This cannot be undone.`)) return
    const cid = inv.customer_id
    await reverseInvoiceInventory(id)
    await supabase.from('invoices').delete().eq('id', id)
    await recalcCustomer(cid)
    navigate('/invoices')
  }

  if (inv === null) return <Spinner />
  if (inv === false) return <div className="card p-10 text-center text-ink/60">Invoice not found. <Link className="text-moss-700 underline" to="/invoices">{t('back_invoices')}</Link></div>
  const s = STATUS[inv.status] || STATUS.draft

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate('/invoices')} className="flex items-center gap-1 text-sm text-ink/60 hover:text-ink"><ArrowLeft size={16} /> Invoices</button>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => documentPDF({ kind: 'invoice', doc: inv, items, customer, company })}><FileDown size={16} /> {t('pdf')}</button>
          <button className="btn-outline" onClick={() => packingSlipPDF({ doc: inv, items, customer, company })}><Package size={16} /> {t('packing_slip')}</button>
          <Link className="btn-outline" to={`/invoices/${id}/edit`}><Pencil size={16} /> Edit</Link>
          <button className="btn-danger" onClick={removeInvoice}><Trash2 size={16} /> {t('delete')}</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[.07] bg-sand/50 p-6">
          <div>
            <div className="font-display text-3xl text-ink">{inv.invoice_number}</div>
            <div className="mt-1 text-sm text-ink/55">Issued {fmtDate(inv.issue_date)} · Due {fmtDate(inv.due_date)}</div>
          </div>
          <div className="text-right">
            <span className={`badge ${s.cls} text-sm`}>{t(s.key)}</span>
            <div className="mt-2 font-display text-3xl text-ink tabular-nums">{money(inv.total, cur)}</div>
            <div className="text-sm text-ink/55">{money(inv.amount_due, cur)} due</div>
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-2">
          <div>
            <div className="label">{t('m_bill_to')}</div>
            <div className="font-semibold text-ink">{customer?.name || '—'}</div>
            <div className="text-sm text-ink/60">{customer?.email}</div>
            <div className="text-sm text-ink/60">
              {[inv.billing_address, inv.billing_city, inv.billing_state, inv.billing_postal_code].filter(Boolean).join(', ')}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="label">{t('m_from')}</div>
            {company?.logo_url && <img src={company.logo_url} alt="" className="mb-1 h-12 object-contain sm:ml-auto" />}
            <div className="font-semibold text-ink">{company?.name}</div>
            <div className="text-sm text-ink/60">{company?.email}</div>
          </div>
        </div>

        <div className="overflow-x-auto px-6">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink/50">
              <tr className="border-b border-black/10">
                <th className="py-2 font-semibold">{t('f_description')}</th>
                <th className="py-2 text-right font-semibold">{t('th_qty')}</th>
                <th className="py-2 text-right font-semibold">{t('th_price')}</th>
                <th className="py-2 text-right font-semibold">{t('th_tax')}</th>
                <th className="py-2 text-right font-semibold">{t('th_amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.05]">
              {items.map(it => (
                <tr key={it.id}>
                  <td className="py-2.5 text-ink">{it.description}</td>
                  <td className="py-2.5 text-right tabular-nums">{Number(it.quantity)}</td>
                  <td className="py-2.5 text-right tabular-nums">{money(it.unit_price, cur)}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink/60">{Number(it.tax_rate)}%</td>
                  <td className="py-2.5 text-right font-medium tabular-nums">{money(it.line_total, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end p-6">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink/60">{t('m_subtotal')}</span><span className="tabular-nums">{money(inv.subtotal, cur)}</span></div>
            <div className="flex justify-between"><span className="text-ink/60">{t('m_tax')}</span><span className="tabular-nums">{money(inv.tax_total, cur)}</span></div>
            <div className="flex justify-between border-t border-black/10 pt-2 font-semibold text-ink"><span>{t('m_total')}</span><span className="tabular-nums">{money(inv.total, cur)}</span></div>
            <div className="flex justify-between text-moss-700"><span>{t('m_paid')}</span><span className="tabular-nums">{money(inv.amount_paid, cur)}</span></div>
            <div className="flex justify-between font-display text-xl text-ink"><span>Due</span><span className="tabular-nums">{money(inv.amount_due, cur)}</span></div>
          </div>
        </div>

        {inv.notes && <div className="border-t border-black/[.07] p-6 text-sm"><div className="label">{t('sec_notes')}</div><p className="text-ink/70">{inv.notes}</p></div>}
      </div>

      {/* Payments */}
      <div className="card mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">Payments</h2>
          <div className="flex gap-2">
            {inv.status !== 'paid' && inv.status !== 'cancelled' &&
              <button className="btn-primary" onClick={() => { setPay(p => ({ ...p, amount: String(inv.amount_due) })); setPayOpen(true) }}><Plus size={16} /> {t('record_payment')}</button>}
            {inv.status === 'draft' && <button className="btn-outline" onClick={() => setStatus('sent')}>{t('mark_sent')}</button>}
            {inv.status !== 'cancelled' && inv.status !== 'paid' && <button className="btn-ghost" onClick={() => setStatus('cancelled')}>{t('cancel')}</button>}
          </div>
        </div>
        {payments.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/50">No payments recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-black/[.05]">
              {payments.map(p => (
                <tr key={p.id}>
                  <td className="py-2.5 text-ink/70">{fmtDate(p.payment_date)}</td>
                  <td className="py-2.5 capitalize text-ink/60">{p.method.replace('_', ' ')}</td>
                  <td className="py-2.5 text-ink/50">{p.reference}</td>
                  <td className="py-2.5 text-right font-medium tabular-nums">{money(p.amount, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Record payment">
        <div className="space-y-4">
          <Field label={t('f_amount')}><input className="input" type="number" step="0.01" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('f_date')}><input className="input" type="date" value={pay.payment_date} onChange={e => setPay({ ...pay, payment_date: e.target.value })} /></Field>
            <Field label={t('f_method')}>
              <select className="input" value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value })}>
                <option value="cash">{t('pm_cash')}</option><option value="card">{t('pm_card')}</option>
                <option value="bank_transfer">{t('pm_bank')}</option><option value="check">{t('pm_check')}</option><option value="other">{t('pm_other')}</option>
              </select>
            </Field>
          </div>
          <Field label={t('f_reference')}><input className="input" value={pay.reference} onChange={e => setPay({ ...pay, reference: e.target.value })} placeholder="Optional" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setPayOpen(false)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={recordPayment} disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</button>
        </div>
      </Modal>
    </div>
  )
}
