import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, TrendingUp, Clock, AlertTriangle, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate, STATUS } from '../lib/format'
import { PageHeader, Spinner } from '../components/ui'

function Stat({ icon: Icon, label, value, tone = 'ink' }) {
  const tones = { ink: 'text-ink', moss: 'text-moss-700', clay: 'text-clay' }
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-ink/50"><Icon size={16} /><span className="text-xs font-semibold uppercase tracking-wide">{label}</span></div>
      <div className={`mt-2 font-display text-3xl tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const { company } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const cur = company?.default_currency || 'USD'

  useEffect(() => {
    (async () => {
      const [{ data: invs }, { data: custs }, { data: vends }] = await Promise.all([
        supabase.from('invoices').select('*, customer:customers(name)').order('created_at', { ascending: false }),
        supabase.from('customers').select('id'),
        supabase.from('vendors').select('balance'),
      ])
      const list = invs || []
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const outstanding = list.filter(i => i.status !== 'cancelled').reduce((s, i) => s + Number(i.amount_due || 0), 0)
      const paidThisMonth = list.filter(i => i.paid_at && new Date(i.paid_at) >= monthStart).reduce((s, i) => s + Number(i.amount_paid || 0), 0)
      const overdue = list.filter(i => i.status !== 'paid' && i.status !== 'cancelled' && i.due_date && new Date(i.due_date) < now)
      const payable = (vends || []).reduce((s, v) => s + Number(v.balance || 0), 0)
      setData({
        outstanding, paidThisMonth, overdueCount: overdue.length, payable,
        overdueAmt: overdue.reduce((s, i) => s + Number(i.amount_due || 0), 0),
        customers: (custs || []).length, recent: list.slice(0, 6),
      })
    })()
  }, [])

  if (!data) return <Spinner />

  return (
    <>
      <PageHeader title={`Welcome${company?.name ? `, ${company.name}` : ''}`} subtitle="Here's where things stand today.">
        <Link to="/invoices/new" className="btn-primary"><Plus size={18} /> New invoice</Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Clock} label="Outstanding" value={money(data.outstanding, cur)} tone="clay" />
        <Stat icon={TrendingUp} label="Paid this month" value={money(data.paidThisMonth, cur)} tone="moss" />
        <Stat icon={AlertTriangle} label="Overdue" value={`${data.overdueCount}`} tone="clay" />
        <Stat icon={Wallet} label="You owe (bills)" value={money(data.payable, cur)} tone="clay" />
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/[.07] px-5 py-4">
          <h2 className="font-display text-xl text-ink">Recent invoices</h2>
          <Link to="/invoices" className="text-sm font-semibold text-moss-700 hover:underline">View all</Link>
        </div>
        {data.recent.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-ink/50">No invoices yet. <Link to="/invoices/new" className="text-moss-700 underline">Create one</Link>.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-black/[.05]">
              {data.recent.map(i => {
                const s = STATUS[i.status] || STATUS.draft
                return (
                  <tr key={i.id} className="cursor-pointer hover:bg-sand/40" onClick={() => navigate(`/invoices/${i.id}`)}>
                    <td className="px-5 py-3 font-semibold text-ink">{i.invoice_number}</td>
                    <td className="px-5 py-3 text-ink/70">{i.customer?.name || '—'}</td>
                    <td className="px-5 py-3 text-ink/55">{fmtDate(i.issue_date)}</td>
                    <td className="px-5 py-3"><span className={`badge ${s.cls}`}>{s.label}</span></td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">{money(i.total, cur)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
