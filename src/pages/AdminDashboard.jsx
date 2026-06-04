import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Building2, Plus, Trash2, LogOut, Users, FileText, CreditCard } from 'lucide-react'
import { supabase, makeTempClient } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate, todayISO, subState, SUB_BADGE } from '../lib/format'
import { Spinner, Modal, Field } from '../components/ui'
import { useT } from '../i18n'

const plusMonths = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10) }

export default function AdminDashboard() {
  const { signOut, user } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [companies, setCompanies] = useState(null)
  const [signups, setSignups] = useState([])
  const [newOpen, setNewOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', ownerName: '', paid_until: '', companyPhone: '', address: '', city: '', state: '', postal_code: '', country: '', contactName: '', contactPhone: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [created, setCreated] = useState(null)
  const [manage, setManage] = useState(null)
  const [mForm, setMForm] = useState({ subscription_status: 'active', paid_until: '' })

  const load = async () => {
    const [{ data: comps }, { data: custs }, { data: invs }, { data: profs }] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, company_id'),
      supabase.from('invoices').select('company_id, total, amount_due, status'),
      supabase.from('profiles').select('id, company_id, role'),
    ])
    const byCompany = (arr, cid) => (arr || []).filter(x => x.company_id === cid)
    setCompanies((comps || []).map(c => {
      const ci = byCompany(invs, c.id).filter(i => i.status !== 'cancelled')
      const cp = byCompany(profs, c.id)
      const adminProfile = cp.find(p => p.role === 'admin') || cp[0]
      return {
        ...c,
        customers: byCompany(custs, c.id).length,
        users: cp.length,
        userId: adminProfile?.id || null,
        invoices: ci.length,
        invoiced: ci.reduce((s, i) => s + Number(i.total || 0), 0),
        outstanding: ci.reduce((s, i) => s + Number(i.amount_due || 0), 0),
      }
    }))
  }
  useEffect(() => { load() }, [])

  const loadSignups = async () => {
    const { data } = await supabase.from('signups').select('*').order('created_at', { ascending: false })
    setSignups(data || [])
  }
  useEffect(() => { loadSignups() }, [])
  const setSignupStatus = async (id, status) => { await supabase.from('signups').update({ status }).eq('id', id); loadSignups() }
  const deleteSignup = async (id) => { if (confirm('Delete this signup?')) { await supabase.from('signups').delete().eq('id', id); loadSignups() } }

  const openNew = () => { setForm({ name: '', email: '', password: '', ownerName: '', paid_until: plusMonths(1), companyPhone: '', address: '', city: '', state: '', postal_code: '', country: '', contactName: '', contactPhone: '' }); setErr(''); setCreated(null); setNewOpen(true) }

  const createAccount = async () => {
    const name = form.name.trim(), email = form.email.trim(), password = form.password
    if (!name) return setErr('Enter a company name.')
    if (!email) return setErr('Enter the client\'s login email.')
    if (!password || password.length < 6) return setErr('Password must be at least 6 characters.')
    setErr(''); setBusy(true)

    // 1) create the client's auth account on an isolated client (keeps admin signed in)
    const temp = makeTempClient()
    const { data: su, error: e1 } = await temp.auth.signUp({ email, password })
    if (e1) {
      setBusy(false)
      if (/already|registered|exists/i.test(e1.message)) return setErr('This email already has an account. One email = one account — find that company in the list below to manage or renew it.')
      return setErr(e1.message)
    }
    // Supabase hides existing-email signups by returning a user with no identities
    if (su?.user && Array.isArray(su.user.identities) && su.user.identities.length === 0) {
      setBusy(false)
      return setErr('This email already has an account. One email = one account — find that company in the list below to manage or renew it.')
    }
    const newUserId = su?.user?.id
    if (!newUserId) { setBusy(false); return setErr('Could not create the account. Try a different email.') }

    // 2) create the company (admin has cross-company rights) with its paid period
    const { data: comp, error: e2 } = await supabase.from('companies')
      .insert({
        name, subscription_status: 'active', paid_until: form.paid_until || null,
        email: form.email || null, phone: form.companyPhone || null, address: form.address || null,
        city: form.city || null, state: form.state || null, postal_code: form.postal_code || null, country: form.country || null,
        contact_name: form.contactName || form.ownerName || null, contact_phone: form.contactPhone || null,
      })
      .select('id').single()
    if (e2) { setBusy(false); return setErr(e2.message) }

    // 3) link the new user to the company as its admin
    const { error: e3 } = await supabase.from('profiles')
      .insert({ id: newUserId, company_id: comp.id, full_name: form.contactName || form.ownerName || null, role: 'admin' })
    if (e3) { setBusy(false); return setErr(e3.message) }

    setBusy(false)
    setCreated({ email, password, needsConfirm: !su.session })
    load()
  }

  const openManage = (c) => { setManage(c); setErr(''); setMForm({
    name: c.name || '', email: c.email || '', phone: c.phone || '', address: c.address || '',
    city: c.city || '', state: c.state || '', postal_code: c.postal_code || '', country: c.country || '',
    contact_name: c.contact_name || '', contact_phone: c.contact_phone || '',
    subscription_status: c.subscription_status || 'active', paid_until: c.paid_until || '', newPassword: '' }) }
  const saveManage = async () => {
    setErr(''); setBusy(true)
    await supabase.from('companies')
      .update({
        name: mForm.name, email: mForm.email, phone: mForm.phone, address: mForm.address,
        city: mForm.city, state: mForm.state, postal_code: mForm.postal_code, country: mForm.country,
        contact_name: mForm.contact_name, contact_phone: mForm.contact_phone,
        subscription_status: mForm.subscription_status, paid_until: mForm.paid_until || null,
      })
      .eq('id', manage.id)
    // optional password change for the company's login
    if (mForm.newPassword) {
      if (mForm.newPassword.length < 6) { setBusy(false); return setErr('Password must be at least 6 characters.') }
      if (!manage.userId) { setBusy(false); return setErr('No login account is linked to this company yet.') }
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/.netlify/functions/admin-set-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ userId: manage.userId, password: mForm.newPassword }),
        })
        if (!res.ok) { setBusy(false); return setErr('Password change failed: ' + (await res.text())) }
      } catch (e) { setBusy(false); return setErr('Password change failed: ' + e.message) }
    }
    setBusy(false); setManage(null); load()
  }

  const deleteCompany = async (c) => {
    if (!confirm(`Delete "${c.name}" and ALL its data (customers, invoices, payments)? This cannot be undone.`)) return
    await supabase.from('companies').delete().eq('id', c.id)
    load()
  }

  return (
    <div className="min-h-screen bg-sand">
      <header className="flex items-center justify-between bg-ink px-6 py-4 text-white">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-clay" />
          <span className="font-display text-xl">invoice168 · Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-white/50 sm:inline">{user?.email}</span>
          <button onClick={async () => { await signOut(); navigate('/admin/login') }}
            className="flex items-center gap-2 text-sm text-white/70 hover:text-white"><LogOut size={16} /> Sign out</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {signups.filter(s => s.status === 'new').length > 0 && (
          <div className="mb-8">
            <h2 className="font-display text-2xl text-ink">Pending signups
              <span className="ml-2 rounded-full bg-clay px-2.5 py-0.5 align-middle text-sm text-white">{signups.filter(s => s.status === 'new').length}</span>
            </h2>
            <p className="mt-1 text-sm text-ink/55">People who requested an account from the pricing page. Contact them, take payment, then create their account below.</p>
            <div className="mt-3 space-y-3">
              {signups.filter(s => s.status === 'new').map(s => (
                <div key={s.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-ink">{s.company_name}{s.company_phone ? <span className="ml-2 text-sm font-normal text-ink/50">· {s.company_phone}</span> : null}</div>
                      <div className="text-sm text-ink/70">{[s.contact_name, s.email, s.phone].filter(Boolean).join(' · ')}</div>
                      <div className="text-sm text-ink/50">{[s.billing_address, s.city, s.state, s.postal_code, s.country].filter(Boolean).join(', ')}</div>
                      {s.notes && <div className="mt-1 text-sm italic text-ink/55">“{s.notes}”</div>}
                      <div className="mt-1 text-xs text-ink/40">{fmtDate(s.created_at)} · {s.plan}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-outline text-sm" onClick={() => setSignupStatus(s.id, 'contacted')}>Mark contacted</button>
                      <button className="btn-primary text-sm" onClick={() => { setForm({ name: s.company_name, email: s.email || '', password: '', ownerName: s.contact_name || '', paid_until: /12 months|annual|year/i.test(s.plan || '') ? plusMonths(12) : plusMonths(1), companyPhone: s.company_phone || '', address: s.billing_address || '', city: s.city || '', state: s.state || '', postal_code: s.postal_code || '', country: s.country || '', contactName: s.contact_name || '', contactPhone: s.phone || '' }); setErr(''); setCreated(null); setNewOpen(true); setSignupStatus(s.id, 'activated') }}>Create account</button>
                      <button className="rounded-md p-2 text-ink/40 hover:bg-clay/10 hover:text-clay" onClick={() => deleteSignup(s.id)}><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl text-ink">All companies</h1>
            <p className="mt-1 text-sm text-ink/55">Every business account on the platform.</p>
          </div>
          <button className="btn-primary" onClick={openNew}><Plus size={18} /> {t('new_company')}</button>
        </div>

        {companies === null ? <Spinner /> : companies.length === 0 ? (
          <div className="card p-12 text-center text-ink/55">No companies yet.</div>
        ) : (
          <>
            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <div className="card p-5"><div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Companies</div><div className="mt-1 font-display text-3xl text-ink">{companies.length}</div></div>
              <div className="card p-5"><div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Total invoiced</div><div className="mt-1 font-display text-3xl text-ink tabular-nums">{money(companies.reduce((s, c) => s + c.invoiced, 0))}</div></div>
              <div className="card p-5"><div className="text-xs font-semibold uppercase tracking-wide text-ink/50">{t('m_outstanding')}</div><div className="mt-1 font-display text-3xl text-clay tabular-nums">{money(companies.reduce((s, c) => s + c.outstanding, 0))}</div></div>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-ink/5 text-left text-xs uppercase tracking-wide text-ink/50">
                    <tr>
                      <th className="px-5 py-3 font-semibold">{t('th_company')}</th>
                      <th className="px-5 py-3 font-semibold">{t('th_subscription')}</th>
                      <th className="px-5 py-3 font-semibold">{t('th_expires')}</th>
                      <th className="px-5 py-3 text-center font-semibold">{t('th_users')}</th>
                      <th className="px-5 py-3 text-center font-semibold">{t('nav_customers')}</th>
                      <th className="px-5 py-3 text-center font-semibold">{t('nav_invoices')}</th>
                      <th className="px-5 py-3 text-right font-semibold">{t('th_invoiced')}</th>
                      <th className="px-5 py-3 text-right font-semibold">{t('th_outstanding')}</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[.05]">
                    {companies.map(c => (
                      <tr key={c.id} className="hover:bg-sand/50">
                        <td className="px-5 py-3">
                          <button onClick={() => openManage(c)} className="text-left">
                            <div className="font-semibold text-ink hover:text-clay">{c.name}</div>
                            <div className="text-xs text-ink/45">{c.email || '—'}</div>
                          </button>
                        </td>
                        <td className="px-5 py-3">
                          {(() => { const s = subState(c); return (
                            <button onClick={() => openManage(c)} className="group flex items-center gap-2 text-left">
                              <span className={`badge ${SUB_BADGE[s.state]}`}>{t(s.key)}</span>
                              <span className="text-xs text-ink/45 group-hover:text-ink/70">
                                {c.paid_until ? `until ${fmtDate(c.paid_until)}` : 'no date'}
                              </span>
                            </button>
                          )})()}
                        </td>
                        <td className="px-5 py-3">
                          {c.paid_until
                            ? <span className={`tabular-nums ${c.paid_until < todayISO() ? 'font-semibold text-clay' : 'text-ink/70'}`}>{fmtDate(c.paid_until)}</span>
                            : <span className="text-ink/35">{t('plan_no_date')}</span>}
                        </td>
                        <td className="px-5 py-3 text-center tabular-nums">{c.users}</td>
                        <td className="px-5 py-3 text-center tabular-nums">{c.customers}</td>
                        <td className="px-5 py-3 text-center tabular-nums">{c.invoices}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{money(c.invoiced, c.default_currency)}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-clay">{money(c.outstanding, c.default_currency)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => openManage(c)} className="rounded-md p-2 text-ink/40 hover:bg-black/5 hover:text-ink" title="Manage company"><CreditCard size={16} /></button>
                            <button onClick={() => deleteCompany(c)} className="rounded-md p-2 text-ink/40 hover:bg-clay/10 hover:text-clay" title="Delete"><Trash2 size={16} /></button>
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
      </main>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title={created ? 'Account created' : 'New company + login'}>
        {created ? (
          <div className="space-y-4">
            <p className="text-sm text-ink/70">Share these login details with your client. They sign in on the main login page.</p>
            <div className="rounded-lg bg-sand p-4 text-sm">
              <div className="flex justify-between py-1"><span className="text-ink/50">Email</span><span className="font-semibold text-ink">{created.email}</span></div>
              <div className="flex justify-between py-1"><span className="text-ink/50">Password</span><span className="font-semibold text-ink">{created.password}</span></div>
            </div>
            {created.needsConfirm && (
              <p className="text-sm text-clay">Note: email confirmation is ON in Supabase, so the client must confirm via their inbox before logging in. Turn it off in Supabase → Authentication if you'd rather hand out passwords directly.</p>
            )}
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => setNewOpen(false)}>{t('done')}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label={t('f_company_name_req')}><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Client's business name" /></Field>
            <Field label={t('f_owner_name')}><input className="input" value={form.ownerName} onChange={e => setForm({ ...form, ownerName: e.target.value })} placeholder="Optional" /></Field>
            <Field label={t('f_login_email_req')}><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="client@example.com" /></Field>
            <Field label={t('f_password_req')}><input className="input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" /></Field>
            <Field label={t('f_paid_until_plan')}><input className="input" type="date" value={form.paid_until} onChange={e => setForm({ ...form, paid_until: e.target.value })} /></Field>
            {err && <p className="text-sm text-clay">{err}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setNewOpen(false)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={createAccount} disabled={busy}>{busy ? 'Creating…' : 'Create company + login'}</button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!manage} onClose={() => setManage(null)} title={`Manage · ${manage?.name || ''}`} wide>
        <div className="space-y-4">
          <div className="label">Company info</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label={t('f_company_name')}><input className="input" value={mForm.name} onChange={e => setMForm({ ...mForm, name: e.target.value })} /></Field></div>
            <Field label={t('email')}><input className="input" value={mForm.email} onChange={e => setMForm({ ...mForm, email: e.target.value })} /></Field>
            <Field label={t('f_company_phone')}><input className="input" value={mForm.phone} onChange={e => setMForm({ ...mForm, phone: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label={t('f_address')}><input className="input" value={mForm.address} onChange={e => setMForm({ ...mForm, address: e.target.value })} /></Field></div>
            <Field label={t('f_city')}><input className="input" value={mForm.city} onChange={e => setMForm({ ...mForm, city: e.target.value })} /></Field>
            <Field label={t('f_state')}><input className="input" value={mForm.state} onChange={e => setMForm({ ...mForm, state: e.target.value })} /></Field>
            <Field label={t('f_postal_code')}><input className="input" value={mForm.postal_code} onChange={e => setMForm({ ...mForm, postal_code: e.target.value })} /></Field>
            <Field label={t('f_country')}><input className="input" value={mForm.country} onChange={e => setMForm({ ...mForm, country: e.target.value })} /></Field>
          </div>

          <div className="label border-t border-black/[.07] pt-4">{t('gs_contact_sec')}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('f_contact_name')}><input className="input" value={mForm.contact_name} onChange={e => setMForm({ ...mForm, contact_name: e.target.value })} /></Field>
            <Field label={t('f_contact_phone')}><input className="input" value={mForm.contact_phone} onChange={e => setMForm({ ...mForm, contact_phone: e.target.value })} /></Field>
          </div>

          <div className="label border-t border-black/[.07] pt-4">Subscription</div>
          <div className="flex gap-2">
            <button onClick={() => setMForm({ ...mForm, subscription_status: 'active' })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${mForm.subscription_status === 'active' ? 'border-moss-600 bg-moss-50 text-moss-700' : 'border-black/15 text-ink/60'}`}>Active</button>
            <button onClick={() => setMForm({ ...mForm, subscription_status: 'suspended' })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${mForm.subscription_status === 'suspended' ? 'border-clay bg-clay/10 text-clay' : 'border-black/15 text-ink/60'}`}>Suspended</button>
          </div>
          <Field label={t('f_paid_until')}><input className="input" type="date" value={mForm.paid_until} onChange={e => setMForm({ ...mForm, paid_until: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline text-xs" onClick={() => setMForm({ ...mForm, paid_until: plusMonths(1) })}>+1 month from today</button>
            <button className="btn-outline text-xs" onClick={() => setMForm({ ...mForm, paid_until: plusMonths(12) })}>+12 months</button>
          </div>
          <p className="text-xs text-ink/50">When "Paid until" passes, or you set Suspended, the client is automatically blocked from using the app until you renew it.</p>

          <div className="border-t border-black/[.07] pt-4">
            <Field label="Set new login password (optional)">
              <input className="input" type="text" value={mForm.newPassword || ''} onChange={e => setMForm({ ...mForm, newPassword: e.target.value })} placeholder="Leave blank to keep current password" />
            </Field>
            <p className="mt-1 text-xs text-ink/50">The client signs in with their email + this new password. Min 6 characters.</p>
          </div>
          {err && <p className="text-sm text-clay">{err}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setManage(null)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={saveManage} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </div>
  )
}
