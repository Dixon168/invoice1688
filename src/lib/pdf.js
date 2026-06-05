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
  for (const line of [company?.email, company?.phone, ...addressLines(company)].filter(Boolean)) {
    pdf.text(String(line), textX, y); y += 4.5
  }
  pdf.setFont(font, 'bold'); pdf.setFontSize(22); pdf.setTextColor(...MOSS)
  pdf.text(title.toUpperCase(), 196, 20, { align: 'right' })
  pdf.setFont(font, 'normal'); pdf.setFontSize(10); pdf.setTextColor(...INK)
  pdf.text(accentNumber || '', 196, 27, { align: 'right' })
  return Math.max(y, 32)
}

// kind: 'invoice' | 'estimate'  | opts: { preview: true } returns a blob URL instead of saving
export async function documentPDF({ kind, doc: d, items, customer, company }, opts = {}) {
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

  // bill to
  y += 8
  pdf.setFont(font, 'bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
  pdf.text('BILL TO', 14, y)
  pdf.setFont(font, 'bold'); pdf.setFontSize(11); pdf.setTextColor(...INK)
  pdf.text(customer?.name || '', 14, y + 6)
  pdf.setFont(font, 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
  let yy = y + 11
  for (const line of [customer?.email, ...addressLines(d)].filter(Boolean)) { pdf.text(String(line), 14, yy); yy += 4.5 }

  // items
  autoTable(pdf, {
    startY: Math.max(yy + 4, y + 20),
    head: [['Description', 'Qty', 'Unit price', 'Tax', 'Amount']],
    body: (items || []).map(it => [
      it.detail ? `${it.description}\n${it.detail}` : it.description,
      String(Number(it.quantity)),
      money(it.unit_price, cur),
      `${Number(it.tax_rate)}%`,
      money(it.line_total, cur),
    ]),
    theme: 'striped',
    styles: { font },
    headStyles: { fillColor: MOSS, textColor: 255, fontSize: 9, font },
    bodyStyles: { fontSize: 9, textColor: INK, font },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })

  // totals
  let ty = pdf.lastAutoTable.finalY + 8
  const right = 196, labelX = 150
  const row = (label, val, bold) => {
    pdf.setFont(font, bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 11 : 9)
    pdf.setTextColor(...INK)
    pdf.text(label, labelX, ty); pdf.text(val, right, ty, { align: 'right' }); ty += bold ? 7 : 5.5
  }
  row('Subtotal', money(d.subtotal, cur))
  row('Tax', money(d.tax_total, cur))
  row('Total', money(d.total, cur), true)
  if (kind === 'invoice') {
    row('Paid', money(d.amount_paid, cur))
    row('Amount due', money(d.amount_due, cur), true)
  }

  // notes / terms / payment instructions
  if (d.notes || d.terms) {
    ty += 6; pdf.setFont(font, 'bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
    if (d.notes) { pdf.text('Notes', 14, ty); pdf.setFont(font, 'normal'); pdf.setTextColor(...INK); pdf.text(pdf.splitTextToSize(d.notes, 120), 14, ty + 5); ty += 5 + pdf.splitTextToSize(d.notes, 120).length * 4.5 }
    if (d.terms) { pdf.setFont(font, 'bold'); pdf.setTextColor(...MUTED); pdf.text('Terms', 14, ty + 4); pdf.setFont(font, 'normal'); pdf.setTextColor(...INK); pdf.text(pdf.splitTextToSize(d.terms, 120), 14, ty + 9); ty += 9 + pdf.splitTextToSize(d.terms, 120).length * 4.5 }
  }
  if (kind === 'invoice' && company?.payment_instructions) {
    ty += 8; pdf.setFont(font, 'bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
    pdf.text('Payment instructions', 14, ty)
    pdf.setFont(font, 'normal'); pdf.setTextColor(...INK)
    pdf.text(pdf.splitTextToSize(company.payment_instructions, 120), 14, ty + 5)
  }

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
    theme: 'striped',
    styles: { font },
    headStyles: { fillColor: INK, textColor: 255, fontSize: 9, font },
    bodyStyles: { fontSize: 9, textColor: INK, font },
    columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
    margin: { left: 14, right: 14 },
  })

  let ty = pdf.lastAutoTable.finalY + 14
  pdf.setFont(font, 'normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
  pdf.text('Received in good condition:', 14, ty)
  pdf.line(60, ty, 130, ty)
  if (opts.preview) return { url: pdf.output('bloburl'), filename: `packing-slip-${numberLabel}.pdf` }
  pdf.save(`packing-slip-${numberLabel}.pdf`)
}
