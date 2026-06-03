import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate } from '../lib/format'
import { PageHeader, Spinner, EmptyState } from '../components/ui'

export default function Payments() {
  const { company } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const cur = company?.default_currency || 'USD'

  useEffect(() => {
    supabase.from('payments')
      .select('*, customer:customers(name), invoice:invoices(invoice_number)')
      .order('payment_date', { ascending: false })
      .then(({ data }) => setRows(data || []))
  }, [])

  const total = (rows || []).reduce((s, p) => s + Number(p.amount || 0), 0)

  return (
    <>
      <PageHeader title="Payments" subtitle="Everything you've collected." />
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" hint="Payments you record on invoices show up here." />
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-black/[.07] px-5 py-4">
            <span className="text-sm text-ink/55">{rows.length} payment{rows.length !== 1 ? 's' : ''}</span>
            <span className="font-display text-xl text-moss-700">{money(total, cur)} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Invoice</th>
                  <th className="px-5 py-3 font-semibold">Method</th>
                  <th className="px-5 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.05]">
                {rows.map(p => (
                  <tr key={p.id} className="cursor-pointer hover:bg-sand/40"
                    onClick={() => p.invoice_id && navigate(`/invoices/${p.invoice_id}`)}>
                    <td className="px-5 py-3 text-ink/70">{fmtDate(p.payment_date)}</td>
                    <td className="px-5 py-3 text-ink">{p.customer?.name || '—'}</td>
                    <td className="px-5 py-3 text-ink/60">{p.invoice?.invoice_number || '—'}</td>
                    <td className="px-5 py-3 capitalize text-ink/60">{p.method.replace('_', ' ')}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">{money(p.amount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
