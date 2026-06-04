import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import LanguageSwitcher from './LanguageSwitcher'

export function Brand({ className = '' }) {
  return <span className={`font-display font-700 ${className}`}>Bill<span className="text-clay">&</span>Pays</span>
}

export function PublicHeader() {
  const { t } = useT()
  return (
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5">
      <Link to="/login"><Brand className="text-2xl text-ink" /></Link>
      <nav className="flex flex-wrap items-center gap-1 sm:gap-2">
        <Link to="/features" className="rounded-lg px-3 py-1.5 text-sm text-ink/70 hover:bg-black/5">{t('nav_features')}</Link>
        <Link to="/why-us" className="rounded-lg px-3 py-1.5 text-sm text-ink/70 hover:bg-black/5">{t('nav_whyus')}</Link>
        <Link to="/pricing" className="rounded-lg px-3 py-1.5 text-sm text-ink/70 hover:bg-black/5">{t('nav_pricing')}</Link>
        <LanguageSwitcher />
        <Link to="/login" className="btn-ghost">{t('nav_signin')}</Link>
        <Link to="/get-started" className="btn-primary">{t('get_started')}</Link>
      </nav>
    </header>
  )
}

export function PublicFooter() {
  const { t } = useT()
  return (
    <footer className="border-t border-black/10 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Brand className="text-lg text-ink" />
          <div className="flex flex-wrap gap-4 text-sm text-ink/55">
            <Link to="/features" className="hover:text-ink">{t('nav_features')}</Link>
            <Link to="/why-us" className="hover:text-ink">{t('nav_whyus')}</Link>
            <Link to="/pricing" className="hover:text-ink">{t('nav_pricing')}</Link>
            <Link to="/login" className="hover:text-ink">{t('nav_signin')}</Link>
          </div>
        </div>
        <div className="mt-4 text-xs text-ink/40">
          {t('powered_by')} · 4136 College Point Blvd #2, Flushing, NY 11355 · 646-703-8888 · support@allinonepayment.com
        </div>
      </div>
    </footer>
  )
}
