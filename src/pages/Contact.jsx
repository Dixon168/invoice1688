import { useState } from 'react'
import { MapPin, Phone, Mail, Send, CheckCircle2, ImagePlus, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Field, Spinner } from '../components/ui'
import { useT } from '../i18n'
import { sendSupportEmail } from '../lib/emailjs'
import { supabase } from '../lib/supabase'

const ADDRESS = '4136 College Point Blvd #2, Flushing, NY 11355'
const PHONE = '646-703-8888'
const SUPPORT_EMAIL = 'support@allinonepayment.com'
const MAP_SRC = `https://www.google.com/maps?q=${encodeURIComponent(ADDRESS)}&output=embed`

export default function Contact() {
  const { t } = useT()
  const { user, company } = useAuth()
  const [form, setForm] = useState({
    type: 'type_bug',
    name: '',
    email: user?.email || '',
    company_name: company?.name || '',
    message: '',
  })
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [files, setFiles] = useState([])

  const addFiles = (list) => {
    const imgs = Array.from(list).filter(f => f.type.startsWith('image/')).slice(0, 5 - files.length)
    setFiles(prev => [...prev, ...imgs])
  }
  const removeFile = (i) => setFiles(prev => prev.filter((_, idx) => idx !== i))

  const uploadPhotos = async () => {
    const urls = []
    for (const f of files) {
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${company?.id || 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('support').upload(path, f, { upsert: false, contentType: f.type })
      if (!error) {
        const { data } = supabase.storage.from('support').getPublicUrl(path)
        if (data?.publicUrl) urls.push(data.publicUrl)
      }
    }
    return urls
  }

  const types = ['type_cancel', 'type_bug', 'type_suggestion', 'type_billing', 'type_other']

  const submit = async () => {
    if (!form.message.trim()) { alert(t('c_need_msg')); return }
    setBusy(true)
    try {
      let message = form.message
      if (files.length) {
        const urls = await uploadPhotos()
        if (urls.length) message += `\n\n${t('c_photos') || 'Attached photos'}:\n` + urls.join('\n')
      }
      await sendSupportEmail({
        type: t(form.type),
        name: form.name || (form.email ? form.email.split('@')[0] : 'Customer'),
        email: form.email,
        company_name: form.company_name,
        message,
      })
      setSent(true)
    } catch (e) {
      alert(t('c_failed'))
    } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title={t('contact_title')} subtitle={t('contact_sub')} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* company info + map */}
        <div className="space-y-4">
          <div className="card p-6">
            <h2 className="font-display text-2xl text-ink">All In One Payment</h2>
            <p className="mt-1 text-sm text-ink/50">{t('powered_by')}</p>
            <div className="mt-4 space-y-3 text-sm">
              <a href={MAP_SRC.replace('&output=embed', '')} target="_blank" rel="noreferrer"
                className="flex items-start gap-3 text-ink/80 hover:text-moss-700">
                <MapPin size={18} className="mt-0.5 shrink-0 text-moss-700" />
                <span>{ADDRESS}</span>
              </a>
              <a href={`tel:${PHONE.replace(/[^0-9]/g, '')}`} className="flex items-center gap-3 text-ink/80 hover:text-moss-700">
                <Phone size={18} className="shrink-0 text-moss-700" /> {PHONE}
              </a>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-3 text-ink/80 hover:text-moss-700">
                <Mail size={18} className="shrink-0 text-moss-700" /> {SUPPORT_EMAIL}
              </a>
            </div>
          </div>

          <div className="card overflow-hidden p-0">
            <iframe title="map" src={MAP_SRC} className="h-64 w-full border-0" loading="lazy"
              referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          </div>
        </div>

        {/* support form */}
        <div className="card p-6">
          {sent ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 size={48} className="text-moss-600" />
              <h3 className="mt-4 font-display text-xl text-ink">{t('c_sent_title')}</h3>
              <p className="mt-2 max-w-sm text-sm text-ink/60">{t('c_sent_body')}</p>
              <button className="btn-outline mt-5" onClick={() => { setSent(false); setForm(f => ({ ...f, message: '' })) }}>{t('c_send_another')}</button>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label={t('c_type')}>
                <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {types.map(ty => <option key={ty} value={ty}>{t(ty)}</option>)}
                </select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('c_name')}>
                  <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label={t('c_your_email')}>
                  <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </Field>
              </div>
              <Field label={t('c_message')}>
                <textarea className="input min-h-[140px]" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
              </Field>
              <div>
                <span className="label">{t('c_photos') || 'Photos'} <span className="font-normal text-ink/40">({t('c_optional') || 'optional'}, max 5)</span></span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-black/10">
                      <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => removeFile(i)} className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black"><X size={12} /></button>
                    </div>
                  ))}
                  {files.length < 5 && (
                    <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-black/20 text-ink/40 hover:border-moss-600/50 hover:text-moss-700">
                      <ImagePlus size={20} />
                      <span className="text-[10px]">{t('c_add_photo') || 'Add'}</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
                    </label>
                  )}
                </div>
              </div>
              <button className="btn-primary w-full" onClick={submit} disabled={busy}>
                <Send size={16} /> {busy ? t('c_sending') : t('c_send')}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
