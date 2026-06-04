import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'

// fields: [{ key, label, type, required, note }]  type: 'text' | 'number' | 'bool'

function coerce(v, type) {
  if (v === undefined || v === null) return ''
  if (type === 'number') {
    const n = Number(String(v).replace(/[, $]/g, ''))
    return isNaN(n) ? '' : n
  }
  if (type === 'bool') {
    const s = String(v).trim().toLowerCase()
    return ['y', 'yes', 'true', '1', '是', 'on'].includes(s)
  }
  return String(v).trim()
}

export function downloadTemplate(filename, fields, example) {
  const headers = fields.map(f => f.label || f.key)
  const exampleRow = example || fields.map(f => f.note ? `(${f.note})` : '')
  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow])
  ws['!cols'] = headers.map(h => ({ wch: Math.max(14, String(h).length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Template')
  XLSX.writeFile(wb, filename)
}

export function TemplateButton({ filename, fields, example, label }) {
  const { t } = useT()
  return (
    <button className="btn-outline" onClick={() => downloadTemplate(filename, fields, example)}>
      <Download size={16} /> {label || t('ie_template')}
    </button>
  )
}

export function ImportButton({ table, fields, companyId, transform, onDone, label }) {
  const { t } = useT()
  const inputRef = useRef()
  const [busy, setBusy] = useState(false)

  const handle = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

      const records = []
      const errors = []
      rows.forEach((r, i) => {
        // skip the helper "(example)" row if present
        const looksExample = fields.some(f => {
          const v = r[f.label] ?? r[f.key]
          return typeof v === 'string' && /^\(.*\)$/.test(v.trim())
        })
        if (looksExample) return

        const rec = {}
        for (const f of fields) {
          const raw = r[f.label] !== undefined ? r[f.label] : r[f.key]
          const v = coerce(raw, f.type)
          if (v !== '' && v !== null && v !== undefined) rec[f.key] = v
        }
        const missing = fields.filter(f => f.required && (rec[f.key] === undefined || rec[f.key] === ''))
        // ignore fully-blank rows silently
        if (Object.keys(rec).length === 0) return
        if (missing.length) { errors.push(`Row ${i + 2}: ${missing.map(m => m.label).join(', ')}`); return }
        rec.company_id = companyId
        records.push(transform ? transform(rec, r) : rec)
      })

      if (records.length === 0) {
        alert(t('ie_none') + (errors.length ? '\n\n' + errors.slice(0, 8).join('\n') : ''))
        return
      }
      const msg = `${t('ie_confirm')} ${records.length}` + (errors.length ? `\n(${errors.length} ${t('ie_skipped')})` : '')
      if (!confirm(msg)) return

      const chunk = 200
      let done = 0
      for (let j = 0; j < records.length; j += chunk) {
        const { error } = await supabase.from(table).insert(records.slice(j, j + chunk))
        if (error) { alert('Import error: ' + error.message); break }
        done += Math.min(chunk, records.length - j)
      }
      alert(`${t('ie_imported')} ${done}`)
      onDone && onDone()
    } catch (err) {
      alert('Could not read file: ' + (err?.message || err))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handle} />
      <button className="btn-outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        <Upload size={16} /> {busy ? '…' : (label || t('ie_import'))}
      </button>
    </>
  )
}
