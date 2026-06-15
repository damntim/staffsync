import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { attendanceApi, leaveApi, reportsApi } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  Users, Clock, CheckSquare, Calendar, TrendingUp, TrendingDown,
  AlertTriangle, ChevronRight, Activity, Bell, Star,
  ThumbsUp, ThumbsDown, MoreHorizontal, Zap, Target, Award
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

const PRESENCE_CFG = {
  CHECKED_IN:      { label: 'Active',       color: '#10b981' },
  INACTIVE_SIGNAL: { label: 'Inactive',     color: '#f59e0b' },
  OUT_OF_ZONE:     { label: 'Out of Zone',  color: '#ef4444' },
  PRESENCE_DOUBT:  { label: 'Flagged',      color: '#ef4444' },
  EXEMPT:          { label: 'Exempt',       color: '#06b6d4' },
  CHECKED_OUT:     { label: 'Checked Out',  color: '#475569' },
  NO_DATA:         { label: 'Not tracked',  color: '#64748b' },
}
const DEFAULT_PRESENCE = { label: 'Unknown', color: '#64748b' }

export default function ManagerDashboard() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  /* ── Live data ── */
  const { data: teamRaw, isLoading: loadingTeam } = useQuery({
    queryKey: ['attendance', 'team_today'],
    queryFn:  attendanceApi.teamToday,
    refetchInterval: 60_000,
  })

  const { data: leaveRaw, isLoading: loadingLeave } = useQuery({
    queryKey: ['leave', 'list', 'pending'],
    queryFn:  () => leaveApi.list({ status: 'SUBMITTED', limit: 20 }),
  })

  const approveMut = useMutation({
    mutationFn: ({ id, comment }) => leaveApi.approve(id, comment ?? ''),
    onSuccess: () => { toast.success('Leave approved'); qc.invalidateQueries({ queryKey: ['leave'] }) },
    onError: (e) => toast.error(e.message),
  })
  const rejectMut = useMutation({
    mutationFn: ({ id, comment }) => leaveApi.reject(id, comment ?? 'Declined'),
    onSuccess: () => { toast.success('Leave rejected'); qc.invalidateQueries({ queryKey: ['leave'] }) },
    onError: (e) => toast.error(e.message),
  })

  const { data: punctData } = useQuery({
    queryKey: ['reports', 'punctuality', 'dashboard'],
    queryFn:  () => {
      const to   = new Date().toISOString().slice(0, 10)
      const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
      return reportsApi.punctuality({ from, to })
    },
    staleTime: 300_000,
  })

  /* ── Derive team list ── */
  const teamList = Array.isArray(teamRaw)
    ? teamRaw.map(r => ({
        id:          r.user_id ?? r.id,
        name:        r.full_name ?? r.name ?? 'Employee',
        initials:    initials(r.full_name ?? r.name ?? '?'),
        role:        r.department ?? r.role ?? '',
        status:      r.presence_status ?? (r.check_in_time ? 'CHECKED_IN' : 'NO_DATA'),
        punctuality: Number(r.punctuality_pct ?? 0),
        tasks:       { open: Number(r.open_tasks ?? 0), done: Number(r.done_tasks ?? 0) },
      }))
    : []

  /* ── Derive pending approvals ── */
  const rawLeaveArr = Array.isArray(leaveRaw?.requests) ? leaveRaw.requests : Array.isArray(leaveRaw) ? leaveRaw : []
  const pendingLeave = rawLeaveArr.map(r => ({
    id:        r.leave_id ?? r.id,
    type:      'leave',
    name:      r.full_name ?? r.employee_name ?? 'Employee',
    initials:  initials(r.full_name ?? r.employee_name ?? '?'),
    detail:    `${r.type ?? r.leave_type ?? 'Leave'} — ${r.start_date?.slice(0,10)} to ${r.end_date?.slice(0,10)}`,
    submitted: timeAgo(r.created_at),
    urgent:    false,
  }))

  /* ── Performance trend from punctuality report ── */
  const punctRows = Array.isArray(punctData) ? punctData : []
  const perfTrend = punctRows.length > 0
    ? punctRows.slice(0, 12).map(r => Math.round(Number(r.punctuality_pct ?? 0)))
    : []

  const activeCount    = teamList.filter(e => e.status === 'CHECKED_IN').length
  const flaggedCount   = teamList.filter(e => ['OUT_OF_ZONE','PRESENCE_DOUBT','INACTIVE_SIGNAL'].includes(e.status)).length
  const avgPunctuality = teamList.length > 0
    ? Math.round(teamList.reduce((a, e) => a + e.punctuality, 0) / teamList.length)
    : 0

  function handleApproval(id, action, comment) {
    if (action === 'approve') approveMut.mutate({ id, comment: comment ?? '' })
    else rejectMut.mutate({ id, comment: comment ?? 'Declined' })
  }

  /* ── Capacity: next 10 weekdays ── */
  const CAPACITY = buildCapacity(teamList.length)

  return (
    <div className="space-y-5 pb-6">
      <ManagerHero user={user} now={now} teamSize={teamList.length} activeCount={activeCount} flaggedCount={flaggedCount} pendingCount={pendingLeave.length} avgPunctuality={avgPunctuality} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat icon={<Users size={16}/>}       label="Team size"       value={teamList.length}       sub="direct reports"              color="#6366f1" />
        <MiniStat icon={<Activity size={16}/>}    label="Active now"      value={loadingTeam ? '…' : activeCount} sub={`${flaggedCount} flagged`} color="#10b981" />
        <MiniStat icon={<Target size={16}/>}      label="Avg punctuality" value={`${avgPunctuality}%`}  sub="this month"                  color="#a78bfa" />
        <MiniStat icon={<CheckSquare size={16}/>} label="Pending actions" value={loadingLeave ? '…' : pendingLeave.length} sub="need your response" color="#fbbf24" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">

          <SectionCard title="Team Status — Today" icon={<Users size={14}/>} linkTo="/dashboard/manager/team" linkLabel="Full roster">
            {loadingTeam ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({length:4}).map((_,i) => (
                  <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {teamList.map(emp => <TeamMemberCard key={emp.id} emp={emp} />)}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Team Capacity — Next 10 Days" icon={<Calendar size={14}/>}>
            <CapacityCalendar days={CAPACITY} teamSize={teamList.length} />
          </SectionCard>

          <SectionCard title="Team Punctuality Trend" icon={<TrendingUp size={14}/>} linkTo="/dashboard/manager/reports" linkLabel="Full report">
            {perfTrend.length === 0
              ? <div className="h-24 flex items-center justify-center text-xs text-text-muted">No trend data yet</div>
              : <PerformanceChart data={perfTrend} />
            }
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Pending Approvals" icon={<Bell size={14}/>} linkTo="/dashboard/manager/approvals" linkLabel="All" badge={pendingLeave.length}>
            {loadingLeave ? (
              <div className="space-y-3">{Array.from({length:2}).map((_,i) => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />)}</div>
            ) : pendingLeave.length === 0 ? (
              <div className="py-6 text-center">
                <Star size={24} className="mx-auto text-text-muted mb-2" />
                <p className="text-xs text-text-muted">All caught up!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingLeave.slice(0, 4).map(req => (
                  <ApprovalCard key={req.id} req={req} onAction={handleApproval} />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Alerts" icon={<AlertTriangle size={14}/>}>
            <AlertsList team={teamList} />
          </SectionCard>

          <SectionCard title="Quick Actions" icon={<Zap size={14}/>}>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Team',      to: '/dashboard/manager/team',      color: '#6366f1', icon: Users },
                { label: 'Approvals', to: '/dashboard/manager/approvals', color: '#fbbf24', icon: CheckSquare },
                { label: 'Tasks',     to: '/dashboard/manager/tasks',     color: '#a78bfa', icon: Target },
                { label: 'Reports',   to: '/dashboard/manager/reports',   color: '#10b981', icon: TrendingUp },
              ].map(a => {
                const Icon = a.icon
                return (
                  <Link key={a.label} to={a.to}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-200 hover:scale-105"
                    style={{ background: a.color+'0d', borderColor: a.color+'25' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = a.color+'55'; e.currentTarget.style.boxShadow = `0 0 16px ${a.color}20` }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = a.color+'25'; e.currentTarget.style.boxShadow = 'none' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: a.color+'18' }}>
                      <Icon size={16} style={{ color: a.color }} />
                    </div>
                    <span className="text-xs font-medium text-text-secondary">{a.label}</span>
                  </Link>
                )
              })}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

/* ── Hero strip ── */
function ManagerHero({ user, now, teamSize, activeCount, flaggedCount, pendingCount, avgPunctuality }) {
  const h = now.getHours()
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  const day = now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })

  return (
    <div className="relative rounded-2xl overflow-hidden p-6"
      style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(26,34,54,0.9) 60%, rgba(17,24,39,0.95) 100%)', border: '1px solid rgba(99,102,241,0.2)', boxShadow: '0 4px 32px rgba(0,0,0,0.3)' }}>
      <div className="absolute top-0 right-0 w-72 h-72 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)' }} />
      <div className="absolute bottom-0 left-1/4 w-48 h-48 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)' }} />

      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-text-muted mb-0.5">{day}</p>
          <h1 className="text-xl font-bold text-text-primary">
            {greeting}, <span className="gradient-text">{user?.full_name?.split(' ')[0] ?? 'Manager'}</span>
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Your team of <span className="text-text-secondary font-medium">{teamSize}</span> is{' '}
            {flaggedCount > 0
              ? <span className="text-warning-400">{activeCount} active · {flaggedCount} need attention</span>
              : <span className="text-success-400">all present and on track</span>
            }
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <KPIPill color="#10b981" label="Active"       value={`${activeCount}/${teamSize}`} />
          {flaggedCount > 0 && <KPIPill color="#ef4444" label="Flagged"     value={flaggedCount} />}
          {pendingCount > 0 && <KPIPill color="#fbbf24" label="Pending"     value={pendingCount} />}
          <KPIPill color="#a78bfa"                      label="Punctuality" value={`${avgPunctuality}%`} />
        </div>
      </div>
    </div>
  )
}

function KPIPill({ color, label, value }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
      style={{ background: color+'15', border: `1px solid ${color}30`, color }}>
      <span className="font-black text-sm">{value}</span>
      <span className="opacity-75">{label}</span>
    </div>
  )
}

/* ── Mini stat ── */
function MiniStat({ icon, label, value, sub, color, trend }) {
  return (
    <div className="glass-card p-4 group" style={{ padding: 16 }}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: color+'15', border: `1px solid ${color}25` }}>
          <span style={{ color }}>{icon}</span>
        </div>
        {trend !== undefined && (
          <span className={cn('text-[10px] font-bold flex items-center gap-0.5', trend >= 0 ? 'text-success-400' : 'text-danger-400')}>
            {trend >= 0 ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}{Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="text-xl font-bold text-text-primary mb-0.5">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

/* ── Section card ── */
function SectionCard({ title, icon, children, linkTo, linkLabel, badge }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-brand-400">{icon}</span>
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          {badge > 0 && (
            <span className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center"
              style={{ background: '#6366f1', color: '#fff', boxShadow: '0 0 8px rgba(99,102,241,0.5)' }}>
              {badge}
            </span>
          )}
        </div>
        {linkTo && (
          <Link to={linkTo} className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors">
            {linkLabel} <ChevronRight size={12}/>
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

/* ── Team member card ── */
function TeamMemberCard({ emp }) {
  const cfg = PRESENCE_CFG[emp.status] ?? DEFAULT_PRESENCE
  const tasks = emp.tasks ?? { done: 0, open: 0 }
  const taskPct = tasks.done + tasks.open > 0 ? tasks.done / (tasks.done + tasks.open) * 100 : 0

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl border transition-all duration-200 hover:scale-[1.02] cursor-pointer group"
      style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.1)' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = cfg.color+'40'; e.currentTarget.style.boxShadow = `0 0 12px ${cfg.color}15` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.1)'; e.currentTarget.style.boxShadow = 'none' }}>

      {/* Avatar + status */}
      <div className="flex items-center gap-2">
        <div className="relative flex-shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
            style={{ background: cfg.color+'18', color: cfg.color, border: `1px solid ${cfg.color}30` }}>
            {emp.initials}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
            style={{ background: cfg.color, borderColor: '#111827' }}>
            {['CHECKED_IN','OUT_OF_ZONE','PRESENCE_DOUBT'].includes(emp.status) && (
              <div className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: cfg.color }} />
            )}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-text-primary truncate">{emp.name.split(' ')[0]}</p>
          <p className="text-[9px] text-text-muted truncate">{emp.role}</p>
        </div>
      </div>

      {/* Status badge */}
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full self-start"
        style={{ background: cfg.color+'18', color: cfg.color }}>
        {cfg.label}
      </span>

      {/* Task progress */}
      <div>
        <div className="flex justify-between text-[9px] text-text-muted mb-1">
          <span>Tasks</span>
          <span className="text-text-secondary">{tasks.done}/{tasks.done + tasks.open}</span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
          <div className="h-full rounded-full" style={{ width: `${taskPct}%`, background: cfg.color }} />
        </div>
      </div>

      {/* Punctuality */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-text-muted">Punctuality</span>
        <span className="text-[9px] font-bold"
          style={{ color: emp.punctuality >= 90 ? '#10b981' : emp.punctuality >= 80 ? '#f59e0b' : '#ef4444' }}>
          {emp.punctuality}%
        </span>
      </div>
    </div>
  )
}

/* ── Capacity calendar ── */
function CapacityCalendar({ days, teamSize }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-2 min-w-max">
        {days.map((day, i) => {
          const available = teamSize - day.absent - day.onLeave
          const pct = available / teamSize
          const color = pct >= 0.85 ? '#10b981' : pct >= 0.7 ? '#f59e0b' : '#ef4444'
          const today = i === 0
          return (
            <div key={i}
              className={cn('flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-200 hover:scale-105 cursor-pointer min-w-[72px]')}
              style={{
                background: today ? 'rgba(99,102,241,0.12)' : 'rgba(26,34,54,0.5)',
                borderColor: today ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.1)',
              }}>
              <span className="text-[9px] font-bold text-text-muted uppercase">{day.day}</span>
              <span className="text-xs text-text-muted">{day.date}</span>

              {/* Capacity ring */}
              <div className="relative w-10 h-10">
                <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
                  <circle cx="20" cy="20" r="15" fill="none" stroke="rgba(99,102,241,0.1)" strokeWidth="3" />
                  <circle cx="20" cy="20" r="15" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={2*Math.PI*15}
                    strokeDashoffset={2*Math.PI*15*(1-pct)} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[9px] font-black" style={{ color }}>{available}</span>
                </div>
              </div>

              {/* Legend pills */}
              <div className="space-y-0.5 w-full">
                {day.onLeave > 0 && (
                  <div className="flex justify-between text-[8px]">
                    <span className="text-neon-400">Leave</span>
                    <span className="text-text-muted">{day.onLeave}</span>
                  </div>
                )}
                {day.absent > 0 && (
                  <div className="flex justify-between text-[8px]">
                    <span className="text-danger-400">Absent</span>
                    <span className="text-text-muted">{day.absent}</span>
                  </div>
                )}
              </div>

              {today && (
                <span className="text-[8px] font-black text-brand-400 uppercase tracking-wider">Today</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Performance sparkline ── */
function PerformanceChart({ data }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const H = 80, W = 280
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / (max - min)) * H * 0.8 - H * 0.1
    return `${x},${y}`
  }).join(' ')

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible flex-1">
          <defs>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3"/>
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {/* Fill */}
          <path d={`M0,${H} ${pts.split(' ').map((p,i)=>(i===0?`L${p}`:p)).join(' ')} L${W},${H} Z`} fill="url(#sparkFill)" />
          {/* Line */}
          <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 4px rgba(99,102,241,0.6))' }} />
          {/* Dots */}
          {data.map((v, i) => {
            const x = (i / (data.length - 1)) * W
            const y = H - ((v - min) / (max - min)) * H * 0.8 - H * 0.1
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="3" fill="#6366f1" stroke="#111827" strokeWidth="1.5" />
                {i === data.length - 1 && (
                  <text x={x + 6} y={y + 4} fontSize="9" fill="#818cf8" fontWeight="700">{v}%</text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Month labels */}
      <div className="flex justify-between">
        {months.slice(0, data.length).map(m => (
          <span key={m} className="text-[9px] text-text-muted">{m}</span>
        ))}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Current',  value: `${data[data.length-1]}%`, color: '#818cf8' },
          { label: 'Peak',     value: `${max}%`,                  color: '#10b981' },
          { label: 'Trend',    value: data[data.length-1] > data[0] ? '↑ Improving' : '↓ Declining', color: data[data.length-1] > data[0] ? '#10b981' : '#ef4444' },
        ].map(m => (
          <div key={m.label} className="text-center p-2.5 rounded-xl" style={{ background: 'rgba(26,34,54,0.5)', border: '1px solid rgba(99,102,241,0.08)' }}>
            <div className="text-sm font-bold" style={{ color: m.color }}>{m.value}</div>
            <div className="text-[9px] text-text-muted">{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Approval card ── */
function ApprovalCard({ req, onAction }) {
  const [loading, setLoading] = useState(null)

  function act(action) {
    setLoading(action)
    onAction(req.id, action)
  }

  return (
    <div className={cn('p-3 rounded-xl border transition-all duration-200')}
      style={{
        background: req.urgent ? 'rgba(245,158,11,0.06)' : 'rgba(26,34,54,0.5)',
        borderColor: req.urgent ? 'rgba(245,158,11,0.25)' : 'rgba(99,102,241,0.12)',
      }}>
      <div className="flex items-start gap-2.5 mb-2.5">
        {/* Avatar */}
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
          {req.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-text-primary">{req.name}</span>
            {req.urgent && <AlertTriangle size={10} className="text-warning-400" />}
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
              {req.type === 'leave' ? 'Leave' : 'Reg.'}
            </span>
          </div>
          <p className="text-[10px] text-text-muted mt-0.5 truncate">{req.detail}</p>
          <p className="text-[9px] text-text-muted mt-0.5">{req.submitted}</p>
        </div>
      </div>

      {/* Inline approve/reject */}
      <div className="flex gap-1.5">
        <button
          onClick={() => act('approve')}
          disabled={!!loading}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-200 hover:scale-[1.02]"
          style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
          {loading === 'approve'
            ? <div className="w-3 h-3 border border-success-400 border-t-transparent rounded-full animate-spin" />
            : <ThumbsUp size={10} />}
          Approve
        </button>
        <button
          onClick={() => act('reject')}
          disabled={!!loading}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-200 hover:scale-[1.02]"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.22)' }}>
          {loading === 'reject'
            ? <div className="w-3 h-3 border border-danger-400 border-t-transparent rounded-full animate-spin" />
            : <ThumbsDown size={10} />}
          Reject
        </button>
      </div>
    </div>
  )
}

/* ── Alerts list ── */
function AlertsList({ team }) {
  const flagged = team.filter(e => ['OUT_OF_ZONE','PRESENCE_DOUBT','INACTIVE_SIGNAL'].includes(e.status))
  const alerts = flagged.length > 0
    ? flagged.map(e => ({
        msg:   `${e.name} — ${PRESENCE_CFG[e.status]?.label ?? e.status}`,
        color: e.status === 'INACTIVE_SIGNAL' ? '#f59e0b' : '#ef4444',
        icon:  e.status === 'INACTIVE_SIGNAL' ? '📡' : e.status === 'OUT_OF_ZONE' ? '📍' : '⚠️',
      }))
    : [{ msg: 'No active alerts — team is all good', color: '#10b981', icon: '✅' }]

  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl"
          style={{ background: a.color+'08', border: `1px solid ${a.color}22` }}>
          <span className="text-sm flex-shrink-0">{a.icon}</span>
          <p className="text-[10px] text-text-muted leading-relaxed">{a.msg}</p>
        </div>
      ))}
    </div>
  )
}

/* ── Utility helpers ── */
function initials(name) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return `${Math.floor(diff/86400)}d ago`
}

function buildCapacity(teamSize) {
  const days = []
  const d = new Date()
  while (days.length < 10) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) {
      days.push({
        day:     ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow],
        date:    d.toLocaleDateString('en-GB', { day:'numeric', month:'short' }),
        absent:  0,
        onLeave: 0,
      })
    }
    d.setDate(d.getDate() + 1)
  }
  return days
}
