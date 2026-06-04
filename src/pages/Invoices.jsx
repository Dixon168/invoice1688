import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate, STATUS, isOverdue } from '../lib/format'
import { PageHeader, Spinner, EmptyState } from '../components/ui'
import { useT } from '../i18n'

export default function Invoices() {
  const { company } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState(searchParams.get('filter') || 'all')
  const cur = company?.default_currency || 'USD'

  useEffect(() => {
    supabase.from('invoices')
      .select('*, customer:customers(name)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []))
  }, [])

  const matchFilter = (i) => {
    if (filter === 'all') return true
    if (filter === 'overdue') return isOverdue(i.due_date, i.status)
    if (filter === 'outstanding') return Number(i.amount_due) > 0 && !['paid', 'cancelled', 'draft'].includes(i.status)
    return i.status === filter
  }
  const filtered = (rows || [])
    .filter(matchFilter)
    .filter(i => [i.invoice_number, i.customer?.name].join(' ').toLowerCase().includes(q.toLowerCase()))

  const tabs = filter === 'outstanding' ? ['outstanding', 'all', 'draft', 'sent', 'partial', 'paid', 'overdue']
    : ['all', 'draft', 'sent', 'partial', 'paid', 'overdue']
  const tabLabel = (t) => t === 'all' ? 'All' : t === 'outstanding' ? 'Outstanding' : (STATUS[t]?.label || t)

  return (
    <>
      <PageHeader title={t('nav_invoices')} subtitle={t('invoices_sub')}>
        <Link to="/invoices/new" className="btn-primary"><Plus size={18} /> {t('new_invoice')}</Link>
      </PageHeader>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices yet" hint="Create your first invoice to start getting paid."
          action={<Link to="/invoices/new" className="btn-primary"><Plus size={18} /> {t('new_invoice')}</Link>} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {tabs.map(t => (
              <button key={t} onClick={() => setFilter(t)}
                className={`badge px-3 py-1.5 ${filter === t ? 'bg-moss-700 text-white' : 'bg-white text-ink/60 hover:bg-black/5'}`}>
                {tabLabel(t)}
              </button>
            ))}
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-black/[.07] px-4 py-3">
              <Search size={18} className="text-ink/40" />
              <input className="w-full bg-transparent text-sm outline-none placeholder:text-black/30" placeholder="Search invoice # or customer…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Invoice</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Due</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                    <th className="px-4 py-3 text-right font-semibold">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[.05]">
                  {filtered.map(i => {
                    const od = isOverdue(i.due_date, i.status)
                    const s = od ? { label: 'Overdue', cls: STATUS.overdue.cls } : (STATUS[i.status] || STATUS.draft)
                    return (
                      <tr key={i.id} className="cursor-pointer hover:bg-sand/40" onClick={() => navigate(`/invoices/${i.id}`)}>
                        <td className="px-4 py-3 font-semibold text-ink">{i.invoice_number}</td>
                        <td className="px-4 py-3 text-ink/70">{i.customer?.name || '—'}</td>
                        <td className="px-4 py-3 text-ink/60">{fmtDate(i.due_date)}</td>
                        <td className="px-4 py-3"><span className={`badge ${s.cls}`}>{s.label}</span></td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{money(i.total, cur)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink/70">{money(i.amount_due, cur)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
