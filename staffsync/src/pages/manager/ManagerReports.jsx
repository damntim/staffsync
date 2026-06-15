import { useState, useMemo } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { TrendingUp, TrendingDown, Download, Calendar, BarChart2, Users, Clock, Loader } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '@/lib/api'

const REPORT_TYPES = ['Attendance', 'Leave', 'Punctuality', 'Tasks']
const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#06b6d4','#a78bfa','#ec4899','#14b8a6','#f97316','#38bdf8']

function periodToRange(period) {
  const to   = new Date()
  const from = new Date()
  if (period === '1mo') from.setMonth(from.getMonth() - 1)
  if (period === '3mo') from.setMonth(from.getMonth() - 3)
  if (period === '6mo') from.setMonth(from.getMonth() - 6)
  const fmt = d => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(to) }
}

function StatCard({ label, value, color, isLoading }) {
  return (
    <div className="glass-card p-4">
      {isLoading
        ? <div className="h-7 w-16 rounded animate-pulse mb-1" style={{ background: 'rgba(99,102,241,0.1)' }} />
        : <div className="text-xl font-black mb-0.5" style={{ color }}>{value}</div>
      }
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  )
}

/* ── SVG Attendance bar chart ── */
function AttendanceChart({ rows }) {
  if (!rows?.length) return <p className="text-xs text-text-muted py-4 text-center">No data for this period</p>

  const maxPresent = Math.max(...rows.map(r => Number(r.present ?? 0)), 1)
  const H = 120, W = Math.max(rows.length * 40, 300)

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H + 24} viewBox={`0 0 ${W} ${H + 24}`} className="overflow-visible">
        {rows.map((r, i) => {
          const present = Number(r.present ?? 0)
          const late    = Number(r.late    ?? 0)
          const absent  = Number(r.absent  ?? 0)
          const total   = Math.max(present + late + absent, 1)
          const barH    = (present / total) * H * 0.85

          return (
            <g key={r.employee_id ?? i} transform={`translate(${i * 40 + 10}, 0)`}>
              <rect x={0} y={H - barH} width={22} height={barH} rx={3} fill={COLORS[i % COLORS.length]} fillOpacity="0.75"
                style={{ filter: `drop-shadow(0 0 4px ${COLORS[i % COLORS.length]}50)` }} />
              {late > 0 && (
                <rect x={0} y={H - barH - (late/total)*H*0.85} width={22} height={(late/total)*H*0.85} rx={2} fill="#f59e0b" fillOpacity="0.6" />
              )}
              <text x={11} y={H + 14} fontSize="8" fill="#64748b" textAnchor="middle">
                {(r.full_name ?? '').split(' ')[0].slice(0, 6)}
              </text>
              <text x={11} y={H - barH - 4} fontSize="8" fill={COLORS[i % COLORS.length]} textAnchor="middle">
                {present}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="flex gap-4 mt-2">
        {[{ label: 'Present', color: '#6366f1' }, { label: 'Late', color: '#f59e0b' }, { label: 'Absent', color: '#ef4444' }].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: l.color }} />
            <span className="text-[9px] text-text-muted">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Leave breakdown bar chart ── */
function LeaveChart({ rows }) {
  if (!rows?.length) return <p className="text-xs text-text-muted py-4 text-center">No data for this period</p>

  const byPerson = {}
  for (const r of rows) {
    if (!r.full_name) continue
    if (!byPerson[r.full_name]) byPerson[r.full_name] = {}
    byPerson[r.full_name][r.type ?? 'other'] = Number(r.days_taken ?? 0)
  }
  const names  = Object.keys(byPerson)
  const maxTotal = Math.max(...names.map(n => Object.values(byPerson[n]).reduce((a,b) => a+b, 0)), 1)

  const TYPE_COLORS = { annual: '#6366f1', sick: '#10b981', casual: '#a78bfa', maternity: '#f472b6', paternity: '#38bdf8', unpaid: '#94a3b8', other: '#818cf8' }

  return (
    <div className="space-y-3">
      {names.map(name => {
        const data  = byPerson[name]
        const total = Object.values(data).reduce((a,b) => a+b, 0)
        let offset  = 0
        return (
          <div key={name}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-secondary">{name.split(' ').slice(0, 2).join(' ')}</span>
              <span className="text-text-muted">{total} days</span>
            </div>
            <div className="h-5 rounded-full overflow-hidden flex" style={{ background: 'rgba(99,102,241,0.08)' }}>
              {Object.entries(data).map(([type, days]) => {
                const w = (days / maxTotal) * 100
                return (
                  <div key={type} style={{ width: `${w}%`, background: TYPE_COLORS[type] ?? '#818cf8' }}
                    className="h-full transition-all duration-500" />
                )
              })}
            </div>
          </div>
        )
      })}
      <div className="flex gap-3 mt-2 flex-wrap">
        {Object.entries(TYPE_COLORS).map(([t, c]) => (
          <div key={t} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: c }} />
            <span className="text-[9px] capitalize text-text-muted">{t}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Punctuality ranking ── */
function PunctualityRanking({ rows }) {
  if (!rows?.length) return <p className="text-xs text-text-muted py-4 text-center">No data for this period</p>

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="space-y-2.5">
      {rows.slice(0, 10).map((r, i) => {
        const score = Number(r.punctuality_pct ?? 0)
        return (
          <div key={r.employee_id ?? i} className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: i < 3 ? 'rgba(99,102,241,0.06)' : 'rgba(26,34,54,0.4)', border: '1px solid rgba(99,102,241,0.08)' }}>
            <span className="text-base w-6 text-center flex-shrink-0">{medals[i] ?? `#${i+1}`}</span>
            <span className="flex-1 text-sm text-text-primary truncate">{r.full_name}</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
                <div className="h-full rounded-full" style={{ width: `${score}%`, background: score >= 90 ? '#10b981' : score >= 80 ? '#6366f1' : score >= 70 ? '#f59e0b' : '#ef4444' }} />
              </div>
              <span className="text-sm font-bold w-12 text-right"
                style={{ color: score >= 90 ? '#10b981' : score >= 80 ? '#818cf8' : score >= 70 ? '#f59e0b' : '#ef4444' }}>
                {score}%
              </span>
              <span className="text-[10px] text-text-muted w-8">{r.late_days ?? 0}L</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Task completion chart ── */
function TaskChart({ rows }) {
  if (!rows?.length) return <p className="text-xs text-text-muted py-4 text-center">No data for this period</p>

  const sorted = [...rows].sort((a,b) => Number(b.done??0) - Number(a.done??0)).slice(0, 10)
  const maxDone = Math.max(...sorted.map(r => Number(r.done ?? 0)), 1)

  return (
    <div className="space-y-2.5">
      {sorted.map((r, i) => {
        const done       = Number(r.done        ?? 0)
        const inProgress = Number(r.in_progress ?? 0)
        const todo       = Number(r.todo        ?? 0)
        const total      = Number(r.total_tasks ?? done + inProgress + todo)
        const pct        = total > 0 ? Math.round((done / total) * 100) : 0
        const color      = COLORS[i % COLORS.length]

        return (
          <div key={r.employee_id ?? i} className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(26,34,54,0.4)', border: '1px solid rgba(99,102,241,0.08)' }}>
            <span className="flex-1 text-sm text-text-primary truncate">{r.full_name?.split(' ').slice(0,2).join(' ')}</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className="text-xs font-bold w-12 text-right" style={{ color }}>{done}/{total}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ManagerReports() {
  const [tab, setTab]       = useState('Attendance')
  const [period, setPeriod] = useState('3mo')
  const [exporting, setExp] = useState(false)

  const { from, to } = useMemo(() => periodToRange(period), [period])

  const attend = useQuery({ queryKey: ['reports','attendance',from,to], queryFn: () => reportsApi.attendanceSummary({ from, to }), staleTime: 300_000 })
  const leave  = useQuery({ queryKey: ['reports','leave',from,to],      queryFn: () => reportsApi.leaveSummary({ from, to }),      staleTime: 300_000 })
  const punct  = useQuery({ queryKey: ['reports','punctuality',from,to],queryFn: () => reportsApi.punctuality({ from, to }),        staleTime: 300_000 })
  const tasks  = useQuery({ queryKey: ['reports','tasks',from,to],      queryFn: () => reportsApi.taskCompletion({ from, to }),     staleTime: 300_000 })

  const attendRows = Array.isArray(attend.data) ? attend.data : []
  const leaveRows  = Array.isArray(leave.data)  ? leave.data  : []
  const punctRows  = Array.isArray(punct.data)  ? punct.data  : []
  const taskRows   = Array.isArray(tasks.data)  ? tasks.data  : []

  const totalPresent = attendRows.reduce((a,r) => a + Number(r.present ?? 0), 0)
  const totalDays    = attendRows.reduce((a,r) => a + Number(r.total_days ?? 0), 0)
  const avgAttend    = totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 0

  const avgPunct = punctRows.length > 0
    ? Math.round(punctRows.reduce((a,r) => a + Number(r.punctuality_pct ?? 0), 0) / punctRows.length)
    : 0

  const totalLeaveDays = leaveRows.reduce((a,r) => a + Number(r.days_taken ?? 0), 0)

  const totalTasksDone = taskRows.reduce((a,r) => a + Number(r.done ?? 0), 0)

  async function exportReport() {
    setExp(true)
    const typeMap = { Attendance: 'attendance', Leave: 'leave', Punctuality: 'punctuality', Tasks: 'tasks' }
    reportsApi.exportCsv(typeMap[tab] ?? 'attendance', from, to)
    setTimeout(() => setExp(false), 1500)
  }

  const isFetching = attend.isFetching || leave.isFetching || punct.isFetching || tasks.isFetching

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Team Reports</h1>
          <p className="text-sm text-text-muted mt-0.5">Analytics and insights for your direct reports</p>
        </div>
        <div className="flex gap-2 items-center">
          {isFetching && <Loader size={13} className="animate-spin text-brand-400" />}
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-xs border text-text-secondary outline-none bg-transparent focus:border-brand-500"
            style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }}>
            <option value="1mo">Last month</option>
            <option value="3mo">Last 3 months</option>
            <option value="6mo">Last 6 months</option>
          </select>
          <Button variant="outline" size="sm" icon={exporting ? <Loader size={13} className="animate-spin"/> : <Download size={13}/>}
            onClick={exportReport}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Avg attendance"  value={`${avgAttend}%`}           color="#10b981" isLoading={attend.isLoading} />
        <StatCard label="Avg punctuality" value={`${avgPunct}%`}            color="#a78bfa" isLoading={punct.isLoading}  />
        <StatCard label="Leave days used" value={`${totalLeaveDays}d`}      color="#06b6d4" isLoading={leave.isLoading}  />
        <StatCard label="Tasks done"      value={`${totalTasksDone}`}       color="#fbbf24" isLoading={tasks.isLoading}  />
      </div>

      {/* Report tabs */}
      <div className="flex gap-2 flex-wrap">
        {REPORT_TYPES.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200"
            style={{
              background:  tab === t ? 'rgba(99,102,241,0.15)' : 'rgba(26,34,54,0.5)',
              borderColor: tab === t ? 'rgba(99,102,241,0.4)'  : 'rgba(99,102,241,0.12)',
              color:       tab === t ? '#818cf8' : '#94a3b8',
              boxShadow:   tab === t ? '0 0 12px rgba(99,102,241,0.18)' : 'none',
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* Attendance tab */}
      {tab === 'Attendance' && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 size={14} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-text-primary">Attendance Summary</h2>
          </div>
          {attend.isLoading
            ? <div className="h-40 animate-pulse rounded-xl" style={{ background: 'rgba(99,102,241,0.07)' }} />
            : <AttendanceChart rows={attendRows} />
          }
        </div>
      )}

      {/* Leave tab */}
      {tab === 'Leave' && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Calendar size={14} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-text-primary">Leave Usage by Employee</h2>
          </div>
          {leave.isLoading
            ? <div className="h-40 animate-pulse rounded-xl" style={{ background: 'rgba(99,102,241,0.07)' }} />
            : <LeaveChart rows={leaveRows} />
          }
        </div>
      )}

      {/* Punctuality tab */}
      {tab === 'Punctuality' && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Clock size={14} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-text-primary">Team Punctuality Rankings</h2>
          </div>
          {punct.isLoading
            ? <div className="h-40 animate-pulse rounded-xl" style={{ background: 'rgba(99,102,241,0.07)' }} />
            : <PunctualityRanking rows={punctRows} />
          }
        </div>
      )}

      {/* Tasks tab */}
      {tab === 'Tasks' && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={14} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-text-primary">Task Completion by Member</h2>
          </div>
          {tasks.isLoading
            ? <div className="h-40 animate-pulse rounded-xl" style={{ background: 'rgba(99,102,241,0.07)' }} />
            : <TaskChart rows={taskRows} />
          }
        </div>
      )}
    </div>
  )
}
