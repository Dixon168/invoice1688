import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Printer } from 'lucide-react'
import { vendorBillPDF } from '../lib/pdf'
import { usePdfPreview, PdfPreview } from '../components/PdfPreview'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate, isOverdue, fmtDateTime } from '../lib/format'
import { recalcVendorBill, recalcVendor, splitByMethod } from '../lib/calc'
import { Spinner } from '../components/ui'
import AllocatePayment from '../components/AllocatePayment'
import { useT } from '../i18n'

const BILL_STATUS = {
  unpaid: { key: 'st_unpaid', cls: 'bg-amber-100 text-amber-700' },
  partial: { key: 'st_partial', cls: 'bg-blue-100 text-blue-700' },
  paid: { key: 'st_paid', cls: 'bg-moss-100 text-moss-700' },
  cancelled: { key: 'st_cancelled', cls: 'bg-black/8 text-ink/40 line-through' },
  overdue: { key: 'st_overdue', cls: 'bg-red-100 text-red-700' },
}

export default function VendorDetail() {
  const { id } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const { company } = useAuth()
  const cur = company?.default_currency || 'USD'
  const [v, setV] = useState(null)
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [payOpen, setPayOpen] = useState(false)
  const [prods, setProds] = useState([])
  const preview = usePdfPreview()

  const load = async () => {
    const { data: vend } = await supabase.from('vendors').select('*').eq('id', id).maybeSingle()
    if (!vend) { setV(false); return }
    setV(vend)
    const [{ data: b }, { data: p }, { data: prods }] = await Promise.all([
      supabase.from('vendor_bills').select('*').eq('vendor_id', id).order('bill_date', { ascending: false }),
      supabase.from('vendor_payments').select('*, bill:vendor_bills(bill_number)').eq('vendor_id', id).order('payment_date', { ascending: false }),
      supabase.from('products').select('name, units_per_ctn'),
    ])
    setBills(b || []); setPayments(p || []); setProds(prods || [])
  }
  useEffect(() => { load() }, [id])

  if (v === null) return <Spinner />
  if (v === false) return <div className="card p-10 text-center text-ink/60">Vendor not found. <Link className="text-moss-700 underline" to="/vendors">Back</Link></div>

  const open = bills.filter(b => b.status !== 'paid' && b.status !== 'cancelled' && Number(b.amount_due) > 0)
  const items = open.map(b => ({ id: b.id, label: b.bill_number || 'Bill', sub: `Due ${fmtDate(b.due_date)}`, due: Number(b.amount_due) }))

  const payBills = async (rows, meta) => {
    const now = new Date().toISOString()
    const split = splitByMethod(rows, meta.methodLines)
    const affected = [...new Set(split.map(s => s.id))]
    for (const s of split) {
      await supabase.from('vendor_payments').insert({
        company_id: company.id, vendor_id: id, bill_id: s.id,
        amount: s.amount, method: s.method, payment_date: meta.payment_date, reference: meta.reference, paid_at: now,
      })
    }
    for (const bid of affected) await recalcVendorBill(bid)
    await recalcVendor(id)
    setPayOpen(false); load()
  }

  return (
    <div>
      <button onClick={() => navigate('/vendors')} className="mb-4 flex items-center gap-1 text-sm text-ink/60 hover:text-ink"><ArrowLeft size={16} /> Vendors</button>

      <div className="card mb-4 flex flex-wrap items-start justify-between gap-4 p-6">
        <div>
          <h1 className="font-display text-3xl text-ink">{v.name}</h1>
          <p className="mt-1 text-sm text-ink/60">{[v.email, v.phone, v.billing_city].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        <div className="text-right">
          <div className="label">{t('m_you_owe')}</div>
          <div className="font-display text-3xl text-clay tabular-nums">{money(v.balance, cur)}</div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button className="btn-primary" onClick={() => setPayOpen(true)} disabled={open.length === 0}><Plus size={16} /> {t('pay_bills')}</button>
          <Link className="btn-outline" to={`/bills?vendor=${id}`}><Plus size={16} /> New bill</Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="border-b border-black/[.07] px-5 py-3 font-display text-lg text-ink">Bills</div>
          {bills.length === 0 ? <p className="px-5 py-8 text-center text-sm text-ink/50">No bills yet.</p> : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-black/[.05]">
                {bills.map(b => {
                  const od = isOverdue(b.due_date, b.status)
                  const s = od ? BILL_STATUS.overdue : (BILL_STATUS[b.status] || BILL_STATUS.unpaid)
                  return (
                    <tr key={b.id} className="cursor-pointer hover:bg-sand/40" title="Open PDF"
                      onClick={() => preview.open(() => vendorBillPDF({ bill: b, vendor: v, company, products: prods, payments: payments.filter(pp => pp.bill_id === b.id) }, { preview: true }))}>
                      <td className="px-5 py-2.5 font-semibold text-ink">{b.bill_number || '—'}</td>
                      <td className="px-5 py-2.5 text-ink/55">{fmtDate(b.bill_date)}</td>
                      <td className="px-5 py-2.5"><span className={`badge ${s.cls}`}>{t(s.key)}</span></td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{money(b.total, cur)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-clay">{money(b.amount_due, cur)}</td>
                      <td className="px-5 py-2.5 text-right"><Printer size={15} className="inline text-ink/40" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-black/[.07] px-5 py-3 font-display text-lg text-ink">{t('sec_payments_made')}</div>
          {payments.length === 0 ? <p className="px-5 py-8 text-center text-sm text-ink/50">No payments yet.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink/45">
                <tr>
                  <th className="px-5 py-2 font-semibold">{t('f_date')} / time</th>
                  <th className="px-5 py-2 font-semibold">{t('th_bill') || 'Bill'}</th>
                  <th className="px-5 py-2 font-semibold">{t('f_method') || 'Method'}</th>
                  <th className="px-5 py-2 text-right font-semibold">{t('m_paid') || 'Paid'}</th>
                  <th className="px-5 py-2 text-right font-semibold">{t('m_balance_due') || 'Balance'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.05]">
                {(() => {
                  const billTotal = {}; for (const b of bills) billTotal[b.id] = Number(b.total) || 0
                  const asc = [...payments].sort((a, b) => String(a.paid_at || a.payment_date).localeCompare(String(b.paid_at || b.payment_date)))
                  const run = {}
                  const withBal = asc.map(p => { run[p.bill_id] = (run[p.bill_id] || 0) + (Number(p.amount) || 0); const tot = billTotal[p.bill_id]; return { ...p, balance: tot != null ? Math.max(0, Math.round((tot - run[p.bill_id]) * 100) / 100) : null } })
                  return withBal.reverse().map(p => (
                    <tr key={p.id}>
                      <td className="px-5 py-2.5 text-ink/70">{p.paid_at ? fmtDateTime(p.paid_at) : fmtDate(p.payment_date)}</td>
                      <td className="px-5 py-2.5 text-ink/55">{p.bill?.bill_number || '—'}</td>
                      <td className="px-5 py-2.5 capitalize text-ink/55">{p.method.replace('_', ' ')}</td>
                      <td className="px-5 py-2.5 text-right font-medium tabular-nums text-moss-700">{money(p.amount, cur)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-ink/60">{p.balance == null ? '—' : money(p.balance, cur)}</td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AllocatePayment open={payOpen} onClose={() => setPayOpen(false)} title={`${t('pay_bills')} · ${v.name}`}
        items={items} currency={cur} methods={['bank_transfer', 'card', 'cash', 'check', 'other']} defaultMethod="bank_transfer"
        onSubmit={payBills} />
      <PdfPreview preview={preview} />
    </div>
  )
}
