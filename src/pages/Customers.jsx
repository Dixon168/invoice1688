import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, isOverdue } from '../lib/format'
import { PageHeader, Spinner, EmptyState, Modal, Field } from '../components/ui'
import { TemplateButton, ImportButton } from '../components/ImportExport'
import { useT } from '../i18n'

const blank = {
  name: '', email: '', phone: '', payment_terms: 30, notes: '',
  billing_address: '', billing_city: '', billing_state: '', billing_postal_code: '', billing_country: '',
}

const customerFields = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'payment_terms', label: 'Payment terms (days)', type: 'number' },
  { key: 'billing_address', label: 'Billing address', type: 'text' },
  { key: 'billing_city', label: 'Billing city', type: 'text' },
  { key: 'billing_state', label: 'Billing state', type: 'text' },
  { key: 'billing_postal_code', label: 'Billing postal code', type: 'text' },
  { key: 'billing_country', label: 'Billing country', type: 'text' },
  { key: 'delivery_address', label: 'Delivery address', type: 'text' },
  { key: 'delivery_city', label: 'Delivery city', type: 'text' },
  { key: 'delivery_state', label: 'Delivery state', type: 'text' },
  { key: 'delivery_postal_code', label: 'Delivery postal code', type: 'text' },
  { key: 'delivery_country', label: 'Delivery country', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'text' },
]
const customerExample = ['John Smith', 'john@email.com', '555-9876', 30, '10 Oak Ave', 'Dallas', 'TX', '75201', 'USA', '', '', '', '', '', '']

export default function Customers() {
  const { company } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [overdueIds, setOverdueIds] = useState(new Set())
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const cur = company?.default_currency || 'USD'

  const load = async () => {
    const [{ data }, { data: invs }] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('invoices').select('customer_id, due_date, status'),
    ])
    setRows(data || [])
    const od = new Set()
    for (const i of (invs || [])) if (isOverdue(i.due_date, i.status)) od.add(i.customer_id)
    setOverdueIds(od)
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(blank); setOpen(true) }
  const openEdit = (c) => { setEditing(c); setForm({ ...blank, ...c }); setOpen(true) }

  const save = async () => {
    if (!form.name.trim()) return
    setBusy(true)
    const payload = { ...form, payment_terms: Number(form.payment_terms) || 0, company_id: company.id }
    if (editing) await supabase.from('customers').update(payload).eq('id', editing.id)
    else await supabase.from('customers').insert(payload)
    setBusy(false); setOpen(false); load()
  }

  const remove = async (c) => {
    if (!confirm(`Delete customer "${c.name}"?`)) return
    await supabase.from('customers').delete().eq('id', c.id); load()
  }

  const filtered = (rows || [])
    .filter(c => filter === 'all' ? true : filter === 'owing' ? Number(c.balance) > 0 : overdueIds.has(c.id))
    .filter(c => [c.name, c.email, c.phone, c.billing_city].join(' ').toLowerCase().includes(q.toLowerCase()))

  const stats = {
    total: (rows || []).length,
    owing: (rows || []).filter(c => Number(c.balance) > 0).length,
    overdue: (rows || []).filter(c => overdueIds.has(c.id)).length,
    outstanding: (rows || []).reduce((s, c) => s + Number(c.balance || 0), 0),
    credit: (rows || []).reduce((s, c) => s + Number(c.credit_balance || 0), 0),
  }

  return (
    <>
      <PageHeader title={t('nav_customers')} subtitle={t('customers_sub')}>
        <TemplateButton filename="customers_template.xlsx" fields={customerFields} example={customerExample} />
        <ImportButton table="customers" fields={customerFields} companyId={company.id} onDone={load} />
        <button className="btn-primary" onClick={openNew}><Plus size={18} /> {t('new_customer')}</button>
      </PageHeader>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={Users} title={t('es_no_customers')} hint={t('es_no_customers_h')}
          action={<button className="btn-primary" onClick={openNew}><Plus size={18} /> {t('new_customer')}</button>} />
      ) : (
        <>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <button onClick={() => setFilter('all')}
            className={`card p-4 text-left transition hover:shadow-md ${filter === 'all' ? 'ring-2 ring-moss-600' : ''}`}>
            <div className="label">{t('st_total_customers')}</div>
            <div className="mt-1 font-display text-2xl text-ink tabular-nums">{stats.total}</div>
          </button>
          <button onClick={() => setFilter('owing')}
            className={`card p-4 text-left transition hover:shadow-md ${filter === 'owing' ? 'ring-2 ring-moss-600' : ''}`}>
            <div className="label">{t('st_owing')}</div>
            <div className="mt-1 font-display text-2xl text-clay tabular-nums">{stats.owing}</div>
          </button>
          <button onClick={() => setFilter('overdue')}
            className={`card p-4 text-left transition hover:shadow-md ${filter === 'overdue' ? 'ring-2 ring-moss-600' : ''}`}>
            <div className="label">{t('st_overdue')}</div>
            <div className="mt-1 font-display text-2xl text-red-600 tabular-nums">{stats.overdue}</div>
          </button>
          <div className="card p-4">
            <div className="label">{t('st_outstanding')}</div>
            <div className="mt-1 font-display text-2xl text-ink tabular-nums">{money(stats.outstanding, cur)}</div>
          </div>
          <div className="card p-4">
            <div className="label">{t('st_credit')}</div>
            <div className="mt-1 font-display text-2xl text-moss-700 tabular-nums">{money(stats.credit, cur)}</div>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {['all', 'owing', 'overdue'].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`badge px-3 py-1.5 ${filter === t ? 'bg-moss-700 text-white' : 'bg-white text-ink/60 hover:bg-black/5'}`}>
              {t === 'all' ? 'All' : t === 'owing' ? 'Owing' : 'Overdue'}
            </button>
          ))}
        </div>
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-black/[.07] px-4 py-3">
            <Search size={18} className="text-ink/40" />
            <input className="w-full bg-transparent text-sm outline-none placeholder:text-black/30"
              placeholder={t('ph_search_name_phone_city')} value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t('th_name')}</th>
                  <th className="px-4 py-3 font-semibold">{t('th_contact')}</th>
                  <th className="px-4 py-3 font-semibold">{t('th_location')}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('th_balance')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.05]">
                {filtered.map(c => (
                  <tr key={c.id} className="cursor-pointer hover:bg-sand/40" onClick={() => navigate(`/customers/${c.id}`)}>
                    <td className="px-4 py-3 font-semibold text-ink">
                      <span className="flex items-center gap-2">{c.name}
                        {overdueIds.has(c.id) && <span className="badge bg-red-100 text-red-700">Overdue</span>}</span>
                    </td>
                    <td className="px-4 py-3 text-ink/70">{c.email || c.phone || '—'}</td>
                    <td className="px-4 py-3 text-ink/70">{c.billing_city || '—'}</td>
                    <td className={`px-4 py-3 text-right font-medium tabular-nums ${Number(c.balance) > 0 ? 'text-clay' : 'text-ink/40'}`}>
                      {money(c.balance, cur)}
                      {Number(c.credit_balance) > 0 && <div className="text-xs font-normal text-moss-700">+{money(c.credit_balance, cur)} {t('cr_balance')}</div>}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button className="rounded-md p-2 text-ink/50 hover:bg-black/5 hover:text-ink" onClick={() => openEdit(c)}><Pencil size={16} /></button>
                        <button className="rounded-md p-2 text-ink/50 hover:bg-clay/10 hover:text-clay" onClick={() => remove(c)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `${t('edit')} ${t('th_customer')}` : t('new_customer')} wide>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('f_name_req')}><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t('email')}><input className="input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label={t('f_phone')}><input className="input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label={t('f_payment_terms')}><input className="input" type="number" value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label={t('f_billing_address')}><input className="input" value={form.billing_address || ''} onChange={e => setForm({ ...form, billing_address: e.target.value })} /></Field></div>
          <Field label={t('f_city')}><input className="input" value={form.billing_city || ''} onChange={e => setForm({ ...form, billing_city: e.target.value })} /></Field>
          <Field label={t('f_state')}><input className="input" value={form.billing_state || ''} onChange={e => setForm({ ...form, billing_state: e.target.value })} /></Field>
          <Field label={t('f_postal_code')}><input className="input" value={form.billing_postal_code || ''} onChange={e => setForm({ ...form, billing_postal_code: e.target.value })} /></Field>
          <Field label={t('f_country')}><input className="input" value={form.billing_country || ''} onChange={e => setForm({ ...form, billing_country: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label={t('f_notes')}><textarea className="input min-h-[70px]" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setOpen(false)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </>
  )
}
