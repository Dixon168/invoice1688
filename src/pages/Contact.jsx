import { useState } from 'react'
import { MapPin, Phone, Mail, Send, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Field, Spinner } from '../components/ui'
import { useT } from '../i18n'
import { sendSupportEmail } from '../lib/emailjs'

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

  const types = ['type_cancel', 'type_bug', 'type_suggestion', 'type_billing', 'type_other']

  const submit = async () => {
    if (!form.message.trim()) { alert(t('c_need_msg')); return }
    setBusy(true)
    try {
      await sendSupportEmail({
        type: t(form.type),
        name: form.name || (form.email ? form.email.split('@')[0] : 'Customer'),
        email: form.email,
        company_name: form.company_name,
        message: form.message,
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
