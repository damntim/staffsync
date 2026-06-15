import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { payrollApi } from '@/lib/api'
import {
  CheckCircle, XCircle, FileText, Users, DollarSign, AlertTriangle,
} from 'lucide-react'

function fmtRwf(n) {
  return 'RWF ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function ManagerPayrollApproval() {
  const qc = useQueryClient()
  const [rejectingId, setRejectingId] = useState(null)
  const [reason, setReason]           = useState('')

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['payroll', 'runs'],
    queryFn:  payrollApi.runList,
    refetchInterval: 30_000,
  })

  const pendingRuns = runs.filter((r) => r.status === 'pending_manager')

  const approve = useMutation({
    mutationFn: payrollApi.runApprove,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['payroll', 'runs'] }),
  })

  const reject = useMutation({
    mutationFn: ({ runId, reason: r }) => payrollApi.runReject(runId, r),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['payroll', 'runs'] }); setRejectingId(null); setReason('') },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Payroll Approval</h1>
        <p className="text-text-muted text-sm mt-1">Review and approve payroll runs submitted by Finance</p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-text-muted">Loading…</div>
      ) : !pendingRuns.length ? (
        <div className="text-center py-16">
          <CheckCircle size={48} className="mx-auto mb-4 text-emerald-400 opacity-40" />
          <p className="text-text-muted">No payroll runs awaiting your approval.</p>
          <p className="text-xs text-text-muted mt-1 opacity-60">You'll see them here when Finance submits a run.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingRuns.map((run) => (
            <div key={run.id} className="glass rounded-2xl border border-amber-400/20 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5" style={{ background: 'rgba(245,158,11,0.06)' }}>
                <AlertTriangle size={14} style={{ color: '#fbbf24' }} />
                <span className="text-sm font-semibold text-amber-400">Awaiting Your Approval</span>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-lg font-bold text-text-primary">{run.period_label}</p>
                    <p className="text-xs text-text-muted">{run.period_start} → {run.period_end}</p>
                    {run.created_by_name && (
                      <p className="text-xs text-text-muted mt-0.5">Created by: {run.created_by_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-text-muted" />
                    <span className="text-sm text-text-secondary">{run.employee_count} employees</span>
                  </div>
                </div>

                {/* Financials */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { l: 'Gross Pay',    v: fmtRwf(run.total_gross),       c: '#34d399' },
                    { l: 'Deductions',   v: fmtRwf(run.total_deductions),  c: '#f87171' },
                    { l: 'Net Pay',      v: fmtRwf(run.total_net),          c: '#818cf8' },
                  ].map((f) => (
                    <div key={f.l} className="bg-surface-3 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-text-muted uppercase">{f.l}</p>
                      <p className="text-sm font-bold mt-1" style={{ color: f.c }}>{f.v}</p>
                    </div>
                  ))}
                </div>

                {/* Reject form */}
                {rejectingId === run.id && (
                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      className="w-full bg-surface-3 border border-border-default rounded-xl px-3 py-2 text-sm text-text-primary resize-none"
                      placeholder="Reason for rejection…"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setRejectingId(null); setReason('') }}
                        className="px-3 py-1.5 rounded-lg text-xs border border-border-default text-text-secondary hover:bg-surface-3">Cancel</button>
                      <button
                        onClick={() => reject.mutate({ runId: run.id, reason })}
                        disabled={!reason.trim() || reject.isPending}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-danger-500 disabled:opacity-50"
                      >{reject.isPending ? 'Rejecting…' : 'Confirm Reject'}</button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {rejectingId !== run.id && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => approve.mutate(run.id)}
                      disabled={approve.isPending}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
                    >
                      <CheckCircle size={16} /> {approve.isPending ? 'Approving…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => setRejectingId(run.id)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-danger-400/30 text-danger-400 hover:bg-danger-400/10"
                    >
                      <XCircle size={16} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History — all runs */}
      {runs.filter((r) => r.status !== 'pending_manager').length > 0 && (
        <div>
          <h2 className="font-semibold text-text-primary mb-3">Run History</h2>
          <div className="glass rounded-2xl border border-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Period','Status','Employees','Net Pay'].map((h) => (
                    <th key={h} className="py-3 px-4 text-left text-[10px] font-semibold text-text-muted uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {runs.filter((r) => r.status !== 'pending_manager').map((r) => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="py-3 px-4 font-medium text-text-primary">{r.period_label}</td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{
                          color: r.status === 'paid' ? '#34d399' : r.status === 'rejected' ? '#f87171' : '#94a3b8',
                          background: r.status === 'paid' ? 'rgba(16,185,129,0.15)' : r.status === 'rejected' ? 'rgba(239,68,68,0.15)' : 'rgba(71,85,105,0.15)',
                        }}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-text-secondary">{r.employee_count}</td>
                    <td className="py-3 px-4 text-xs font-medium" style={{ color: '#818cf8' }}>{fmtRwf(r.total_net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
