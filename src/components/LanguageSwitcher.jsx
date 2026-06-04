import { useEffect, useRef, useState } from 'react'
import { Globe, Check } from 'lucide-react'
import { LANGS, useT } from '../i18n'

export default function LanguageSwitcher({ dark = false }) {
  const { lang, setLang } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const current = LANGS.find(l => l.code === lang) || LANGS[0]
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition ${dark ? 'text-white/80 hover:bg-white/10' : 'text-ink/70 hover:bg-black/5'}`}>
        <Globe size={16} /> {current.label}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg">
          {LANGS.map(l => (
            <button key={l.code} onClick={() => { setLang(l.code); setOpen(false) }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-ink hover:bg-sand">
              {l.label}{l.code === lang && <Check size={15} className="text-moss-700" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
