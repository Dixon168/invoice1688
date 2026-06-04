import { useEffect, useState } from 'react'
import { Percent, Plus, Pencil, Trash2, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Spinner, EmptyState, Modal, Field } from '../components/ui'
import { useT } from '../i18n'

const blank = { name: '', rate: 0, region: '', is_default: false }

export default function TaxRates() {
  const { company } = useAuth()
  const { t } = useT()
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('tax_rates').select('*').order('name')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(blank); setOpen(true) }
  const openEdit = (t) => { setEditing(t); setForm({ ...blank, ...t }); setOpen(true) }

  const save = async () => {
    if (!form.name.trim()) return
    setBusy(true)
    const payload = { name: form.name, rate: Number(form.rate) || 0, region: form.region, is_default: form.is_default, company_id: company.id }
    if (form.is_default) await supabase.from('tax_rates').update({ is_default: false }).eq('company_id', company.id)
    if (editing) await supabase.from('tax_rates').update(payload).eq('id', editing.id)
    else await supabase.from('tax_rates').insert(payload)
    setBusy(false); setOpen(false); load()
  }
  const remove = async (t) => {
    if (!confirm(`Delete tax rate "${t.name}"?`)) return
    await supabase.from('tax_rates').delete().eq('id', t.id); load()
  }

  return (
    <>
      <PageHeader title={t('taxrates_title')} subtitle={t('taxrates_sub')}>
        <button className="btn-primary" onClick={openNew}><Plus size={18} /> {t('new_taxrate')}</button>
      </PageHeader>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={Percent} title={t('es_no_taxrates')} hint={t('es_no_taxrates_h')}
          action={<button className="btn-primary" onClick={openNew}><Plus size={18} /> {t('new_taxrate')}</button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(t => (
            <div key={t.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-ink">{t.name}</h3>
                    {t.is_default && <span className="badge bg-moss-100 text-moss-700"><Star size={12} className="mr-1" /> Default</span>}
                  </div>
                  <p className="text-sm text-ink/55">{t.region || '—'}</p>
                </div>
                <div className="font-display text-2xl text-moss-700">{Number(t.rate)}%</div>
              </div>
              <div className="mt-3 flex justify-end gap-1">
                <button className="rounded-md p-2 text-ink/50 hover:bg-black/5 hover:text-ink" onClick={() => openEdit(t)}><Pencil size={16} /></button>
                <button className="rounded-md p-2 text-ink/50 hover:bg-clay/10 hover:text-clay" onClick={() => remove(t)}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `${t('edit')} ${t('taxrates_title')}` : t('new_taxrate')}>
        <div className="space-y-4">
          <Field label={t('f_name_req')}><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="NY Sales Tax" /></Field>
          <Field label={t('f_rate_pct')}><input className="input" type="number" step="0.0001" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} placeholder="8.875" /></Field>
          <Field label={t('f_region')}><input className="input" value={form.region || ''} onChange={e => setForm({ ...form, region: e.target.value })} placeholder="New York" /></Field>
          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} /> Set as default rate
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setOpen(false)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </>
  )
}
