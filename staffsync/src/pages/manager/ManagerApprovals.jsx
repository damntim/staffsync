import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  CheckSquare, ThumbsUp, ThumbsDown, Clock, Search,
  Calendar, AlertTriangle, MessageSquare, ChevronDown, Loader,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useLeaveList, useApproveLeave, useRejectLeave, useLeaveBalance } from '@/hooks/useLeave'

const TYPE_CFG = {
  annual:         { label: 'Annual',   color: '#6366f1' },
  sick:           { label: 'Sick',     color: '#10b981' },
  casual:         { label: 'Casual',   color: '#a78bfa' },
  maternity:      { label: 'Maternity',color: '#f472b6' },
  paternity:      { label: 'Paternity',color: '#38bdf8' },
  unpaid:         { label: 'Unpaid',   color: '#94a3b8' },
  other:          { label: 'Other',    color: '#818cf8' },
  regularisation: { label: 'Reg.',     color: '#06b6d4' },
}

const STATUS_CFG = {
  pending:   { label: 'Pending',   color: '#fbbf24' },
  approved:  { label: 'Approved',  color: '#10b981' },
  rejected:  { label: 'Rejected',  color: '#ef4444' },
  cancelled: { label: 'Cancelled', color: '#475569' },
}

function BalanceContext({ userId, leaveType }) {
  const { data, isLoading } = useLeaveBalance(userId)
  const balances = Array.isArray(data) ? data : []
  const bal = balances.find(b => b.type === leaveType)

  if (leaveType === 'regularisation') return null

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[0,1,2].map(i => (
          <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
        ))}
      </div>
    )
  }

  if (!bal) return null

  const entitlement = Number(bal.entitlement ?? 0)
  const used        = Number(bal.used        ?? 0)
  const remaining   = Number(bal.balance     ?? 0)

  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: 'Entitlement', value: `${entitlement} days` },
        { label: 'Used',        value: `${used} days`        },
        { label: 'Remaining',   value: `${remaining} days`,  highlight: remaining < 3 },
      ].map(b => (
        <div key={b.label} className="text-center p-2 rounded-xl"
          style={{ background: 'rgba(26,34,54,0.4)', border: `1px solid ${b.highlight ? 'rgba(245,158,11,0.25)' : 'rgba(99,102,241,0.08)'}` }}>
          <div className="text-sm font-bold" style={{ color: b.highlight ? '#fbbf24' : '#e2e8f0' }}>{b.value}</div>
          <div className="text-[9px] text-text-muted">{b.label}</div>
        </div>
      ))}
    </div>
  )
}

export default function ManagerApprovals() {
  const [filter, setFilter]         = useState('pending')
  const [search, setSearch]         = useState('')
  const [expanded, setExpanded]     = useState(null)
  const [commentMap, setCommentMap] = useState({})

  const { data, isLoading } = useLeaveList()
  const approveLeave = useApproveLeave()
  const rejectLeave  = useRejectLeave()

  const items = Array.isArray(data) ? data : []

  const pendingItems = items.filter(i => i.status === 'pending')

  const visible = items.filter(i => {
    if (filter !== 'all' && i.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(i.full_name ?? '').toLowerCase().includes(q) &&
          !(i.type      ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  function act(id, action) {
    const comment = commentMap[id] ?? ''
    if (action === 'approve') {
      approveLeave.mutate({ id, comment }, { onSuccess: () => setExpanded(null) })
    } else {
      if (!comment.trim()) return toast.error('Please add a rejection reason')
      rejectLeave.mutate({ id, comment }, { onSuccess: () => setExpanded(null) })
    }
  }

  async function bulkApprove() {
    for (const item of pendingItems) {
      approveLeave.mutate({ id: item.id, comment: '' })
      await new Promise(r => setTimeout(r, 80))
    }
    toast.success(`${pendingItems.length} requests approved`)
  }

  function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function initials(name = '') {
    return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || '??'
  }

  const counts = {
    pending:  items.filter(i => i.status === 'pending').length,
    approved: items.filter(i => i.status === 'approved').length,
    rejected: items.filter(i => i.status === 'rejected').length,
  }

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Approvals Queue</h1>
          <p className="text-sm text-text-muted mt-0.5">Leave and regularisation requests from your team</p>
        </div>
        {counts.pending > 0 && (
          <Button variant="primary" size="sm" onClick={bulkApprove}
            icon={approveLeave.isPending ? <Loader size={13} className="animate-spin" /> : undefined}>
            Approve All Pending ({counts.pending})
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pending',  val: counts.pending,  color: '#fbbf24' },
          { label: 'Approved', val: counts.approved, color: '#10b981' },
          { label: 'Rejected', val: counts.rejected, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} className="glass-card p-4 text-center">
            <div className="text-2xl font-black mb-0.5" style={{ color: s.color }}>
              {isLoading ? '—' : s.val}
            </div>
            <div className="text-xs text-text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter + search */}
      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'pending',  label: 'Pending',  count: counts.pending  },
              { key: 'approved', label: 'Approved', count: counts.approved },
              { key: 'rejected', label: 'Rejected', count: counts.rejected },
              { key: 'all',      label: 'All',      count: items.length    },
            ].map(f => {
              const cfg    = STATUS_CFG[f.key] ?? { color: '#818cf8' }
              const active = filter === f.key
              return (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200"
                  style={{
                    background:  active ? cfg.color + '18' : 'rgba(26,34,54,0.5)',
                    borderColor: active ? cfg.color + '45' : 'rgba(99,102,241,0.12)',
                    color:       active ? cfg.color : '#94a3b8',
                  }}>
                  {f.label}
                  <span className="w-4 h-4 rounded text-[9px] font-black flex items-center justify-center"
                    style={{ background: active ? cfg.color + '28' : 'rgba(99,102,241,0.1)', color: active ? cfg.color : '#818cf8' }}>
                    {f.count}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or type…"
              className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-transparent border text-text-primary placeholder-text-muted outline-none focus:border-brand-500 transition-colors"
              style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }}
            />
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-card h-20 animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
        ))}

        {!isLoading && visible.length === 0 && (
          <div className="glass-card p-10 text-center">
            <CheckSquare size={32} className="mx-auto text-text-muted mb-3 opacity-40" />
            <p className="text-sm text-text-muted">No requests match this filter</p>
          </div>
        )}

        {visible.map(req => {
          const isOpen  = expanded === req.id
          const typeCfg = TYPE_CFG[req.type]    ?? { label: req.type,   color: '#818cf8' }
          const stCfg   = STATUS_CFG[req.status] ?? { label: req.status, color: '#94a3b8' }
          const comment = commentMap[req.id] ?? ''
          const isPending = req.status === 'pending'
          const actionPending = approveLeave.isPending || rejectLeave.isPending

          return (
            <div key={req.id} className="glass-card overflow-hidden transition-all duration-300">
              {/* Main row */}
              <div className="p-4 flex items-center gap-3 cursor-pointer select-none"
                onClick={() => setExpanded(isOpen ? null : req.id)}>

                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: typeCfg.color + '15', color: typeCfg.color, border: `1px solid ${typeCfg.color}25` }}>
                  {initials(req.full_name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text-primary">{req.full_name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                      style={{ background: typeCfg.color + '15', color: typeCfg.color }}>
                      {typeCfg.label}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                      style={{ background: stCfg.color + '15', color: stCfg.color }}>
                      {stCfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-text-muted flex-wrap">
                    <span className="flex items-center gap-1"><Calendar size={9}/>{fmtDate(req.start_date)} → {fmtDate(req.end_date)}</span>
                    {req.days > 0 && <span>{req.days} day{req.days > 1 ? 's' : ''}</span>}
                    <span className="flex items-center gap-1"><Clock size={9}/>{fmtDate(req.created_at)}</span>
                    <span>{req.employee_id}</span>
                    {req.department && <span>· {req.department}</span>}
                  </div>
                </div>

                {isPending && (
                  <div className="flex gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => act(req.id, 'approve')}
                      disabled={actionPending}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:scale-105 disabled:opacity-50"
                      style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
                      {approveLeave.isPending ? <div className="w-3 h-3 border border-success-400 border-t-transparent rounded-full animate-spin"/> : <ThumbsUp size={10}/>}
                      OK
                    </button>
                    <button
                      onClick={() => setExpanded(isOpen ? null : req.id)}
                      disabled={actionPending}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:scale-105 disabled:opacity-50"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.22)' }}>
                      <ThumbsDown size={10}/> Reject
                    </button>
                  </div>
                )}

                <span className="flex-shrink-0 text-text-muted transition-transform duration-200"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
                  <ChevronDown size={14} />
                </span>
              </div>

              {/* Expanded */}
              {isOpen && (
                <div className="px-4 pb-4 pt-0 border-t" style={{ borderColor: 'rgba(99,102,241,0.1)' }}>
                  <div className="pt-4 space-y-4">
                    {/* Reason */}
                    <div className="p-3 rounded-xl" style={{ background: 'rgba(26,34,54,0.5)', border: '1px solid rgba(99,102,241,0.08)' }}>
                      <div className="text-[10px] text-text-muted mb-1">Employee's reason</div>
                      <p className="text-xs text-text-secondary">{req.reason}</p>
                    </div>

                    {/* Reviewer comment (if already decided) */}
                    {req.comment && !isPending && (
                      <div className="p-3 rounded-xl" style={{ background: 'rgba(26,34,54,0.4)', border: '1px solid rgba(99,102,241,0.08)' }}>
                        <div className="text-[10px] text-text-muted mb-1">Manager's comment</div>
                        <p className="text-xs italic text-text-secondary">"{req.comment}"</p>
                      </div>
                    )}

                    {/* Real leave balance */}
                    <BalanceContext userId={req.user_id} leaveType={req.type} />

                    {/* Actions for pending */}
                    {isPending && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <MessageSquare size={11} className="text-text-muted" />
                          <span className="text-[10px] text-text-muted">Comment / rejection reason</span>
                        </div>
                        <textarea
                          value={comment}
                          onChange={e => setCommentMap(m => ({ ...m, [req.id]: e.target.value }))}
                          placeholder="Reason for decision…"
                          rows={2}
                          className="w-full px-3 py-2 rounded-xl text-xs bg-transparent border text-text-primary placeholder-text-muted outline-none focus:border-brand-500 resize-none transition-colors"
                          style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }}
                        />
                        <div className="flex gap-2 mt-3">
                          <Button variant="primary" size="sm" icon={<ThumbsUp size={12}/>}
                            disabled={actionPending}
                            onClick={() => act(req.id, 'approve')}>
                            {approveLeave.isPending ? 'Approving…' : 'Approve'}
                          </Button>
                          <Button variant="danger" size="sm" icon={<ThumbsDown size={12}/>}
                            disabled={actionPending}
                            onClick={() => act(req.id, 'reject')}>
                            {rejectLeave.isPending ? 'Rejecting…' : 'Reject'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
