import { useQuery } from '@tanstack/react-query'
import { payrollApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  DollarSign, Users, FileText, AlertCircle, TrendingUp,
  Clock, CheckCircle, XCircle, ArrowRight,
} from 'lucide-react'
import { Link } from 'react-router-dom'

function fmtRwf(n) {
  if (!n && n !== 0) return '—'
  return 'RWF ' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const STATUS_META = {
  draft:           { label: 'Draft',              color: '#94a3b8', bg: 'rgba(71,85,105,0.15)'   },
  processing:      { label: 'Processing',         color: '#818cf8', bg: 'rgba(99,102,241,0.15)'  },
  pending_manager: { label: 'Awaiting Manager',   color: '#fbbf24', bg: 'rgba(245,158,11,0.15)'  },
  pending_hr:      { label: 'Awaiting HR',        color: '#f59e0b', bg: 'rgba(245,158,11,0.15)'  },
  approved:        { label: 'Approved',           color: '#34d399', bg: 'rgba(16,185,129,0.15)'  },
  rejected:        { label: 'Rejected',           color: '#f87171', bg: 'rgba(239,68,68,0.15)'   },
  paid:            { label: 'Paid',               color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
}

export default function FinanceDashboard() {
  const { user } = useAuthStore()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['payroll', 'stats'],
    queryFn:  payrollApi.dashboardStats,
    refetchInterval: 60_000,
  })

  const { data: runs = [] } = useQuery({
    queryKey: ['payroll', 'runs'],
    queryFn:  payrollApi.runList,
  })

  const latestRun = stats?.latest_run

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Finance Dashboard</h1>
        <p className="text-text-muted text-sm mt-1">
          Welcome back, {user?.full_name}. Manage payroll and financials.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: 'Employees on Payroll',
            value: isLoading ? '…' : stats?.total_employees ?? 0,
            icon: Users,
            color: '#818cf8',
            bg: 'rgba(99,102,241,0.12)',
          },
          {
            label: 'YTD Net Pay',
            value: isLoading ? '…' : fmtRwf(stats?.ytd_net_pay),
            icon: DollarSign,
            color: '#34d399',
            bg: 'rgba(16,185,129,0.12)',
          },
          {
            label: 'Total Runs',
            value: isLoading ? '…' : stats?.total_runs ?? 0,
            icon: FileText,
            color: '#fbbf24',
            bg: 'rgba(245,158,11,0.12)',
          },
          {
            label: 'Open Complaints',
            value: isLoading ? '…' : stats?.open_complaints ?? 0,
            icon: AlertCircle,
            color: stats?.open_complaints > 0 ? '#f87171' : '#94a3b8',
            bg: stats?.open_complaints > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(71,85,105,0.12)',
          },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-5 border border-white/5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-text-muted text-xs font-medium">{s.label}</p>
                <p className="text-2xl font-bold text-text-primary mt-1">{s.value}</p>
              </div>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: s.bg }}
              >
                <s.icon size={20} style={{ color: s.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Latest Run Status */}
        <div className="xl:col-span-2 glass rounded-2xl p-6 border border-white/5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-text-primary">Latest Payroll Run</h2>
            <Link
              to="/dashboard/finance/payroll"
              className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
            >
              All Runs <ArrowRight size={12} />
            </Link>
          </div>

          {!latestRun ? (
            <div className="text-center py-10 text-text-muted">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p>No payroll runs yet</p>
              <Link
                to="/dashboard/finance/payroll"
                className="mt-3 inline-block text-sm text-brand-400 hover:text-brand-300"
              >
                Create first run →
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div>
                  <p className="text-lg font-bold text-text-primary">{latestRun.period_label}</p>
                  <p className="text-xs text-text-muted">
                    {latestRun.period_start} → {latestRun.period_end}
                  </p>
                </div>
                <span
                  className="ml-auto px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: STATUS_META[latestRun.status]?.bg,
                    color: STATUS_META[latestRun.status]?.color,
                  }}
                >
                  {STATUS_META[latestRun.status]?.label ?? latestRun.status}
                </span>
              </div>

              {/* Approval pipeline */}
              <div className="flex items-center gap-2 mb-5">
                {['Finance', 'Manager', 'HR', 'Finalize'].map((step, i) => {
                  const statuses = ['processing', 'pending_manager', 'pending_hr', 'approved', 'paid']
                  const doneIdx  = statuses.indexOf(latestRun.status)
                  const done     = i < doneIdx || (i === 3 && latestRun.status === 'paid')
                  const active   = (i === 0 && ['draft','processing'].includes(latestRun.status))
                    || (i === 1 && latestRun.status === 'pending_manager')
                    || (i === 2 && latestRun.status === 'pending_hr')
                    || (i === 3 && latestRun.status === 'approved')
                  return (
                    <div key={step} className="flex items-center gap-2">
                      <div className="flex flex-col items-center">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2"
                          style={{
                            background: done ? 'rgba(16,185,129,0.2)' : active ? 'rgba(99,102,241,0.2)' : 'rgba(71,85,105,0.1)',
                            borderColor: done ? '#10b981' : active ? '#6366f1' : 'rgba(71,85,105,0.3)',
                            color: done ? '#10b981' : active ? '#818cf8' : '#475569',
                          }}
                        >
                          {done ? <CheckCircle size={14} /> : i + 1}
                        </div>
                        <span className="text-[10px] text-text-muted mt-1 whitespace-nowrap">{step}</span>
                      </div>
                      {i < 3 && (
                        <div
                          className="h-0.5 w-8 rounded"
                          style={{ background: done ? '#10b981' : 'rgba(71,85,105,0.3)' }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Financials */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Gross',       value: fmtRwf(latestRun.total_gross),       color: '#34d399' },
                  { label: 'Deductions',  value: fmtRwf(latestRun.total_deductions),  color: '#f87171' },
                  { label: 'Net Pay',     value: fmtRwf(latestRun.total_net),          color: '#818cf8' },
                ].map((f) => (
                  <div key={f.label} className="bg-surface-3 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-text-muted font-medium uppercase">{f.label}</p>
                    <p className="text-sm font-bold mt-1" style={{ color: f.color }}>{f.value}</p>
                  </div>
                ))}
              </div>

              {latestRun.rejection_reason && (
                <div className="mt-4 p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 flex gap-2">
                  <XCircle size={16} className="text-danger-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-danger-400">Rejected</p>
                    <p className="text-xs text-text-muted mt-0.5">{latestRun.rejection_reason}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Monthly trend */}
        <div className="glass rounded-2xl p-6 border border-white/5">
          <h2 className="font-semibold text-text-primary mb-5">Monthly Net Pay</h2>
          {!stats?.monthly_trend?.length ? (
            <div className="text-center py-8 text-text-muted text-sm">No paid runs yet</div>
          ) : (
            <div className="space-y-3">
              {stats.monthly_trend.map((m) => {
                const max = Math.max(...stats.monthly_trend.map((x) => x.total_net))
                const pct = max > 0 ? (m.total_net / max) * 100 : 0
                return (
                  <div key={m.period_label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-secondary">{m.period_label}</span>
                      <span className="text-text-primary font-medium">{fmtRwf(m.total_net)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: 'linear-gradient(90deg,#6366f1,#10b981)',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Quick actions */}
          <div className="mt-6 space-y-2">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Quick Actions</p>
            {[
              { label: 'New Payroll Run', to: '/dashboard/finance/payroll', color: '#818cf8' },
              { label: 'Manage Salaries', to: '/dashboard/finance/salaries', color: '#34d399' },
              { label: 'View Complaints', to: '/dashboard/finance/complaints', color: '#fbbf24' },
            ].map((a) => (
              <Link
                key={a.label}
                to={a.to}
                className="flex items-center justify-between p-3 rounded-xl bg-surface-3 hover:bg-surface-4 transition-colors group"
              >
                <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary">
                  {a.label}
                </span>
                <ArrowRight size={14} style={{ color: a.color }} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
