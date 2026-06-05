import logoUrl from '../assets/logo.png'

// Bill&Pays brand logo (the original "bp" mark). Circular transparent PNG so it
// sits cleanly on both light and dark backgrounds.
export default function Logo({ size = 36, className = '' }) {
  return (
    <img src={logoUrl} width={size} height={size} alt="Bill&Pays"
      className={className} style={{ width: size, height: size, objectFit: 'contain' }} />
  )
}
