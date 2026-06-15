import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leaveApi } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Calendar, CheckCircle, XCircle, Search, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

const STATUS_CFG = {
  SUBMITTED: { label: 'Pending',   color: '#f59e0b' },
  APPROVED:  { label: 'Approved',  color: '#10b981' },
  REJECTED:  { label: 'Rejected',  color: '#ef4444' },
  CANCELLED: { label: 'Cancelled', color: '#475569' },
}

export default function HROfficerLeave() {
  const qc = useQueryClient()
  const [status,   setStatus]   = useState('SUBMITTED')
  const [search,   setSearch]   = useState('')
  const [note,     setNote]     = useState({})
  const [expanded, setExpanded] = useState(null)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['leave','list','officer', status],
    queryFn:  () => leaveApi.list({ status, limit: 100 }),
    staleTime: 30_000,
  })

  const approveMut = useMutation({
    mutationFn: ({ id }) => leaveApi.approve(id, note[id] ?? ''),
    onSuccess: () => { toast.success('Leave approved'); qc.invalidateQueries({ queryKey: ['leave'] }) },
    onError:   (e) => toast.error(e.message),
  })
  const rejectMut = useMutation({
    mutationFn: ({ id }) => leaveApi.reject(id, note[id] ?? 'Declined by HR'),
    onSuccess: () => { toast.success('Leave rejected'); qc.invalidateQueries({ queryKey: ['leave'] }) },
    onError:   (e) => toast.error(e.message),
  })

  const requests = Array.isArray(raw?.requests ?? raw) ? (raw?.requests ?? raw) : []
  const filtered  = requests.filter(r =>
    !search || (r.full_name ?? r.employee_name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Leave Queue</h1>
          <p className="text-sm text-text-muted mt-0.5">Review and action employee leave requests</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}>
          <Calendar size={12} /> {filtered.length} request{filtered.length !== 1 ? 's' : ''}
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
        <div className="flex gap-2 flex-wrap">
          {Object.entries(STATUS_CFG).map(([s, cfg]) => (
            <button key={s} onClick={() => setStatus(s)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all', status === s ? '' : 'opacity-60 hover:opacity-100')}
              style={{ background: status === s ? cfg.color+'18' : 'transparent', borderColor: cfg.color+(status === s ? '50' : '25'), color: cfg.color }}>
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Request list */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({length:3}).map((_,i) => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />)
        ) : filtered.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <CheckCircle size={32} className="mx-auto text-success-400 mb-3" />
            <p className="text-sm font-medium text-success-400">No {STATUS_CFG[status]?.label.toLowerCase()} requests</p>
          </div>
        ) : (
          filtered.map(r => {
            const cfg  = STATUS_CFG[r.status] ?? STATUS_CFG.SUBMITTED
            const open = expanded === r.id
            const days = daysBetween(r.start_date, r.end_date)
            return (
              <div key={r.id} className="glass-card overflow-hidden">
                <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpanded(open ? null : r.id)}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: '#6366f118', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
                    {initials(r.full_name ?? r.employee_name ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-text-primary">{r.full_name ?? r.employee_name}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>{r.leave_type ?? 'Leave'}</span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {r.start_date?.slice(0,10)} → {r.end_date?.slice(0,10)} · <span className="text-text-secondary font-medium">{days} day{days !== 1 ? 's' : ''}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: cfg.color+'18', color: cfg.color }}>{cfg.label}</span>
                    <ChevronDown size={14} className={cn('text-text-muted transition-transform', open && 'rotate-180')} />
                  </div>
                </button>
                {open && (
                  <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'rgba(99,102,241,0.1)' }}>
                    <div className="pt-3 grid grid-cols-2 gap-3 text-xs">
                      <div><span className="text-text-muted">Employee ID</span><p className="text-text-secondary font-medium mt-0.5">{r.employee_id ?? '—'}</p></div>
                      <div><span className="text-text-muted">Department</span><p className="text-text-secondary font-medium mt-0.5">{r.department ?? '—'}</p></div>
                      <div><span className="text-text-muted">Submitted</span><p className="text-text-secondary font-medium mt-0.5">{r.created_at?.slice(0,10) ?? '—'}</p></div>
                      <div><span className="text-text-muted">Duration</span><p className="text-text-secondary font-medium mt-0.5">{days} day{days !== 1 ? 's' : ''}</p></div>
                    </div>
                    {r.reason && (
                      <div className="p-3 rounded-xl text-xs text-text-muted leading-relaxed"
                        style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.1)' }}>
                        <span className="text-text-secondary font-medium block mb-1">Reason:</span>{r.reason}
                      </div>
                    )}
                    {r.status === 'SUBMITTED' && (
                      <div className="space-y-2">
                        <textarea value={note[r.id] ?? ''} onChange={e => setNote(p => ({ ...p, [r.id]: e.target.value }))}
                          placeholder="Add note (optional)…" rows={2}
                          className="w-full px-3 py-2 rounded-xl text-xs bg-transparent border text-text-primary placeholder:text-text-muted outline-none resize-none focus:border-brand-500"
                          style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(26,34,54,0.4)' }} />
                        <div className="flex gap-2">
                          <Button variant="primary" size="sm" className="flex-1"
                            onClick={() => approveMut.mutate({ id: r.id })} loading={approveMut.isPending}
                            icon={<CheckCircle size={13} />}>Approve</Button>
                          <Button variant="danger" size="sm" className="flex-1"
                            onClick={() => rejectMut.mutate({ id: r.id })} loading={rejectMut.isPending}
                            icon={<XCircle size={13} />}>Reject</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function initials(name) { return (name ?? '').split(' ').map(p => p[0]).join('').toUpperCase().slice(0,2) }
function daysBetween(a, b) {
  if (!a || !b) return 1
  return Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000) + 1)
}
