import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { payrollApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Plus, Play, Send, CheckCircle, XCircle, DollarSign,
  ChevronDown, ChevronUp, Users, Edit3, RefreshCw,
  AlertTriangle, Clock, FileText,
} from 'lucide-react'

function fmtRwf(n) {
  return 'RWF ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const STATUS = {
  draft:           { label: 'Draft',            color: '#94a3b8', bg: 'rgba(71,85,105,0.15)'  },
  processing:      { label: 'Processing',        color: '#818cf8', bg: 'rgba(99,102,241,0.15)' },
  pending_manager: { label: 'Awaiting Manager',  color: '#fbbf24', bg: 'rgba(245,158,11,0.15)' },
  pending_hr:      { label: 'Awaiting HR',       color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  approved:        { label: 'Approved',          color: '#34d399', bg: 'rgba(16,185,129,0.15)' },
  rejected:        { label: 'Rejected',          color: '#f87171', bg: 'rgba(239,68,68,0.15)'  },
  paid:            { label: 'Paid',              color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
}

export default function FinancePayroll() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showReject, setShowReject] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [form, setForm]       = useState({
    period_label: '',
    period_start: new Date().toISOString().slice(0, 8) + '01',
    period_end:   new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10),
  })
  const [error, setError] = useState('')

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['payroll', 'runs'],
    queryFn:  payrollApi.runList,
  })

  const { data: entries = [], isFetching: loadingEntries } = useQuery({
    queryKey: ['payroll', 'entries', expanded],
    queryFn:  () => payrollApi.entryList(expanded),
    enabled:  !!expanded,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['payroll'] })

  const create  = useMutation({ mutationFn: payrollApi.runCreate,  onSuccess: () => { invalidate(); setShowCreate(false) }, onError: (e) => setError(e.message) })
  const process = useMutation({ mutationFn: payrollApi.runProcess, onSuccess: invalidate })
  const submit  = useMutation({ mutationFn: payrollApi.runSubmit,  onSuccess: invalidate })
  const finalize= useMutation({ mutationFn: payrollApi.runFinalize,onSuccess: invalidate })
  const reject  = useMutation({
    mutationFn: ({ runId, reason }) => payrollApi.runReject(runId, reason),
    onSuccess: () => { invalidate(); setShowReject(null); setRejectReason('') },
  })
  const adjust  = useMutation({
    mutationFn: payrollApi.entryAdjust,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll', 'entries', expanded] }),
  })

  function handleCreate(e) {
    e.preventDefault()
    setError('')
    const payload = { ...form }
    if (!payload.period_label) payload.period_label = new Date(payload.period_start).toLocaleString('default', { month: 'long', year: 'numeric' })
    create.mutate(payload)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Payroll Runs</h1>
          <p className="text-text-muted text-sm mt-1">Create, process, and manage payroll cycles</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
        >
          <Plus size={16} /> New Run
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-md border border-white/10">
            <h3 className="text-lg font-bold text-text-primary mb-4">New Payroll Run</h3>
            {error && <p className="text-danger-400 text-sm mb-3">{error}</p>}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs text-text-muted font-medium">Period Label (optional)</label>
                <input
                  className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2 text-sm text-text-primary"
                  placeholder="e.g. June 2026"
                  value={form.period_label}
                  onChange={(e) => setForm({ ...form, period_label: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted font-medium">Start Date</label>
                  <input
                    type="date"
                    required
                    className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2 text-sm text-text-primary"
                    value={form.period_start}
                    onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-text-muted font-medium">End Date</label>
                  <input
                    type="date"
                    required
                    className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2 text-sm text-text-primary"
                    value={form.period_end}
                    onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setError('') }}
                  className="flex-1 py-2 rounded-xl border border-border-default text-sm text-text-secondary hover:bg-surface-3"
                >Cancel</button>
                <button
                  type="submit"
                  disabled={create.isPending}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                >{create.isPending ? 'Creating…' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-md border border-white/10">
            <h3 className="text-lg font-bold text-text-primary mb-4">Reject Payroll Run</h3>
            <textarea
              className="w-full bg-surface-3 border border-border-default rounded-xl px-3 py-2 text-sm text-text-primary min-h-[100px]"
              placeholder="Reason for rejection…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setShowReject(null); setRejectReason('') }}
                className="flex-1 py-2 rounded-xl border border-border-default text-sm text-text-secondary hover:bg-surface-3">Cancel</button>
              <button
                onClick={() => reject.mutate({ runId: showReject, reason: rejectReason })}
                disabled={!rejectReason.trim() || reject.isPending}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-danger-500 disabled:opacity-50"
              >{reject.isPending ? 'Rejecting…' : 'Reject'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Runs list */}
      {isLoading ? (
        <div className="text-center py-16 text-text-muted">Loading…</div>
      ) : !runs.length ? (
        <div className="text-center py-16">
          <FileText size={48} className="mx-auto mb-4 text-text-muted opacity-30" />
          <p className="text-text-muted">No payroll runs yet. Create your first run.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const sm = STATUS[run.status] ?? STATUS.draft
            const isOpen = expanded === run.id
            return (
              <div key={run.id} className="glass rounded-2xl border border-white/5 overflow-hidden">
                {/* Header row */}
                <div
                  className="flex items-center gap-4 p-5 cursor-pointer hover:bg-white/2 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : run.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="font-semibold text-text-primary">{run.period_label}</p>
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold"
                        style={{ background: sm.bg, color: sm.color }}>
                        {sm.label}
                      </span>
                      {run.employee_count > 0 && (
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <Users size={12} /> {run.employee_count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">{run.period_start} → {run.period_end}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-6 text-right">
                    <div>
                      <p className="text-[10px] text-text-muted">Net Pay</p>
                      <p className="text-sm font-bold" style={{ color: '#34d399' }}>{fmtRwf(run.total_net)}</p>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={18} className="text-text-muted" /> : <ChevronDown size={18} className="text-text-muted" />}
                </div>

                {/* Expanded */}
                {isOpen && (
                  <div className="border-t border-white/5 p-5 space-y-5">
                    {/* Rejection reason */}
                    {run.rejection_reason && (
                      <div className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 flex gap-2 text-sm">
                        <AlertTriangle size={16} className="text-danger-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-danger-400">Rejected</p>
                          <p className="text-text-muted text-xs mt-0.5">{run.rejection_reason}</p>
                        </div>
                      </div>
                    )}

                    {/* Totals */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { l: 'Gross',      v: fmtRwf(run.total_gross),       c: '#34d399' },
                        { l: 'Deductions', v: fmtRwf(run.total_deductions),  c: '#f87171' },
                        { l: 'Net Pay',    v: fmtRwf(run.total_net),          c: '#818cf8' },
                      ].map((f) => (
                        <div key={f.l} className="bg-surface-3 rounded-xl p-3 text-center">
                          <p className="text-[10px] text-text-muted uppercase">{f.l}</p>
                          <p className="text-sm font-bold mt-1" style={{ color: f.c }}>{f.v}</p>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      {run.status === 'draft' && (
                        <button
                          onClick={() => process.mutate(run.id)}
                          disabled={process.isPending}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                        >
                          <Play size={14} /> {process.isPending ? 'Processing…' : 'Process'}
                        </button>
                      )}
                      {run.status === 'rejected' && (
                        <button
                          onClick={() => process.mutate(run.id)}
                          disabled={process.isPending}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                        >
                          <RefreshCw size={14} /> Re-process
                        </button>
                      )}
                      {run.status === 'processing' && (
                        <button
                          onClick={() => submit.mutate(run.id)}
                          disabled={submit.isPending}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
                        >
                          <Send size={14} /> {submit.isPending ? 'Submitting…' : 'Submit for Approval'}
                        </button>
                      )}
                      {run.status === 'approved' && (
                        <button
                          onClick={() => finalize.mutate(run.id)}
                          disabled={finalize.isPending}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
                        >
                          <CheckCircle size={14} /> {finalize.isPending ? 'Finalizing…' : 'Finalize & Send Payslips'}
                        </button>
                      )}
                    </div>

                    {/* Entry table */}
                    {loadingEntries && expanded === run.id ? (
                      <p className="text-text-muted text-sm text-center py-4">Loading entries…</p>
                    ) : entries.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/5">
                              {['Employee','Basic','Overtime','Bonus','Gross','Deductions','Net Pay',''].map((h) => (
                                <th key={h} className="py-2 px-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {entries.map((e) => (
                              <EntryRow key={e.id} entry={e} run={run} onAdjust={(d) => adjust.mutate(d)} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EntryRow({ entry, run, onAdjust }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    overtime_hours:   entry.overtime_hours,
    bonus:            entry.bonus,
    other_deductions: entry.other_deductions,
  })

  function save() {
    onAdjust({
      entry_id:         entry.id,
      overtime_hours:   parseFloat(form.overtime_hours) || 0,
      bonus:            parseFloat(form.bonus) || 0,
      other_deductions: parseFloat(form.other_deductions) || 0,
    })
    setEditing(false)
  }

  return (
    <tr className="hover:bg-white/2 transition-colors">
      <td className="py-2.5 px-3">
        <div className="font-medium text-text-primary text-xs">{entry.full_name}</div>
        <div className="text-[10px] text-text-muted">{entry.department}</div>
      </td>
      <td className="py-2.5 px-3 text-xs text-text-secondary">
        {Number(entry.basic_salary).toLocaleString()}
      </td>
      <td className="py-2.5 px-3">
        {editing ? (
          <input
            type="number"
            min="0"
            step="0.5"
            className="w-16 bg-surface-3 border border-border-default rounded px-1 py-0.5 text-xs text-text-primary"
            value={form.overtime_hours}
            onChange={(e) => setForm({ ...form, overtime_hours: e.target.value })}
          />
        ) : (
          <span className="text-xs text-text-secondary">{entry.overtime_hours}h</span>
        )}
      </td>
      <td className="py-2.5 px-3">
        {editing ? (
          <input
            type="number"
            min="0"
            className="w-20 bg-surface-3 border border-border-default rounded px-1 py-0.5 text-xs text-text-primary"
            value={form.bonus}
            onChange={(e) => setForm({ ...form, bonus: e.target.value })}
          />
        ) : (
          <span className="text-xs text-text-secondary">{Number(entry.bonus).toLocaleString()}</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-xs font-medium" style={{ color: '#34d399' }}>
        {Number(entry.gross).toLocaleString()}
      </td>
      <td className="py-2.5 px-3 text-xs" style={{ color: '#f87171' }}>
        {Number(entry.total_deductions).toLocaleString()}
      </td>
      <td className="py-2.5 px-3 text-xs font-bold" style={{ color: '#818cf8' }}>
        {Number(entry.net_pay).toLocaleString()}
      </td>
      <td className="py-2.5 px-3">
        {run.status === 'processing' && (
          editing ? (
            <div className="flex gap-1">
              <button onClick={save} className="text-[10px] px-2 py-1 rounded bg-brand-500/20 text-brand-400 hover:bg-brand-500/30">Save</button>
              <button onClick={() => setEditing(false)} className="text-[10px] px-2 py-1 rounded bg-surface-3 text-text-muted">×</button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text-primary">
              <Edit3 size={12} />
            </button>
          )
        )}
      </td>
    </tr>
  )
}
