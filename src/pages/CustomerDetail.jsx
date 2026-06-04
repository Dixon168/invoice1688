import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Plus, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate, STATUS, isOverdue } from '../lib/format'
import { recalcInvoice, recalcCustomer } from '../lib/calc'
import { Spinner } from '../components/ui'
import AllocatePayment from '../components/AllocatePayment'
import { useT } from '../i18n'

export default function CustomerDetail() {
  const { id } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const { company } = useAuth()
  const cur = company?.default_currency || 'USD'
  const [c, setC] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [payOpen, setPayOpen] = useState(false)

  const load = async () => {
    const { data: cust } = await supabase.from('customers').select('*').eq('id', id).maybeSingle()
    if (!cust) { setC(false); return }
    setC(cust)
    const [{ data: inv }, { data: pay }] = await Promise.all([
      supabase.from('invoices').select('*').eq('customer_id', id).order('issue_date', { ascending: false }),
      supabase.from('payments').select('*, invoice:invoices(invoice_number)').eq('customer_id', id).order('payment_date', { ascending: false }),
    ])
    setInvoices(inv || []); setPayments(pay || [])
  }
  useEffect(() => { load() }, [id])

  if (c === null) return <Spinner />
  if (c === false) return <div className="card p-10 text-center text-ink/60">Customer not found. <Link className="text-moss-700 underline" to="/customers">Back</Link></div>

  const open = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled' && Number(i.amount_due) > 0)
  const items = open.map(i => ({ id: i.id, label: i.invoice_number, sub: `Due ${fmtDate(i.due_date)}`, due: Number(i.amount_due) }))

  const receivePayment = async (rows, meta) => {
    for (const r of rows) {
      await supabase.from('payments').insert({
        company_id: company.id, invoice_id: r.id, customer_id: id,
        amount: r.amount, method: meta.method, payment_date: meta.payment_date, reference: meta.reference,
      })
      await recalcInvoice(r.id)
    }
    await recalcCustomer(id)
    setPayOpen(false); load()
  }

  return (
    <div>
      <button onClick={() => navigate('/customers')} className="mb-4 flex items-center gap-1 text-sm text-ink/60 hover:text-ink"><ArrowLeft size={16} /> Customers</button>

      <div className="card mb-4 flex flex-wrap items-start justify-between gap-4 p-6">
        <div>
          <h1 className="font-display text-3xl text-ink">{c.name}</h1>
          <p className="mt-1 text-sm text-ink/60">{[c.email, c.phone, c.billing_city].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        <div className="text-right">
          <div className="label">{t('m_balance_owed')}</div>
          <div className="font-display text-3xl text-clay tabular-nums">{money(c.balance, cur)}</div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button className="btn-primary" onClick={() => setPayOpen(true)} disabled={open.length === 0}><Plus size={16} /> {t('receive_payment')}</button>
          <Link className="btn-outline" to={`/invoices/new?customer=${id}`}><FileText size={16} /> New invoice</Link>
          <Link className="btn-outline" to={`/estimates/new?customer=${id}`}>New estimate</Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="border-b border-black/[.07] px-5 py-3 font-display text-lg text-ink">Invoices</div>
          {invoices.length === 0 ? <p className="px-5 py-8 text-center text-sm text-ink/50">No invoices yet.</p> : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-black/[.05]">
                {invoices.map(i => {
                  const od = isOverdue(i.due_date, i.status)
                  const s = od ? STATUS.overdue : (STATUS[i.status] || STATUS.draft)
                  return (
                    <tr key={i.id} className="cursor-pointer hover:bg-sand/40" onClick={() => navigate(`/invoices/${i.id}`)}>
                      <td className="px-5 py-2.5 font-semibold text-ink">{i.invoice_number}</td>
                      <td className="px-5 py-2.5 text-ink/55">{fmtDate(i.issue_date)}</td>
                      <td className="px-5 py-2.5"><span className={`badge ${s.cls}`}>{t(s.key)}</span></td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{money(i.total, cur)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-ink/60">{money(i.amount_due, cur)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-black/[.07] px-5 py-3 font-display text-lg text-ink">{t('sec_payments_received')}</div>
          {payments.length === 0 ? <p className="px-5 py-8 text-center text-sm text-ink/50">No payments yet.</p> : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-black/[.05]">
                {payments.map(p => (
                  <tr key={p.id}>
                    <td className="px-5 py-2.5 text-ink/70">{fmtDate(p.payment_date)}</td>
                    <td className="px-5 py-2.5 text-ink/55">{p.invoice?.invoice_number || '—'}</td>
                    <td className="px-5 py-2.5 capitalize text-ink/55">{p.method.replace('_', ' ')}</td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums text-moss-700">{money(p.amount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AllocatePayment open={payOpen} onClose={() => setPayOpen(false)} title={`${t('receive_payment')} · ${c.name}`}
        items={items} currency={cur} methods={['cash', 'card', 'bank_transfer', 'check', 'other']} defaultMethod="cash"
        onSubmit={receivePayment} />
    </div>
  )
}
