import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate, isOverdue } from '../lib/format'
import { recalcVendorBill, recalcVendor } from '../lib/calc'
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
  const [openBill, setOpenBill] = useState(null)

  const load = async () => {
    const { data: vend } = await supabase.from('vendors').select('*').eq('id', id).maybeSingle()
    if (!vend) { setV(false); return }
    setV(vend)
    const [{ data: b }, { data: p }] = await Promise.all([
      supabase.from('vendor_bills').select('*').eq('vendor_id', id).order('bill_date', { ascending: false }),
      supabase.from('vendor_payments').select('*, bill:vendor_bills(bill_number)').eq('vendor_id', id).order('payment_date', { ascending: false }),
    ])
    setBills(b || []); setPayments(p || [])
  }
  useEffect(() => { load() }, [id])

  if (v === null) return <Spinner />
  if (v === false) return <div className="card p-10 text-center text-ink/60">Vendor not found. <Link className="text-moss-700 underline" to="/vendors">Back</Link></div>

  const open = bills.filter(b => b.status !== 'paid' && b.status !== 'cancelled' && Number(b.amount_due) > 0)
  const items = open.map(b => ({ id: b.id, label: b.bill_number || 'Bill', sub: `Due ${fmtDate(b.due_date)}`, due: Number(b.amount_due) }))

  const payBills = async (rows, meta) => {
    for (const r of rows) {
      await supabase.from('vendor_payments').insert({
        company_id: company.id, vendor_id: id, bill_id: r.id,
        amount: r.amount, method: meta.method, payment_date: meta.payment_date, reference: meta.reference,
      })
      await recalcVendorBill(r.id)
    }
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
                  const isOpen = openBill === b.id
                  return (
                    <React.Fragment key={b.id}>
                      <tr className="cursor-pointer hover:bg-sand/40" onClick={() => setOpenBill(isOpen ? null : b.id)}>
                        <td className="px-5 py-2.5 font-semibold text-ink"><span className="mr-1 inline-block text-ink/40">{isOpen ? '▾' : '▸'}</span>{b.bill_number || '—'}</td>
                        <td className="px-5 py-2.5 text-ink/55">{fmtDate(b.bill_date)}</td>
                        <td className="px-5 py-2.5"><span className={`badge ${s.cls}`}>{t(s.key)}</span></td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{money(b.total, cur)}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-clay">{money(b.amount_due, cur)}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-sand/30">
                          <td colSpan={5} className="px-5 py-3">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div><div className="label">Bill date</div><div className="text-ink/80">{fmtDate(b.bill_date)}</div></div>
                              <div><div className="label">Due</div><div className="text-ink/80">{b.due_date ? fmtDate(b.due_date) : '—'}</div></div>
                              <div><div className="label">Paid / Due</div><div className="text-ink/80">{money(b.amount_paid, cur)} / <span className="text-clay">{money(b.amount_due, cur)}</span></div></div>
                            </div>
                            {b.notes ? (
                              <div className="mt-3">
                                <div className="label mb-1">Received / details</div>
                                <pre className="whitespace-pre-wrap rounded-lg border border-black/10 bg-white p-3 text-xs leading-relaxed text-ink/80">{b.notes}</pre>
                              </div>
                            ) : <div className="mt-3 text-sm text-ink/45">No line details recorded for this bill.</div>}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
              <tbody className="divide-y divide-black/[.05]">
                {payments.map(p => (
                  <tr key={p.id}>
                    <td className="px-5 py-2.5 text-ink/70">{fmtDate(p.payment_date)}</td>
                    <td className="px-5 py-2.5 text-ink/55">{p.bill?.bill_number || '—'}</td>
                    <td className="px-5 py-2.5 capitalize text-ink/55">{p.method.replace('_', ' ')}</td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums">{money(p.amount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AllocatePayment open={payOpen} onClose={() => setPayOpen(false)} title={`${t('pay_bills')} · ${v.name}`}
        items={items} currency={cur} methods={['bank_transfer', 'card', 'cash', 'check', 'other']} defaultMethod="bank_transfer"
        onSubmit={payBills} />
    </div>
  )
}
