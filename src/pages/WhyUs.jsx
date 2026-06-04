import { Link } from 'react-router-dom'
import { Check, Minus, Globe, Boxes, Undo2, HandHeart, Tag, Upload } from 'lucide-react'
import { PublicHeader, PublicFooter } from '../components/PublicChrome'
import { useT } from '../i18n'

const HL_ICONS = [Boxes, Globe, Undo2, HandHeart, Tag, Upload]

export default function WhyUs() {
  const { t } = useT()
  const rows = [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ label: t(`r${i}_l`), us: t(`r${i}_u`), them: t(`r${i}_x`) }))
  const highlights = HL_ICONS.map((Icon, i) => ({ Icon, title: t(`h${i + 1}_t`), desc: t(`h${i + 1}_d`) }))
  return (
    <div className="min-h-screen bg-sand">
      <PublicHeader />
      <main>
        <section className="mx-auto max-w-6xl px-6 pb-4 pt-8 text-center">
          <h1 className="mx-auto max-w-3xl font-display text-4xl text-ink sm:text-5xl">{t('why_hero_t')}</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink/60">{t('why_hero_sub')}</p>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-10">
          <div className="card overflow-hidden p-0">
            <div className="grid grid-cols-12 border-b border-black/10 bg-sand/60 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink/50">
              <div className="col-span-6">{t('why_col_cap')}</div>
              <div className="col-span-3 text-center">Bill&amp;Pays</div>
              <div className="col-span-3 text-center">{t('why_col_them')}</div>
            </div>
            {rows.map((r, i) => (
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
          <p className="mt-3 text-center text-xs text-ink/40">{t('why_disclaimer')}</p>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-8">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {highlights.map(({ Icon, title, desc }) => (
              <div key={title} className="card p-6">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-moss-100 text-moss-700"><Icon size={22} /></div>
                <h3 className="mt-4 font-display text-lg text-ink">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/60">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-20 pt-4 text-center">
          <div className="card bg-moss-800 p-10 text-white">
            <h2 className="font-display text-3xl">{t('why_cta_t')}</h2>
            <p className="mt-3 text-white/70">{t('why_cta_sub')}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to="/get-started" className="btn-primary bg-white !text-moss-800 hover:bg-white/90">{t('cta_get_started')}</Link>
              <Link to="/pricing" className="btn-outline border-white/40 !text-white hover:bg-white/10">{t('cta_see_pricing')}</Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
