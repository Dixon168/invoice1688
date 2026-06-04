import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ReceiptText, Plus, Search, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate, todayISO, isOverdue } from '../lib/format'
import { recalcVendorBill, recalcVendor } from '../lib/calc'
import { PageHeader, Spinner, EmptyState, Modal, Field } from '../components/ui'
import { useT } from '../i18n'

const BILL_STATUS = {
  unpaid:    { label: 'Unpaid',    cls: 'bg-amber-100 text-amber-700' },
  partial:   { label: 'Partial',   cls: 'bg-blue-100 text-blue-700' },
  paid:      { label: 'Paid',      cls: 'bg-moss-100 text-moss-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-black/8 text-ink/40 line-through' },
  overdue:   { label: 'Overdue',   cls: 'bg-red-100 text-red-700' },
}
const blankBill = () => ({ vendor_id: '', bill_number: '', bill_date: todayISO(), due_date: '', total: '', notes: '' })

export default function Bills() {
  const { company } = useAuth()
  const { t } = useT()
  const cur = company?.default_currency || 'USD'
  const [searchParams, setSearchParams] = useSearchParams()
  const [bills, setBills] = useState(null)
  const [vendors, setVendors] = useState([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState(searchParams.get('filter') || 'all')

  const [newOpen, setNewOpen] = useState(false)
  const [form, setForm] = useState(blankBill())
  const [busy, setBusy] = useState(false)

  const [detail, setDetail] = useState(null)        // bill being viewed
  const [payments, setPayments] = useState([])
  const [payOpen, setPayOpen] = useState(false)
  const [pay, setPay] = useState({ amount: '', method: 'bank_transfer', payment_date: todayISO(), reference: '' })

  const load = async () => {
    const [{ data: b }, { data: v }] = await Promise.all([
      supabase.from('vendor_bills').select('*, vendor:vendors(name)').order('bill_date', { ascending: false }),
      supabase.from('vendors').select('id, name, terms').order('name'),
    ])
    setBills(b || []); setVendors(v || [])
    const vid = searchParams.get('vendor')
    if (vid && (v || []).some(x => x.id === vid)) {
      const vend = v.find(x => x.id === vid)
      const due = (() => { const d = new Date(); d.setDate(d.getDate() + (Number(vend.terms) || 0)); return d.toISOString().slice(0, 10) })()
      setForm({ ...blankBill(), vendor_id: vid, due_date: due })
      setNewOpen(true)
      setSearchParams({}, { replace: true })
    }
  }
  useEffect(() => { load() }, [])

  const onPickVendor = (vid) => {
    const v = vendors.find(x => x.id === vid)
    const due = v ? (() => { const d = new Date(form.bill_date); d.setDate(d.getDate() + (Number(v.terms) || 0)); return d.toISOString().slice(0, 10) })() : ''
    setForm({ ...form, vendor_id: vid, due_date: due })
  }

  const createBill = async () => {
    if (!form.vendor_id) return alert('Pick a vendor.')
    const total = Number(form.total) || 0
    setBusy(true)
    await supabase.from('vendor_bills').insert({
      company_id: company.id, vendor_id: form.vendor_id, bill_number: form.bill_number || null,
      bill_date: form.bill_date, due_date: form.due_date || null,
      total, amount_due: total, status: 'unpaid', notes: form.notes || null,
    })
    await recalcVendor(form.vendor_id)
    setBusy(false); setNewOpen(false); setForm(blankBill()); load()
  }

  const openDetail = async (bill) => {
    setDetail(bill)
    const { data } = await supabase.from('vendor_payments').select('*').eq('bill_id', bill.id).order('payment_date', { ascending: false })
    setPayments(data || [])
  }
  const refreshDetail = async (billId, vendorId) => {
    await recalcVendorBill(billId); await recalcVendor(vendorId)
    const { data: b } = await supabase.from('vendor_bills').select('*, vendor:vendors(name)').eq('id', billId).maybeSingle()
    setDetail(b)
    const { data: p } = await supabase.from('vendor_payments').select('*').eq('bill_id', billId).order('payment_date', { ascending: false })
    setPayments(p || []); load()
  }

  const recordPayment = async () => {
    const amt = Number(pay.amount)
    if (!amt || amt <= 0) return alert('Enter a valid amount.')
    setBusy(true)
    await supabase.from('vendor_payments').insert({
      company_id: company.id, vendor_id: detail.vendor_id, bill_id: detail.id,
      amount: amt, method: pay.method, payment_date: pay.payment_date, reference: pay.reference,
    })
    setBusy(false); setPayOpen(false)
    setPay({ amount: '', method: 'bank_transfer', payment_date: todayISO(), reference: '' })
    refreshDetail(detail.id, detail.vendor_id)
  }
  const cancelBill = async () => {
    await supabase.from('vendor_bills').update({ status: 'cancelled' }).eq('id', detail.id)
    refreshDetail(detail.id, detail.vendor_id)
  }
  const deleteBill = async () => {
    if (!confirm('Delete this bill and its payments?')) return
    const vid = detail.vendor_id
    await supabase.from('vendor_bills').delete().eq('id', detail.id)
    await recalcVendor(vid)
    setDetail(null); load()
  }

  const tabs = ['all', 'unpaid', 'partial', 'overdue', 'paid']
  const filtered = (bills || [])
    .filter(b => filter === 'all' ? true : filter === 'overdue' ? isOverdue(b.due_date, b.status) : b.status === filter)
    .filter(b => [b.bill_number, b.vendor?.name].join(' ').toLowerCase().includes(q.toLowerCase()))
  const totalOwed = (bills || []).filter(b => b.status !== 'cancelled').reduce((s, b) => s + Number(b.amount_due || 0), 0)

  return (
    <>
      <PageHeader title={t('bills_title')} subtitle={t('bills_sub')}>
        <button className="btn-primary" onClick={() => { setForm(blankBill()); setNewOpen(true) }} disabled={vendors.length === 0}><Plus size={18} /> {t('new_bill')}</button>
      </PageHeader>

      {bills === null ? <Spinner /> : vendors.length === 0 ? (
        <EmptyState icon={ReceiptText} title="Add a vendor first" hint="Create a vendor, then you can record their bills here." />
      ) : bills.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No bills yet" hint="Record a bill from a vendor to track what you owe."
          action={<button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={18} /> {t('new_bill')}</button>} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {tabs.map(t => (
              <button key={t} onClick={() => setFilter(t)} className={`badge px-3 py-1.5 capitalize ${filter === t ? 'bg-moss-700 text-white' : 'bg-white text-ink/60 hover:bg-black/5'}`}>
                {t === 'all' ? 'All' : BILL_STATUS[t]?.label}
              </button>
            ))}
            <div className="ml-auto text-sm text-ink/55">You owe <span className="font-display text-lg text-clay">{money(totalOwed, cur)}</span></div>
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-black/[.07] px-4 py-3">
              <Search size={18} className="text-ink/40" />
              <input className="w-full bg-transparent text-sm outline-none placeholder:text-black/30" placeholder="Search bill # or vendor…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Vendor</th>
                    <th className="px-4 py-3 font-semibold">Bill #</th>
                    <th className="px-4 py-3 font-semibold">Due</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                    <th className="px-4 py-3 text-right font-semibold">Owed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[.05]">
                  {filtered.map(b => {
                    const od = isOverdue(b.due_date, b.status)
                    const s = od ? BILL_STATUS.overdue : (BILL_STATUS[b.status] || BILL_STATUS.unpaid)
                    return (
                      <tr key={b.id} className="cursor-pointer hover:bg-sand/40" onClick={() => openDetail(b)}>
                        <td className="px-4 py-3 font-semibold text-ink">{b.vendor?.name || '—'}</td>
                        <td className="px-4 py-3 text-ink/70">{b.bill_number || '—'}</td>
                        <td className="px-4 py-3 text-ink/60">{fmtDate(b.due_date)}</td>
                        <td className="px-4 py-3"><span className={`badge ${s.cls}`}>{s.label}</span></td>
                        <td className="px-4 py-3 text-right tabular-nums">{money(b.total, cur)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-clay">{money(b.amount_due, cur)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* New bill */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New bill">
        <div className="space-y-4">
          <Field label="Vendor *">
            <select className="input" value={form.vendor_id} onChange={e => onPickVendor(e.target.value)}>
              <option value="">Select vendor…</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bill #"><input className="input" value={form.bill_number} onChange={e => setForm({ ...form, bill_number: e.target.value })} placeholder="Their ref" /></Field>
            <Field label="Amount *"><input className="input" type="number" step="0.01" value={form.total} onChange={e => setForm({ ...form, total: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bill date"><input className="input" type="date" value={form.bill_date} onChange={e => setForm({ ...form, bill_date: e.target.value })} /></Field>
            <Field label="Due date"><input className="input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></Field>
          </div>
          <Field label="Notes"><textarea className="input min-h-[60px]" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setNewOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={createBill} disabled={busy}>{busy ? 'Saving…' : 'Save bill'}</button>
        </div>
      </Modal>

      {/* Bill detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Bill · ${detail.vendor?.name || ''}` : ''} wide>
        {detail && (
          <>
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-sand p-4 text-sm sm:grid-cols-4">
              <div><div className="label">Bill #</div>{detail.bill_number || '—'}</div>
              <div><div className="label">Bill date</div>{fmtDate(detail.bill_date)}</div>
              <div><div className="label">Total</div><span className="tabular-nums">{money(detail.total, cur)}</span></div>
              <div><div className="label">Owed</div><span className="font-semibold tabular-nums text-clay">{money(detail.amount_due, cur)}</span></div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg text-ink">Payments</h3>
              <div className="flex gap-2">
                {detail.status !== 'paid' && detail.status !== 'cancelled' &&
                  <button className="btn-primary" onClick={() => { setPay(p => ({ ...p, amount: String(detail.amount_due) })); setPayOpen(true) }}><Plus size={16} /> Record payment</button>}
                {detail.status !== 'cancelled' && detail.status !== 'paid' && <button className="btn-ghost" onClick={cancelBill}>Cancel bill</button>}
                <button className="btn-danger" onClick={deleteBill}><Trash2 size={16} /></button>
              </div>
            </div>
            {payments.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink/50">No payments recorded yet.</p>
            ) : (
              <table className="mt-2 w-full text-sm">
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
          </>
        )}
      </Modal>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Record payment to vendor">
        <div className="space-y-4">
          <Field label="Amount"><input className="input" type="number" step="0.01" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date"><input className="input" type="date" value={pay.payment_date} onChange={e => setPay({ ...pay, payment_date: e.target.value })} /></Field>
            <Field label="Method">
              <select className="input" value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value })}>
                <option value="bank_transfer">Bank transfer</option><option value="card">Card</option>
                <option value="cash">Cash</option><option value="check">Check</option><option value="other">Other</option>
              </select>
            </Field>
          </div>
          <Field label="Reference"><input className="input" value={pay.reference} onChange={e => setPay({ ...pay, reference: e.target.value })} placeholder="Optional" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setPayOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={recordPayment} disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</button>
        </div>
      </Modal>
    </>
  )
}
