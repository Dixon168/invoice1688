import { useEffect, useState } from 'react'
import { Tag, Plus, Trash2, ChevronRight, FolderInput, Pencil } from 'lucide-react'
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
  const [movingSub, setMovingSub] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const load = async () => {
    const { data } = await supabase.from('categories').select('*').order('name')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  const tops = (rows || []).filter(c => !c.parent_id)
  const subsOf = (id) => (rows || []).filter(c => c.parent_id === id)

  const addCategory = async () => {
    const name = newCat.trim()
    if (!name) return
    if ((rows || []).some(c => !c.parent_id && c.name.toLowerCase() === name.toLowerCase())) { alert(t('cat_dup')); return }
    const { error } = await supabase.from('categories').insert({ company_id: company.id, name })
    if (error) { alert('Could not add category: ' + error.message); return }
    setNewCat(''); load()
  }
  const addSub = async (parentId) => {
    const name = (subInputs[parentId] || '').trim()
    if (!name) return
    if ((rows || []).some(c => c.parent_id === parentId && c.name.toLowerCase() === name.toLowerCase())) { alert(t('cat_dup_sub')); return }
    const { error } = await supabase.from('categories').insert({ company_id: company.id, name, parent_id: parentId })
    if (error) { alert('Could not add sub-category: ' + error.message); return }
    setSubInputs({ ...subInputs, [parentId]: '' }); load()
  }
  const moveSub = async (s, newParentId) => {
    if (!newParentId || newParentId === s.parent_id) { setMovingSub(null); return }
    if ((rows || []).some(c => c.parent_id === newParentId && c.name.toLowerCase() === s.name.toLowerCase())) { alert(t('cat_dup_sub')); setMovingSub(null); return }
    const { error } = await supabase.from('categories').update({ parent_id: newParentId }).eq('id', s.id)
    if (error) { alert('Could not move: ' + error.message); return }
    setMovingSub(null); load()
  }

  const startEdit = (c) => { setMovingSub(null); setEditingId(c.id); setEditName(c.name) }
  const saveRename = async (c) => {
    const name = editName.trim()
    if (!name || name === c.name) { setEditingId(null); return }
    const siblings = (rows || []).filter(x => x.parent_id === c.parent_id && x.id !== c.id)
    if (siblings.some(x => x.name.toLowerCase() === name.toLowerCase())) { alert(c.parent_id ? t('cat_dup_sub') : t('cat_dup')); return }
    const { error } = await supabase.from('categories').update({ name }).eq('id', c.id)
    if (error) { alert('Could not rename: ' + error.message); return }
    // keep products in sync (products store category/sub-category as text)
    if (c.parent_id) {
      const parent = (rows || []).find(x => x.id === c.parent_id)
      if (parent) await supabase.from('products').update({ subcategory: name }).eq('subcategory', c.name).eq('category', parent.name)
    } else {
      await supabase.from('products').update({ category: name }).eq('category', c.name)
    }
    setEditingId(null); load()
  }

  const remove = async (c) => {
    const sub = c.parent_id ? '' : ' and its sub-categories'
    if (!confirm(`Delete "${c.name}"${sub}?`)) return
    await supabase.from('categories').delete().eq('id', c.id); load()
  }

  const editKeys = (c) => (e) => { if (e.key === 'Enter') saveRename(c); if (e.key === 'Escape') setEditingId(null) }

  return (
    <>
      <PageHeader title={t('categories_title')} subtitle={t('categories_sub')} />

      <div className="card mb-4 flex gap-2 p-4">
        <input className="input" value={newCat} onChange={e => setNewCat(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCategory()} placeholder={t('ph_new_category')} />
        <button className="btn-primary shrink-0" onClick={addCategory}><Plus size={18} /> {t('add')}</button>
      </div>

      {rows === null ? <Spinner /> : tops.length === 0 ? (
        <EmptyState icon={Tag} title={t('es_no_categories')} hint={t('es_no_categories_h')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {tops.map(cat => (
            <div key={cat.id} className="card p-4">
              {/* main category */}
              <div className="flex items-center justify-between gap-2">
                {editingId === cat.id ? (
                  <div className="flex flex-1 items-center gap-1">
                    <input autoFocus className="input py-1.5" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={editKeys(cat)} />
                    <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => saveRename(cat)}>{t('save')}</button>
                    <button className="px-2 text-sm text-ink/40 hover:text-ink" onClick={() => setEditingId(null)}>{t('cancel')}</button>
                  </div>
                ) : (
                  <>
                    <span className="font-display text-lg text-ink">{cat.name}</span>
                    <div className="flex gap-1">
                      <button className="rounded-md p-1.5 text-ink/40 hover:bg-black/5 hover:text-ink" title={t('edit')} onClick={() => startEdit(cat)}><Pencil size={14} /></button>
                      <button className="rounded-md p-1.5 text-ink/40 hover:bg-clay/10 hover:text-clay" onClick={() => remove(cat)}><Trash2 size={15} /></button>
                    </div>
                  </>
                )}
              </div>

              {/* sub categories */}
              <div className="mt-2 space-y-1">
                {subsOf(cat.id).map(s => (
                  <div key={s.id} className="rounded-md px-2 py-1 text-sm hover:bg-sand">
                    <div className="flex items-center justify-between gap-2">
                      {editingId === s.id ? (
                        <div className="flex flex-1 items-center gap-1">
                          <input autoFocus className="input py-1" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={editKeys(s)} />
                          <button className="px-2 text-xs font-semibold text-moss-700" onClick={() => saveRename(s)}>{t('save')}</button>
                          <button className="px-1 text-xs text-ink/40 hover:text-ink" onClick={() => setEditingId(null)}>{t('cancel')}</button>
                        </div>
                      ) : (
                        <>
                          <span className="flex items-center gap-1 text-ink/70"><ChevronRight size={14} className="text-ink/30" />{s.name}</span>
                          <div className="flex items-center gap-1">
                            <button className="rounded p-1 text-ink/40 hover:text-ink" title={t('edit')} onClick={() => startEdit(s)}><Pencil size={13} /></button>
                            <button className="rounded p-1 text-ink/40 hover:text-moss-700" title={t('cat_move_to')} onClick={() => setMovingSub(movingSub === s.id ? null : s.id)}><FolderInput size={13} /></button>
                            <button className="rounded p-1 text-ink/40 hover:text-clay" onClick={() => remove(s)}><Trash2 size={13} /></button>
                          </div>
                        </>
                      )}
                    </div>
                    {movingSub === s.id && editingId !== s.id && (
                      <div className="mt-1 flex items-center gap-2 pl-5">
                        <select className="input py-1 text-xs" defaultValue="" onChange={e => moveSub(s, e.target.value)}>
                          <option value="" disabled>{t('cat_move_to')}</option>
                          {tops.filter(tc => tc.id !== cat.id).map(tc => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
                        </select>
                        <button className="text-xs text-ink/40 hover:text-ink" onClick={() => setMovingSub(null)}>{t('cancel')}</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* add sub */}
              <div className="mt-2 flex gap-2">
                <input className="input py-1.5 text-sm" value={subInputs[cat.id] || ''}
                  onChange={e => setSubInputs({ ...subInputs, [cat.id]: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && addSub(cat.id)} placeholder={t('ph_add_subcat')} />
                <button className="btn-outline shrink-0 px-3 py-1.5 text-sm" onClick={() => addSub(cat.id)}><Plus size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
