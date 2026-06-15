import { useState } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { FileText, Edit3, Save, ChevronDown, AlertTriangle, Shield, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { policyApi } from '@/lib/api'

export default function HRAdminPolicy() {
  const qc = useQueryClient()
  const [editId, setEditId]   = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [draftValues, setDraft] = useState({})

  const { data, isLoading } = useQuery({
    queryKey: ['policies'],
    queryFn:  policyApi.list,
    staleTime: 60_000,
    onSuccess: (rows) => {
      /* Auto-expand first policy on first load */
      if (expanded === null && rows?.length) setExpanded(rows[0].id)
    },
  })
  const policies = Array.isArray(data) ? data : []

  const saveMut = useMutation({
    mutationFn: ({ policyId, rules }) => policyApi.update(policyId, rules),
    onSuccess: (res) => {
      toast.success(`Policy saved — ${res.version ?? 'updated'}`)
      qc.invalidateQueries({ queryKey: ['policies'] })
      setEditId(null)
    },
    onError: (e) => toast.error(e.message ?? 'Save failed'),
  })

  function startEdit(policy) {
    const draft = {}
    policy.rules.forEach(r => { draft[r.id] = r.value })
    setDraft(draft)
    setEditId(policy.id)
    setExpanded(policy.id)
  }

  function savePolicy(policyId) {
    const policy = policies.find(p => p.id === policyId)
    if (!policy) return
    const rules = policy.rules
      .filter(r => r.editable)
      .map(r => ({ id: r.id, value: draftValues[r.id] ?? r.value }))
    saveMut.mutate({ policyId, rules })
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Policy Management</h1>
          <p className="text-sm text-text-muted mt-0.5">Configure company-wide HR and attendance policies</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <AlertTriangle size={12} className="text-warning-400"/>
          Changes apply to all employees immediately
        </div>
      </div>

      {isLoading && Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="glass-card h-16 animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
      ))}

      <div className="space-y-3">
        {policies.map(policy => {
          const isOpen = expanded === policy.id
          const isEdit = editId === policy.id

          return (
            <div key={policy.id} className="glass-card overflow-hidden"
              style={{ borderLeft: `3px solid ${policy.color}` }}>
              {/* Header row */}
              <div className="p-5 flex items-center justify-between cursor-pointer"
                onClick={() => setExpanded(isOpen ? null : policy.id)}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{policy.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">{policy.name}</span>
                      <span className="text-[9px] font-mono text-text-muted">{policy.version}</span>
                      <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded uppercase',
                        policy.status === 'published' ? 'text-success-400' : 'text-warning-400')}
                        style={{ background: policy.status === 'published' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)' }}>
                        {policy.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      Last updated: {policy.updated_at} · {policy.rules.length} rules
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  {isEdit ? (
                    <>
                      <Button variant="primary" size="xs" icon={saveMut.isPending ? <Loader size={11} className="animate-spin"/> : <Save size={11}/>}
                        loading={saveMut.isPending} onClick={() => savePolicy(policy.id)}>
                        Publish
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setEditId(null)} disabled={saveMut.isPending}>Cancel</Button>
                    </>
                  ) : (
                    <Button variant="outline" size="xs" icon={<Edit3 size={11}/>} onClick={() => startEdit(policy)}>
                      Edit
                    </Button>
                  )}
                  <button className="text-text-muted transition-transform duration-200"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    onClick={() => setExpanded(isOpen ? null : policy.id)}>
                    <ChevronDown size={14}/>
                  </button>
                </div>
              </div>

              {/* Rules body */}
              {isOpen && (
                <div className="px-5 pb-5 pt-0 border-t" style={{ borderColor: 'rgba(99,102,241,0.08)' }}>
                  <div className="space-y-2 mt-4">
                    {policy.rules.map(rule => (
                      <div key={rule.id}
                        className="flex items-center justify-between gap-4 p-3 rounded-xl"
                        style={{ background: 'rgba(26,34,54,0.5)', border: '1px solid rgba(99,102,241,0.07)' }}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {rule.editable
                            ? <Edit3 size={10} className="text-text-muted flex-shrink-0"/>
                            : <Shield size={10} className="text-text-muted flex-shrink-0" title="System rule — not editable"/>
                          }
                          <span className="text-xs text-text-muted truncate">{rule.label}</span>
                        </div>
                        {isEdit && rule.editable ? (
                          <input
                            value={draftValues[rule.id] ?? rule.value}
                            onChange={e => setDraft(d => ({ ...d, [rule.id]: e.target.value }))}
                            className="px-2 py-1 rounded-lg text-xs border text-text-primary outline-none focus:border-brand-500 w-40 text-right"
                            style={{ background: 'rgba(15,20,40,0.8)', borderColor: 'rgba(99,102,241,0.25)' }}
                          />
                        ) : (
                          <span className="text-xs font-semibold text-right flex-shrink-0"
                            style={{ color: rule.editable ? '#e2e8f0' : '#64748b' }}>
                            {rule.value}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {isEdit && (
                    <div className="mt-4 p-3 rounded-xl"
                      style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
                      <p className="text-[10px] text-warning-400 leading-relaxed">
                        Saving will publish a new version and notify all affected employees.
                        System rules (🔒) cannot be modified through the UI.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
