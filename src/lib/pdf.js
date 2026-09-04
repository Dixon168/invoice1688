import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { money, fmtDate, fmtDateTime, ctnLabel } from './format'

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
export async function documentPDF({ kind, doc: d, items, customer, company, employeeName, payments }, opts = {}) {
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
    body: (items || []).map(it => {
      const name = it.product_name || it.description || ''
      const extra = (it.product_name && it.description && it.description !== it.product_name) ? it.description : ''
      const sub = [extra, it.detail].filter(Boolean).join('\n')
      return [sub ? `${name}\n${sub}` : name, it.units_per_ctn ? `${Number(it.quantity)} (${ctnLabel(it.quantity, it.units_per_ctn)})` : String(Number(it.quantity)), money(it.unit_price, cur), money(it.line_total, cur)]
    }),
    theme: 'grid',
    styles: { font, lineColor: [220, 222, 218], lineWidth: 0.1 },
    headStyles: { fillColor: MOSS, textColor: 255, fontSize: 9, font, lineColor: [220, 222, 218], lineWidth: 0.1 },
    bodyStyles: { fontSize: 9, textColor: INK, font },
    columnStyles: { 1: { halign: 'right', cellWidth: 32 }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })

  // ---- bottom row: payments table on the LEFT, totals box on the RIGHT ----
  const tableEnd = pdf.lastAutoTable.finalY
  const pageH = pdf.internal.pageSize.getHeight()

  const livePayments = (payments || []).filter(p => !p.voided_at)
  const hasPay = kind === 'invoice' && livePayments.length > 0
  const payRows = hasPay ? [...livePayments].sort((a, b) => String(a.paid_at || a.payment_date).localeCompare(String(b.paid_at || b.payment_date))) : []
  const payHeight = hasPay ? (payRows.length + 2) * 6 + 12 : 0
  const totalsRowCount = 3 + (kind === 'invoice' ? 2 : 0)
  const totalsHeight = totalsRowCount * 6 + 10

  // notes/terms sit just under the items table (left), above the bottom row
  let ny = tableEnd + 10
  if (d.notes || d.terms) {
    pdf.setFont(font, 'bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTED)
    if (d.notes) { pdf.text('Notes', 14, ny); pdf.setFont(font, 'normal'); pdf.setTextColor(...INK); pdf.text(pdf.splitTextToSize(d.notes, 118), 14, ny + 5); ny += 5 + pdf.splitTextToSize(d.notes, 118).length * 4.5 }
    if (d.terms) { pdf.setFont(font, 'bold'); pdf.setTextColor(...MUTED); pdf.text('Terms', 14, ny + 3); pdf.setFont(font, 'normal'); pdf.setTextColor(...INK); pdf.text(pdf.splitTextToSize(d.terms, 118), 14, ny + 8); ny += 8 + pdf.splitTextToSize(d.terms, 118).length * 4.5 }
    ny += 6
  }

  const bottomRowH = Math.max(payHeight, totalsHeight)
  let rowY = Math.max(ny, pageH - 16 - bottomRowH)   // anchor toward the bottom for a professional look
  if (rowY < ny) rowY = ny

  // LEFT: payments table
  if (hasPay) {
    pdf.setFont(font, 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(...MUTED)
    pdf.text('Payments received', 14, rowY)
    autoTable(pdf, {
      startY: rowY + 2,
      head: [['Date / time', 'Method', 'Amount', 'Balance']],
      body: (() => {
        let run = 0
        return payRows.map(p => {
          run += Number(p.amount) || 0
          const bal = Math.max(0, Math.round((Number(d.total) - run) * 100) / 100)
          const meth = String(p.method || '').replace('_', ' ')
          const noteTxt = [p.note, p.reference].filter(Boolean).join(' \u00b7 ')
          return [p.paid_at ? fmtDateTime(p.paid_at) : fmtDate(p.payment_date), noteTxt ? `${meth} \u00b7 ${noteTxt}` : meth, money(p.amount, cur), money(bal, cur)]
        })
      })(),
      foot: [['', 'Paid', '', money(d.amount_paid, cur)], ['', 'Amount due', '', money(d.amount_due, cur)]],
      theme: 'grid',
      styles: { font, fontSize: 7.5, lineColor: [220, 222, 218], lineWidth: 0.1, cellPadding: 1.5 },
      headStyles: { fillColor: [240, 240, 236], textColor: INK, fontSize: 7.5, font, lineColor: [220, 222, 218], lineWidth: 0.1 },
      footStyles: { fillColor: [248, 248, 245], textColor: INK, fontStyle: 'bold', font, halign: 'right', fontSize: 7.5 },
      columnStyles: { 0: { cellWidth: 34 }, 2: { halign: 'right', cellWidth: 22 }, 3: { halign: 'right', cellWidth: 24 } },
      margin: { left: 14 },
      tableWidth: 128,
    })
  }

  // RIGHT: totals box (bottom-right)
  let ty = rowY
  const right = 196, labelX = 150
  const tTop = ty
  const row = (label, val, bold) => {
    pdf.setFont(font, bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 11 : 9)
    pdf.setTextColor(...INK)
    pdf.text(label, labelX, ty); pdf.text(val, right, ty, { align: 'right' }); ty += bold ? 7 : 5.5
  }
  row('Subtotal', money(d.subtotal, cur))
  row('Tax', money(d.tax_total, cur))
  pdf.setDrawColor(200, 202, 198); pdf.setLineWidth(0.2); pdf.line(labelX - 4, ty - 4, right, ty - 4)
  row('Total', money(d.total, cur), true)
  if (kind === 'invoice') {
    row('Paid', money(d.amount_paid, cur))
    row('Amount due', money(d.amount_due, cur), true)
  }
  pdf.setDrawColor(210, 212, 208); pdf.setLineWidth(0.3)
  pdf.roundedRect(labelX - 8, tTop - 6, right - (labelX - 8) + 2, (ty - tTop) + 6, 1.5, 1.5)

  if (kind === 'invoice' && company?.payment_instructions) {
    const piY = Math.max(ty, pdf.lastAutoTable ? pdf.lastAutoTable.finalY : ty) + 8
    pdf.setFont(font, 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(...MUTED)
    pdf.text('Payment instructions', 14, piY)
    pdf.setFont(font, 'normal'); pdf.setTextColor(...INK); pdf.setFontSize(9)
    pdf.text(pdf.splitTextToSize(company.payment_instructions, 118), 14, piY + 5)
  }

  drawPageBorder(pdf)

  if (kind === 'invoice' && d.status === 'cancelled') {
    pdf.saveGraphicsState && pdf.saveGraphicsState()
    try { pdf.setGState(new pdf.GState({ opacity: 0.18 })) } catch (e) {}
    pdf.setFont(font, 'bold'); pdf.setFontSize(90); pdf.setTextColor(194, 96, 59)
    pdf.text('VOID', 105, 160, { align: 'center', angle: 30 })
    try { pdf.setGState(new pdf.GState({ opacity: 1 })) } catch (e) {}
    pdf.restoreGraphicsState && pdf.restoreGraphicsState()
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
    body: (items || []).map(it => {
      const name = it.product_name || it.description || ''
      const extra = (it.product_name && it.description && it.description !== it.product_name) ? it.description : ''
      const sub = [extra, it.detail].filter(Boolean).join('\n')
      return [sub ? `${name}\n${sub}` : name, it.units_per_ctn ? `${Number(it.quantity)} (${ctnLabel(it.quantity, it.units_per_ctn)})` : String(Number(it.quantity))]
    }),
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

// Vendor / receiving bill PDF (purchase side), styled like an invoice with boxed sections.
export async function vendorBillPDF({ bill, vendor, company, products, payments }, opts = {}) {
  const pdf = new jsPDF()
  const cur = bill.currency || company?.default_currency || 'USD'
  const numberLabel = bill.bill_number || 'Bill'

  // product name -> units per box (to show CTN even on older bills)
  const upcByName = {}
  for (const p of (products || [])) { if (p.units_per_ctn) upcByName[String(p.name).trim().toLowerCase()] = Number(p.units_per_ctn) }

  // split notes into free text + received lines
  const raw = bill.notes || ''
  const marker = '\u2014 Received \u2014'
  let freeNotes = raw, received = ''
  if (raw.includes(marker)) { const parts = raw.split(marker); freeNotes = (parts[0] || '').trim(); received = (parts[1] || '').trim() }
  else if (/\u00d7/.test(raw)) { received = raw; freeNotes = '' }
  const rows = received.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(.+?)\s*\u00d7\s*(.+?)\s*@\s*(.+)$/)
    if (!m) return [l, '', '', '']
    let qty = m[1].trim(); const name = m[2].trim(); const costStr = m[3].trim()
    const q = parseFloat(qty) || 0
    const c = parseFloat(String(costStr).replace(/[^0-9.]/g, '')) || 0
    // if the qty text doesn't already carry a CTN breakdown, derive it from the product's box size
    if (!/CTN/i.test(qty)) {
      const upc = upcByName[name.toLowerCase()]
      const lbl = upc ? ctnLabel(q, upc) : ''
      if (lbl) qty = `${q} (${lbl})`
    }
    return [name, qty, costStr, money(q * c, cur)]
  })

  const allText = [company?.name, company?.email, company?.phone, vendor?.name, vendor?.email, raw].filter(Boolean).join(' ')
  const font = await ensureFont(pdf, allText)

  header(pdf, company, 'Purchase Bill', numberLabel, font)

  // ---- boxed info row: VENDOR (left) + BILL INFO (right) ----
  const boxY = 46, boxH = 26
  pdf.setDrawColor(210, 212, 208); pdf.setLineWidth(0.3)
  pdf.roundedRect(14, boxY, 110, boxH, 1.5, 1.5)   // vendor box
  pdf.roundedRect(130, boxY, 66, boxH, 1.5, 1.5)   // bill info box

  pdf.setFont(font, 'bold'); pdf.setFontSize(8); pdf.setTextColor(...MUTED)
  pdf.text('VENDOR', 18, boxY + 6)
  pdf.setFont(font, 'bold'); pdf.setFontSize(10); pdf.setTextColor(...INK)
  pdf.text(vendor?.name || '', 18, boxY + 12)
  pdf.setFont(font, 'normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTED)
  let vy = boxY + 17
  for (const line of [vendor?.email, vendor?.phone].filter(Boolean)) { pdf.text(String(line), 18, vy); vy += 4 }

  pdf.setFont(font, 'normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTED)
  const infoRow = (label, val, yy) => { pdf.setTextColor(...MUTED); pdf.text(label, 134, yy); pdf.setTextColor(...INK); pdf.text(String(val || '-'), 192, yy, { align: 'right' }) }
  infoRow('Bill #', numberLabel, boxY + 7)
  infoRow('Bill date', fmtDate(bill.bill_date), boxY + 13)
  infoRow('Due', bill.due_date ? fmtDate(bill.due_date) : '-', boxY + 19)
  infoRow('Status', String(bill.status || ''), boxY + 25)

  // ---- items table (boxed grid) ----
  let startY = boxY + boxH + 8
  if (rows.length) {
    autoTable(pdf, {
      startY,
      head: [['Item', 'Qty', 'Unit cost', 'Total']],
      body: rows,
      theme: 'grid',
      styles: { font, fontSize: 9, lineColor: [220, 222, 218], lineWidth: 0.1 },
      headStyles: { fillColor: MOSS, textColor: 255, fontSize: 9, font, lineColor: [220, 222, 218], lineWidth: 0.1 },
      bodyStyles: { fontSize: 9, textColor: INK, font },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    })
    startY = pdf.lastAutoTable.finalY
  }

  // ---- notes box (free text, if any) ----
  const pageH = pdf.internal.pageSize.getHeight()
  let ty = Math.max(startY + 10, pageH - 60, 200)
  if (freeNotes) {
    const nlines = pdf.splitTextToSize(freeNotes, 120)
    pdf.setDrawColor(210, 212, 208); pdf.setLineWidth(0.3)
    pdf.roundedRect(14, startY + 8, 120, 10 + nlines.length * 4.4, 1.5, 1.5)
    pdf.setFont(font, 'bold'); pdf.setFontSize(8); pdf.setTextColor(...MUTED); pdf.text('NOTES', 18, startY + 14)
    pdf.setFont(font, 'normal'); pdf.setFontSize(9); pdf.setTextColor(...INK); pdf.text(nlines, 18, startY + 19)
  }

  // ---- bottom row: payments (LEFT) + totals box (RIGHT) ----
  const pageH2 = pdf.internal.pageSize.getHeight()
  const livePayments = (payments || []).filter(p => !p.voided_at)
  const hasPay = livePayments.length > 0
  const payRows = hasPay ? [...livePayments].sort((a, b) => String(a.paid_at || a.payment_date).localeCompare(String(b.paid_at || b.payment_date))) : []
  const payHeight = hasPay ? (payRows.length + 2) * 6 + 12 : 0
  const totalsHeight = 3 * 6 + 10
  const bottomRowH = Math.max(payHeight, totalsHeight)
  let rowY = Math.max(startY + 12, pageH2 - 16 - bottomRowH)

  if (hasPay) {
    pdf.setFont(font, 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(...MUTED)
    pdf.text('Payments made', 14, rowY)
    autoTable(pdf, {
      startY: rowY + 2,
      head: [['Date / time', 'Method', 'Amount', 'Balance']],
      body: (() => {
        let run = 0
        return payRows.map(p => {
          run += Number(p.amount) || 0
          const bal = Math.max(0, Math.round((Number(bill.total) - run) * 100) / 100)
          const meth = String(p.method || '').replace('_', ' ')
          const noteTxt = [p.note, p.reference].filter(Boolean).join(' \u00b7 ')
          return [p.paid_at ? fmtDateTime(p.paid_at) : fmtDate(p.payment_date), noteTxt ? `${meth} \u00b7 ${noteTxt}` : meth, money(p.amount, cur), money(bal, cur)]
        })
      })(),
      foot: [['', 'Paid', '', money(bill.amount_paid, cur)], ['', 'Amount due', '', money(bill.amount_due, cur)]],
      theme: 'grid',
      styles: { font, fontSize: 7.5, lineColor: [220, 222, 218], lineWidth: 0.1, cellPadding: 1.5 },
      headStyles: { fillColor: [240, 240, 236], textColor: INK, fontSize: 7.5, font, lineColor: [220, 222, 218], lineWidth: 0.1 },
      footStyles: { fillColor: [248, 248, 245], textColor: INK, fontStyle: 'bold', font, halign: 'right', fontSize: 7.5 },
      columnStyles: { 0: { cellWidth: 34 }, 2: { halign: 'right', cellWidth: 22 }, 3: { halign: 'right', cellWidth: 24 } },
      margin: { left: 14 },
      tableWidth: 128,
    })
  }

  let ty2 = rowY
  const right = 196, labelX = 150
  const tTop = ty2
  const row = (label, val, bold) => {
    pdf.setFont(font, bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 11 : 9); pdf.setTextColor(...INK)
    pdf.text(label, labelX, ty2); pdf.text(val, right, ty2, { align: 'right' }); ty2 += bold ? 7 : 5.5
  }
  row('Total', money(bill.total, cur), true)
  row('Paid', money(bill.amount_paid, cur))
  row('Amount due', money(bill.amount_due, cur), true)
  pdf.setDrawColor(210, 212, 208); pdf.setLineWidth(0.3)
  pdf.roundedRect(labelX - 8, tTop - 6, right - (labelX - 8) + 2, (ty2 - tTop) + 6, 1.5, 1.5)

  drawPageBorder(pdf)

  if (opts.preview) return { url: pdf.output('bloburl'), filename: `bill-${numberLabel}.pdf` }
  pdf.save(`bill-${numberLabel}.pdf`)
}

// Purchase Order PDF (what you send to the vendor)
export async function purchaseOrderPDF({ po, items, vendor, company }, opts = {}) {
  const pdf = new jsPDF()
  const cur = company?.default_currency || 'USD'
  const numberLabel = po.po_number || 'PO'
  const allText = [company?.name, company?.email, company?.phone, vendor?.name, vendor?.email, po?.notes, ...(items || []).map(i => i.description)].filter(Boolean).join(' ')
  const font = await ensureFont(pdf, allText)

  header(pdf, company, 'Purchase Order', numberLabel, font)

  const boxY = 46, boxH = 26
  pdf.setDrawColor(210, 212, 208); pdf.setLineWidth(0.3)
  pdf.roundedRect(14, boxY, 110, boxH, 1.5, 1.5)
  pdf.roundedRect(130, boxY, 66, boxH, 1.5, 1.5)
  pdf.setFont(font, 'bold'); pdf.setFontSize(8); pdf.setTextColor(...MUTED); pdf.text('VENDOR', 18, boxY + 6)
  pdf.setFont(font, 'bold'); pdf.setFontSize(10); pdf.setTextColor(...INK); pdf.text(vendor?.name || '—', 18, boxY + 12)
  pdf.setFont(font, 'normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTED)
  let vy = boxY + 17
  for (const line of [vendor?.email, vendor?.phone].filter(Boolean)) { pdf.text(String(line), 18, vy); vy += 4 }
  const infoRow = (label, val, yy) => { pdf.setTextColor(...MUTED); pdf.text(label, 134, yy); pdf.setTextColor(...INK); pdf.text(String(val || '-'), 192, yy, { align: 'right' }) }
  infoRow('PO #', numberLabel, boxY + 7)
  infoRow('Order date', fmtDate(po.order_date), boxY + 13)
  infoRow('Expected', po.expected_date ? fmtDate(po.expected_date) : '-', boxY + 19)
  infoRow('Status', String(po.status || ''), boxY + 25)

  autoTable(pdf, {
    startY: boxY + boxH + 8,
    head: [['Item', 'Qty', 'Unit cost', 'Total']],
    body: (items || []).map(it => {
      const q = Number(it.qty_ordered) || 0, c = Number(it.unit_cost) || 0
      const qlabel = it.units_per_ctn ? `${q} (${ctnLabel(q, it.units_per_ctn)})` : String(q)
      return [it.description || '', qlabel, money(c, cur), money(q * c, cur)]
    }),
    theme: 'grid',
    styles: { font, fontSize: 9, lineColor: [220, 222, 218], lineWidth: 0.1 },
    headStyles: { fillColor: MOSS, textColor: 255, fontSize: 9, font, lineColor: [220, 222, 218], lineWidth: 0.1 },
    bodyStyles: { fontSize: 9, textColor: INK, font },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })

  let ty = pdf.lastAutoTable.finalY + 10
  const right = 196, labelX = 150, tTop = ty
  const row = (label, val, bold) => { pdf.setFont(font, bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 11 : 9); pdf.setTextColor(...INK); pdf.text(label, labelX, ty); pdf.text(val, right, ty, { align: 'right' }); ty += bold ? 7 : 5.5 }
  row('Total', money(po.total, cur), true)
  pdf.setDrawColor(210, 212, 208); pdf.setLineWidth(0.3); pdf.roundedRect(labelX - 8, tTop - 6, right - (labelX - 8) + 2, (ty - tTop) + 6, 1.5, 1.5)

  if (po.notes) {
    pdf.setFont(font, 'bold'); pdf.setFontSize(8); pdf.setTextColor(...MUTED); pdf.text('NOTES', 14, tTop)
    pdf.setFont(font, 'normal'); pdf.setFontSize(9); pdf.setTextColor(...INK); pdf.text(pdf.splitTextToSize(po.notes, 120), 14, tTop + 5)
  }

  drawPageBorder(pdf)
  if (opts.preview) return { url: pdf.output('bloburl'), filename: `po-${numberLabel}.pdf` }
  pdf.save(`po-${numberLabel}.pdf`)
}
