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

// ---- Vendor / payables side ----
export async function recalcVendorBill(billId) {
  const { data: bill } = await supabase.from('vendor_bills')
    .select('total, status').eq('id', billId).maybeSingle()
  if (!bill) return
  const { data: pays } = await supabase.from('vendor_payments')
    .select('amount').eq('bill_id', billId)
  const paid = (pays || []).reduce((s, p) => s + Number(p.amount || 0), 0)
  const due = Math.round((Number(bill.total || 0) - paid) * 100) / 100
  let status = bill.status
  if (bill.status !== 'cancelled') {
    if (paid <= 0) status = 'unpaid'
    else if (due > 0.005) status = 'partial'
    else status = 'paid'
  }
  await supabase.from('vendor_bills').update({
    amount_paid: Math.round(paid * 100) / 100,
    amount_due: due < 0 ? 0 : due,
    status,
  }).eq('id', billId)
}

export async function recalcVendor(vendorId) {
  if (!vendorId) return
  const { data: bills } = await supabase.from('vendor_bills')
    .select('total, amount_paid, status').eq('vendor_id', vendorId)
  let billed = 0, paid = 0
  for (const b of (bills || [])) {
    if (b.status === 'cancelled') continue
    billed += Number(b.total || 0)
    paid += Number(b.amount_paid || 0)
  }
  const r = (n) => Math.round(n * 100) / 100
  await supabase.from('vendors').update({
    total_billed: r(billed),
    total_paid: r(paid),
    balance: r(billed - paid),
  }).eq('id', vendorId)
}

// Adjust a customer's store-credit balance by delta (never below 0).
export async function addCustomerCredit(customerId, delta) {
  if (!customerId) return
  const { data: c } = await supabase.from('customers').select('credit_balance').eq('id', customerId).maybeSingle()
  if (!c) return
  let nb = Math.round((Number(c.credit_balance || 0) + Number(delta)) * 100) / 100
  if (nb < 0) nb = 0
  await supabase.from('customers').update({ credit_balance: nb }).eq('id', customerId)
  return nb
}

// Apply store credit across invoices (in the given order). Returns the amount used.
// invoices: [{ id, amount_due }]
export async function applyStoreCredit(companyId, customerId, available, invoices) {
  const today = new Date().toISOString().slice(0, 10)
  let remaining = Math.round(Number(available || 0) * 100) / 100
  let used = 0
  for (const inv of (invoices || [])) {
    if (remaining <= 0) break
    const due = Math.round(Number(inv.amount_due || 0) * 100) / 100
    if (due <= 0) continue
    const part = Math.min(remaining, due)
    await supabase.from('payments').insert({
      company_id: companyId, invoice_id: inv.id, customer_id: customerId,
      amount: part, method: 'credit', payment_date: today, notes: 'Store credit applied',
    })
    await recalcInvoice(inv.id)
    remaining = Math.round((remaining - part) * 100) / 100
    used = Math.round((used + part) * 100) / 100
  }
  if (used > 0) { await addCustomerCredit(customerId, -used); await recalcCustomer(customerId) }
  return used
}
