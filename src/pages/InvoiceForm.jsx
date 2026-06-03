import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, todayISO } from '../lib/format'
import { computeTotals, recalcCustomer } from '../lib/calc'
import { Spinner, Field } from '../components/ui'

const emptyItem = () => ({ key: Math.random().toString(36).slice(2), product_id: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 })

export default function InvoiceForm() {
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const { company, refreshCompany } = useAuth()
  const cur = company?.default_currency || 'USD'

  const [loading, setLoading] = useState(editing)
  const [busy, setBusy] = useState(false)
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [taxes, setTaxes] = useState([])

  const [customerId, setCustomerId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [issueDate, setIssueDate] = useState(todayISO())
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState('draft')
  const [isExempt, setIsExempt] = useState(false)
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')
  const [items, setItems] = useState([emptyItem()])

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: p }, { data: t }] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase.from('products').select('*').order('name'),
        supabase.from('tax_rates').select('*').order('name'),
      ])
      setCustomers(c || []); setProducts(p || []); setTaxes(t || [])

      if (editing) {
        const { data: inv } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle()
        const { data: its } = await supabase.from('invoice_items').select('*').eq('invoice_id', id).order('sort_order')
        if (inv) {
          setCustomerId(inv.customer_id); setInvoiceNumber(inv.invoice_number)
          setIssueDate(inv.issue_date); setDueDate(inv.due_date || ''); setStatus(inv.status)
          setIsExempt(inv.is_exempt); setNotes(inv.notes || ''); setTerms(inv.terms || '')
          setItems((its || []).map(i => ({ key: i.id, product_id: i.product_id || '', description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price), tax_rate: Number(i.tax_rate) })))
        }
        setLoading(false)
      } else {
        const seq = company?.next_invoice_seq || 1
        setInvoiceNumber(`${company?.invoice_prefix || 'INV-'}${String(seq).padStart(4, '0')}`)
      }
    })()
  }, [id])

  const onPickCustomer = (cid) => {
    setCustomerId(cid)
    const c = customers.find(x => x.id === cid)
    if (c && !editing) {
      const days = Number(c.payment_terms) || 0
      const d = new Date(issueDate); d.setDate(d.getDate() + days)
      setDueDate(d.toISOString().slice(0, 10))
    }
  }

  const onPickProduct = (idx, pid) => {
    const p = products.find(x => x.id === pid)
    const tax = p?.tax_rate_id ? (taxes.find(t => t.id === p.tax_rate_id)?.rate || 0) : 0
    setItems(items.map((it, i) => i === idx ? {
      ...it, product_id: pid,
      description: p ? p.name : it.description,
      unit_price: p ? Number(p.unit_price) : it.unit_price,
      tax_rate: Number(tax),
    } : it))
  }
  const setItem = (idx, patch) => setItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it))
  const addItem = () => setItems([...items, emptyItem()])
  const delItem = (idx) => setItems(items.length === 1 ? items : items.filter((_, i) => i !== idx))

  const totals = useMemo(() => computeTotals(items, isExempt), [items, isExempt])

  const save = async (newStatus) => {
    if (!customerId) return alert('Please choose a customer.')
    if (!invoiceNumber.trim()) return alert('Invoice number is required.')
    setBusy(true)
    const c = customers.find(x => x.id === customerId)
    const finalStatus = newStatus || status
    const head = {
      company_id: company.id, invoice_number: invoiceNumber.trim(), customer_id: customerId,
      issue_date: issueDate, due_date: dueDate || null, status: finalStatus,
      subtotal: totals.subtotal, tax_total: totals.taxTotal, total: totals.total,
      amount_due: totals.total, currency: cur, is_exempt: isExempt,
      notes, terms,
      billing_address: c?.billing_address, billing_city: c?.billing_city, billing_state: c?.billing_state,
      billing_country: c?.billing_country, billing_postal_code: c?.billing_postal_code,
    }

    let invoiceId = id
    if (editing) {
      await supabase.from('invoices').update(head).eq('id', id)
      await supabase.from('invoice_items').delete().eq('invoice_id', id)
    } else {
      const { data, error } = await supabase.from('invoices').insert(head).select('id').single()
      if (error) { setBusy(false); return alert(error.message) }
      invoiceId = data.id
      const seq = (company?.next_invoice_seq || 1) + 1
      await supabase.from('companies').update({ next_invoice_seq: seq }).eq('id', company.id)
      refreshCompany()
    }

    const rows = items.map((it, idx) => ({
      invoice_id: invoiceId, product_id: it.product_id || null, description: it.description || '(item)',
      quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0,
      tax_rate: isExempt ? 0 : (Number(it.tax_rate) || 0),
      line_total: Math.round((Number(it.quantity) || 0) * (Number(it.unit_price) || 0) * 100) / 100,
      sort_order: idx,
    }))
    await supabase.from('invoice_items').insert(rows)
    await recalcCustomer(customerId)

    setBusy(false)
    navigate(`/invoices/${invoiceId}`)
  }

  if (loading) return <Spinner />

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-ink/60 hover:text-ink"><ArrowLeft size={16} /> Back</button>
      <h1 className="mb-6 font-display text-3xl text-ink">{editing ? 'Edit invoice' : 'New invoice'}</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5"><Field label="Customer *">
          <select className="input" value={customerId} onChange={e => onPickCustomer(e.target.value)}>
            <option value="">Select customer…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {customers.length === 0 && <p className="mt-2 text-xs text-clay">Add a customer first (Customers page).</p>}
        </Field></div>
        <div className="card p-5"><Field label="Invoice number">
          <input className="input" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
        </Field></div>
        <div className="card grid grid-cols-2 gap-3 p-5">
          <Field label="Issue date"><input className="input" type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></Field>
          <Field label="Due date"><input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></Field>
        </div>
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-3 py-3 font-semibold">Item / description</th>
                <th className="w-20 px-3 py-3 text-right font-semibold">Qty</th>
                <th className="w-28 px-3 py-3 text-right font-semibold">Price</th>
                <th className="w-24 px-3 py-3 text-right font-semibold">Tax %</th>
                <th className="w-28 px-3 py-3 text-right font-semibold">Amount</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.05]">
              {items.map((it, idx) => (
                <tr key={it.key}>
                  <td className="px-3 py-2">
                    {products.length > 0 && (
                      <select className="input mb-1 py-1.5 text-xs" value={it.product_id} onChange={e => onPickProduct(idx, e.target.value)}>
                        <option value="">— pick item —</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                    <input className="input py-1.5" value={it.description} onChange={e => setItem(idx, { description: e.target.value })} placeholder="Description" />
                  </td>
                  <td className="px-3 py-2"><input className="input py-1.5 text-right" type="number" step="0.01" value={it.quantity} onChange={e => setItem(idx, { quantity: e.target.value })} /></td>
                  <td className="px-3 py-2"><input className="input py-1.5 text-right" type="number" step="0.01" value={it.unit_price} onChange={e => setItem(idx, { unit_price: e.target.value })} /></td>
                  <td className="px-3 py-2"><input className="input py-1.5 text-right" type="number" step="0.0001" value={it.tax_rate} disabled={isExempt} onChange={e => setItem(idx, { tax_rate: e.target.value })} /></td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{money((Number(it.quantity) || 0) * (Number(it.unit_price) || 0), cur)}</td>
                  <td className="px-2 py-2"><button onClick={() => delItem(idx)} className="rounded-md p-1.5 text-ink/40 hover:bg-clay/10 hover:text-clay"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-black/[.07] p-3">
          <button onClick={addItem} className="btn-ghost text-sm"><Plus size={16} /> Add line</button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4 p-5">
          <Field label="Notes"><textarea className="input min-h-[70px]" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Visible to customer" /></Field>
          <Field label="Terms"><textarea className="input min-h-[60px]" value={terms} onChange={e => setTerms(e.target.value)} placeholder="Payment terms, etc." /></Field>
          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input type="checkbox" checked={isExempt} onChange={e => setIsExempt(e.target.checked)} /> Tax exempt (no tax on this invoice)
          </label>
        </div>
        <div className="card p-5">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink/60">Subtotal</span><span className="tabular-nums">{money(totals.subtotal, cur)}</span></div>
            <div className="flex justify-between"><span className="text-ink/60">Tax</span><span className="tabular-nums">{money(totals.taxTotal, cur)}</span></div>
            <div className="mt-2 flex justify-between border-t border-black/10 pt-3 font-display text-2xl text-ink"><span>Total</span><span className="tabular-nums">{money(totals.total, cur)}</span></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn-outline" onClick={() => save('draft')} disabled={busy}>Save draft</button>
            <button className="btn-primary flex-1" onClick={() => save('sent')} disabled={busy}>{busy ? 'Saving…' : 'Save & mark sent'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
