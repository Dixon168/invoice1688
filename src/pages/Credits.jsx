import { useEffect, useState } from 'react'
import { Undo2, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Spinner, EmptyState, Modal, Field } from '../components/ui'
import { useT } from '../i18n'
import { money, fmtDate, todayISO } from '../lib/format'
import { restockReturn, reverseReturnRestock } from '../lib/inventory'
import { addCustomerCredit } from '../lib/calc'

const blankLine = () => ({ product_id: '', description: '', quantity: 1, unit_price: 0 })

export default function Credits() {
  const { company } = useAuth()
  const { t } = useT()
  const [rows, setRows] = useState(null)
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ type: 'return', customer_id: '', reason: 'goodwill', amount: '', restock: true, credit_date: todayISO(), notes: '' })
  const [lines, setLines] = useState([blankLine()])

  const load = async () => {
    const { data } = await supabase.from('credits').select('*, customers(name)').order('credit_date', { ascending: false }).order('created_at', { ascending: false })
    setRows(data || [])
  }
  const loadRefs = async () => {
    const { data: cs } = await supabase.from('customers').select('id, name, credit_balance').order('name')
    setCustomers(cs || [])
    const { data: ps } = await supabase.from('products').select('id, name, unit_price, track_inventory').order('name')
    setProducts(ps || [])
  }
  useEffect(() => { load(); loadRefs() }, [])

  const openNew = () => {
    setForm({ type: 'return', customer_id: '', reason: 'goodwill', amount: '', restock: true, credit_date: todayISO(), notes: '' })
    setLines([blankLine()]); loadRefs(); setOpen(true)
  }
  const setLine = (i, patch) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const onPick = (i, productId) => {
    const p = products.find(x => x.id === productId)
    setLine(i, { product_id: productId, description: p?.name || '', unit_price: p ? Number(p.unit_price) : 0 })
  }
  const addLine = () => setLines(ls => [...ls, blankLine()])
  const removeLine = (i) => setLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)

  const returnTotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)

  const save = async () => {
    if (!form.customer_id) { alert(t('cr_need_customer')); return }
    const isReturn = form.type === 'return'
    let amount = 0, validItems = []
    if (isReturn) {
      validItems = lines.filter(l => l.product_id && Number(l.quantity) > 0)
      amount = validItems.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price || 0), 0)
    } else {
      amount = Number(form.amount || 0)
    }
    amount = Math.round(amount * 100) / 100
    if (amount <= 0) { alert(t('cr_need_amount')); return }
    setBusy(true)
    try {
      const { data: cr, error } = await supabase.from('credits').insert({
        company_id: company.id, customer_id: form.customer_id, credit_date: form.credit_date,
        reason: isReturn ? 'return' : form.reason, amount,
        restock: isReturn ? form.restock : false, notes: form.notes || null,
      }).select().single()
      if (error) { alert(error.message); setBusy(false); return }
      if (isReturn && validItems.length) {
        const items = validItems.map(l => ({
          credit_id: cr.id, product_id: l.product_id, description: l.description || null,
          quantity: Number(l.quantity), unit_price: Number(l.unit_price || 0),
          line_total: Math.round(Number(l.quantity) * Number(l.unit_price || 0) * 100) / 100,
        }))
        await supabase.from('credit_items').insert(items)
        if (form.restock) await restockReturn(company.id, cr.id, items)
      }
      await addCustomerCredit(form.customer_id, amount)
      setOpen(false); load(); loadRefs()
    } finally { setBusy(false) }
  }

  const voidCredit = async (cr) => {
    if (!confirm(t('cr_void_confirm'))) return
    if (cr.reason === 'return' && cr.restock) await reverseReturnRestock(cr.id)
    await addCustomerCredit(cr.customer_id, -Number(cr.amount))
    await supabase.from('credits').delete().eq('id', cr.id)
    load(); loadRefs()
  }

  const reasonLabel = (r) => t('reason_' + r)

  return (
    <>
      <PageHeader title={t('credits_title')} subtitle={t('credits_sub')}>
        <button className="btn-primary" onClick={openNew}><Plus size={18} /> {t('cr_new')}</button>
      </PageHeader>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={Undo2} title={t('es_no_credits')} hint={t('es_no_credits_h')} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 bg-sand/40 text-left text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3 font-semibold">{t('th_date')}</th>
                <th className="px-4 py-3 font-semibold">{t('cr_customer')}</th>
                <th className="px-4 py-3 font-semibold">{t('th_reason')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('cr_amount')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.06]">
              {rows.map(cr => (
                <tr key={cr.id} className="hover:bg-sand/30">
                  <td className="px-4 py-3 text-ink/70">{fmtDate(cr.credit_date)}</td>
                  <td className="px-4 py-3 font-medium text-ink">{cr.customers?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-black/5 text-ink/70">{reasonLabel(cr.reason)}</span>
                    {cr.reason === 'return' && cr.restock && <span className="badge ml-1 bg-moss-50 text-moss-700">{t('cr_restock')}</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-moss-700">{money(cr.amount, company?.default_currency)}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="rounded-md p-2 text-ink/40 hover:bg-clay/10 hover:text-clay" title={t('cr_void')} onClick={() => voidCredit(cr)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t('cr_new')} wide>
        <div className="space-y-4">
          {/* type toggle */}
          <div className="flex gap-2">
            <button className={`badge px-3 py-1.5 ${form.type === 'return' ? 'bg-moss-600 text-white' : 'bg-black/5 text-ink/60'}`} onClick={() => setForm({ ...form, type: 'return' })}>{t('cr_new_return')}</button>
            <button className={`badge px-3 py-1.5 ${form.type === 'manual' ? 'bg-moss-600 text-white' : 'bg-black/5 text-ink/60'}`} onClick={() => setForm({ ...form, type: 'manual' })}>{t('cr_new_manual')}</button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('cr_customer')}>
              <select className="input" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">—</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label={t('th_date')}>
              <input className="input" type="date" value={form.credit_date} onChange={e => setForm({ ...form, credit_date: e.target.value })} />
            </Field>
          </div>

          {form.type === 'return' ? (
            <div className="rounded-lg border border-black/10 p-3">
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 items-center gap-2">
                    <select className="input col-span-6 py-1.5 text-sm" value={l.product_id} onChange={e => onPick(i, e.target.value)}>
                      <option value="">—</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input className="input col-span-2 py-1.5 text-sm text-right" type="number" step="1" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} title={t('cr_qty')} />
                    <input className="input col-span-3 py-1.5 text-sm text-right" type="number" step="0.01" value={l.unit_price} onChange={e => setLine(i, { unit_price: e.target.value })} title={t('cr_unit_price')} />
                    <button className="col-span-1 text-ink/30 hover:text-clay" onClick={() => removeLine(i)}><X size={16} /></button>
                  </div>
                ))}
              </div>
              <button className="btn-ghost mt-2 text-sm" onClick={addLine}><Plus size={15} /> {t('cr_add_line')}</button>
              <div className="mt-3 flex items-center justify-between border-t border-black/10 pt-3">
                <label className="flex items-center gap-2 text-sm text-ink/80">
                  <input type="checkbox" checked={form.restock} onChange={e => setForm({ ...form, restock: e.target.checked })} /> {t('cr_restock')}
                </label>
                <div className="text-right"><span className="text-xs text-ink/50">{t('cr_amount')}: </span><span className="font-display text-lg text-moss-700">{money(returnTotal, company?.default_currency)}</span></div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('cr_reason')}>
                <select className="input" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}>
                  <option value="goodwill">{t('reason_goodwill')}</option>
                  <option value="adjustment">{t('reason_adjustment')}</option>
                </select>
              </Field>
              <Field label={t('cr_amount')}>
                <input className="input" type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </Field>
            </div>
          )}

          <Field label={t('f_note')}>
            <textarea className="input min-h-[60px]" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setOpen(false)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? t('saving') : t('save')}</button>
        </div>
      </Modal>
    </>
  )
}
