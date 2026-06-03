import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Building2, Plus, Trash2, LogOut, Users, FileText } from 'lucide-react'
import { supabase, makeTempClient } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate } from '../lib/format'
import { Spinner, Modal, Field } from '../components/ui'

export default function AdminDashboard() {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const [companies, setCompanies] = useState(null)
  const [newOpen, setNewOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', ownerName: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [created, setCreated] = useState(null)

  const load = async () => {
    const [{ data: comps }, { data: custs }, { data: invs }, { data: profs }] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, company_id'),
      supabase.from('invoices').select('company_id, total, amount_due, status'),
      supabase.from('profiles').select('company_id'),
    ])
    const byCompany = (arr, cid) => (arr || []).filter(x => x.company_id === cid)
    setCompanies((comps || []).map(c => {
      const ci = byCompany(invs, c.id).filter(i => i.status !== 'cancelled')
      return {
        ...c,
        customers: byCompany(custs, c.id).length,
        users: byCompany(profs, c.id).length,
        invoices: ci.length,
        invoiced: ci.reduce((s, i) => s + Number(i.total || 0), 0),
        outstanding: ci.reduce((s, i) => s + Number(i.amount_due || 0), 0),
      }
    }))
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setForm({ name: '', email: '', password: '', ownerName: '' }); setErr(''); setCreated(null); setNewOpen(true) }

  const createAccount = async () => {
    const name = form.name.trim(), email = form.email.trim(), password = form.password
    if (!name) return setErr('Enter a company name.')
    if (!email) return setErr('Enter the client\'s login email.')
    if (!password || password.length < 6) return setErr('Password must be at least 6 characters.')
    setErr(''); setBusy(true)

    // 1) create the client's auth account on an isolated client (keeps admin signed in)
    const temp = makeTempClient()
    const { data: su, error: e1 } = await temp.auth.signUp({ email, password })
    if (e1) { setBusy(false); return setErr(e1.message) }
    const newUserId = su?.user?.id
    if (!newUserId) { setBusy(false); return setErr('Could not create the account. Try a different email.') }

    // 2) create the company (admin has cross-company rights)
    const { data: comp, error: e2 } = await supabase.from('companies').insert({ name }).select('id').single()
    if (e2) { setBusy(false); return setErr(e2.message) }

    // 3) link the new user to the company as its admin
    const { error: e3 } = await supabase.from('profiles')
      .insert({ id: newUserId, company_id: comp.id, full_name: form.ownerName || null, role: 'admin' })
    if (e3) { setBusy(false); return setErr(e3.message) }

    setBusy(false)
    setCreated({ email, password, needsConfirm: !su.session })
    load()
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
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl text-ink">All companies</h1>
            <p className="mt-1 text-sm text-ink/55">Every business account on the platform.</p>
          </div>
          <button className="btn-primary" onClick={openNew}><Plus size={18} /> New company</button>
        </div>

        {companies === null ? <Spinner /> : companies.length === 0 ? (
          <div className="card p-12 text-center text-ink/55">No companies yet.</div>
        ) : (
          <>
            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <div className="card p-5"><div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Companies</div><div className="mt-1 font-display text-3xl text-ink">{companies.length}</div></div>
              <div className="card p-5"><div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Total invoiced</div><div className="mt-1 font-display text-3xl text-ink tabular-nums">{money(companies.reduce((s, c) => s + c.invoiced, 0))}</div></div>
              <div className="card p-5"><div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Outstanding</div><div className="mt-1 font-display text-3xl text-clay tabular-nums">{money(companies.reduce((s, c) => s + c.outstanding, 0))}</div></div>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-ink/5 text-left text-xs uppercase tracking-wide text-ink/50">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Company</th>
                      <th className="px-5 py-3 font-semibold">Created</th>
                      <th className="px-5 py-3 text-center font-semibold">Users</th>
                      <th className="px-5 py-3 text-center font-semibold">Customers</th>
                      <th className="px-5 py-3 text-center font-semibold">Invoices</th>
                      <th className="px-5 py-3 text-right font-semibold">Invoiced</th>
                      <th className="px-5 py-3 text-right font-semibold">Outstanding</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[.05]">
                    {companies.map(c => (
                      <tr key={c.id} className="hover:bg-sand/50">
                        <td className="px-5 py-3">
                          <div className="font-semibold text-ink">{c.name}</div>
                          <div className="text-xs text-ink/45">{c.email || '—'}</div>
                        </td>
                        <td className="px-5 py-3 text-ink/60">{fmtDate(c.created_at)}</td>
                        <td className="px-5 py-3 text-center tabular-nums">{c.users}</td>
                        <td className="px-5 py-3 text-center tabular-nums">{c.customers}</td>
                        <td className="px-5 py-3 text-center tabular-nums">{c.invoices}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{money(c.invoiced, c.default_currency)}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-clay">{money(c.outstanding, c.default_currency)}</td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => deleteCompany(c)} className="rounded-md p-2 text-ink/40 hover:bg-clay/10 hover:text-clay"><Trash2 size={16} /></button>
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
              <button className="btn-primary" onClick={() => setNewOpen(false)}>Done</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Company name *"><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Client's business name" /></Field>
            <Field label="Owner name"><input className="input" value={form.ownerName} onChange={e => setForm({ ...form, ownerName: e.target.value })} placeholder="Optional" /></Field>
            <Field label="Login email *"><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="client@example.com" /></Field>
            <Field label="Password *"><input className="input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" /></Field>
            {err && <p className="text-sm text-clay">{err}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setNewOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={createAccount} disabled={busy}>{busy ? 'Creating…' : 'Create company + login'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
