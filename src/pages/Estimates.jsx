import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate } from '../lib/format'
import { PageHeader, Spinner, EmptyState } from '../components/ui'

export const EST_STATUS = {
  draft:     { label: 'Draft',     cls: 'bg-black/8 text-ink/70' },
  sent:      { label: 'Sent',      cls: 'bg-blue-100 text-blue-700' },
  accepted:  { label: 'Accepted',  cls: 'bg-moss-100 text-moss-700' },
  declined:  { label: 'Declined',  cls: 'bg-red-100 text-red-700' },
  expired:   { label: 'Expired',   cls: 'bg-amber-100 text-amber-700' },
  converted: { label: 'Converted', cls: 'bg-moss-100 text-moss-700' },
}

export default function Estimates() {
  const { company } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const cur = company?.default_currency || 'USD'

  useEffect(() => {
    supabase.from('estimates').select('*, customer:customers(name)').order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []))
  }, [])

  const tabs = ['all', 'draft', 'sent', 'accepted', 'declined', 'converted']
  const filtered = (rows || [])
    .filter(e => filter === 'all' ? true : e.status === filter)
    .filter(e => [e.estimate_number, e.customer?.name].join(' ').toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <PageHeader title="Estimates" subtitle="Quotes you send before invoicing.">
        <Link to="/estimates/new" className="btn-primary"><Plus size={18} /> New estimate</Link>
      </PageHeader>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No estimates yet" hint="Send a quote, then convert it to an invoice when accepted."
          action={<Link to="/estimates/new" className="btn-primary"><Plus size={18} /> New estimate</Link>} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {tabs.map(t => (
              <button key={t} onClick={() => setFilter(t)} className={`badge px-3 py-1.5 ${filter === t ? 'bg-moss-700 text-white' : 'bg-white text-ink/60 hover:bg-black/5'}`}>
                {t === 'all' ? 'All' : EST_STATUS[t]?.label}
              </button>
            ))}
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-black/[.07] px-4 py-3">
              <Search size={18} className="text-ink/40" />
              <input className="w-full bg-transparent text-sm outline-none placeholder:text-black/30" placeholder="Search estimate # or customer…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Estimate</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Expiry</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[.05]">
                  {filtered.map(e => {
                    const s = EST_STATUS[e.status] || EST_STATUS.draft
                    return (
                      <tr key={e.id} className="cursor-pointer hover:bg-sand/40" onClick={() => navigate(`/estimates/${e.id}`)}>
                        <td className="px-4 py-3 font-semibold text-ink">{e.estimate_number}</td>
                        <td className="px-4 py-3 text-ink/70">{e.customer?.name || '—'}</td>
                        <td className="px-4 py-3 text-ink/60">{fmtDate(e.expiry_date)}</td>
                        <td className="px-4 py-3"><span className={`badge ${s.cls}`}>{s.label}</span></td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{money(e.total, cur)}</td>
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
