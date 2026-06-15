import { useState, useMemo } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { BarChart2, TrendingUp, TrendingDown, Download, Calendar, Users, Clock, FileText, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '@/lib/api'

function periodToRange(period) {
  const to   = new Date()
  const from = new Date()
  if (period === '1mo') from.setMonth(from.getMonth() - 1)
  if (period === '3mo') from.setMonth(from.getMonth() - 3)
  if (period === '6mo') from.setMonth(from.getMonth() - 6)
  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  }
}

const ZONE_COLORS = ['#6366f1','#10b981','#06b6d4','#a78bfa','#f59e0b','#ec4899','#ef4444','#84cc16']

const REPORT_GALLERY = [
  { label: 'Attendance Summary',     type: 'attendance',   icon: '📅', color: '#6366f1', desc: 'Monthly attendance rate by dept'  },
  { label: 'Leave Utilisation',      type: 'leave',        icon: '🏖️', color: '#10b981', desc: 'Leave days used vs entitlement'   },
  { label: 'Punctuality Report',     type: 'punctuality',  icon: '⏰', color: '#a78bfa', desc: 'Late arrivals and patterns'       },
  { label: 'Task Completion',        type: 'tasks',        icon: '✅', color: '#fbbf24', desc: 'Task throughput by team'          },
  { label: 'Face Enrollment Status', type: 'face',         icon: '🫡', color: '#06b6d4', desc: 'Biometric coverage by dept'       },
  { label: 'Geofence Breach Log',    type: 'geofence',     icon: '📍', color: '#ef4444', desc: 'Zone violations timeline'         },
]

/* ── Small helpers ── */
function OrgBarChart({ rows, nameKey, valKey, color, unit = '' }) {
  if (!rows?.length) return <div className="h-28 flex items-center justify-center text-xs text-text-muted">No data</div>
  const max = Math.max(...rows.map(r => Number(r[valKey] ?? 0)), 1)
  return (
    <div>
      <div className="flex items-end gap-1.5 h-28">
        {rows.slice(0, 12).map((r, i) => {
          const v  = Number(r[valKey] ?? 0)
          const h  = (v / max) * 100
          const isLast = i === rows.length - 1
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group min-w-0">
              <span className={cn('text-[8px] font-bold transition-opacity truncate', isLast ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
                style={{ color }}>{v}{unit}</span>
              <div className="w-full rounded-t-lg transition-all duration-500"
                style={{ height: `${Math.max(h, 3)}%`, background: isLast ? color : color + '55', boxShadow: isLast ? `0 0 10px ${color}60` : 'none' }} />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-2 overflow-hidden">
        {rows.slice(0, 12).map((r, i) => (
          <span key={i} className="text-[8px] text-text-muted truncate flex-1 text-center">
            {String(r[nameKey] ?? '').slice(0, 6)}
          </span>
        ))}
      </div>
    </div>
  )
}

function PunctBar({ rows }) {
  if (!rows?.length) return <div className="py-8 text-center text-xs text-text-muted">No data</div>
  const sorted = [...rows].sort((a, b) => Number(b.punctuality_pct ?? 0) - Number(a.punctuality_pct ?? 0))
  return (
    <div className="space-y-3">
      {sorted.slice(0, 8).map((r, i) => {
        const score = Math.round(Number(r.punctuality_pct ?? 0))
        const color = score >= 90 ? '#10b981' : score >= 80 ? '#6366f1' : score >= 70 ? '#f59e0b' : '#ef4444'
        return (
          <div key={i}>
            <div className="flex justify-between text-xs mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-text-muted w-4 text-right">#{i+1}</span>
                <span className="text-text-secondary truncate">{r.full_name}</span>
              </div>
              <span className="font-bold flex-shrink-0" style={{ color }}>{score}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${score}%`, background: color, boxShadow: `0 0 6px ${color}40` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FaceChart({ rows }) {
  if (!rows?.length) return <div className="py-8 text-center text-xs text-text-muted">No data</div>
  /* aggregate by department */
  const byDept = {}
  rows.forEach(r => {
    const d = r.department ?? 'Unknown'
    if (!byDept[d]) byDept[d] = { total: 0, enrolled: 0 }
    byDept[d].total++
    if (r.face_enrolled) byDept[d].enrolled++
  })
  const depts = Object.entries(byDept).sort((a, b) => b[1].total - a[1].total)
  return (
    <div className="space-y-3">
      {depts.map(([name, counts], i) => {
        const pct   = counts.total ? Math.round((counts.enrolled / counts.total) * 100) : 0
        const color = ZONE_COLORS[i % ZONE_COLORS.length]
        return (
          <div key={name}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-text-secondary">{name}</span>
              <span className="font-bold" style={{ color }}>{counts.enrolled}/{counts.total}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.08)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}40` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function HRAdminReports() {
  const [period, setPeriod] = useState('3mo')
  const [exporting, setExpt] = useState(null)

  const { from, to } = periodToRange(period)

  const attend = useQuery({ queryKey: ['reports','attendance',from,to], queryFn: () => reportsApi.attendanceSummary({ from, to }), staleTime: 300_000 })
  const leave  = useQuery({ queryKey: ['reports','leave',from,to],      queryFn: () => reportsApi.leaveSummary({ from, to }),      staleTime: 300_000 })
  const punct  = useQuery({ queryKey: ['reports','punctuality',from,to],queryFn: () => reportsApi.punctuality({ from, to }),        staleTime: 300_000 })
  const tasks  = useQuery({ queryKey: ['reports','tasks',from,to],      queryFn: () => reportsApi.taskCompletion({ from, to }),     staleTime: 300_000 })
  const face   = useQuery({ queryKey: ['reports','face'],               queryFn: () => reportsApi.faceStatus(),                    staleTime: 300_000 })

  const attendRows = Array.isArray(attend.data) ? attend.data : []
  const leaveRows  = Array.isArray(leave.data)  ? leave.data  : []
  const punctRows  = Array.isArray(punct.data)  ? punct.data  : []
  const tasksRows  = Array.isArray(tasks.data)  ? tasks.data  : []
  const faceRows   = Array.isArray(face.data)   ? face.data   : []

  /* KPI aggregates */
  const avgAttend = attendRows.length
    ? Math.round(attendRows.reduce((s, r) => s + Number(r.present ?? 0), 0) / attendRows.reduce((s, r) => s + Number(r.total_days ?? 1), 1) * 100)
    : null
  const totalLeave = leaveRows.reduce((s, r) => s + Number(r.days_taken ?? 0), 0)
  const faceEnrolledPct = faceRows.length
    ? Math.round((faceRows.filter(r => r.face_enrolled).length / faceRows.length) * 100)
    : null
  const avgPunct = punctRows.length
    ? Math.round(punctRows.reduce((s, r) => s + Number(r.punctuality_pct ?? 0), 0) / punctRows.length)
    : null

  async function exportReport(type, label) {
    setExpt(label)
    try {
      await reportsApi.exportCsv(type, from, to)
    } catch (e) {
      toast.error(e.message ?? 'Export failed')
    }
    setExpt(null)
  }

  const isLoading = attend.isLoading || leave.isLoading || punct.isLoading || tasks.isLoading

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Org-Wide Reports</h1>
          <p className="text-sm text-text-muted mt-0.5">Analytics across all departments and employees</p>
        </div>
        <select value={period} onChange={e => setPeriod(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs border text-text-secondary outline-none bg-transparent"
          style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }}>
          <option value="1mo">Last month</option>
          <option value="3mo">Last 3 months</option>
          <option value="6mo">Last 6 months</option>
        </select>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Avg attendance', val: avgAttend  != null ? `${avgAttend}%` : '—',        color: '#10b981' },
          { label: 'Leave days used', val: totalLeave != null ? String(totalLeave) : '—',    color: '#6366f1' },
          { label: 'Face enrolled',   val: faceEnrolledPct != null ? `${faceEnrolledPct}%` : '—', color: '#a78bfa' },
          { label: 'Avg punctuality', val: avgPunct   != null ? `${avgPunct}%` : '—',        color: '#f59e0b' },
        ].map(k => (
          <div key={k.label} className="glass-card p-4" style={{ padding: 14 }}>
            <div className="text-xl font-black mb-0.5" style={{ color: k.color }}>
              {isLoading ? <div className="h-6 w-16 rounded animate-pulse" style={{ background: 'rgba(99,102,241,0.1)' }} /> : k.val}
            </div>
            <div className="text-[10px] text-text-muted">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Org attendance */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 size={14} className="text-brand-400"/>
              <h2 className="text-sm font-semibold text-text-primary">Attendance by Employee</h2>
            </div>
            <button onClick={() => exportReport('attendance', 'Attendance Summary')}
              className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1">
              {exporting === 'Attendance Summary' ? <Loader size={10} className="animate-spin"/> : <Download size={10}/>} CSV
            </button>
          </div>
          {attend.isLoading
            ? <div className="h-28 animate-pulse rounded-lg" style={{ background: 'rgba(99,102,241,0.07)' }}/>
            : <OrgBarChart rows={attendRows} nameKey="full_name" valKey="present" color="#6366f1" unit=" days" />
          }
        </div>

        {/* Leave usage */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-brand-400"/>
              <h2 className="text-sm font-semibold text-text-primary">Leave Days Used</h2>
            </div>
            <button onClick={() => exportReport('leave', 'Leave Utilisation')}
              className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1">
              {exporting === 'Leave Utilisation' ? <Loader size={10} className="animate-spin"/> : <Download size={10}/>} CSV
            </button>
          </div>
          {leave.isLoading
            ? <div className="h-28 animate-pulse rounded-lg" style={{ background: 'rgba(99,102,241,0.07)' }}/>
            : <OrgBarChart rows={leaveRows} nameKey="full_name" valKey="days_taken" color="#10b981" unit=" days" />
          }
        </div>

        {/* Punctuality */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-brand-400"/>
              <h2 className="text-sm font-semibold text-text-primary">Punctuality Ranking</h2>
            </div>
            <button onClick={() => exportReport('punctuality', 'Punctuality Report')}
              className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1">
              {exporting === 'Punctuality Report' ? <Loader size={10} className="animate-spin"/> : <Download size={10}/>} CSV
            </button>
          </div>
          {punct.isLoading
            ? <div className="h-40 animate-pulse rounded-lg" style={{ background: 'rgba(99,102,241,0.07)' }}/>
            : <PunctBar rows={punctRows} />
          }
        </div>

        {/* Face enrollment */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={14} className="text-brand-400"/>
            <h2 className="text-sm font-semibold text-text-primary">Face Enrollment Coverage</h2>
          </div>
          {face.isLoading
            ? <div className="h-40 animate-pulse rounded-lg" style={{ background: 'rgba(99,102,241,0.07)' }}/>
            : <FaceChart rows={faceRows} />
          }
        </div>

        {/* Task completion */}
        <div className="glass-card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 size={14} className="text-brand-400"/>
              <h2 className="text-sm font-semibold text-text-primary">Task Completion by Employee</h2>
            </div>
            <button onClick={() => exportReport('tasks', 'Task Completion')}
              className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1">
              {exporting === 'Task Completion' ? <Loader size={10} className="animate-spin"/> : <Download size={10}/>} CSV
            </button>
          </div>
          {tasks.isLoading
            ? <div className="h-28 animate-pulse rounded-lg" style={{ background: 'rgba(99,102,241,0.07)' }}/>
            : <OrgBarChart rows={tasksRows} nameKey="full_name" valKey="done" color="#fbbf24" unit=" done" />
          }
        </div>
      </div>

      {/* Export gallery */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={14} className="text-brand-400"/>
          <h2 className="text-sm font-semibold text-text-primary">Export Reports</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {REPORT_GALLERY.map(r => (
            <button key={r.label}
              onClick={() => exportReport(r.type, r.label)}
              disabled={exporting === r.label}
              className="flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all hover:scale-[1.02]"
              style={{ background: r.color + '08', borderColor: r.color + '20' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = r.color + '45'; e.currentTarget.style.boxShadow = `0 0 14px ${r.color}15` }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = r.color + '20'; e.currentTarget.style.boxShadow = 'none' }}>
              <span className="text-xl flex-shrink-0">{r.icon}</span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-text-primary leading-tight">{r.label}</div>
                <div className="text-[9px] text-text-muted mt-0.5 leading-relaxed">{r.desc}</div>
              </div>
              {exporting === r.label
                ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin flex-shrink-0 ml-auto" style={{ color: r.color }}/>
                : <Download size={11} className="flex-shrink-0 ml-auto" style={{ color: r.color }}/>
              }
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
