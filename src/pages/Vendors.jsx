import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money } from '../lib/format'
import { PageHeader, Spinner, EmptyState, Modal, Field } from '../components/ui'
import { useT } from '../i18n'

const blank = {
  name: '', email: '', phone: '', terms: 30, notes: '',
  billing_address: '', billing_city: '', billing_state: '', billing_postal_code: '', billing_country: '',
}

export default function Vendors() {
  const { company } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const cur = company?.default_currency || 'USD'

  const load = async () => {
    const { data } = await supabase.from('vendors').select('*').order('name')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(blank); setOpen(true) }
  const openEdit = (v) => { setEditing(v); setForm({ ...blank, ...v }); setOpen(true) }

  const save = async () => {
    if (!form.name.trim()) return
    setBusy(true)
    const payload = { ...form, terms: Number(form.terms) || 0, company_id: company.id }
    delete payload.balance; delete payload.total_billed; delete payload.total_paid
    if (editing) await supabase.from('vendors').update(payload).eq('id', editing.id)
    else await supabase.from('vendors').insert(payload)
    setBusy(false); setOpen(false); load()
  }
  const remove = async (v) => {
    if (!confirm(`Delete vendor "${v.name}" and its bills?`)) return
    await supabase.from('vendors').delete().eq('id', v.id); load()
  }

  const filtered = (rows || [])
    .filter(v => filter === 'all' ? true : Number(v.balance) > 0)
    .filter(v => [v.name, v.email, v.phone].join(' ').toLowerCase().includes(q.toLowerCase()))
  const totalOwed = (rows || []).reduce((s, v) => s + Number(v.balance || 0), 0)

  return (
    <>
      <PageHeader title={t('vendors_title')} subtitle={t('vendors_sub')}>
        <button className="btn-primary" onClick={openNew}><Plus size={18} /> {t('new_vendor')}</button>
      </PageHeader>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={Truck} title={t('es_no_vendors')} hint={t('es_no_vendors_h')}
          action={<button className="btn-primary" onClick={openNew}><Plus size={18} /> {t('new_vendor')}</button>} />
      ) : (
        <>
        <div className="mb-4 flex flex-wrap gap-2">
          {['all', 'owing'].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`badge px-3 py-1.5 ${filter === t ? 'bg-moss-700 text-white' : 'bg-white text-ink/60 hover:bg-black/5'}`}>
              {t === 'all' ? 'All' : 'Owing'}
            </button>
          ))}
        </div>
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-black/[.07] px-4 py-3">
            <div className="flex flex-1 items-center gap-2">
              <Search size={18} className="text-ink/40" />
              <input className="w-full bg-transparent text-sm outline-none placeholder:text-black/30" placeholder={t('ph_search_vendors')} value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="text-sm text-ink/55">{t('m_you_owe')} <span className="font-display text-lg text-clay">{money(totalOwed, cur)}</span></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t('th_name')}</th>
                  <th className="px-4 py-3 font-semibold">{t('th_contact')}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('th_balance_owed')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.05]">
                {filtered.map(v => (
                  <tr key={v.id} className="cursor-pointer hover:bg-sand/40" onClick={() => navigate(`/vendors/${v.id}`)}>
                    <td className="px-4 py-3 font-semibold text-ink">{v.name}</td>
                    <td className="px-4 py-3 text-ink/70">{v.email || v.phone || '—'}</td>
                    <td className={`px-4 py-3 text-right font-medium tabular-nums ${Number(v.balance) > 0 ? 'text-clay' : 'text-ink/40'}`}>{money(v.balance, cur)}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button className="rounded-md p-2 text-ink/50 hover:bg-black/5 hover:text-ink" onClick={() => openEdit(v)}><Pencil size={16} /></button>
                        <button className="rounded-md p-2 text-ink/50 hover:bg-clay/10 hover:text-clay" onClick={() => remove(v)}><Trash2 size={16} /></button>
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `${t('edit')} ${t('th_vendor')}` : t('new_vendor')} wide>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('f_name_req')}><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t('email')}><input className="input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label={t('f_phone')}><input className="input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label={t('f_payment_terms')}><input className="input" type="number" value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label={t('f_address')}><input className="input" value={form.billing_address || ''} onChange={e => setForm({ ...form, billing_address: e.target.value })} /></Field></div>
          <Field label={t('f_city')}><input className="input" value={form.billing_city || ''} onChange={e => setForm({ ...form, billing_city: e.target.value })} /></Field>
          <Field label={t('f_state')}><input className="input" value={form.billing_state || ''} onChange={e => setForm({ ...form, billing_state: e.target.value })} /></Field>
          <Field label={t('f_postal_code')}><input className="input" value={form.billing_postal_code || ''} onChange={e => setForm({ ...form, billing_postal_code: e.target.value })} /></Field>
          <Field label={t('f_country')}><input className="input" value={form.billing_country || ''} onChange={e => setForm({ ...form, billing_country: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label={t('f_notes')}><textarea className="input min-h-[60px]" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setOpen(false)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </>
  )
}
