import { useEffect, useMemo, useState } from 'react'
import { Wallet, Banknote, CreditCard, Building2, FileCheck, Coins } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { money, todayISO } from '../lib/format'
import { useT } from '../i18n'

const METHOD_META = {
  cash: { key: 'pm_cash', label: 'Cash', icon: Banknote },
  card: { key: 'pm_card', label: 'Card', icon: CreditCard },
  bank_transfer: { key: 'pm_bank', label: 'Bank transfer', icon: Building2 },
  check: { key: 'pm_check', label: 'Check', icon: FileCheck },
  credit: { key: 'pm_credit', label: 'Store credit', icon: Coins },
  other: { key: 'pm_other', label: 'Other', icon: Wallet },
}

function firstOfMonth() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

export default function PaymentsReport({ currency }) {
  const { t } = useT()
  const cur = currency || 'USD'
  const [preset, setPreset] = useState('today')
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [rows, setRows] = useState(null)

  const applyPreset = (p) => {
    setPreset(p)
    const today = todayISO()
    if (p === 'today') { setFrom(today); setTo(today) }
    else if (p === '7d') { setFrom(daysAgo(6)); setTo(today) }
    else if (p === 'month') { setFrom(firstOfMonth()); setTo(today) }
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      setRows(null)
      const { data } = await supabase.from('payments').select('amount, method, payment_date')
        .is('voided_at', null)
        .gte('payment_date', from).lte('payment_date', to)
      if (alive) setRows(data || [])
    })()
    return () => { alive = false }
  }, [from, to])

  const report = useMemo(() => {
    const list = rows || []
    const byMethod = {}
    let total = 0
    for (const p of list) {
      const amt = Number(p.amount) || 0
      total += amt
      const m = p.method || 'other'
      if (!byMethod[m]) byMethod[m] = { amount: 0, count: 0 }
      byMethod[m].amount += amt; byMethod[m].count += 1
    }
    const methods = Object.entries(byMethod).map(([m, v]) => ({ method: m, ...v })).sort((a, b) => b.amount - a.amount)
    return { total, count: list.length, methods }
  }, [rows])

  const label = (m) => t(METHOD_META[m]?.key) || METHOD_META[m]?.label || m

  return (
    <div className="card mt-6 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="font-display text-lg text-ink">{t('rep_title') || 'Payments collected'}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[['today', t('rep_today') || 'Today'], ['7d', t('rep_7d') || 'Last 7 days'], ['month', t('rep_month') || 'This month']].map(([p, lbl]) => (
            <button key={p} onClick={() => applyPreset(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${preset === p ? 'bg-moss-600 text-white' : 'bg-black/5 text-ink/60 hover:bg-black/10'}`}>{lbl}</button>
          ))}
          <div className="flex items-center gap-1 pl-1">
            <input type="date" className="input py-1 text-xs" value={from} max={to} onChange={e => { setPreset('custom'); setFrom(e.target.value) }} />
            <span className="text-ink/40">–</span>
            <input type="date" className="input py-1 text-xs" value={to} min={from} onChange={e => { setPreset('custom'); setTo(e.target.value) }} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-moss-600/20 bg-moss-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-moss-700">{t('rep_total') || 'Total collected'}</div>
          <div className="mt-1 font-display text-3xl text-moss-800 tabular-nums">{rows === null ? '…' : money(report.total, cur)}</div>
          <div className="mt-0.5 text-xs text-ink/45">{rows === null ? '' : `${report.count} ${t('rep_payments') || 'payments'}`}</div>
        </div>

        <div className="sm:col-span-2">
          {rows === null ? (
            <div className="flex h-full items-center justify-center text-sm text-ink/40">…</div>
          ) : report.methods.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-ink/45">{t('rep_none') || 'No payments in this range.'}</div>
          ) : (
            <div className="divide-y divide-black/[.06]">
              {report.methods.map(m => {
                const Icon = METHOD_META[m.method]?.icon || Wallet
                const pct = report.total > 0 ? Math.round((m.amount / report.total) * 100) : 0
                return (
                  <div key={m.method} className="flex items-center gap-3 py-2">
                    <span className="rounded-lg bg-black/5 p-1.5 text-ink/60"><Icon size={16} /></span>
                    <span className="w-32 text-sm capitalize text-ink/70">{label(m.method)}</span>
                    <div className="flex-1"><div className="h-1.5 rounded-full bg-black/5"><div className="h-1.5 rounded-full bg-moss-500" style={{ width: `${pct}%` }} /></div></div>
                    <span className="w-10 text-right text-xs text-ink/45">{pct}%</span>
                    <span className="w-14 text-right text-xs text-ink/45">{m.count}×</span>
                    <span className="w-24 text-right font-medium tabular-nums text-ink">{money(m.amount, cur)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
