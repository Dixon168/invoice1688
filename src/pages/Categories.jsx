import { useEffect, useState } from 'react'
import { Tag, Plus, Trash2, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Spinner, EmptyState } from '../components/ui'
import { useT } from '../i18n'

export default function Categories() {
  const { company } = useAuth()
  const { t } = useT()
  const [rows, setRows] = useState(null)
  const [newCat, setNewCat] = useState('')
  const [subInputs, setSubInputs] = useState({})

  const load = async () => {
    const { data } = await supabase.from('categories').select('*').order('name')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  const tops = (rows || []).filter(c => !c.parent_id)
  const subsOf = (id) => (rows || []).filter(c => c.parent_id === id)

  const addCategory = async () => {
    if (!newCat.trim()) return
    await supabase.from('categories').insert({ company_id: company.id, name: newCat.trim() })
    setNewCat(''); load()
  }
  const addSub = async (parentId) => {
    const name = (subInputs[parentId] || '').trim()
    if (!name) return
    await supabase.from('categories').insert({ company_id: company.id, name, parent_id: parentId })
    setSubInputs({ ...subInputs, [parentId]: '' }); load()
  }
  const rename = async (c) => {
    const name = prompt('Rename to:', c.name)
    if (name && name.trim() && name.trim() !== c.name) {
      await supabase.from('categories').update({ name: name.trim() }).eq('id', c.id); load()
    }
  }
  const remove = async (c) => {
    const sub = c.parent_id ? '' : ' and its sub-categories'
    if (!confirm(`Delete "${c.name}"${sub}?`)) return
    await supabase.from('categories').delete().eq('id', c.id); load()
  }

  return (
    <>
      <PageHeader title={t('categories_title')} subtitle={t('categories_sub')} />

      <div className="card mb-4 flex gap-2 p-4">
        <input className="input" value={newCat} onChange={e => setNewCat(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCategory()} placeholder="New category name…" />
        <button className="btn-primary shrink-0" onClick={addCategory}><Plus size={18} /> Add</button>
      </div>

      {rows === null ? <Spinner /> : tops.length === 0 ? (
        <EmptyState icon={Tag} title="No categories yet" hint="Add a category above, then add sub-categories under it." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {tops.map(cat => (
            <div key={cat.id} className="card p-4">
              <div className="flex items-center justify-between">
                <button className="font-display text-lg text-ink hover:text-moss-700" onClick={() => rename(cat)}>{cat.name}</button>
                <button className="rounded-md p-1.5 text-ink/40 hover:bg-clay/10 hover:text-clay" onClick={() => remove(cat)}><Trash2 size={15} /></button>
              </div>
              <div className="mt-2 space-y-1">
                {subsOf(cat.id).map(s => (
                  <div key={s.id} className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-sand">
                    <span className="flex items-center gap-1 text-ink/70"><ChevronRight size={14} className="text-ink/30" />
                      <button className="hover:text-moss-700" onClick={() => rename(s)}>{s.name}</button></span>
                    <button className="rounded p-1 text-ink/40 hover:text-clay" onClick={() => remove(s)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input className="input py-1.5 text-sm" value={subInputs[cat.id] || ''}
                  onChange={e => setSubInputs({ ...subInputs, [cat.id]: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && addSub(cat.id)} placeholder="Add sub-category…" />
                <button className="btn-outline shrink-0 px-3 py-1.5 text-sm" onClick={() => addSub(cat.id)}><Plus size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
