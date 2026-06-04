import { Link } from 'react-router-dom'
import { Check, FileText, Wallet, Package, Globe } from 'lucide-react'
import { useT } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

function Feat({ icon: Icon, title, desc }) {
  return (
    <div className="flex gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-moss-100 text-moss-700"><Icon size={20} /></div>
      <div><div className="font-semibold text-ink">{title}</div><div className="text-sm text-ink/55">{desc}</div></div>
    </div>
  )
}

export default function Pricing() {
  const { t } = useT()
  const includes = ['pr_inc1', 'pr_inc2', 'pr_inc3', 'pr_inc4', 'pr_inc5', 'pr_inc6']
  return (
    <div className="min-h-screen bg-sand">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link to="/login" className="font-display text-2xl font-700 text-ink">invoice<span className="text-clay">168</span></Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Link to="/login" className="btn-ghost">{t('nav_signin')}</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-20">
        <div className="pt-8 text-center">
          <h1 className="font-display text-4xl text-ink sm:text-5xl">{t('pr_hero_t')}</h1>
          <p className="mx-auto mt-4 max-w-xl text-ink/60">{t('pr_hero_sub')}</p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {/* plan card */}
          <div className="card border-2 border-moss-700/20 p-8">
            <div className="text-sm font-semibold uppercase tracking-wide text-moss-700">Invoice168</div>
            <div className="mt-3 flex items-end gap-1">
              <span className="font-display text-5xl text-ink">$19.99</span>
              <span className="mb-1.5 text-ink/55">{t('pr_per_month')}</span>
            </div>
            <p className="mt-1 text-sm text-ink/50">{t('pr_no_contract')}</p>
            <Link to="/get-started" className="btn-primary mt-6 w-full justify-center">{t('get_started')}</Link>
            <div className="mt-6 border-t border-black/[.07] pt-5">
              <div className="label">{t('pr_includes')}</div>
              <ul className="mt-2 space-y-2">
                {includes.map(k => (
                  <li key={k} className="flex items-center gap-2 text-sm text-ink/75">
                    <Check size={16} className="shrink-0 text-moss-700" /> {t(k)}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* features */}
          <div className="space-y-6 p-2 sm:p-6">
            <Feat icon={FileText} title={t('feat_quote_t')} desc={t('feat_quote_d')} />
            <Feat icon={Wallet} title={t('feat_pay_t')} desc={t('feat_pay_d')} />
            <Feat icon={Package} title={t('feat_inv_t')} desc={t('feat_inv_d')} />
            <Feat icon={Globe} title={t('feat_multi_t')} desc={t('feat_multi_d')} />
            <div className="rounded-xl bg-moss-800 p-5 text-white">
              <div className="text-sm text-white/70">{t('owner_badge')}</div>
              <Link to="/get-started" className="mt-3 inline-flex rounded-lg bg-clay px-4 py-2 text-sm font-semibold text-white hover:opacity-90">{t('get_started')} →</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
