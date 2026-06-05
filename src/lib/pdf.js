import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { money, fmtDate } from './format'

const INK = [17, 33, 27]
const MUTED = [110, 120, 115]
const MOSS = [47, 95, 73]

// --- CJK / Unicode font (loaded on demand, cached for the session) ---
// SimHei = full Simplified-Chinese TrueType font (jsPDF-compatible), unlike subset fonts that miss characters.
const CJK_URL = 'https://cdn.jsdelivr.net/gh/StellarCN/scp_zh@master/fonts/SimHei.ttf'
const CJK_NAME = 'SimHei'
let _cjkB64 = null
async function loadCjk() {
  if (_cjkB64) return _cjkB64
  const res = await fetch(CJK_URL)
  if (!res.ok) throw new Error('font fetch failed')
  const bytes = new Uint8Array(await res.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  _cjkB64 = btoa(binary)
  return _cjkB64
}
// returns the font family to use; embeds the CJK font only when needed
async function ensureFont(pdf, text) {
  if (!/[^\u0000-\u00FF]/.test(text || '')) return 'helvetica'
  try {
    const b64 = await loadCjk()
    pdf.addFileToVFS(CJK_NAME + '.ttf', b64)
    pdf.addFont(CJK_NAME + '.ttf', CJK_NAME, 'normal')
    pdf.addFont(CJK_NAME + '.ttf', CJK_NAME, 'bold')
    return CJK_NAME
  } catch (e) {
    return 'helvetica'
  }
}

function addressLines(o, prefix = 'billing_') {
  return [
    o?.[prefix + 'address'],
    [o?.[prefix + 'city'], o?.[prefix + 'state'], o?.[prefix + 'postal_code']].filter(Boolean).join(', '),
    o?.[prefix + 'country'],
  ].filter(Boolean)
}

// company contact block (company stores plain address/city/... not billing_*)
function companyLines(c) {
  return [
    c?.email,
    c?.phone,
    c?.address,
    [c?.city, c?.state, c?.postal_code].filter(Boolean).join(', '),
    c?.country,
  ].filter(Boolean)
}

// outer frame for a professional printed look
function drawPageBorder(pdf) {
  const w = pdf.internal.pageSize.getWidth()
  const h = pdf.internal.pageSize.getHeight()
  pdf.setDrawColor(200, 202, 198); pdf.setLineWidth(0.4)
  pdf.roundedRect(8, 8, w - 16, h - 16, 2, 2)
}

function header(pdf, company, title, accentNumber, font) {
  let textX = 14
  if (company?.logo_url) {
    try {
      const props = pdf.getImageProperties(company.logo_url)
      const w = 26, h = Math.min(26, w * props.height / props.width)
      pdf.addImage(company.logo_url, props.fileType || 'PNG', 14, 12, w, h)
      textX = 14 + w + 6
    } catch (e) { /* ignore bad logo */ }
  }
  pdf.setFont(font, 'bold'); pdf.setFontSize(20); pdf.setTextColor(...INK)
  pdf.text(company?.name || 'Company', textX, 20)
  pdf.setFont(font, 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
  let y = 26
  for (const line of companyLines(company)) {
    pdf.text(String(line), textX, y); y += 4.5
  }
  pdf.setFont(font, 'bold'); pdf.setFontSize(22); pdf.setTextColor(...MOSS)
  pdf.text(title.toUpperCase(), 196, 20, { align: 'right' })
  pdf.setFont(font, 'normal'); pdf.setFontSize(10); pdf.setTextColor(...INK)
  pdf.text(accentNumber || '', 196, 27, { align: 'right' })
  return Math.max(y, 32)
}

// kind: 'invoice' | 'estimate'  | opts: { preview: true } returns a blob URL instead of saving
export async function documentPDF({ kind, doc: d, items, customer, company, employeeName }, opts = {}) {
  const pdf = new jsPDF()
  const cur = d.currency || company?.default_currency || 'USD'
  const numberLabel = kind === 'estimate' ? d.estimate_number : d.invoice_number

  const allText = [
    company?.name, company?.email, company?.phone, ...addressLines(company),
    customer?.name, customer?.email, ...addressLines(d),
    d.notes, d.terms, company?.payment_instructions,
    ...(items || []).flatMap(it => [it.description, it.detail]),
  ].filter(Boolean).join(' ')
  const font = await ensureFont(pdf, allText)

  let y = header(pdf, company, kind, numberLabel, font)

  // meta (dates)
  pdf.setFont(font, 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
  const dateLabel = kind === 'estimate' ? 'Expiry' : 'Due'
  pdf.text(`Date: ${fmtDate(d.issue_date)}`, 196, 33, { align: 'right' })
  pdf.text(`${dateLabel}: ${fmtDate(d.expiry_date || d.due_date)}`, 196, 37.5, { align: 'right' })
  if (employeeName) pdf.text(`By: ${employeeName}`, 196, 42, { align: 'right' })

  // bill to
  y += 8
  pdf.setFont(font, 'bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
  pdf.text('BILL TO', 14, y)
  pdf.setFont(font, 'bold'); pdf.setFontSize(11); pdf.setTextColor(...INK)
  pdf.text(customer?.name || '', 14, y + 6)
  pdf.setFont(font, 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
  let yy = y + 11
  for (const line of [customer?.email, ...addressLines(d)].filter(Boolean)) { pdf.text(String(line), 14, yy); yy += 4.5 }

  // ship to (only if a delivery address exists and differs from billing)
  const shipLines = addressLines(d, 'delivery_')
  const billLines = addressLines(d, 'billing_')
  if (shipLines.length > 0 && shipLines.join('|') !== billLines.join('|')) {
    const sx = 110
    pdf.setFont(font, 'bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
    pdf.text('SHIP TO', sx, y)
    pdf.setFont(font, 'bold'); pdf.setFontSize(11); pdf.setTextColor(...INK)
    pdf.text(customer?.name || '', sx, y + 6)
    pdf.setFont(font, 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
    let sy = y + 11
    for (const line of shipLines) { pdf.text(String(line), sx, sy); sy += 4.5 }
    yy = Math.max(yy, sy)
  }

  // items
  autoTable(pdf, {
    startY: Math.max(yy + 4, y + 20),
    head: [['Product / Description', 'Qty', 'Unit price', 'Amount']],
    body: (items || []).map(it => [
      it.detail ? `${it.description}\n${it.detail}` : it.description,
      String(Number(it.quantity)),
      money(it.unit_price, cur),
      money(it.line_total, cur),
    ]),
    theme: 'grid',
    styles: { font, lineColor: [220, 222, 218], lineWidth: 0.1 },
    headStyles: { fillColor: MOSS, textColor: 255, fontSize: 9, font, lineColor: [220, 222, 218], lineWidth: 0.1 },
    bodyStyles: { fontSize: 9, textColor: INK, font },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })

  // totals — anchored toward the bottom-right so the layout stays consistent even with one line item
  const tableEnd = pdf.lastAutoTable.finalY
  const totalRowCount = 3 + (kind === 'invoice' ? 2 : 0)
  const totalsHeight = totalRowCount * 6 + 6
  const pageH = pdf.internal.pageSize.getHeight()
  let ty = Math.max(tableEnd + 12, pageH - 60, 230)
  if (ty + totalsHeight > pageH - 16) ty = tableEnd + 12 // very long invoice: fall back to right after the table
  const right = 196, labelX = 150
  const tTop = ty
  const row = (label, val, bold) => {
    pdf.setFont(font, bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 11 : 9)
    pdf.setTextColor(...INK)
    pdf.text(label, labelX, ty); pdf.text(val, right, ty, { align: 'right' }); ty += bold ? 7 : 5.5
  }
  row('Subtotal', money(d.subtotal, cur))
  row('Tax', money(d.tax_total, cur))
  // divider before the grand total
  pdf.setDrawColor(200, 202, 198); pdf.setLineWidth(0.2); pdf.line(labelX - 4, ty - 4, right, ty - 4)
  row('Total', money(d.total, cur), true)
  if (kind === 'invoice') {
    row('Paid', money(d.amount_paid, cur))
    row('Amount due', money(d.amount_due, cur), true)
  }
  // light box around the totals block
  pdf.setDrawColor(210, 212, 208); pdf.setLineWidth(0.3)
  pdf.roundedRect(labelX - 8, tTop - 6, right - (labelX - 8) + 2, (ty - tTop) + 6, 1.5, 1.5)

  // notes / terms / payment instructions — start just under the table (left side, independent of totals)
  let ny = tableEnd + 12
  if (d.notes || d.terms) {
    pdf.setFont(font, 'bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
    if (d.notes) { pdf.text('Notes', 14, ny); pdf.setFont(font, 'normal'); pdf.setTextColor(...INK); pdf.text(pdf.splitTextToSize(d.notes, 120), 14, ny + 5); ny += 5 + pdf.splitTextToSize(d.notes, 120).length * 4.5 }
    if (d.terms) { pdf.setFont(font, 'bold'); pdf.setTextColor(...MUTED); pdf.text('Terms', 14, ny + 4); pdf.setFont(font, 'normal'); pdf.setTextColor(...INK); pdf.text(pdf.splitTextToSize(d.terms, 120), 14, ny + 9); ny += 9 + pdf.splitTextToSize(d.terms, 120).length * 4.5 }
  }
  ty = Math.max(ty, ny)
  if (kind === 'invoice' && company?.payment_instructions) {
    ty += 8; pdf.setFont(font, 'bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
    pdf.text('Payment instructions', 14, ty)
    pdf.setFont(font, 'normal'); pdf.setTextColor(...INK)
    pdf.text(pdf.splitTextToSize(company.payment_instructions, 120), 14, ty + 5)
  }

  drawPageBorder(pdf)
  if (opts.preview) return { url: pdf.output('bloburl'), filename: `${kind}-${numberLabel}.pdf` }
  pdf.save(`${kind}-${numberLabel}.pdf`)
}

export async function packingSlipPDF({ doc: d, items, customer, company }, opts = {}) {
  const pdf = new jsPDF()
  const numberLabel = d.invoice_number || d.estimate_number

  const allText = [
    company?.name, company?.email, company?.phone, ...addressLines(company),
    customer?.name, ...addressLines(d, 'delivery_'), ...addressLines(d, 'billing_'),
    ...(items || []).flatMap(it => [it.description, it.detail]),
  ].filter(Boolean).join(' ')
  const font = await ensureFont(pdf, allText)

  let y = header(pdf, company, 'Packing Slip', numberLabel, font)
  pdf.setFont(font, 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
  pdf.text(`Date: ${fmtDate(d.issue_date)}`, 196, 33, { align: 'right' })

  // ship to (delivery address, fallback to billing)
  const hasDelivery = d.delivery_address || d.delivery_city
  y += 8
  pdf.setFont(font, 'bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
  pdf.text('SHIP TO', 14, y)
  pdf.setFont(font, 'bold'); pdf.setFontSize(11); pdf.setTextColor(...INK)
  pdf.text(customer?.name || '', 14, y + 6)
  pdf.setFont(font, 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
  let yy = y + 11
  const lines = hasDelivery ? addressLines(d, 'delivery_') : addressLines(d, 'billing_')
  for (const line of lines) { pdf.text(String(line), 14, yy); yy += 4.5 }

  // items: description + quantity only (no prices on a packing slip)
  autoTable(pdf, {
    startY: Math.max(yy + 4, y + 20),
    head: [['Description', 'Qty packed']],
    body: (items || []).map(it => [it.detail ? `${it.description}\n${it.detail}` : it.description, String(Number(it.quantity))]),
    theme: 'grid',
    styles: { font, lineColor: [220, 222, 218], lineWidth: 0.1 },
    headStyles: { fillColor: INK, textColor: 255, fontSize: 9, font, lineColor: [220, 222, 218], lineWidth: 0.1 },
    bodyStyles: { fontSize: 9, textColor: INK, font },
    columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
    margin: { left: 14, right: 14 },
  })

  let ty = pdf.lastAutoTable.finalY + 14
  pdf.setFont(font, 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
  pdf.text('Received in good condition:', 14, ty)
  pdf.line(60, ty, 130, ty)
  drawPageBorder(pdf)
  if (opts.preview) return { url: pdf.output('bloburl'), filename: `packing-slip-${numberLabel}.pdf` }
  pdf.save(`packing-slip-${numberLabel}.pdf`)
}
