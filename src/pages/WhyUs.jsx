import { Link } from 'react-router-dom'
import { Check, Minus, Globe, Boxes, Undo2, HandHeart, Tag, Upload } from 'lucide-react'
import { PublicHeader, PublicFooter } from '../components/PublicChrome'

const ROWS = [
  { label: 'Invoicing, inventory, receiving & A/P in one plan', us: 'Included', them: 'Higher tiers / add-ons' },
  { label: 'Returns with restock & customer store credit', us: 'Built in', them: 'Limited / manual' },
  { label: 'Full multi-language interface (EN/中文/ES/VI/KO)', us: '5 languages', them: 'Mostly English' },
  { label: 'Designed for small retail & wholesale', us: 'Yes', them: 'General accounting' },
  { label: 'Simple enough without an accountant', us: 'Yes', them: 'Steeper learning curve' },
  { label: 'Transparent flat pricing', us: '$19.99/mo', them: 'Tiered, add-ons' },
  { label: 'Local, real-person support (Flushing, NY)', us: 'Yes', them: 'Call center' },
  { label: 'Bulk Excel import for products/customers/vendors', us: 'Yes', them: 'Varies by plan' },
]

const HIGHLIGHTS = [
  { icon: Boxes, title: 'One system, not five', desc: 'Invoices, inventory, receiving, vendors, payments and returns live together — not split across add-ons.' },
  { icon: Globe, title: 'Speaks your language', desc: 'The entire app works in English, Chinese, Spanish, Vietnamese and Korean — great for diverse teams and customers.' },
  { icon: Undo2, title: 'Built for the way you sell', desc: 'Receive stock, return goods to inventory, and hand out store credit — workflows real shops actually use.' },
  { icon: HandHeart, title: 'A real person answers', desc: 'Based in Flushing, NY. Call 646-703-8888 and talk to someone who knows the product.' },
  { icon: Tag, title: 'Honest pricing', desc: 'One simple plan. No per-feature upsells just to unlock the basics.' },
  { icon: Upload, title: 'Easy to switch', desc: 'Import your products, customers and vendors from Excel and be running the same day.' },
]

export default function WhyUs() {
  return (
    <div className="min-h-screen bg-sand">
      <PublicHeader />
      <main>
        <section className="mx-auto max-w-6xl px-6 pb-4 pt-8 text-center">
          <h1 className="mx-auto max-w-3xl font-display text-4xl text-ink sm:text-5xl">
            Why businesses choose us over QuickBooks
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink/60">
            All the everyday tools a shop needs — billing, stock and payments — in one simple, affordable place.
          </p>
        </section>

        {/* comparison table */}
        <section className="mx-auto max-w-4xl px-6 py-10">
          <div className="card overflow-hidden p-0">
            <div className="grid grid-cols-12 border-b border-black/10 bg-sand/60 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink/50">
              <div className="col-span-6">Capability</div>
              <div className="col-span-3 text-center">Bill&amp;Pays</div>
              <div className="col-span-3 text-center">QuickBooks</div>
            </div>
            {ROWS.map((r, i) => (
              <div key={i} className="grid grid-cols-12 items-center border-b border-black/[.06] px-5 py-3 text-sm last:border-0">
                <div className="col-span-6 pr-3 text-ink/80">{r.label}</div>
                <div className="col-span-3 text-center">
                  <span className="inline-flex items-center gap-1 font-medium text-moss-700"><Check size={15} /> {r.us}</span>
                </div>
                <div className="col-span-3 text-center text-ink/45">
                  <span className="inline-flex items-center gap-1"><Minus size={14} /> {r.them}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-ink/40">
            Comparison reflects typical small-business plans and is provided for general guidance. QuickBooks is a trademark of Intuit Inc.; we are not affiliated with Intuit. Features and pricing of other products may change.
          </p>
        </section>

        {/* highlights */}
        <section className="mx-auto max-w-6xl px-6 py-8">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {HIGHLIGHTS.map(h => (
              <div key={h.title} className="card p-6">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-moss-100 text-moss-700"><h.icon size={22} /></div>
                <h3 className="mt-4 font-display text-lg text-ink">{h.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/60">{h.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-20 pt-4 text-center">
          <div className="card bg-moss-800 p-10 text-white">
            <h2 className="font-display text-3xl">See the difference for your shop.</h2>
            <p className="mt-3 text-white/70">No contract. Cancel anytime. Local support when you need it.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to="/get-started" className="btn-primary bg-white !text-moss-800 hover:bg-white/90">Get started</Link>
              <Link to="/pricing" className="btn-outline border-white/40 !text-white hover:bg-white/10">See pricing</Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
