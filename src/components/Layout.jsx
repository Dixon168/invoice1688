import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Package, PackagePlus, Percent, FileText, CreditCard, Settings, LogOut, Menu, X, Truck, ReceiptText, Tag, ClipboardList } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { fmtDate } from '../lib/format'
import { useT } from '../i18n'
import LanguageSwitcher from './LanguageSwitcher'

const nav = [
  { to: '/', key: 'nav_dashboard', icon: LayoutDashboard, end: true },
  { to: '/estimates', key: 'nav_estimates', icon: ClipboardList },
  { to: '/invoices', key: 'nav_invoices', icon: FileText },
  { to: '/customers', key: 'nav_customers', icon: Users },
  { to: '/products', key: 'nav_products', icon: Package },
  { to: '/categories', key: 'nav_categories', icon: Tag },
  { to: '/payments', key: 'nav_payments', icon: CreditCard },
  { to: '/vendors', key: 'nav_vendors', icon: Truck },
  { to: '/bills', key: 'nav_bills', icon: ReceiptText },
  { to: '/receiving', key: 'nav_receiving', icon: PackagePlus },
  { to: '/tax-rates', key: 'nav_taxrates', icon: Percent },
  { to: '/settings', key: 'nav_settings', icon: Settings },
]

export default function Layout({ children }) {
  const { company, user, signOut } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const SidebarInner = () => (
    <>
      <div className="px-5 pb-6 pt-6">
        <div className="font-display text-2xl font-700 tracking-tight text-white">invoice<span className="text-clay">168</span></div>
        <div className="mt-1 truncate text-sm text-white/55">{company?.name || '—'}</div>
        {company?.paid_until && <div className="mt-0.5 text-xs text-white/35">{t('th_expires')}: {fmtDate(company.paid_until)}</div>}
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {nav.map(({ to, key, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive ? 'bg-white/15 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'
              }`}>
            <Icon size={18} /> {t(key)}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="px-1 pb-2"><LanguageSwitcher dark /></div>
        <div className="truncate px-3 pb-2 text-xs text-white/45">{user?.email}</div>
        <button onClick={async () => { await signOut(); navigate('/login') }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/65 transition hover:bg-white/10 hover:text-white">
          <LogOut size={18} /> {t('signout')}
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen lg:flex">
      {/* mobile top bar */}
      <div className="flex items-center justify-between bg-moss-800 px-4 py-3 lg:hidden">
        <div className="font-display text-xl font-700 text-white">invoice<span className="text-clay">168</span></div>
        <div className="flex items-center gap-1">
          <LanguageSwitcher dark />
          <button onClick={() => setOpen(true)} className="text-white"><Menu /></button>
        </div>
      </div>

      {/* desktop sidebar */}
      <aside className="hidden w-64 flex-col bg-moss-800 lg:flex">
        <SidebarInner />
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-moss-800">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 text-white/70"><X /></button>
            <SidebarInner />
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
