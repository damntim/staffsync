import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { payrollApi } from '@/lib/api'
import { FileText, Download, MessageCircle, X, Send, AlertCircle, Eye } from 'lucide-react'

function fmtRwf(n) {
  return 'RWF ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function EmployeePayslips() {
  const qc = useQueryClient()
  const [selected, setSelected]     = useState(null)
  const [complaint, setComplaint]   = useState(null)
  const [cForm, setCForm]           = useState({ subject: '', message: '' })
  const [cError, setCError]         = useState('')

  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ['payroll', 'payslips', 'me'],
    queryFn:  () => payrollApi.payslipList(),
  })

  const { data: slip } = useQuery({
    queryKey: ['payroll', 'payslip', selected],
    queryFn:  () => payrollApi.payslipGet(selected),
    enabled:  !!selected,
  })

  const { data: complaints = [] } = useQuery({
    queryKey: ['payroll', 'complaints', 'me'],
    queryFn:  payrollApi.complaintList,
  })

  const addComplaint = useMutation({
    mutationFn: payrollApi.complaintAdd,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['payroll', 'complaints'] })
      setComplaint(null)
      setCForm({ subject: '', message: '' })
    },
    onError: (e) => setCError(e.message),
  })

  function handleComplaint(e) {
    e.preventDefault()
    setCError('')
    addComplaint.mutate({ entry_id: complaint, ...cForm })
  }

  function openPdf(id) {
    window.open(`/api/payroll.php?action=payslip_pdf&entry_id=${id}`, '_blank')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">My Payslips</h1>
        <p className="text-text-muted text-sm mt-1">View and download your payroll history</p>
      </div>

      {/* Complaint form modal */}
      {complaint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-md border border-white/10">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-text-primary">Raise a Complaint</h3>
              <button onClick={() => { setComplaint(null); setCError('') }} className="text-text-muted hover:text-text-primary">
                <X size={20} />
              </button>
            </div>

            {cError && (
              <div className="mb-4 p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 flex gap-2 text-sm text-danger-400">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {cError}
              </div>
            )}

            <form onSubmit={handleComplaint} className="space-y-4">
              <div>
                <label className="text-xs text-text-muted font-medium">Subject</label>
                <input
                  required
                  className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary"
                  placeholder="e.g. Incorrect overtime calculation"
                  value={cForm.subject}
                  onChange={(e) => setCForm({ ...cForm, subject: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-text-muted font-medium">Message</label>
                <textarea
                  required
                  rows={4}
                  className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary resize-none"
                  placeholder="Describe the issue in detail…"
                  value={cForm.message}
                  onChange={(e) => setCForm({ ...cForm, message: e.target.value })}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setComplaint(null); setCError('') }}
                  className="flex-1 py-2.5 rounded-xl border border-border-default text-sm text-text-secondary hover:bg-surface-3"
                >Cancel</button>
                <button
                  type="submit"
                  disabled={addComplaint.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                >{addComplaint.isPending ? 'Sending…' : 'Submit'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payslip detail modal */}
      {selected && slip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="glass-strong rounded-2xl w-full max-w-lg border border-white/10 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <h3 className="font-bold text-text-primary">{slip.period_label}</h3>
              <div className="flex gap-2">
                <button onClick={() => openPdf(slip.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 hover:bg-surface-4 text-text-secondary">
                  <Download size={12} /> PDF
                </button>
                <button onClick={() => { setComplaint(slip.id); setSelected(null) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-400/10 hover:bg-amber-400/20 text-amber-400">
                  <MessageCircle size={12} /> Dispute
                </button>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-5 space-y-4">
              <div className="rounded-xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                <p className="text-xs opacity-75 uppercase tracking-wider font-semibold">StaffSync · DevX Ltd</p>
                <p className="text-lg font-bold mt-1">PAYSLIP</p>
                <p className="text-sm opacity-85">{slip.period_label} · {slip.period_start} → {slip.period_end}</p>
              </div>
              <div className="bg-surface-3 rounded-xl p-4">
                <p className="text-[10px] text-text-muted uppercase font-semibold mb-3">Earnings</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-text-secondary">Basic Salary</span><span className="text-emerald-400 font-medium">{fmtRwf(slip.basic_salary)}</span></div>
                  {Number(slip.overtime_hours) > 0 && <div className="flex justify-between text-sm"><span className="text-text-secondary">Overtime ({slip.overtime_hours}h)</span><span className="text-emerald-400 font-medium">{fmtRwf(slip.overtime_amount)}</span></div>}
                  {Number(slip.bonus) > 0 && <div className="flex justify-between text-sm"><span className="text-text-secondary">Bonus</span><span className="text-emerald-400 font-medium">{fmtRwf(slip.bonus)}</span></div>}
                  <div className="flex justify-between text-sm border-t border-white/10 pt-2 font-semibold"><span className="text-text-primary">GROSS</span><span className="text-emerald-400">{fmtRwf(slip.gross)}</span></div>
                </div>
              </div>
              <div className="bg-surface-3 rounded-xl p-4">
                <p className="text-[10px] text-text-muted uppercase font-semibold mb-3">Deductions</p>
                <div className="space-y-2">
                  {(typeof slip.deduction_details === 'string' ? JSON.parse(slip.deduction_details) : slip.deduction_details ?? []).map((d, i) => (
                    <div key={i} className="flex justify-between text-sm"><span className="text-text-secondary">{d.name}{d.rate > 0 ? ` (${d.rate}%)` : ''}</span><span className="text-red-400">{fmtRwf(d.amount)}</span></div>
                  ))}
                  <div className="flex justify-between text-sm border-t border-white/10 pt-2 font-semibold"><span className="text-text-primary">TOTAL</span><span className="text-red-400">{fmtRwf(slip.total_deductions)}</span></div>
                </div>
              </div>
              <div className="rounded-xl p-4 flex justify-between items-center" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                <span className="text-white/85 font-semibold">NET PAY</span>
                <span className="text-white font-black text-xl">{fmtRwf(slip.net_pay)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* My complaints */}
      {complaints.length > 0 && (
        <div className="glass rounded-2xl p-5 border border-white/5">
          <h2 className="font-semibold text-text-primary mb-3 text-sm">My Disputes</h2>
          <div className="space-y-2">
            {complaints.map((c) => (
              <div key={c.id} className="flex items-start gap-3 p-3 rounded-xl bg-surface-3">
                <MessageCircle size={14} className="text-text-muted mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{c.subject}</p>
                  <p className="text-xs text-text-muted">{c.period_label}</p>
                  {c.reply && <p className="text-xs text-brand-400 mt-1 italic">Finance: {c.reply}</p>}
                </div>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                  style={{
                    color: c.status === 'resolved' ? '#34d399' : c.status === 'in_review' ? '#818cf8' : '#fbbf24',
                    background: c.status === 'resolved' ? 'rgba(16,185,129,0.15)' : c.status === 'in_review' ? 'rgba(99,102,241,0.15)' : 'rgba(245,158,11,0.15)',
                  }}
                >
                  {c.status === 'in_review' ? 'In Review' : c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payslips list */}
      {isLoading ? (
        <div className="text-center py-16 text-text-muted">Loading…</div>
      ) : !payslips.length ? (
        <div className="text-center py-16">
          <FileText size={48} className="mx-auto mb-4 text-text-muted opacity-30" />
          <p className="text-text-muted text-sm">No payslips yet. Your payslips will appear here once payroll is processed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payslips.map((p) => (
            <div
              key={p.id}
              className="glass rounded-2xl p-5 border border-white/5 flex items-center gap-5 flex-wrap"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(99,102,241,0.15)' }}
              >
                <FileText size={18} style={{ color: '#818cf8' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-text-primary">{p.period_label}</p>
                <p className="text-xs text-text-muted">{p.period_start} → {p.period_end}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-text-muted">Net Pay</p>
                <p className="text-sm font-bold" style={{ color: '#818cf8' }}>{fmtRwf(p.net_pay)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelected(p.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 hover:bg-surface-4 text-text-secondary hover:text-text-primary"
                >
                  <Eye size={12} /> View
                </button>
                <button
                  onClick={() => openPdf(p.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 hover:bg-surface-4 text-text-secondary hover:text-text-primary"
                >
                  <Download size={12} /> PDF
                </button>
                <button
                  onClick={() => setComplaint(p.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-400/10 hover:bg-amber-400/20 text-amber-400"
                >
                  <MessageCircle size={12} /> Dispute
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
