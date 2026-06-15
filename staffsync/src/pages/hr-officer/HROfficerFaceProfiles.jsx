import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi, faceApi } from '@/lib/api'
import { cn } from '@/lib/cn'
import { ScanFace, Search, Trash2, AlertTriangle, CheckCircle, Shield } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

export default function HROfficerFaceProfiles() {
  const qc = useQueryClient()
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')   // all | enrolled | missing
  const [confirm, setConfirm] = useState(null)

  const { data: usersRaw, isLoading } = useQuery({
    queryKey: ['users','list','face-officer'],
    queryFn:  () => usersApi.list({ limit: 200 }),
    staleTime: 120_000,
  })

  const { data: faceList } = useQuery({
    queryKey: ['face','list'],
    queryFn:  faceApi.list,
    staleTime: 120_000,
  })

  const deleteMut = useMutation({
    mutationFn: (userId) => faceApi.delete(userId),
    onSuccess: () => {
      toast.success('Face data deleted')
      setConfirm(null)
      qc.invalidateQueries({ queryKey: ['face'] })
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const users   = Array.isArray(usersRaw?.users ?? usersRaw) ? (usersRaw?.users ?? usersRaw) : []
  const faceMap = new Set(Array.isArray(faceList) ? faceList.map(f => f.user_id) : [])

  const filtered = users.filter(u => {
    const enrolled = u.face_enrolled || faceMap.has(u.id)
    const matchSearch = !search || u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || (filter === 'enrolled' && enrolled) || (filter === 'missing' && !enrolled)
    return matchSearch && matchFilter
  })

  const enrolledCount = users.filter(u => u.face_enrolled || faceMap.has(u.id)).length
  const missingCount  = users.length - enrolledCount
  const pct = users.length > 0 ? Math.round((enrolledCount / users.length) * 100) : 0

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Face Profiles</h1>
        <p className="text-sm text-text-muted mt-0.5">Manage biometric enrollment status</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Enrolled',    val: enrolledCount, color: '#6366f1', icon: ScanFace    },
          { label: 'Not enrolled', val: missingCount, color: '#f59e0b', icon: AlertTriangle },
          { label: 'Coverage',    val: `${pct}%`,     color: '#10b981', icon: CheckCircle },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="glass-card p-4 text-center">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center mx-auto mb-2"
                style={{ background: s.color+'15', border: `1px solid ${s.color}25` }}>
                <Icon size={15} style={{ color: s.color }} />
              </div>
              <div className="text-xl font-black mb-0.5" style={{ color: s.color }}>{s.val}</div>
              <div className="text-[10px] text-text-muted">{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* Enrollment donut + bar */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-6">
          <div className="relative w-24 h-24 flex-shrink-0">
            <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
              <circle cx="40" cy="40" r="30" fill="none" stroke="rgba(99,102,241,0.08)" strokeWidth="8" />
              <circle cx="40" cy="40" r="30" fill="none" stroke="#6366f1" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={2*Math.PI*30}
                strokeDashoffset={2*Math.PI*30*(1 - pct/100)}
                style={{ filter: 'drop-shadow(0 0 6px rgba(99,102,241,0.5))', transition: 'stroke-dashoffset 1s ease' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-base font-black text-brand-400">{pct}%</span>
              <span className="text-[9px] text-text-muted">enrolled</span>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Biometric Coverage</h3>
            {missingCount > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-xl mb-3"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertTriangle size={13} className="text-warning-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-warning-400">{missingCount} employee{missingCount > 1 ? 's have' : ' has'} not enrolled yet. Send them a reminder to complete face enrollment.</p>
              </div>
            )}
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#6366f1,#22d3ee)', boxShadow: '0 0 8px rgba(99,102,241,0.4)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…"
            className="w-full pl-8 pr-3 py-2 rounded-xl text-sm bg-transparent border text-text-primary placeholder:text-text-muted outline-none focus:border-brand-500"
            style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(26,34,54,0.4)' }} />
        </div>
        <div className="flex gap-2">
          {[['all','All'],['enrolled','Enrolled'],['missing','Missing']].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all', filter === v ? '' : 'opacity-60 hover:opacity-100')}
              style={{
                background: filter === v ? 'rgba(99,102,241,0.18)' : 'transparent',
                borderColor: filter === v ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.2)',
                color: '#818cf8',
              }}>{l}</button>
          ))}
        </div>
      </div>

      {/* User list */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({length:4}).map((_,i) => <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />)
        ) : filtered.length === 0 ? (
          <div className="glass-card p-10 text-center text-text-muted text-xs">No employees found</div>
        ) : (
          filtered.map(u => {
            const enrolled = u.face_enrolled || faceMap.has(u.id)
            return (
              <div key={u.id} className="glass-card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: (enrolled ? '#6366f1' : '#475569')+'18', color: enrolled ? '#818cf8' : '#64748b', border: `1px solid ${enrolled ? 'rgba(99,102,241,0.2)' : 'rgba(71,85,105,0.2)'}` }}>
                  {u.full_name.split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{u.full_name}</span>
                    {!u.is_active && <span className="text-[9px] px-1.5 py-0.5 rounded text-danger-400" style={{ background: 'rgba(239,68,68,0.1)' }}>Inactive</span>}
                  </div>
                  <p className="text-xs text-text-muted">{u.employee_id} · {u.department ?? u.role}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: (enrolled ? '#10b981' : '#f59e0b')+'18', color: enrolled ? '#10b981' : '#f59e0b' }}>
                    {enrolled ? <><CheckCircle size={10} /> Enrolled</> : <><AlertTriangle size={10} /> Missing</>}
                  </div>
                  {enrolled && (
                    <button onClick={() => setConfirm(u)} title="Delete face data"
                      className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                      <Trash2 size={12} className="text-danger-400" />
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Confirm delete modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="glass-card p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <Shield size={18} className="text-danger-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary">Delete Face Data</h3>
                <p className="text-xs text-text-muted">This cannot be undone</p>
              </div>
            </div>
            <p className="text-xs text-text-muted">
              Delete biometric data for <span className="text-text-secondary font-semibold">{confirm.full_name}</span>? They will need to re-enroll before their next check-in.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button variant="danger" size="sm" className="flex-1" loading={deleteMut.isPending}
                icon={<Trash2 size={13}/>} onClick={() => deleteMut.mutate(confirm.id)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
