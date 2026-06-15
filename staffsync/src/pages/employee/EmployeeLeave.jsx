import { useState, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Calendar, Plus, X, CheckCircle, Clock, XCircle, FileText, Upload, Loader, Paperclip } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLeaveBalance, useLeaveTypes, useMyLeaves, useApplyLeave, useCancelLeave } from '@/hooks/useLeave'

const BALANCE_COLORS = ['#6366f1', '#22d3ee', '#a78bfa', '#10b981', '#fbbf24', '#f87171']

const STATUS_CFG = {
  pending:   { label: 'Pending',   color: '#fbbf24', icon: Clock       },
  approved:  { label: 'Approved',  color: '#10b981', icon: CheckCircle },
  rejected:  { label: 'Rejected',  color: '#ef4444', icon: XCircle     },
  cancelled: { label: 'Cancelled', color: '#475569', icon: X           },
}

export default function EmployeeLeave() {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ type: '', start_date: '', end_date: '', reason: '' })
  const [file, setFile]         = useState(null)
  const [cancelId, setCancelId] = useState(null)
  const fileRef                 = useRef(null)

  const { data: balanceData, isLoading: balLoading } = useLeaveBalance()
  const { data: typesData }                           = useLeaveTypes()
  const { data: myLeaves,  isLoading: leaveLoading } = useMyLeaves()
  const applyLeave  = useApplyLeave()
  const cancelLeave = useCancelLeave()

  const leaveTypes = Array.isArray(typesData) ? typesData : []
  const balances   = Array.isArray(balanceData) ? balanceData : []
  const requests   = Array.isArray(myLeaves)   ? myLeaves   : []

  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedType = leaveTypes.find(t => t.name === form.type) ?? null

  const calcDays = () => {
    if (!form.start_date || !form.end_date) return 0
    let count = 0
    let cur   = new Date(form.start_date)
    const end = new Date(form.end_date)
    while (cur <= end) {
      const dow = cur.getDay()
      if (dow !== 0 && dow !== 6) count++
      cur.setDate(cur.getDate() + 1)
    }
    return count
  }

  function resetForm() {
    setForm({ type: '', start_date: '', end_date: '', reason: '' })
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setShowForm(false)
  }

  function handleApply(e) {
    e.preventDefault()
    if (!form.type)          return toast.error('Select a leave type')
    if (!form.start_date)    return toast.error('Select a start date')
    if (!form.end_date)      return toast.error('Select an end date')
    if (!form.reason.trim()) return toast.error('Please provide a reason')
    if (selectedType?.requires_document == '1' && !file) {
      return toast.error('A supporting document is required for this leave type')
    }

    applyLeave.mutate({ data: form, file }, {
      onSuccess: resetForm,
    })
  }

  function handleCancel(id) {
    cancelLeave.mutate(id, { onSuccess: () => setCancelId(null) })
  }

  const days = calcDays()

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Leave Management</h1>
          <p className="text-sm text-text-muted mt-0.5">Apply for leave, track balances and history</p>
        </div>
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowForm(true)}>
          Apply for Leave
        </Button>
      </div>

      {/* Apply modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(6,9,18,0.8)', backdropFilter: 'blur(8px)' }}
          onClick={resetForm}>
          <div className="w-full max-w-lg glass-strong rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(99,102,241,0.25)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10"
              style={{ borderColor: 'rgba(99,102,241,0.15)', background: 'rgba(13,17,23,0.98)' }}>
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-brand-400" />
                <h2 className="font-semibold text-text-primary">Apply for Leave</h2>
              </div>
              <button onClick={resetForm}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-4 transition-all">
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleApply} className="p-6 space-y-4">
              {/* Leave type */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">
                  Leave Type
                </label>
                <select
                  value={form.type}
                  onChange={e => { up('type', e.target.value); setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-text-primary outline-none border transition-all"
                  style={{
                    background: 'rgba(26,34,54,0.8)',
                    borderColor: form.type ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.2)',
                    color: form.type ? 'inherit' : '#64748b',
                  }}
                  required>
                  <option value="" disabled style={{ color: '#64748b', background: '#0d1117' }}>— Select type —</option>
                  {leaveTypes.map(t => (
                    <option key={t.id} value={t.name} style={{ background: '#0d1117', color: '#e2e8f0' }}>
                      {t.name}{t.requires_document == '1' ? ' *' : ''}
                    </option>
                  ))}
                </select>
                {leaveTypes.length === 0 && (
                  <p className="text-[10px] text-text-muted mt-1">Loading types…</p>
                )}
                {selectedType?.requires_document == '1' && (
                  <p className="text-[10px] text-amber-400 mt-1">* Supporting document required for this leave type</p>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <Input label="Start Date" type="date" value={form.start_date} onChange={e => up('start_date', e.target.value)} />
                <Input label="End Date"   type="date" value={form.end_date}   onChange={e => up('end_date',   e.target.value)} />
              </div>

              {/* Day count pill */}
              {days > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
                  style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)' }}>
                  <Calendar size={13} className="text-brand-400" />
                  <span className="text-text-secondary">
                    <span className="font-bold text-brand-400">{days}</span> working day{days !== 1 ? 's' : ''} requested
                  </span>
                </div>
              )}

              {/* Reason */}
              <Textarea label="Reason" placeholder="Brief reason for leave…" rows={3}
                value={form.reason} onChange={e => up('reason', e.target.value)} />

              {/* Document upload — always visible, required when type demands it */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">
                  Supporting Document{selectedType?.requires_document == '1' ? <span className="text-danger-400 ml-1">*</span> : <span className="text-text-muted ml-1">(optional)</span>}
                </label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-3 p-3.5 rounded-xl border border-dashed cursor-pointer transition-all"
                  style={{
                    borderColor: file ? 'rgba(99,102,241,0.5)' : selectedType?.requires_document == '1' ? 'rgba(251,191,36,0.35)' : 'rgba(99,102,241,0.2)',
                    background:  file ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.03)',
                  }}>
                  {file
                    ? <Paperclip size={14} className="text-brand-400 flex-shrink-0" />
                    : <Upload size={14} className="text-text-muted flex-shrink-0" />}
                  <span className="text-xs text-text-muted truncate flex-1">
                    {file ? file.name : 'Click to upload PDF, JPG or PNG (max 5 MB)'}
                  </span>
                  {file && (
                    <button type="button" onClick={e => { e.stopPropagation(); setFile(null); fileRef.current.value = '' }}
                      className="text-text-muted hover:text-danger-400 transition-colors">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="ghost" fullWidth type="button" onClick={resetForm}>Cancel</Button>
                <Button variant="primary" fullWidth type="submit"
                  icon={applyLeave.isPending ? <Loader size={13} className="animate-spin" /> : undefined}>
                  {applyLeave.isPending ? 'Submitting…' : 'Submit Request'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel confirm modal */}
      {cancelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(6,9,18,0.8)', backdropFilter: 'blur(4px)' }}
          onClick={() => setCancelId(null)}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-text-primary">Cancel Leave Request?</h3>
            <p className="text-xs text-text-muted">This will withdraw your leave request. HR will be notified.</p>
            <div className="flex gap-2">
              <Button variant="danger" fullWidth size="sm"
                icon={cancelLeave.isPending ? <Loader size={13} className="animate-spin" /> : undefined}
                onClick={() => handleCancel(cancelId)}>
                {cancelLeave.isPending ? 'Cancelling…' : 'Yes, cancel it'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCancelId(null)}>Keep it</Button>
            </div>
          </div>
        </div>
      )}

      {/* Balance cards */}
      {balLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card p-4 h-28 animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
          ))}
        </div>
      ) : balances.length === 0 ? (
        <div className="glass-card p-6 text-center text-xs text-text-muted">No leave balances found</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {balances.map((b, idx) => {
            const total = Number(b.entitlement ?? b.total_days ?? 0)
            const taken = Number(b.used ?? b.days_taken ?? 0)
            const avail = Number(b.remaining ?? (total - taken))
            const pct   = total > 0 ? Math.min((taken / total) * 100, 100) : 0
            const color = BALANCE_COLORS[idx % BALANCE_COLORS.length]
            return (
              <div key={b.id ?? b.leave_type ?? idx} className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-text-secondary truncate">{b.leave_type ?? b.type}</span>
                  <span className="text-xs font-bold flex-shrink-0 ml-1" style={{ color }}>{avail} left</span>
                </div>
                <div className="text-2xl font-black mb-1" style={{ color }}>{avail}</div>
                <div className="text-[10px] text-text-muted mb-2">of {total} days</div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}60` }} />
                </div>
                <div className="text-[9px] text-text-muted mt-1">{taken} taken</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Request history */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <FileText size={15} className="text-brand-400" /> Leave History
          </h2>
          {!leaveLoading && (
            <span className="text-xs text-text-muted">{requests.length} request{requests.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {leaveLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="py-8 text-center">
            <Calendar size={28} className="mx-auto text-text-muted mb-2" />
            <p className="text-xs text-text-muted">No leave requests yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => {
              const status = (req.status ?? 'pending').toLowerCase()
              const cfg = STATUS_CFG[status] ?? { label: status, color: '#94a3b8', icon: Clock }
              const StatusIcon = cfg.icon
              const reqDays = req.days ?? '?'
              return (
                <div key={req.id}
                  className="flex items-start gap-4 p-4 rounded-xl border transition-all duration-200 hover:border-brand-500/20"
                  style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.1)' }}>
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                      <Calendar size={16} className="text-brand-400" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-text-primary">{req.type}</span>
                      <span className="text-xs text-text-muted">&middot; {reqDays} day{reqDays != 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-xs text-text-muted mb-1.5">{req.reason}</p>
                    <div className="flex items-center gap-3 text-xs text-text-muted flex-wrap">
                      <span>{req.start_date} → {req.end_date}</span>
                    </div>
                    {req.comment && (
                      <p className="text-[10px] text-text-muted mt-1 italic">"{req.comment}"</p>
                    )}
                    {req.document_path && (
                      <a
                        href={`/uploads/${req.document_path}`}
                        target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300 mt-1 transition-colors">
                        <Paperclip size={10} /> View document
                      </a>
                    )}
                  </div>

                  <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                      style={{ background: cfg.color + '18', color: cfg.color, border: `1px solid ${cfg.color}30` }}>
                      <StatusIcon size={10} />
                      {cfg.label}
                    </span>
                    {status === 'pending' && (
                      <button onClick={() => setCancelId(req.id)}
                        className="text-[10px] text-danger-400 hover:text-danger-300 transition-colors">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
