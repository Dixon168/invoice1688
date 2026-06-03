import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [company, setCompany] = useState(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (uid) => {
    if (!uid) { setProfile(null); setCompany(null); setIsSuperAdmin(false); return }
    const { data: admin } = await supabase.rpc('is_super_admin')
    setIsSuperAdmin(!!admin)
    const { data: prof } = await supabase
      .from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(prof || null)
    if (prof?.company_id) {
      const { data: comp } = await supabase
        .from('companies').select('*').eq('id', prof.company_id).maybeSingle()
      setCompany(comp || null)
    } else {
      setCompany(null)
    }
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadProfile(data.session?.user?.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, sess) => {
      setSession(sess)
      await loadProfile(sess?.user?.id)
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signUp = (email, password) =>
    supabase.auth.signUp({ email, password })

  const signOut = () => supabase.auth.signOut()

  const createCompany = async (companyName, fullName) => {
    const { data, error } = await supabase.rpc('create_company_and_profile', {
      p_company_name: companyName,
      p_full_name: fullName || null,
    })
    if (!error) await loadProfile(session?.user?.id)
    return { data, error }
  }

  const refreshCompany = () => loadProfile(session?.user?.id)

  const value = {
    session, user: session?.user || null, profile, company, loading, isSuperAdmin,
    needsCompany: !!session && !loading && !profile && !isSuperAdmin,
    signIn, signUp, signOut, createCompany, refreshCompany,
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
