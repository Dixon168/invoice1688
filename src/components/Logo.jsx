// Bill&Pays "bp" monogram — green circle with interlocking b / p, drawn as SVG
// so it stays crisp at any size and can be tinted to match the app theme.
export default function Logo({ size = 36, circle = '#2f5f49', mark = '#ffffff', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} role="img" aria-label="Bill&Pays">
      <circle cx="50" cy="50" r="50" fill={circle} />
      <g fill="none" stroke={mark} strokeWidth="8.5" strokeLinecap="round">
        {/* b — left stem + lower bowl */}
        <path d="M36 23 V61" />
        <circle cx="43" cy="60" r="15" />
        {/* p — right stem (descender) + upper bowl */}
        <path d="M64 77 V39" />
        <circle cx="57" cy="40" r="15" />
      </g>
    </svg>
  )
}
