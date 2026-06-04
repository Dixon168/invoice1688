import { supabase } from './supabase'

const round = (n) => Math.round(n * 1000) / 1000

// Reverse any stock movements previously recorded for this invoice.
export async function reverseInvoiceInventory(invoiceId) {
  const { data: moves } = await supabase.from('inventory_movements')
    .select('product_id, change').eq('ref_type', 'invoice').eq('ref_id', invoiceId)
  if (!moves || moves.length === 0) return
  const byProduct = {}
  for (const m of moves) byProduct[m.product_id] = (byProduct[m.product_id] || 0) + Number(m.change)
  for (const pid of Object.keys(byProduct)) {
    const { data: p } = await supabase.from('products').select('stock_quantity').eq('id', pid).maybeSingle()
    if (p) await supabase.from('products').update({ stock_quantity: round(Number(p.stock_quantity) - byProduct[pid]) }).eq('id', pid)
  }
  await supabase.from('inventory_movements').delete().eq('ref_type', 'invoice').eq('ref_id', invoiceId)
}

// Deduct stock for an invoice's line items (tracked products only). Safe to re-run (reverses first).
export async function applyInvoiceInventory(companyId, invoiceId, items) {
  await reverseInvoiceInventory(invoiceId)
  const byProduct = {}
  for (const it of (items || [])) {
    if (!it.product_id) continue
    byProduct[it.product_id] = (byProduct[it.product_id] || 0) + (Number(it.quantity) || 0)
  }
  const pids = Object.keys(byProduct)
  if (pids.length === 0) return
  const { data: prods } = await supabase.from('products')
    .select('id, stock_quantity, track_inventory').in('id', pids)
  const movements = []
  for (const p of (prods || [])) {
    if (!p.track_inventory) continue
    const qty = byProduct[p.id]
    await supabase.from('products').update({ stock_quantity: round(Number(p.stock_quantity) - qty) }).eq('id', p.id)
    movements.push({ company_id: companyId, product_id: p.id, change: -qty, reason: 'invoice', ref_type: 'invoice', ref_id: invoiceId })
  }
  if (movements.length) await supabase.from('inventory_movements').insert(movements)
}

// Manual stock change (restock / correction). delta can be + or -.
export async function adjustStock(companyId, productId, delta, note) {
  const { data: p } = await supabase.from('products').select('stock_quantity').eq('id', productId).maybeSingle()
  if (!p) return
  await supabase.from('products').update({ stock_quantity: round(Number(p.stock_quantity) + Number(delta)) }).eq('id', productId)
  await supabase.from('inventory_movements').insert({
    company_id: companyId, product_id: productId, change: Number(delta),
    reason: 'adjustment', ref_type: 'manual', note: note || null,
  })
}
