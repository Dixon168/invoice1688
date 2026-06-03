import { X } from 'lucide-react'

export function Spinner({ className = '' }) {
  return (
    <div className={`flex items-center justify-center p-10 ${className}`}>
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-moss-600/30 border-t-moss-700" />
    </div>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-600 tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink/55">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      {Icon && <div className="rounded-2xl bg-moss-50 p-4 text-moss-700"><Icon size={26} /></div>}
      <h3 className="font-display text-xl text-ink">{title}</h3>
      {hint && <p className="max-w-sm text-sm text-ink/55">{hint}</p>}
      {action}
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

export function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm sm:p-8">
      <div className={`card my-auto w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} animate-[fadeIn_.15s_ease]`}>
        <div className="flex items-center justify-between border-b border-black/[.07] px-5 py-4">
          <h2 className="font-display text-xl text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink/50 hover:bg-black/5 hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
