import { supabase } from './supabase'

// Compute totals from line items. Each item: { quantity, unit_price, tax_rate }
export function computeTotals(items, isExempt = false) {
  let subtotal = 0, taxTotal = 0
  for (const it of items) {
    const line = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
    subtotal += line
    if (!isExempt) taxTotal += line * ((Number(it.tax_rate) || 0) / 100)
  }
  const round = (n) => Math.round(n * 100) / 100
  subtotal = round(subtotal); taxTotal = round(taxTotal)
  return { subtotal, taxTotal, total: round(subtotal + taxTotal) }
}

// Re-sum payments for an invoice and update amount_paid / amount_due / status.
export async function recalcInvoice(invoiceId) {
  const { data: inv } = await supabase.from('invoices')
    .select('total, status').eq('id', invoiceId).maybeSingle()
  if (!inv) return
  const { data: pays } = await supabase.from('payments')
    .select('amount').eq('invoice_id', invoiceId)
  const paid = (pays || []).reduce((s, p) => s + Number(p.amount || 0), 0)
  const total = Number(inv.total || 0)
  const due = Math.round((total - paid) * 100) / 100

  let status = inv.status
  if (inv.status !== 'cancelled') {
    if (paid <= 0) status = inv.status === 'draft' ? 'draft' : 'sent'
    else if (due > 0.005) status = 'partial'
    else status = 'paid'
  }
  await supabase.from('invoices').update({
    amount_paid: Math.round(paid * 100) / 100,
    amount_due: due < 0 ? 0 : due,
    status,
    paid_at: status === 'paid' ? new Date().toISOString() : null,
  }).eq('id', invoiceId)
}

// Recompute a customer's totals/balance from their invoices + payments.
export async function recalcCustomer(customerId) {
  if (!customerId) return
  const { data: invs } = await supabase.from('invoices')
    .select('total, amount_paid, status').eq('customer_id', customerId)
  let invoiced = 0, paid = 0
  for (const i of (invs || [])) {
    if (i.status === 'cancelled') continue
    invoiced += Number(i.total || 0)
    paid += Number(i.amount_paid || 0)
  }
  const r = (n) => Math.round(n * 100) / 100
  await supabase.from('customers').update({
    total_invoiced: r(invoiced),
    total_paid: r(paid),
    balance: r(invoiced - paid),
  }).eq('id', customerId)
}
