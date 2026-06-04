import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, todayISO } from '../lib/format'
import { computeTotals, recalcCustomer, recalcInvoice } from '../lib/calc'
import { applyInvoiceInventory } from '../lib/inventory'
import { Spinner, Field } from '../components/ui'
import { ItemCombo, NameCombo } from '../components/Combo'

const CFG = {
  invoice: {
    table: 'invoices', itemTable: 'invoice_items', itemFK: 'invoice_id',
    numField: 'invoice_number', prefixField: 'invoice_prefix', seqField: 'next_invoice_seq', prefixDefault: 'INV-',
    dateField: 'due_date', dateLabel: 'Due date', basePath: '/invoices', title: 'invoice',
    primaryLabel: 'Save & mark sent',
  },
  estimate: {
    table: 'estimates', itemTable: 'estimate_items', itemFK: 'estimate_id',
    numField: 'estimate_number', prefixField: 'estimate_prefix', seqField: 'next_estimate_seq', prefixDefault: 'EST-',
    dateField: 'expiry_date', dateLabel: 'Expiry date', basePath: '/estimates', title: 'estimate',
    primaryLabel: 'Save & send',
  },
}
const emptyItem = () => ({ key: Math.random().toString(36).slice(2), product_id: '', description: '', quantity: 1, unit_price: 0, tax_rate: 0 })

export default function DocumentForm({ kind = 'invoice' }) {
  const cfg = CFG[kind]
  const { id } = useParams()
  const editing = !!id
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { company, refreshCompany } = useAuth()
  const cur = company?.default_currency || 'USD'

  const [loading, setLoading] = useState(editing)
  const [busy, setBusy] = useState(false)
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [taxes, setTaxes] = useState([])

  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [number, setNumber] = useState('')
  const [issueDate, setIssueDate] = useState(todayISO())
  const [endDate, setEndDate] = useState('')
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
        const { data: d } = await supabase.from(cfg.table).select('*').eq('id', id).maybeSingle()
        const { data: its } = await supabase.from(cfg.itemTable).select('*').eq(cfg.itemFK, id).order('sort_order')
        if (d) {
          setCustomerId(d.customer_id); setNumber(d[cfg.numField])
          setCustomerQuery((c || []).find(x => x.id === d.customer_id)?.name || '')
          setIssueDate(d.issue_date); setEndDate(d[cfg.dateField] || ''); setStatus(d.status)
          setIsExempt(d.is_exempt); setNotes(d.notes || ''); setTerms(d.terms || '')
          setItems((its || []).map(i => ({ key: i.id, product_id: i.product_id || '', description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price), tax_rate: Number(i.tax_rate) })))
        }
        setLoading(false)
      } else {
        const seq = company?.[cfg.seqField] || 1
        setNumber(`${company?.[cfg.prefixField] || cfg.prefixDefault}${String(seq).padStart(4, '0')}`)
        setNotes(company?.default_notes || '')
        setTerms(company?.default_terms || '')
        const cidParam = searchParams.get('customer')
        const cust = cidParam ? (c || []).find(x => x.id === cidParam) : null
        if (cust) {
          setCustomerId(cust.id); setCustomerQuery(cust.name)
          const days = Number(cust.payment_terms) || 0
          const d = new Date(); d.setDate(d.getDate() + days)
          setEndDate(d.toISOString().slice(0, 10))
        }
      }
    })()
  }, [id, kind])

  const pickCustomer = (cust) => {
    setCustomerId(cust.id); setCustomerQuery(cust.name)
    if (!editing) {
      const days = Number(cust.payment_terms) || 0
      const d = new Date(issueDate); d.setDate(d.getDate() + days)
      setEndDate(d.toISOString().slice(0, 10))
    }
  }
  const createCustomer = async (name) => {
    const { data, error } = await supabase.from('customers').insert({ company_id: company.id, name }).select('*').single()
    if (error) { alert(error.message); return }
    setCustomers(prev => [...prev, data]); pickCustomer(data)
  }
  const applyProduct = (idx, p) => {
    const tax = p?.tax_rate_id ? (taxes.find(t => t.id === p.tax_rate_id)?.rate || 0) : 0
    setItems(items.map((it, i) => i === idx ? { ...it, product_id: p.id, description: p.name, unit_price: Number(p.unit_price) || 0, tax_rate: Number(tax) } : it))
  }
  const createAndPick = async (idx, name) => {
    const { data, error } = await supabase.from('products').insert({ company_id: company.id, name, unit_price: Number(items[idx]?.unit_price) || 0 }).select('*').single()
    if (error) { alert(error.message); return }
    setProducts(prev => [...prev, data]); applyProduct(idx, data)
  }
  const setItem = (idx, patch) => setItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it))
  const addItem = () => setItems([...items, emptyItem()])
  const delItem = (idx) => setItems(items.length === 1 ? items : items.filter((_, i) => i !== idx))

  const totals = useMemo(() => computeTotals(items, isExempt), [items, isExempt])

  const save = async (newStatus) => {
    if (!customerId) return alert('Please choose a customer.')
    if (!number.trim()) return alert(`${cfg.title} number is required.`)
    setBusy(true)
    const c = customers.find(x => x.id === customerId)
    const head = {
      company_id: company.id, [cfg.numField]: number.trim(), customer_id: customerId,
      issue_date: issueDate, [cfg.dateField]: endDate || null, status: newStatus || status,
      subtotal: totals.subtotal, tax_total: totals.taxTotal, total: totals.total,
      currency: cur, is_exempt: isExempt, notes, terms,
      billing_address: c?.billing_address, billing_city: c?.billing_city, billing_state: c?.billing_state,
      billing_country: c?.billing_country, billing_postal_code: c?.billing_postal_code,
    }
    if (kind === 'invoice') head.amount_due = totals.total

    let docId = id
    if (editing) {
      await supabase.from(cfg.table).update(head).eq('id', id)
      await supabase.from(cfg.itemTable).delete().eq(cfg.itemFK, id)
    } else {
      const { data, error } = await supabase.from(cfg.table).insert(head).select('id').single()
      if (error) { setBusy(false); return alert(error.message) }
      docId = data.id
      await supabase.from('companies').update({ [cfg.seqField]: (company?.[cfg.seqField] || 1) + 1 }).eq('id', company.id)
      refreshCompany()
    }
    const rows = items.map((it, idx) => ({
      [cfg.itemFK]: docId, product_id: it.product_id || null, description: it.description || '(item)',
      quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0,
      tax_rate: isExempt ? 0 : (Number(it.tax_rate) || 0),
      line_total: Math.round((Number(it.quantity) || 0) * (Number(it.unit_price) || 0) * 100) / 100,
      sort_order: idx,
    }))
    await supabase.from(cfg.itemTable).insert(rows)
    if (kind === 'invoice') {
      await applyInvoiceInventory(company.id, docId, items)
      await recalcInvoice(docId); await recalcCustomer(customerId)
    }
    setBusy(false)
    navigate(`${cfg.basePath}/${docId}`)
  }

  if (loading) return <Spinner />

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-ink/60 hover:text-ink"><ArrowLeft size={16} /> Back</button>
      <h1 className="mb-6 font-display text-3xl capitalize text-ink">{editing ? `Edit ${cfg.title}` : `New ${cfg.title}`}</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5"><Field label="Customer *">
          <NameCombo value={customerQuery} options={customers}
            onText={t => { setCustomerQuery(t); setCustomerId('') }}
            onPick={pickCustomer} onCreate={createCustomer}
            placeholder="Search or add customer…" createLabel="Create customer" />
          {!customerId && customerQuery && <p className="mt-1 text-xs text-clay">Pick a match or create the customer.</p>}
        </Field></div>
        <div className="card p-5"><Field label={`${cfg.title} number`}>
          <input className="input capitalize-first" value={number} onChange={e => setNumber(e.target.value)} />
        </Field></div>
        <div className="card grid grid-cols-2 gap-3 p-5">
          <Field label="Issue date"><input className="input" type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></Field>
          <Field label={cfg.dateLabel}><input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></Field>
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
                    <ItemCombo value={it.description} products={products} currency={cur}
                      onText={t => setItem(idx, { description: t, product_id: '' })}
                      onPick={p => applyProduct(idx, p)} onCreate={name => createAndPick(idx, name)} />
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
          <Field label="Terms"><textarea className="input min-h-[60px]" value={terms} onChange={e => setTerms(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input type="checkbox" checked={isExempt} onChange={e => setIsExempt(e.target.checked)} /> Tax exempt (no tax)
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
            <button className="btn-primary flex-1" onClick={() => save('sent')} disabled={busy}>{busy ? 'Saving…' : cfg.primaryLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
