import { Link } from 'react-router-dom'
import {
  FileText, Wallet, Users, Package, PackagePlus, Truck, Undo2, Globe,
  Upload, BarChart3, ShieldCheck, ReceiptText,
} from 'lucide-react'
import { PublicHeader, PublicFooter } from '../components/PublicChrome'
import { useT } from '../i18n'

const ICONS = [FileText, Wallet, Users, Package, PackagePlus, Truck, Undo2, Globe, Upload, BarChart3, ReceiptText, ShieldCheck]

export default function Features() {
  const { t } = useT()
  const cards = ICONS.map((Icon, i) => ({ Icon, title: t(`f${i + 1}_t`), desc: t(`f${i + 1}_d`) }))
  return (
    <div className="min-h-screen bg-sand">
      <PublicHeader />
      <main>
        <section className="mx-auto max-w-6xl px-6 pb-6 pt-8 text-center">
          <h1 className="mx-auto max-w-3xl font-display text-4xl text-ink sm:text-5xl">{t('slogan_main')}</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink/60">{t('slogan_sub')}</p>
          <div className="mt-7 flex justify-center gap-3">
            <Link to="/get-started" className="btn-primary">{t('cta_get_started')}</Link>
            <Link to="/why-us" className="btn-outline">{t('cta_why_us')}</Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(({ Icon, title, desc }) => (
              <div key={title} className="card p-6">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-moss-100 text-moss-700"><Icon size={22} /></div>
                <h3 className="mt-4 font-display text-lg text-ink">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/60">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-20 text-center">
          <div className="card bg-moss-800 p-10 text-white">
            <h2 className="font-display text-3xl">{t('feat_cta_title')}</h2>
            <p className="mt-3 text-white/70">{t('feat_cta_sub')}</p>
            <Link to="/get-started" className="btn-primary mt-6 bg-white !text-moss-800 hover:bg-white/90">{t('cta_get_started')}</Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
