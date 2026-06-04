export const money = (n, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(n || 0))

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const isOverdue = (due, status) =>
  !!due && due < todayISO() && !['paid', 'cancelled', 'draft'].includes(status)

export const STATUS = {
  draft:     { label: 'Draft',     cls: 'bg-black/8 text-ink/70' },
  sent:      { label: 'Sent',      cls: 'bg-blue-100 text-blue-700' },
  partial:   { label: 'Partial',   cls: 'bg-amber-100 text-amber-700' },
  paid:      { label: 'Paid',      cls: 'bg-moss-100 text-moss-700' },
  overdue:   { label: 'Overdue',   cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-black/8 text-ink/40 line-through' },
}

// Subscription state for a company (manual billing).
// Active only if not suspended AND within the paid period.
export function subState(company) {
  if (!company) return { state: 'active', active: true, label: 'Active' }
  if (company.subscription_status === 'suspended') return { state: 'suspended', active: false, label: 'Suspended' }
  if (company.paid_until && company.paid_until < todayISO()) return { state: 'expired', active: false, label: 'Expired' }
  return { state: 'active', active: true, label: 'Active' }
}

export const SUB_BADGE = {
  active:    'bg-moss-100 text-moss-700',
  suspended: 'bg-black/10 text-ink/50',
  expired:   'bg-red-100 text-red-700',
}
