import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, FileDown, ArrowRightLeft, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate } from '../lib/format'
import { recalcCustomer } from '../lib/calc'
import { documentPDF } from '../lib/pdf'
import { Spinner } from '../components/ui'
import { EST_STATUS } from './Estimates'
import { useT } from '../i18n'

export default function EstimateDetail() {
  const { id } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const { company, refreshCompany } = useAuth()
  const cur = company?.default_currency || 'USD'
  const [est, setEst] = useState(null)
  const [items, setItems] = useState([])
  const [customer, setCustomer] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data: e } = await supabase.from('estimates').select('*').eq('id', id).maybeSingle()
    if (!e) { setEst(false); return }
    setEst(e)
    const [{ data: its }, { data: cu }] = await Promise.all([
      supabase.from('estimate_items').select('*').eq('estimate_id', id).order('sort_order'),
      supabase.from('customers').select('*').eq('id', e.customer_id).maybeSingle(),
    ])
    setItems(its || []); setCustomer(cu || null)
  }
  useEffect(() => { load() }, [id])

  const setStatus = async (status) => { await supabase.from('estimates').update({ status }).eq('id', id); load() }

  const convertToInvoice = async () => {
    if (!confirm('Create an invoice from this estimate?')) return
    setBusy(true)
    const seq = (company?.next_invoice_seq || 1)
    const invNumber = `${company?.invoice_prefix || 'INV-'}${String(seq).padStart(4, '0')}`
    const head = {
      company_id: company.id, invoice_number: invNumber, customer_id: est.customer_id,
      issue_date: new Date().toISOString().slice(0, 10), due_date: null, status: 'draft',
      subtotal: est.subtotal, tax_total: est.tax_total, total: est.total, amount_due: est.total,
      currency: est.currency, is_exempt: est.is_exempt, notes: est.notes, terms: est.terms,
      billing_address: est.billing_address, billing_city: est.billing_city, billing_state: est.billing_state,
      billing_country: est.billing_country, billing_postal_code: est.billing_postal_code,
    }
    const { data: inv, error } = await supabase.from('invoices').insert(head).select('id').single()
    if (error) { setBusy(false); return alert(error.message) }
    const rows = items.map((it, idx) => ({
      invoice_id: inv.id, product_id: it.product_id || null, description: it.description,
      quantity: it.quantity, unit_price: it.unit_price, tax_rate: it.tax_rate, line_total: it.line_total, sort_order: idx,
    }))
    await supabase.from('invoice_items').insert(rows)
    await supabase.from('companies').update({ next_invoice_seq: seq + 1 }).eq('id', company.id)
    await supabase.from('estimates').update({ status: 'converted', converted_invoice_id: inv.id }).eq('id', id)
    await recalcCustomer(est.customer_id)
    refreshCompany()
    setBusy(false)
    navigate(`/invoices/${inv.id}`)
  }

  const remove = async () => {
    if (!confirm(`Delete estimate ${est.estimate_number}?`)) return
    await supabase.from('estimates').delete().eq('id', id)
    navigate('/estimates')
  }

  if (est === null) return <Spinner />
  if (est === false) return <div className="card p-10 text-center text-ink/60">Estimate not found. <Link className="text-moss-700 underline" to="/estimates">Back</Link></div>
  const s = EST_STATUS[est.status] || EST_STATUS.draft

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate('/estimates')} className="flex items-center gap-1 text-sm text-ink/60 hover:text-ink"><ArrowLeft size={16} /> Estimates</button>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => documentPDF({ kind: 'estimate', doc: est, items, customer, company })}><FileDown size={16} /> {t('pdf')}</button>
          {est.status !== 'converted' && <Link className="btn-outline" to={`/estimates/${id}/edit`}><Pencil size={16} /> Edit</Link>}
          {est.status !== 'converted' && <button className="btn-primary" onClick={convertToInvoice} disabled={busy}><ArrowRightLeft size={16} /> {t('convert_invoice')}</button>}
          <button className="btn-danger" onClick={remove}><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[.07] bg-sand/50 p-6">
          <div>
            <div className="font-display text-3xl text-ink">{est.estimate_number}</div>
            <div className="mt-1 text-sm text-ink/55">Issued {fmtDate(est.issue_date)} · Expires {fmtDate(est.expiry_date)}</div>
          </div>
          <div className="text-right">
            <span className={`badge ${s.cls} text-sm`}>{s.label}</span>
            <div className="mt-2 font-display text-3xl text-ink tabular-nums">{money(est.total, cur)}</div>
            {est.converted_invoice_id && <Link to={`/invoices/${est.converted_invoice_id}`} className="text-sm text-moss-700 hover:underline">View invoice →</Link>}
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-2">
          <div>
            <div className="label">{t('m_quote_for')}</div>
            <div className="font-semibold text-ink">{customer?.name || '—'}</div>
            <div className="text-sm text-ink/60">{customer?.email}</div>
          </div>
          <div className="sm:text-right">
            <div className="label">{t('m_from')}</div>
            <div className="font-semibold text-ink">{company?.name}</div>
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
                  <td className="py-2.5 text-ink">{it.description}</td>
                  <td className="py-2.5 text-right tabular-nums">{Number(it.quantity)}</td>
                  <td className="py-2.5 text-right tabular-nums">{money(it.unit_price, cur)}</td>
                  <td className="py-2.5 text-right font-medium tabular-nums">{money(it.line_total, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end p-6">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink/60">{t('m_subtotal')}</span><span className="tabular-nums">{money(est.subtotal, cur)}</span></div>
            <div className="flex justify-between"><span className="text-ink/60">{t('m_tax')}</span><span className="tabular-nums">{money(est.tax_total, cur)}</span></div>
            <div className="flex justify-between border-t border-black/10 pt-2 font-display text-xl text-ink"><span>{t('m_total')}</span><span className="tabular-nums">{money(est.total, cur)}</span></div>
          </div>
        </div>
      </div>

      {est.status !== 'converted' && (
        <div className="card mt-4 flex flex-wrap items-center gap-2 p-4">
          <span className="text-sm text-ink/60">{t('mark_as')}</span>
          {est.status === 'draft' && <button className="btn-outline" onClick={() => setStatus('sent')}>{t('st_sent')}</button>}
          <button className="btn-outline" onClick={() => setStatus('accepted')}><Check size={16} /> {t('st_accepted')}</button>
          <button className="btn-ghost" onClick={() => setStatus('declined')}><X size={16} /> {t('st_declined')}</button>
        </div>
      )}
    </div>
  )
}
