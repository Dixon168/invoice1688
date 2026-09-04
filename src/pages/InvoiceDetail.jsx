import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, Plus, FileDown, Package, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate, fmtDateTime, todayISO, STATUS, ctnLabel } from '../lib/format'
import { recalcInvoice, recalcCustomer, applyStoreCredit } from '../lib/calc'
import { reverseInvoiceInventory } from '../lib/inventory'
import { documentPDF, packingSlipPDF } from '../lib/pdf'
import { usePdfPreview, PdfPreview } from '../components/PdfPreview'
import { Spinner, Modal, Field } from '../components/ui'
import { useT } from '../i18n'

export default function InvoiceDetail() {
  const { id } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const preview = usePdfPreview()
  const { company } = useAuth()
  const cur = company?.default_currency || 'USD'

  const [inv, setInv] = useState(null)
  const [employeeName, setEmployeeName] = useState('')
  const [items, setItems] = useState([])
  const [customer, setCustomer] = useState(null)
  const [payments, setPayments] = useState([])
  const [payOpen, setPayOpen] = useState(false)
  const [payDate, setPayDate] = useState(todayISO())
  const [payLines, setPayLines] = useState([{ amount: '', method: 'cash', note: '' }])
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
    const pids = [...new Set((its || []).map(x => x.product_id).filter(Boolean))]
    let pmap = {}
    if (pids.length) { const { data: prods } = await supabase.from('products').select('id,name').in('id', pids); for (const p of (prods || [])) pmap[p.id] = p.name }
    setItems((its || []).map(x => ({ ...x, product_name: pmap[x.product_id] || '' })))
    setCustomer(cu || null); setPayments(ps || [])
    if (i.employee_id) { const { data: emp } = await supabase.from('employees').select('name').eq('id', i.employee_id).maybeSingle(); setEmployeeName(emp?.name || '') } else setEmployeeName('')
  }
  useEffect(() => { load() }, [id])

  const payEntered = payLines.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const recordPayment = async () => {
    const valid = payLines.filter(p => (Number(p.amount) || 0) > 0)
    if (valid.length === 0) return alert('Enter a valid amount.')
    const due = Number(inv.amount_due) || 0
    if (payEntered > due + 0.001) return alert(`${t('collect_over') || 'Payments exceed the amount due'} (${money(due, cur)})`)
    setBusy(true)
    const now = new Date().toISOString()
    const rows = valid.map(p => ({
      company_id: company.id, invoice_id: id, customer_id: inv.customer_id,
      amount: Number(p.amount), method: p.method, payment_date: payDate, note: p.note || null, paid_at: now,
    }))
    await supabase.from('payments').insert(rows)
    await recalcInvoice(id)
    await recalcCustomer(inv.customer_id)
    setBusy(false); setPayOpen(false)
    setPayLines([{ amount: '', method: 'cash', note: '' }]); setPayDate(todayISO())
    load()
  }
  const setPayLine = (i, patch) => setPayLines(payLines.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  const addPayLine = () => setPayLines([...payLines, { amount: '', method: 'cash', note: '' }])
  const removePayLine = (i) => setPayLines(payLines.length > 1 ? payLines.filter((_, idx) => idx !== i) : payLines)

  const applyCreditOne = async () => {
    const avail = Number(customer?.credit_balance) || 0
    if (avail <= 0 || Number(inv.amount_due) <= 0) return
    await applyStoreCredit(company.id, inv.customer_id, avail, [{ id, amount_due: inv.amount_due }])
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
          <Link className="btn-primary" to={`/invoices/${id}/edit`}><Pencil size={16} /> {t('edit')} {t('th_invoice')}</Link>
          <button className="btn-outline" onClick={() => preview.open(() => documentPDF({ kind: 'invoice', doc: inv, items, customer, company, employeeName, payments }, { preview: true }))}><FileDown size={16} /> {t('pdf')}</button>
          <button className="btn-outline" onClick={() => preview.open(() => packingSlipPDF({ doc: inv, items, customer, company, employeeName }, { preview: true }))}><Package size={16} /> {t('packing_slip')}</button>
          <button className="btn-danger" onClick={removeInvoice}><Trash2 size={16} /> {t('delete')}</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[.07] bg-sand/50 p-6">
          <div>
            <div className="font-display text-3xl text-ink">{inv.invoice_number}</div>
            <div className="mt-1 text-sm text-ink/55">Issued {fmtDate(inv.issue_date)} · Due {fmtDate(inv.due_date)}{employeeName ? ` · ${t('emp_made_by')}: ${employeeName}` : ''}</div>
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
            {company?.email && <div className="text-sm text-ink/60">{company.email}</div>}
            {company?.phone && <div className="text-sm text-ink/60">{company.phone}</div>}
            <div className="text-sm text-ink/60">{[company?.address, company?.city, company?.state, company?.postal_code, company?.country].filter(Boolean).join(', ')}</div>
          </div>
        </div>

        <div className="overflow-x-auto px-6">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink/50">
              <tr className="border-b border-black/10">
                <th className="py-2 font-semibold">{t('f_description')}</th>
                <th className="py-2 text-right font-semibold">{t('th_qty')}</th>
                <th className="py-2 text-right font-semibold">{t('th_price')}</th>
                <th className="py-2 text-right font-semibold">{t('th_amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.05]">
              {items.map(it => (
                <tr key={it.id}>
                  <td className="py-2.5 text-ink">
                    <div className="font-medium">{it.product_name || it.description}</div>
                    {it.product_name && it.description && it.description !== it.product_name && <div className="text-xs text-ink/55">{it.description}</div>}
                    {it.detail ? <div className="text-xs text-ink/50">{it.detail}</div> : null}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{Number(it.quantity)}{it.units_per_ctn ? <span className="ml-1 text-[11px] text-ink/45">({ctnLabel(it.quantity, it.units_per_ctn)})</span> : null}</td>
                  <td className="py-2.5 text-right tabular-nums">{money(it.unit_price, cur)}</td>
                  <td className="py-2.5 text-right font-medium tabular-nums">{money(it.line_total, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end p-6">
          <div className="w-full max-w-xs space-y-2 rounded-xl border border-black/10 bg-sand/30 p-4 text-sm">
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
              <button className="btn-primary" onClick={() => { setPayDate(todayISO()); setPayLines([{ amount: String(inv.amount_due), method: 'cash', note: '' }]); setPayOpen(true) }}><Plus size={16} /> {t('record_payment')}</button>}
            {inv.status !== 'paid' && inv.status !== 'cancelled' && Number(customer?.credit_balance) > 0 && Number(inv.amount_due) > 0 &&
              <button className="btn-outline" onClick={applyCreditOne}><Wallet size={16} /> {t('cr_use')} ({money(Math.min(Number(customer.credit_balance), Number(inv.amount_due)), cur)})</button>}
            {inv.status === 'draft' && <button className="btn-outline" onClick={() => setStatus('sent')}>{t('mark_sent')}</button>}
            {inv.status !== 'cancelled' && inv.status !== 'paid' && <button className="btn-ghost" onClick={() => setStatus('cancelled')}>{t('cancel')}</button>}
          </div>
        </div>
        {payments.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/50">No payments recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink/45">
              <tr>
                <th className="py-2 font-semibold">{t('f_date')} / time</th>
                <th className="py-2 font-semibold">{t('f_method') || 'Method'}</th>
                <th className="py-2 font-semibold">{t('f_note') || 'Note'}</th>
                <th className="py-2 text-right font-semibold">{t('m_paid') || 'Paid'}</th>
                <th className="py-2 text-right font-semibold">{t('m_balance_due') || 'Balance'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.05]">
              {(() => {
                const ordered = [...payments].sort((a, b) => String(a.paid_at || a.payment_date).localeCompare(String(b.paid_at || b.payment_date)))
                let run = 0
                const withBal = ordered.map(p => { run += Number(p.amount) || 0; return { ...p, balance: Math.max(0, Math.round((Number(inv.total) - run) * 100) / 100) } })
                return withBal.reverse().map(p => (
                  <tr key={p.id}>
                    <td className="py-2.5 text-ink/70">{p.paid_at ? fmtDateTime(p.paid_at) : fmtDate(p.payment_date)}</td>
                    <td className="py-2.5 capitalize text-ink/60">{p.method.replace('_', ' ')}</td>
                    <td className="py-2.5 text-ink/60">{[p.note, p.reference].filter(Boolean).join(' · ')}</td>
                    <td className="py-2.5 text-right font-medium tabular-nums text-moss-700">{money(p.amount, cur)}</td>
                    <td className="py-2.5 text-right tabular-nums text-ink/60">{money(p.balance, cur)}</td>
                  </tr>
                ))
              })()}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={t('record_payment') || 'Record payment'} wide>
        <div className="mb-3 flex items-center justify-between rounded-lg bg-sand/60 p-3 text-sm">
          <span className="text-ink/60">{t('m_balance_due') || 'Amount due'}</span><span className="font-display text-lg text-ink tabular-nums">{money(inv.amount_due, cur)}</span>
        </div>
        <div className="mb-3">
          <Field label={t('f_date')}><input className="input w-48" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} /></Field>
        </div>
        <div className="space-y-2">
          {payLines.map((p, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="w-32"><span className="label">{(t('pay') || 'Payment') + ' ' + (i + 1)}</span>
                <input className="input" type="number" step="0.01" min="0" value={p.amount} placeholder="0.00" onChange={e => setPayLine(i, { amount: e.target.value })} /></div>
              <select className="input w-36" value={p.method} onChange={e => setPayLine(i, { method: e.target.value })}>
                {['cash', 'card', 'bank_transfer', 'check', 'other'].map(m => <option key={m} value={m}>{t('pm_' + (m === 'bank_transfer' ? 'bank' : m)) || m}</option>)}
              </select>
              <input className="input flex-1" value={p.note} placeholder={t('f_note') || 'Note'} onChange={e => setPayLine(i, { note: e.target.value })} />
              <button type="button" className="rounded-md p-2 text-ink/40 hover:bg-clay/10 hover:text-clay disabled:opacity-30" disabled={payLines.length === 1} onClick={() => removePayLine(i)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-ghost mt-2" onClick={addPayLine}><Plus size={16} /> {t('add_payment') || 'Add payment'}</button>

        <div className="mt-4 space-y-1 border-t border-black/10 pt-3 text-sm">
          <div className="flex justify-between"><span className="text-ink/60">{t('rep_total') || 'Total'}</span><span className="tabular-nums">{money(payEntered, cur)}</span></div>
          <div className="flex justify-between font-semibold"><span className={payEntered > Number(inv.amount_due) + 0.001 ? 'text-clay' : 'text-ink/70'}>{t('m_balance_due') || 'Amount due'}</span><span className={`tabular-nums ${payEntered > Number(inv.amount_due) + 0.001 ? 'text-clay' : 'text-ink'}`}>{money(Math.max(0, Number(inv.amount_due) - payEntered), cur)}</span></div>
          {payEntered > Number(inv.amount_due) + 0.001 && <div className="text-xs text-clay">{t('collect_over') || 'Payments exceed the amount due'}</div>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setPayOpen(false)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={recordPayment} disabled={busy}>{busy ? t('saving') : (t('record_payment') || 'Record payment')}</button>
        </div>
      </Modal>
      <PdfPreview preview={preview} />
    </div>
  )
}
