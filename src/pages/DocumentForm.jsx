import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, todayISO } from '../lib/format'
import { computeTotals, recalcCustomer, recalcInvoice } from '../lib/calc'
import { applyInvoiceInventory } from '../lib/inventory'
import { Spinner, Field, Modal } from '../components/ui'
import { ItemCombo, NameCombo } from '../components/Combo'
import { useT } from '../i18n'

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
const emptyItem = () => ({ key: Math.random().toString(36).slice(2), product_id: '', description: '', detail: '', quantity: 1, unit_price: 0, tax_rate: 0, taxable: true, ctn: "", units_per_ctn: null })

export default function DocumentForm({ kind = 'invoice' }) {
  const cfg = CFG[kind]
  const { id } = useParams()
  const { t } = useT()
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
  const [employees, setEmployees] = useState([])
  const [employeeId, setEmployeeId] = useState('')

  const [customerId, setCustomerId] = useState('')
  const [delivery, setDelivery] = useState({ address: '', city: '', state: '', postal_code: '', country: '' })
  const [customerQuery, setCustomerQuery] = useState('')
  const [number, setNumber] = useState('')
  const [issueDate, setIssueDate] = useState(todayISO())
  const [endDate, setEndDate] = useState('')
  const [status, setStatus] = useState('draft')
  const [isExempt, setIsExempt] = useState(false)
  const [taxId, setTaxId] = useState('')
  const [taxRate, setTaxRate] = useState(0)
  const [paidAmount, setPaidAmount] = useState(0)
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
      const { data: emps } = await supabase.from('employees').select('*').eq('is_active', true).order('name')
      setEmployees(emps || [])
      setCustomers(c || []); setProducts(p || []); setTaxes(t || [])
      const taxList = t || []
      const defTax = taxList.find(x => x.is_default)

      if (editing) {
        const { data: d } = await supabase.from(cfg.table).select('*').eq('id', id).maybeSingle()
        const { data: its } = await supabase.from(cfg.itemTable).select('*').eq(cfg.itemFK, id).order('sort_order')
        if (d) {
          setCustomerId(d.customer_id); setNumber(d[cfg.numField])
          setCustomerQuery((c || []).find(x => x.id === d.customer_id)?.name || '')
          setIssueDate(d.issue_date); setEndDate(d[cfg.dateField] || ''); setStatus(d.status)
          setIsExempt(d.is_exempt); setNotes(d.notes || ''); setTerms(d.terms || '')
          setDelivery({ address: d.delivery_address || '', city: d.delivery_city || '', state: d.delivery_state || '', postal_code: d.delivery_postal_code || '', country: d.delivery_country || '' })
          setEmployeeId(d.employee_id || '')
          const prodMap = {}; for (const pr of (p || [])) prodMap[pr.id] = pr
          const loaded = (its || []).map(i => {
            const prod = i.product_id ? prodMap[i.product_id] : null
            const taxable = prod ? !!prod.tax_rate_id : (Number(i.tax_rate) > 0)
            return { key: i.id, product_id: i.product_id || '', description: i.description, detail: i.detail || '', quantity: Number(i.quantity), unit_price: Number(i.unit_price), tax_rate: Number(i.tax_rate), taxable, ctn: i.ctn_qty ?? '', units_per_ctn: i.units_per_ctn ?? (prod?.units_per_ctn ?? null) }
          })
          setItems(loaded)
          const firstRate = loaded.find(l => Number(l.tax_rate) > 0)?.tax_rate || (defTax ? Number(defTax.rate) || 0 : 0)
          setTaxRate(firstRate)
          setTaxId(taxList.find(x => Number(x.rate) === firstRate)?.id || '')
          if (kind === 'invoice') {
            const { data: pays } = await supabase.from('payments').select('amount').eq('invoice_id', id)
            setPaidAmount(Math.round(((pays || []).reduce((s, p) => s + Number(p.amount || 0), 0)) * 100) / 100)
          }
        }
        setLoading(false)
      } else {
        const seq = company?.[cfg.seqField] || 1
        setNumber(`${company?.[cfg.prefixField] || cfg.prefixDefault}${String(seq).padStart(4, '0')}`)
        setNotes(company?.default_notes || '')
        setTerms(company?.default_terms || '')
        if (defTax) { setTaxId(defTax.id); setTaxRate(Number(defTax.rate) || 0) }
        const cidParam = searchParams.get('customer')
        const cust = cidParam ? (c || []).find(x => x.id === cidParam) : null
        if (cust) {
          setCustomerId(cust.id); setCustomerQuery(cust.name)
          setDelivery({ address: cust.delivery_address || cust.billing_address || '', city: cust.delivery_city || cust.billing_city || '', state: cust.delivery_state || cust.billing_state || '', postal_code: cust.delivery_postal_code || cust.billing_postal_code || '', country: cust.delivery_country || cust.billing_country || '' })
          const days = Number(cust.payment_terms) || 0
          const d = new Date(); d.setDate(d.getDate() + days)
          setEndDate(d.toISOString().slice(0, 10))
        }
      }
    })()
  }, [id, kind])

  const pickCustomer = (cust) => {
    setCustomerId(cust.id); setCustomerQuery(cust.name)
    setDelivery({ address: cust.delivery_address || cust.billing_address || '', city: cust.delivery_city || cust.billing_city || '', state: cust.delivery_state || cust.billing_state || '', postal_code: cust.delivery_postal_code || cust.billing_postal_code || '', country: cust.delivery_country || cust.billing_country || '' })
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
  const [custOpen, setCustOpen] = useState(false)
  const custBlank = { name: '', email: '', phone: '', payment_terms: 30, notes: '', billing_address: '', billing_city: '', billing_state: '', billing_postal_code: '', billing_country: '', delivery_address: '', delivery_city: '', delivery_state: '', delivery_postal_code: '', delivery_country: '' }
  const [newCust, setNewCust] = useState(custBlank)
  const [newCustSame, setNewCustSame] = useState(true)
  const openNewCust = () => { setNewCust({ ...custBlank, name: customerQuery || '' }); setNewCustSame(true); setCustOpen(true) }
  const saveNewCust = async () => {
    if (!newCust.name.trim()) { alert(t('c_name') + '?'); return }
    const payload = { ...newCust, company_id: company.id, payment_terms: Number(newCust.payment_terms) || 0 }
    if (newCustSame) {
      payload.delivery_address = newCust.billing_address; payload.delivery_city = newCust.billing_city
      payload.delivery_state = newCust.billing_state; payload.delivery_postal_code = newCust.billing_postal_code
      payload.delivery_country = newCust.billing_country
    }
    const { data, error } = await supabase.from('customers').insert(payload).select('*').single()
    if (error) { alert(error.message); return }
    setCustomers(prev => [...prev, data]); pickCustomer(data); setCustOpen(false)
  }
  const applyProduct = (idx, p) => {
    setItems(items.map((it, i) => i === idx ? { ...it, product_id: p.id, description: p.name, detail: p.description || '', unit_price: Number(p.unit_price) || 0, taxable: !!p.tax_rate_id, units_per_ctn: p.units_per_ctn || null, ctn: '' } : it))
  }
  const createAndPick = async (idx, name) => {
    const { data, error } = await supabase.from('products').insert({ company_id: company.id, name, unit_price: Number(items[idx]?.unit_price) || 0 }).select('*').single()
    if (error) { alert(error.message); return }
    setProducts(prev => [...prev, data]); applyProduct(idx, data)
  }
  const setItem = (idx, patch) => setItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it))
  const addItem = () => setItems([...items, emptyItem()])
  const delItem = (idx) => setItems(items.length === 1 ? items : items.filter((_, i) => i !== idx))

  const calcItems = useMemo(() => items.map(it => ({ ...it, tax_rate: it.taxable === false ? 0 : taxRate })), [items, taxRate])
  const totals = useMemo(() => computeTotals(calcItems, isExempt), [calcItems, isExempt])

  const save = async (newStatus) => {
    if (!customerId) return alert('Please choose a customer.')
    if (!number.trim()) return alert(`${cfg.title} number is required.`)
    setBusy(true)
    // protect paid invoices: don't let the new total drop below what's already been paid
    if (editing && kind === 'invoice') {
      const { data: pays } = await supabase.from('payments').select('amount').eq('invoice_id', id)
      const paid = Math.round(((pays || []).reduce((s, p) => s + Number(p.amount || 0), 0)) * 100) / 100
      if (paid > 0 && totals.total < paid - 0.001) {
        setBusy(false)
        return alert(`${t('edit_paid_warn') || 'This invoice already has payments of'} ${money(paid, cur)}. ${t('edit_paid_warn2') || 'The new total'} ${money(totals.total, cur)} ${t('edit_paid_warn3') || 'is lower and would create an overpayment. Please raise the total, or remove/refund payments first.'}`)
      }
    }
    const c = customers.find(x => x.id === customerId)
    const hasDelivery = delivery.address || delivery.city || delivery.state || delivery.postal_code || delivery.country
    const dlv = hasDelivery ? delivery : {
      address: c?.delivery_address || c?.billing_address || '',
      city: c?.delivery_city || c?.billing_city || '',
      state: c?.delivery_state || c?.billing_state || '',
      postal_code: c?.delivery_postal_code || c?.billing_postal_code || '',
      country: c?.delivery_country || c?.billing_country || '',
    }
    const head = {
      company_id: company.id, [cfg.numField]: number.trim(), customer_id: customerId,
      issue_date: issueDate, [cfg.dateField]: endDate || null, status: newStatus || status,
      subtotal: totals.subtotal, tax_total: totals.taxTotal, total: totals.total,
      currency: cur, is_exempt: isExempt, notes, terms, employee_id: employeeId || null,
      billing_address: c?.billing_address, billing_city: c?.billing_city, billing_state: c?.billing_state,
      billing_country: c?.billing_country, billing_postal_code: c?.billing_postal_code,
      delivery_address: dlv.address || null, delivery_city: dlv.city || null, delivery_state: dlv.state || null,
      delivery_country: dlv.country || null, delivery_postal_code: dlv.postal_code || null,
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
      [cfg.itemFK]: docId, product_id: it.product_id || null, description: it.description || '(item)', detail: it.detail || null,
      quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0,
      ctn_qty: it.ctn === '' || it.ctn == null ? null : Number(it.ctn),
      units_per_ctn: it.units_per_ctn || null,
      tax_rate: (isExempt || it.taxable === false) ? 0 : (Number(taxRate) || 0),
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
      <h1 className="mb-6 font-display text-3xl text-ink">{editing ? `${t('edit')} ${t(kind === 'invoice' ? 'th_invoice' : 'th_estimate')}` : t(kind === 'invoice' ? 'new_invoice' : 'new_estimate')}</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5"><Field label={t('f_customer_req')}>
          <NameCombo value={customerQuery} options={customers}
            onText={t => { setCustomerQuery(t); setCustomerId('') }}
            onPick={pickCustomer} onCreate={createCustomer}
            placeholder={t('ph_search_or_add_customer')} createLabel={t('create_customer')} />
          <button type="button" onClick={openNewCust} className="mt-1.5 text-sm font-medium text-moss-700 hover:underline">＋ {t('create_customer')}</button>
          {!customerId && customerQuery && <p className="mt-1 text-xs text-clay">Pick a match or create the customer.</p>}
        </Field></div>
        <div className="card p-5"><Field label={`${cfg.title} number`}>
          <input className="input capitalize-first" value={number} onChange={e => setNumber(e.target.value)} />
        </Field></div>
        <div className="card grid grid-cols-2 gap-3 p-5">
          <Field label={t('f_issue_date')}><input className="input" type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></Field>
          <Field label={cfg.dateLabel}><input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></Field>
        </div>
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-3 py-3 font-semibold">{t('th_item_desc')}</th>
                <th className="w-20 px-3 py-3 text-right font-semibold">{t('th_ctn') || 'Boxes'}</th>
                <th className="w-20 px-3 py-3 text-right font-semibold">{t('th_qty')}</th>
                <th className="w-28 px-3 py-3 text-right font-semibold">{t('th_price')}</th>
                <th className="w-28 px-3 py-3 text-right font-semibold">{t('th_amount')}</th>
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
                    <input className="input mt-1 py-1 text-xs text-ink/60" value={it.detail || ''} placeholder={t('ph_line_detail') || 'Description (optional)'}
                      onChange={e => setItem(idx, { detail: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    {it.units_per_ctn ? (
                      <input className="input py-1.5 text-right" type="number" step="1" min="0" value={it.ctn || ''}
                        onChange={e => { const c = e.target.value; setItem(idx, { ctn: c, quantity: c === '' ? it.quantity : Math.round(Number(c) * Number(it.units_per_ctn)) }) }} />
                    ) : <span className="block text-center text-xs text-ink/25">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <input className="input py-1.5 text-right" type="number" step="0.01" value={it.quantity} onChange={e => setItem(idx, { quantity: e.target.value, ctn: '' })} />
                    {it.units_per_ctn ? <div className="mt-0.5 text-right text-[10px] text-ink/40">1 box = {it.units_per_ctn}{it.ctn ? ` · ${it.ctn}×${it.units_per_ctn}=${Math.round(Number(it.ctn) * Number(it.units_per_ctn))}` : ''}</div> : null}
                  </td>
                  <td className="px-3 py-2"><input className="input py-1.5 text-right" type="number" step="0.01" value={it.unit_price} onChange={e => setItem(idx, { unit_price: e.target.value })} /></td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{money((Number(it.quantity) || 0) * (Number(it.unit_price) || 0), cur)}</td>
                  <td className="px-2 py-2"><button onClick={() => delItem(idx)} className="rounded-md p-1.5 text-ink/40 hover:bg-clay/10 hover:text-clay"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-black/[.07] p-3">
          <button onClick={addItem} className="btn-ghost text-sm"><Plus size={16} /> {t('add_line')}</button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4 p-5">
          <Field label={t('f_notes')}><textarea className="input min-h-[70px]" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('ph_visible_customer')} /></Field>
          <Field label={t('f_terms')}><textarea className="input min-h-[60px]" value={terms} onChange={e => setTerms(e.target.value)} /></Field>
          <div className="border-t border-black/10 pt-3">
            <div className="label mb-2">{t('ship_to') || 'Ship to (delivery address)'}</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><input className="input py-1.5 text-sm" placeholder={t('f_delivery_address') || 'Delivery address'} value={delivery.address} onChange={e => setDelivery({ ...delivery, address: e.target.value })} /></div>
              <input className="input py-1.5 text-sm" placeholder={t('f_city')} value={delivery.city} onChange={e => setDelivery({ ...delivery, city: e.target.value })} />
              <input className="input py-1.5 text-sm" placeholder={t('f_state')} value={delivery.state} onChange={e => setDelivery({ ...delivery, state: e.target.value })} />
              <input className="input py-1.5 text-sm" placeholder={t('f_postal_code')} value={delivery.postal_code} onChange={e => setDelivery({ ...delivery, postal_code: e.target.value })} />
              <input className="input py-1.5 text-sm" placeholder={t('f_country')} value={delivery.country} onChange={e => setDelivery({ ...delivery, country: e.target.value })} />
            </div>
          </div>
          <Field label={t('emp_made_by')}>
            <select className="input" value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">{t('emp_unassigned') || '—'}</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="card p-5">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink/60">{t('m_subtotal')}</span><span className="tabular-nums">{money(totals.subtotal, cur)}</span></div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink/60">{t('m_tax')}</span>
              <div className="flex items-center gap-1.5">
                <select className="input w-auto py-1 text-xs" value={taxId} disabled={isExempt}
                  onChange={e => { const id = e.target.value; setTaxId(id); const tr = taxes.find(x => x.id === id); if (tr) setTaxRate(Number(tr.rate) || 0) }}>
                  <option value="">{t('tax_custom') || 'Custom'}</option>
                  {taxes.map(tr => <option key={tr.id} value={tr.id}>{tr.name} ({Number(tr.rate)}%)</option>)}
                </select>
                <input className="input w-16 py-1 text-right text-xs" type="number" step="0.0001" value={taxRate} disabled={isExempt}
                  onChange={e => { setTaxRate(e.target.value); setTaxId('') }} />
                <span className="text-ink/40">%</span>
              </div>
            </div>
            <div className="flex justify-between"><span className="text-ink/60">{t('m_tax')}</span><span className="tabular-nums">{money(totals.taxTotal, cur)}</span></div>
            <div className="mt-2 flex justify-between border-t border-black/10 pt-3 font-display text-2xl text-ink"><span>{t('m_total')}</span><span className="tabular-nums">{money(totals.total, cur)}</span></div>
            {editing && kind === 'invoice' && paidAmount > 0 && (
              <>
                <div className="flex justify-between pt-1 text-moss-700"><span>{t('m_paid') || 'Paid'}</span><span className="tabular-nums">−{money(paidAmount, cur)}</span></div>
                <div className="flex justify-between font-semibold text-clay"><span>{t('m_balance_due') || 'Amount due'}</span><span className="tabular-nums">{money(Math.max(0, Math.round((totals.total - paidAmount) * 100) / 100), cur)}</span></div>
              </>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn-outline" onClick={() => save('draft')} disabled={busy}>{t('save_draft')}</button>
            <button className="btn-primary flex-1" onClick={() => save('sent')} disabled={busy}>{busy ? t('saving') : t(kind === 'invoice' ? 'mark_sent_save' : 'send_save')}</button>
          </div>
        </div>
      </div>

      <Modal open={custOpen} onClose={() => setCustOpen(false)} title={t('create_customer')} wide>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('c_name')}><input className="input" value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} autoFocus /></Field>
          <Field label={t('f_payment_terms')}><input className="input" type="number" value={newCust.payment_terms} onChange={e => setNewCust({ ...newCust, payment_terms: e.target.value })} /></Field>
          <Field label={t('email')}><input className="input" type="email" value={newCust.email} onChange={e => setNewCust({ ...newCust, email: e.target.value })} /></Field>
          <Field label={t('f_phone')}><input className="input" value={newCust.phone} onChange={e => setNewCust({ ...newCust, phone: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label={t('f_billing_address')}><input className="input" value={newCust.billing_address} onChange={e => setNewCust({ ...newCust, billing_address: e.target.value })} /></Field></div>
          <Field label={t('f_city')}><input className="input" value={newCust.billing_city} onChange={e => setNewCust({ ...newCust, billing_city: e.target.value })} /></Field>
          <Field label={t('f_state')}><input className="input" value={newCust.billing_state} onChange={e => setNewCust({ ...newCust, billing_state: e.target.value })} /></Field>
          <Field label={t('f_postal_code')}><input className="input" value={newCust.billing_postal_code} onChange={e => setNewCust({ ...newCust, billing_postal_code: e.target.value })} /></Field>
          <Field label={t('f_country')}><input className="input" value={newCust.billing_country} onChange={e => setNewCust({ ...newCust, billing_country: e.target.value })} /></Field>
          <div className="sm:col-span-2 border-t border-black/10 pt-3">
            <label className="flex items-center gap-2 text-sm font-medium text-ink/80">
              <input type="checkbox" checked={newCustSame} onChange={e => setNewCustSame(e.target.checked)} /> {t('f_delivery_same')}
            </label>
          </div>
          {!newCustSame && <>
            <div className="sm:col-span-2"><Field label={t('f_delivery_address')}><input className="input" value={newCust.delivery_address} onChange={e => setNewCust({ ...newCust, delivery_address: e.target.value })} /></Field></div>
            <Field label={t('f_city')}><input className="input" value={newCust.delivery_city} onChange={e => setNewCust({ ...newCust, delivery_city: e.target.value })} /></Field>
            <Field label={t('f_state')}><input className="input" value={newCust.delivery_state} onChange={e => setNewCust({ ...newCust, delivery_state: e.target.value })} /></Field>
            <Field label={t('f_postal_code')}><input className="input" value={newCust.delivery_postal_code} onChange={e => setNewCust({ ...newCust, delivery_postal_code: e.target.value })} /></Field>
            <Field label={t('f_country')}><input className="input" value={newCust.delivery_country} onChange={e => setNewCust({ ...newCust, delivery_country: e.target.value })} /></Field>
          </>}
          <div className="sm:col-span-2"><Field label={t('f_notes')}><textarea className="input min-h-[60px]" value={newCust.notes} onChange={e => setNewCust({ ...newCust, notes: e.target.value })} /></Field></div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setCustOpen(false)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={saveNewCust}>{t('save')}</button>
        </div>
      </Modal>
    </div>
  )
}
