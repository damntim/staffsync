import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { payrollApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Search, Download, Send, Eye, X, FileText, ChevronDown } from 'lucide-react'

function fmtRwf(n) {
  return 'RWF ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const RUN_STATUS_COLOR = {
  paid:     '#34d399',
  approved: '#818cf8',
  rejected: '#f87171',
  default:  '#94a3b8',
}

export default function FinancePayslips() {
  const { token } = useAuthStore()
  const [search, setSearch]       = useState('')
  const [selected, setSelected]   = useState(null)
  const [sending, setSending]     = useState(null)

  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ['payroll', 'payslips'],
    queryFn:  () => payrollApi.payslipList(),
  })

  const sendEmail = useMutation({
    mutationFn: (id) => payrollApi.payslipSend(id),
    onSuccess:  () => setSending(null),
  })

  const filtered = payslips.filter((p) =>
    !search ||
    p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.period_label?.toLowerCase().includes(search.toLowerCase())
  )

  function openPdf(entryId) {
    const url = `/api/payroll.php?action=payslip_pdf&entry_id=${entryId}`
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Payslips</h1>
        <p className="text-text-muted text-sm mt-1">View, download and resend employee payslips</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          className="w-full pl-9 pr-4 py-2.5 bg-surface-3 border border-border-default rounded-xl text-sm text-text-primary"
          placeholder="Search by name or period…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Payslip detail modal */}
      {selected && (
        <PayslipModal
          entryId={selected}
          onClose={() => setSelected(null)}
          onSend={(id) => { setSending(id); sendEmail.mutate(id) }}
          sending={sending}
          onPdf={openPdf}
        />
      )}

      {isLoading ? (
        <div className="text-center py-16 text-text-muted">Loading…</div>
      ) : !filtered.length ? (
        <div className="text-center py-16">
          <FileText size={48} className="mx-auto mb-4 text-text-muted opacity-30" />
          <p className="text-text-muted">No payslips found.</p>
        </div>
      ) : (
        <div className="glass rounded-2xl border border-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['Employee','Period','Gross','Deductions','Net Pay','Status','Actions'].map((h) => (
                  <th key={h} className="py-3 px-4 text-left text-[10px] font-semibold text-text-muted uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((p) => {
                const statusColor = RUN_STATUS_COLOR[p.run_status] ?? RUN_STATUS_COLOR.default
                return (
                  <tr key={p.id} className="hover:bg-white/2 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-text-primary">{p.full_name}</div>
                      <div className="text-[10px] text-text-muted">{p.employee_id}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-text-secondary">{p.period_label}</td>
                    <td className="py-3 px-4 text-xs font-medium" style={{ color: '#34d399' }}>{fmtRwf(p.gross)}</td>
                    <td className="py-3 px-4 text-xs" style={{ color: '#f87171' }}>{fmtRwf(p.total_deductions)}</td>
                    <td className="py-3 px-4 text-xs font-bold" style={{ color: '#818cf8' }}>{fmtRwf(p.net_pay)}</td>
                    <td className="py-3 px-4">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ color: statusColor, background: statusColor + '22' }}
                      >
                        {p.run_status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setSelected(p.id)}
                          className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-brand-400"
                          title="View"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => openPdf(p.id)}
                          className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-emerald-400"
                          title="Download PDF"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => { setSending(p.id); sendEmail.mutate(p.id) }}
                          disabled={sending === p.id && sendEmail.isPending}
                          className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-amber-400 disabled:opacity-50"
                          title="Resend email"
                        >
                          <Send size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PayslipModal({ entryId, onClose, onSend, sending, onPdf }) {
  const { data: slip, isLoading } = useQuery({
    queryKey: ['payroll', 'payslip', entryId],
    queryFn:  () => payrollApi.payslipGet(entryId),
    enabled:  !!entryId,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="glass-strong rounded-2xl w-full max-w-lg border border-white/10 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h3 className="font-bold text-text-primary">Payslip Detail</h3>
          <div className="flex gap-2">
            <button onClick={() => onPdf(entryId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 hover:bg-surface-4 text-text-secondary hover:text-text-primary">
              <Download size={12} /> PDF
            </button>
            <button onClick={() => onSend(entryId)} disabled={sending === entryId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-500/20 hover:bg-brand-500/30 text-brand-400 disabled:opacity-50">
              <Send size={12} /> {sending === entryId ? 'Sending…' : 'Email'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted">
              <X size={16} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-text-muted">Loading…</div>
        ) : !slip ? (
          <div className="p-8 text-center text-text-muted">Not found</div>
        ) : (
          <div className="overflow-y-auto p-5 space-y-4">
            {/* Header info */}
            <div
              className="rounded-xl p-4 text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
            >
              <p className="text-xs opacity-75 uppercase tracking-wider font-semibold">StaffSync · DevX Ltd</p>
              <p className="text-lg font-bold mt-1">PAYSLIP</p>
              <p className="text-sm opacity-85">{slip.period_label}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                ['Employee',    slip.full_name],
                ['Employee ID', slip.employee_id],
                ['Department',  slip.department || '—'],
                ['Period',      `${slip.period_start} → ${slip.period_end}`],
              ].map(([l, v]) => (
                <div key={l} className="bg-surface-3 rounded-xl p-3">
                  <p className="text-[10px] text-text-muted uppercase font-semibold">{l}</p>
                  <p className="text-sm font-medium text-text-primary mt-1">{v}</p>
                </div>
              ))}
            </div>

            {/* Earnings */}
            <div className="bg-surface-3 rounded-xl p-4">
              <p className="text-[10px] text-text-muted uppercase font-semibold mb-3">Earnings</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Basic Salary</span>
                  <span className="font-medium text-emerald-400">{fmtRwf(slip.basic_salary)}</span>
                </div>
                {Number(slip.overtime_hours) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Overtime ({slip.overtime_hours}h)</span>
                    <span className="font-medium text-emerald-400">{fmtRwf(slip.overtime_amount)}</span>
                  </div>
                )}
                {Number(slip.bonus) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Bonus</span>
                    <span className="font-medium text-emerald-400">{fmtRwf(slip.bonus)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t border-white/10 pt-2">
                  <span className="font-semibold text-text-primary">GROSS PAY</span>
                  <span className="font-bold text-emerald-400">{fmtRwf(slip.gross)}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div className="bg-surface-3 rounded-xl p-4">
              <p className="text-[10px] text-text-muted uppercase font-semibold mb-3">Deductions</p>
              <div className="space-y-2">
                {(typeof slip.deduction_details === 'string'
                  ? JSON.parse(slip.deduction_details)
                  : slip.deduction_details ?? []
                ).map((d, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-text-secondary">{d.name} {d.rate > 0 ? `(${d.rate}%)` : ''}</span>
                    <span className="text-red-400 font-medium">{fmtRwf(d.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm border-t border-white/10 pt-2">
                  <span className="font-semibold text-text-primary">TOTAL DEDUCTIONS</span>
                  <span className="font-bold text-red-400">{fmtRwf(slip.total_deductions)}</span>
                </div>
              </div>
            </div>

            {/* Net pay */}
            <div
              className="rounded-xl p-4 flex justify-between items-center"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
            >
              <span className="text-white/85 font-semibold">NET PAY</span>
              <span className="text-white font-black text-xl">{fmtRwf(slip.net_pay)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
