import { Lock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Blocked() {
  const { company, signOut, user } = useAuth()
  return (
    <div className="grid min-h-screen place-items-center bg-sand p-6">
      <div className="card max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-clay/10 text-clay"><Lock size={26} /></div>
        <h1 className="font-display text-2xl text-ink">Subscription inactive</h1>
        <p className="mt-3 text-sm text-ink/60">
          {company?.name ? `${company.name}'s ` : 'Your '} access is currently paused. Please contact your provider to renew your monthly plan and restore access.
        </p>
        <div className="mt-5 rounded-lg bg-sand p-3 text-xs text-ink/50">{user?.email}</div>
        <button className="btn-outline mt-6 w-full" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )
}
