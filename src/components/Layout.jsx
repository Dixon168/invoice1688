import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Package, Percent, FileText, CreditCard, Settings, LogOut, Menu, X, Truck, ReceiptText } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/vendors', label: 'Vendors', icon: Truck },
  { to: '/bills', label: 'Bills', icon: ReceiptText },
  { to: '/tax-rates', label: 'Tax Rates', icon: Percent },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Layout({ children }) {
  const { company, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const SidebarInner = () => (
    <>
      <div className="px-5 pb-6 pt-6">
        <div className="font-display text-2xl font-700 tracking-tight text-white">invoice<span className="text-clay">168</span></div>
        <div className="mt-1 truncate text-sm text-white/55">{company?.name || '—'}</div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive ? 'bg-white/15 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'
              }`}>
            <Icon size={18} /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="truncate px-3 pb-2 text-xs text-white/45">{user?.email}</div>
        <button onClick={async () => { await signOut(); navigate('/login') }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/65 transition hover:bg-white/10 hover:text-white">
          <LogOut size={18} /> Sign out
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen lg:flex">
      {/* mobile top bar */}
      <div className="flex items-center justify-between bg-moss-800 px-4 py-3 lg:hidden">
        <div className="font-display text-xl font-700 text-white">invoice<span className="text-clay">168</span></div>
        <button onClick={() => setOpen(true)} className="text-white"><Menu /></button>
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
