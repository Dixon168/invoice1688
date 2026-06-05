import { useEffect, useRef, useState } from 'react'
import { money } from '../lib/format'
import { useT } from '../i18n'

function useOutside(ref, cb) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) cb() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, cb])
}

// Free-text field with suggestions from existing values. Typing a new value = creating it.
export function TextCombo({ value, onChange, suggestions = [], placeholder }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useOutside(ref, () => setOpen(false))
  const v = (value || '').toLowerCase()
  const filtered = [...new Set(suggestions.filter(Boolean))]
    .filter(s => s.toLowerCase().includes(v) && s.toLowerCase() !== v)
    .slice(0, 8)

  return (
    <div className="relative" ref={ref}>
      <input className="input" value={value || ''} placeholder={placeholder || t('combo_type_add')} autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg">
          {filtered.map(s => (
            <button type="button" key={s} className="block w-full px-3 py-2 text-left text-sm hover:bg-sand"
              onMouseDown={() => { onChange(s); setOpen(false) }}>{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// Searchable picker for a customer (or any simple named record). Pick or create.
export function NameCombo({ value, onText, options = [], onPick, onCreate, placeholder, createLabel }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef()
  useOutside(ref, () => setOpen(false))
  const q = (value || '').toLowerCase().trim()
  const matches = options.filter(o => (o.name || '').toLowerCase().includes(q)).slice(0, 8)
  const exact = options.some(o => (o.name || '').toLowerCase() === q)

  return (
    <div className="relative" ref={ref}>
      <input className="input" value={value || ''} placeholder={placeholder || t('combo_type_add')} autoComplete="off"
        onChange={e => { onText(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} />
      {open && (matches.length > 0 || (q && !exact)) && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-black/10 bg-white py-1 text-sm shadow-lg">
          {matches.map(o => (
            <button type="button" key={o.id} className="block w-full px-3 py-2 text-left hover:bg-sand"
              onMouseDown={() => { onPick(o); setOpen(false) }}>{o.name}</button>
          ))}
          {q && !exact && onCreate && (
            <button type="button" disabled={creating}
              className="block w-full border-t border-black/5 px-3 py-2 text-left font-medium text-moss-700 hover:bg-moss-50 disabled:opacity-50"
              onMouseDown={async () => { setCreating(true); await onCreate(value.trim()); setCreating(false); setOpen(false) }}>
              {creating ? 'Creating…' : `＋ ${createLabel || t('combo_create')} “${value.trim()}”`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
export function ItemCombo({ value, onText, products = [], onPick, onCreate, currency = 'USD' }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [pos, setPos] = useState(null)
  const [catF, setCatF] = useState('')
  const [subF, setSubF] = useState('')
  const ref = useRef()
  const inputRef = useRef()
  useOutside(ref, () => setOpen(false))

  const updatePos = () => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: r.width })
  }
  useEffect(() => {
    if (!open) return
    updatePos()
    const h = () => updatePos()
    window.addEventListener('scroll', h, true)
    window.addEventListener('resize', h)
    return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', h) }
  }, [open])

  const q = (value || '').toLowerCase().trim()
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort()
  const subs = catF ? [...new Set(products.filter(p => p.category === catF).map(p => p.subcategory).filter(Boolean))].sort() : []
  const matches = products
    .filter(p => `${p.name} ${p.sku || ''}`.toLowerCase().includes(q))
    .filter(p => !catF || p.category === catF)
    .filter(p => !subF || p.subcategory === subF)
    .slice(0, 12)
  const exact = products.some(p => (p.name || '').toLowerCase() === q)

  return (
    <div className="relative" ref={ref}>
      <input ref={inputRef} className="input py-1.5" value={value || ''} placeholder={t('ph_type_search_item')} autoComplete="off"
        onChange={e => { onText(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} />
      {open && pos && (matches.length > 0 || (q && !exact) || catF) && (
        <div className="fixed z-50 max-h-72 overflow-auto rounded-lg border border-black/10 bg-white py-1 text-sm shadow-xl"
          style={{ top: pos.top, left: pos.left, width: pos.width }}>
          {cats.length > 0 && (
            <div className="sticky top-0 z-10 flex gap-1 border-b border-black/5 bg-white px-1.5 py-1.5">
              <select className="input py-1 text-xs" value={catF} onChange={e => { setCatF(e.target.value); setSubF('') }}>
                <option value="">{t('all_categories') || 'All categories'}</option>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input py-1 text-xs" value={subF} onChange={e => setSubF(e.target.value)} disabled={!catF || subs.length === 0}>
                <option value="">{t('all_sub') || 'All sub'}</option>
                {subs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {matches.map(p => (
            <button type="button" key={p.id} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-sand"
              onMouseDown={() => { onPick(p); setOpen(false) }}>
              <span className="truncate">{p.name}{p.sku ? <span className="text-ink/40"> · {p.sku}</span> : null}</span>
              <span className="shrink-0 tabular-nums text-ink/50">{money(p.unit_price, currency)}</span>
            </button>
          ))}
          {q && !exact && (
            <button type="button" disabled={creating}
              className="block w-full border-t border-black/5 px-3 py-2 text-left font-medium text-moss-700 hover:bg-moss-50 disabled:opacity-50"
              onMouseDown={async () => { setCreating(true); await onCreate(value.trim()); setCreating(false); setOpen(false) }}>
              {creating ? 'Creating…' : `＋ Create item “${value.trim()}”`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
