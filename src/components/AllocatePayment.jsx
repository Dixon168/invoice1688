import { useEffect, useState } from 'react'
import { money, todayISO } from '../lib/format'
import { Modal, Field } from './ui'

// items: [{ id, label, sub, due }]  (due = outstanding amount, caps the input)
// onSubmit(rows, meta) where rows=[{id, amount}], meta={payment_date, method, reference}
export default function AllocatePayment({ open, onClose, title, items, currency = 'USD', methods, defaultMethod, onSubmit }) {
  const [meta, setMeta] = useState({ payment_date: todayISO(), method: defaultMethod, reference: '' })
  const [alloc, setAlloc] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setMeta({ payment_date: todayISO(), method: defaultMethod, reference: '' }); setAlloc({}) }
  }, [open, defaultMethod])

  const clamped = (it) => {
    const n = Number(alloc[it.id])
    if (!n || n < 0) return 0
    return Math.min(n, Number(it.due))
  }
  const total = items.reduce((s, it) => s + clamped(it), 0)
  const payAll = () => { const a = {}; items.forEach(it => { a[it.id] = String(it.due) }); setAlloc(a) }

  const submit = async () => {
    const rows = items.map(it => ({ id: it.id, amount: clamped(it) })).filter(r => r.amount > 0)
    if (rows.length === 0) return
    setBusy(true); await onSubmit(rows, meta); setBusy(false)
  }

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Date"><input className="input" type="date" value={meta.payment_date} onChange={e => setMeta({ ...meta, payment_date: e.target.value })} /></Field>
        <Field label="Method">
          <select className="input" value={meta.method} onChange={e => setMeta({ ...meta, method: e.target.value })}>
            {methods.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        </Field>
        <Field label="Reference"><input className="input" value={meta.reference} onChange={e => setMeta({ ...meta, reference: e.target.value })} placeholder="Optional" /></Field>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="label !mb-0">Apply to</div>
        <button className="btn-outline text-xs" onClick={payAll}>Pay all in full</button>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink/50">Nothing outstanding.</p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-lg border border-black/[.07]">
          <table className="w-full text-sm">
            <thead className="bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
              <tr><th className="px-3 py-2 font-semibold">Item</th><th className="px-3 py-2 text-right font-semibold">Outstanding</th><th className="w-32 px-3 py-2 text-right font-semibold">Apply</th></tr>
            </thead>
            <tbody className="divide-y divide-black/[.05]">
              {items.map(it => (
                <tr key={it.id}>
                  <td className="px-3 py-2"><div className="font-medium text-ink">{it.label}</div>{it.sub && <div className="text-xs text-ink/45">{it.sub}</div>}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink/70">{money(it.due, currency)}</td>
                  <td className="px-3 py-2">
                    <input className="input py-1.5 text-right" type="number" step="0.01" min="0" max={it.due}
                      value={alloc[it.id] ?? ''} placeholder="0"
                      onChange={e => setAlloc({ ...alloc, [it.id]: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-black/10 pt-3">
        <span className="text-sm text-ink/60">Total payment</span>
        <span className="font-display text-2xl text-ink tabular-nums">{money(total, currency)}</span>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy || total <= 0}>{busy ? 'Saving…' : `Record ${money(total, currency)}`}</button>
      </div>
    </Modal>
  )
}
