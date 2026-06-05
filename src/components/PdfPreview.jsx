import { useEffect, useState } from 'react'
import { X, Download, Printer } from 'lucide-react'
import { useT } from '../i18n'

// Usage: const preview = usePdfPreview(); ... preview.open(() => documentPDF({...}, { preview:true }))
export function usePdfPreview() {
  const [state, setState] = useState(null) // { url, filename } | 'loading' | null
  const open = async (generate) => {
    setState('loading')
    try {
      const res = await generate()
      if (res?.url) setState(res)
      else setState(null)
    } catch (e) {
      setState(null)
      alert('Could not generate the PDF.')
    }
  }
  const close = () => {
    setState(s => { if (s && s.url) { try { URL.revokeObjectURL(s.url) } catch {} } return null })
  }
  return { state, open, close }
}

export function PdfPreview({ preview }) {
  const { t } = useT()
  const { state, close } = preview
  useEffect(() => () => { if (state && state.url) { try { URL.revokeObjectURL(state.url) } catch {} } }, []) // eslint-disable-line

  if (!state) return null

  const loading = state === 'loading'
  const download = () => {
    const a = document.createElement('a')
    a.href = state.url; a.download = state.filename
    document.body.appendChild(a); a.click(); a.remove()
  }
  const print = () => {
    const w = window.open(state.url)
    if (w) w.onload = () => { try { w.focus(); w.print() } catch {} }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3 sm:p-6" onClick={close}>
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
          <span className="font-display text-lg text-ink">{t('pdf_preview') || 'Preview'}</span>
          <div className="flex items-center gap-2">
            {!loading && (
              <>
                <button className="btn-outline" onClick={print}><Printer size={16} /> {t('print') || 'Print'}</button>
                <button className="btn-primary" onClick={download}><Download size={16} /> {t('download') || 'Download'}</button>
              </>
            )}
            <button className="rounded-lg p-2 text-ink/50 hover:bg-black/5" onClick={close}><X size={20} /></button>
          </div>
        </div>
        <div className="flex-1 bg-sand">
          {loading
            ? <div className="flex h-full items-center justify-center text-ink/50">{t('pdf_generating') || 'Generating PDF…'}</div>
            : <iframe title="pdf-preview" src={state.url} className="h-full w-full border-0" />}
        </div>
      </div>
    </div>
  )
}
