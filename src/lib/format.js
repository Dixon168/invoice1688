export const money = (n, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(n || 0))

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const isOverdue = (due, status) =>
  !!due && due < todayISO() && !['paid', 'cancelled', 'draft'].includes(status)

export const isExpired = (expiry, status) =>
  !!expiry && expiry < todayISO() && ['draft', 'sent'].includes(status)

export const STATUS = {
  draft:     { label: 'Draft',     key: 'st_draft',     cls: 'bg-black/8 text-ink/70' },
  sent:      { label: 'Sent',      key: 'st_sent',      cls: 'bg-blue-100 text-blue-700' },
  partial:   { label: 'Partial',   key: 'st_partial',   cls: 'bg-amber-100 text-amber-700' },
  paid:      { label: 'Paid',      key: 'st_paid',      cls: 'bg-moss-100 text-moss-700' },
  overdue:   { label: 'Overdue',   key: 'st_overdue',   cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', key: 'st_cancelled', cls: 'bg-black/8 text-ink/40 line-through' },
}

// Subscription state for a company (manual billing).
// Active only if not suspended AND within the paid period.
export function subState(company) {
  if (!company) return { state: 'active', active: true, label: 'Active', key: 'st_active' }
  if (company.subscription_status === 'suspended') return { state: 'suspended', active: false, label: 'Suspended', key: 'st_suspended' }
  if (company.paid_until && company.paid_until < todayISO()) return { state: 'expired', active: false, label: 'Expired', key: 'st_expired' }
  return { state: 'active', active: true, label: 'Active', key: 'st_active' }
}

export const SUB_BADGE = {
  active:    'bg-moss-100 text-moss-700',
  suspended: 'bg-black/10 text-ink/50',
  expired:   'bg-red-100 text-red-700',
}

// packaging: show a quantity as boxes + remainder, e.g. 9 with 2/box -> "4 CTN + 1"
export function ctnLabel(qty, upc) {
  qty = Number(qty) || 0
  upc = Number(upc) || 0
  if (!upc || upc <= 0) return ''
  const boxes = Math.floor(qty / upc)
  const rem = Math.round((qty - boxes * upc) * 100) / 100
  if (boxes === 0) return `${rem}`
  if (rem === 0) return `${boxes} CTN`
  return `${boxes} CTN + ${rem}`
}
