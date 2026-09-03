import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, TrendingUp, Clock, AlertTriangle, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate, STATUS } from '../lib/format'
import { PageHeader, Spinner } from '../components/ui'
import PaymentsReport from '../components/PaymentsReport'
import { useT } from '../i18n'

function Stat({ icon: Icon, label, value, tone = 'ink', onClick }) {
  const tones = { ink: 'text-ink', moss: 'text-moss-700', clay: 'text-clay' }
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`card p-5 text-left transition ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}`}>
      <div className="flex items-center gap-2 text-ink/50"><Icon size={16} /><span className="text-xs font-semibold uppercase tracking-wide">{label}</span></div>
      <div className={`mt-2 font-display text-3xl tabular-nums ${tones[tone]}`}>{value}</div>
    </button>
  )
}

export default function Dashboard() {
  const { company } = useAuth()
  const { t } = useT()
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
      <PageHeader title={t('dash_title')} subtitle={company?.name || ''}>
        <Link to="/invoices/new" className="btn-primary"><Plus size={18} /> {t('new_invoice')}</Link>
      </PageHeader>

      {company?.paid_until && (
        <div className="mb-5 inline-flex items-center gap-2 rounded-lg bg-moss-50 px-3 py-1.5 text-sm text-moss-800">
          <Clock size={14} /> {t('plan_active_until')} <span className="font-semibold">{fmtDate(company.paid_until)}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Clock} label={t('stat_outstanding')} value={money(data.outstanding, cur)} tone="clay" onClick={() => navigate('/invoices?filter=outstanding')} />
        <Stat icon={TrendingUp} label={t('stat_paid_month')} value={money(data.paidThisMonth, cur)} tone="moss" onClick={() => navigate('/payments')} />
        <Stat icon={AlertTriangle} label={t('stat_overdue')} value={`${data.overdueCount}`} tone="clay" onClick={() => navigate('/invoices?filter=overdue')} />
        <Stat icon={Wallet} label={t('stat_owe')} value={money(data.payable, cur)} tone="clay" onClick={() => navigate('/bills?filter=unpaid')} />
      </div>

      <PaymentsReport currency={cur} />

      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/[.07] px-5 py-4">
          <h2 className="font-display text-xl text-ink">{t('recent_invoices')}</h2>
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
                    <td className="px-5 py-3"><span className={`badge ${s.cls}`}>{t(s.key)}</span></td>
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
