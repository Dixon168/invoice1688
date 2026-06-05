import { useEffect, useState } from 'react'
import { Users, Plus, Trash2, Pencil, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Spinner, EmptyState, Modal, Field } from '../components/ui'
import { useT } from '../i18n'

const blank = { name: '', email: '', phone: '', role: '', is_active: true }

export default function Employees() {
  const { company } = useAuth()
  const { t } = useT()
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('employees').select('*').order('name')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(blank); setOpen(true) }
  const openEdit = (e) => { setEditing(e); setForm({ ...blank, ...e }); setOpen(true) }
  const save = async () => {
    if (!form.name.trim()) return
    setBusy(true)
    const payload = { ...form, company_id: company.id }
    if (editing) await supabase.from('employees').update(payload).eq('id', editing.id)
    else await supabase.from('employees').insert(payload)
    setBusy(false); setOpen(false); load()
  }
  const remove = async (e) => {
    if (!confirm(`${t('delete')} "${e.name}"?`)) return
    await supabase.from('employees').delete().eq('id', e.id); load()
  }

  return (
    <>
      <Link to="/settings" className="mb-4 flex items-center gap-1 text-sm text-ink/60 hover:text-ink"><ArrowLeft size={16} /> {t('settings_title')}</Link>
      <PageHeader title={t('emp_title')} subtitle={t('emp_sub')}>
        <button className="btn-primary" onClick={openNew}><Plus size={18} /> {t('emp_new')}</button>
      </PageHeader>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={Users} title={t('emp_none')} hint={t('emp_none_h')} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 bg-sand/40 text-left text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3 font-semibold">{t('c_name')}</th>
                <th className="px-4 py-3 font-semibold">{t('emp_role')}</th>
                <th className="px-4 py-3 font-semibold">{t('f_phone')}</th>
                <th className="px-4 py-3 font-semibold">{t('email')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.06]">
              {rows.map(e => (
                <tr key={e.id} className="hover:bg-sand/30">
                  <td className="px-4 py-3 font-medium text-ink">{e.name}{!e.is_active && <span className="badge ml-2 bg-black/5 text-ink/50">{t('emp_inactive')}</span>}</td>
                  <td className="px-4 py-3 text-ink/70">{e.role || '—'}</td>
                  <td className="px-4 py-3 text-ink/70">{e.phone || '—'}</td>
                  <td className="px-4 py-3 text-ink/70">{e.email || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="rounded-md p-2 text-ink/50 hover:bg-black/5 hover:text-ink" onClick={() => openEdit(e)}><Pencil size={15} /></button>
                    <button className="rounded-md p-2 text-ink/50 hover:bg-clay/10 hover:text-clay" onClick={() => remove(e)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t('emp_edit') : t('emp_new')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label={t('c_name')}><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus /></Field></div>
          <Field label={t('emp_role')}><input className="input" value={form.role || ''} onChange={e => setForm({ ...form, role: e.target.value })} placeholder={t('emp_role_ph')} /></Field>
          <Field label={t('f_phone')}><input className="input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label={t('email')}><input className="input" type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></Field></div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-ink/80">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> {t('emp_active')}
            </label>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setOpen(false)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? t('saving') : t('save')}</button>
        </div>
      </Modal>
    </>
  )
}
