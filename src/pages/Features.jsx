import { Link } from 'react-router-dom'
import {
  FileText, Wallet, Users, Package, PackagePlus, Truck, Undo2, Globe,
  Upload, BarChart3, ShieldCheck, ClipboardList, ReceiptText, Clock,
} from 'lucide-react'
import { PublicHeader, PublicFooter } from '../components/PublicChrome'

const FEATURES = [
  { icon: FileText, title: 'Invoices & estimates', desc: 'Create polished invoices and quotes in seconds, convert estimates to invoices, and download clean PDFs and packing slips.' },
  { icon: Wallet, title: 'Payments & overdue tracking', desc: 'Record payments, see who owes what, and spot overdue invoices instantly — no more chasing spreadsheets.' },
  { icon: Users, title: 'Customers & store credit', desc: 'Customer profiles with balances, returns, and store credit you can apply across one or many invoices.' },
  { icon: Package, title: 'Products & categories', desc: 'Organize your catalog with main and sub-categories, cost vs. selling price, and quick search.' },
  { icon: PackagePlus, title: 'Inventory & receiving', desc: 'Track stock, get low-stock alerts, receive goods from vendors, and see a full movement history per product.' },
  { icon: Truck, title: 'Vendors & bills (A/P)', desc: 'Manage suppliers, record bills and payments, and always know what you owe.' },
  { icon: Undo2, title: 'Returns & credits', desc: 'Process returns, optionally restock items, and issue store credit — built for real retail and wholesale.' },
  { icon: Globe, title: 'Truly multi-language', desc: 'Full interface in English, 中文, Español, Tiếng Việt, and 한국어 — pick your language anytime.' },
  { icon: Upload, title: 'Batch import', desc: 'Download an Excel template and bulk-upload products, customers, and vendors. Painless migration.' },
  { icon: BarChart3, title: 'Dashboards & insights', desc: 'At-a-glance counts and totals — customers, who is owing, who is overdue, outstanding balances, and more.' },
  { icon: ReceiptText, title: 'Tax rates & terms', desc: 'Set tax rates and payment terms once and apply them automatically across documents.' },
  { icon: ShieldCheck, title: 'Secure & private', desc: 'Each business is fully isolated. Your data is yours — protected with row-level security.' },
]

function Card({ icon: Icon, title, desc }) {
  return (
    <div className="card p-6">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-moss-100 text-moss-700"><Icon size={22} /></div>
      <h3 className="mt-4 font-display text-lg text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink/60">{desc}</p>
    </div>
  )
}

export default function Features() {
  return (
    <div className="min-h-screen bg-sand">
      <PublicHeader />
      <main>
        <section className="mx-auto max-w-6xl px-6 pb-6 pt-8 text-center">
          <h1 className="mx-auto max-w-3xl font-display text-4xl text-ink sm:text-5xl">
            Invoicing, inventory &amp; payments — all in one place.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink/60">Less bookkeeping. More business.</p>
          <div className="mt-7 flex justify-center gap-3">
            <Link to="/get-started" className="btn-primary">Get started</Link>
            <Link to="/why-us" className="btn-outline">Why us</Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(f => <Card key={f.title} {...f} />)}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-20 text-center">
          <div className="card bg-moss-800 p-10 text-white">
            <h2 className="font-display text-3xl">Run your whole business from one screen.</h2>
            <p className="mt-3 text-white/70">Start today — set up in minutes, no contract.</p>
            <Link to="/get-started" className="btn-primary mt-6 bg-white !text-moss-800 hover:bg-white/90">Get started</Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
