import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useMyToday } from '@/hooks/useAttendance'
import { useLeaveBalance } from '@/hooks/useLeave'
import { useTaskList } from '@/hooks/useTasks'
import { useNotifications } from '@/hooks/useNotifications'
import { usePresence } from '@/hooks/usePresence'
import { attendanceApi } from '@/lib/api'
import { cn } from '@/lib/cn'
import { TASK_PRIORITY_COLORS, PRESENCE_STATUS_COLORS } from '@/lib/constants'
import {
  Clock, Calendar, CheckSquare, QrCode, TrendingUp,
  Bell, Star, Target, Award,
  ChevronRight, MapPin, Activity
} from 'lucide-react'

const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt(d)         { return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}` }
function fmtTime(str)   { return str ? str.slice(0,5) : '--:--' }
function fmtHours(secs) { return secs ? (secs / 3600).toFixed(1) : '0.0' }

const STATUS_CONFIG = {
  PRESENT:        { label: 'Present',      color: '#10b981' },
  LATE:           { label: 'Late',         color: '#f59e0b' },
  ABSENT:         { label: 'Absent',       color: '#ef4444' },
  ON_LEAVE:       { label: 'On Leave',     color: '#06b6d4' },
  HALF_DAY:       { label: 'Half Day',     color: '#8b5cf6' },
  WORK_FROM_HOME: { label: 'WFH',          color: '#6366f1' },
  HOLIDAY:        { label: 'Holiday',      color: '#475569' },
}

const TASK_STATUS_CONFIG = {
  TODO:        { label: 'To Do',       color: '#475569' },
  IN_PROGRESS: { label: 'In Progress', color: '#6366f1' },
  IN_REVIEW:   { label: 'In Review',   color: '#06b6d4' },
  BLOCKED:     { label: 'Blocked',     color: '#ef4444' },
  DONE:        { label: 'Done',        color: '#10b981' },
}

/* ── leave type colour palette (cycles if more than 4) ── */
const LEAVE_COLORS = ['#6366f1','#22d3ee','#a78bfa','#fbbf24','#10b981','#f472b6']

export default function EmployeeDashboard() {
  const { user } = useAuthStore()
  const [now, setNow] = useState(new Date())

  /* ── Live API queries ── */
  const { data: todayRaw,  isLoading: loadingToday }   = useMyToday()
  const { data: balances,  isLoading: loadingBalance }  = useLeaveBalance()
  const { data: tasksRaw,  isLoading: loadingTasks }    = useTaskList({ assigned_to: 'me', status: 'open', limit: 5 })
  const { data: notifRaw }                              = useNotifications(8)

  /* ── Tick clock every second ── */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  /* ── Derive attendance state ── */
  const today      = todayRaw ?? {}
  const checkedIn  = !!today.check_in_time

  /* ── GPS presence heartbeat — active only when checked in ── */
  const gps = usePresence({ enabled: checkedIn })
  const checkInStr = today.check_in_time   // "HH:MM:SS" or null
  const shift      = { start: user?.shift_start ?? '08:00', end: user?.shift_end ?? '17:00' }
  const shiftSecs  = shift.end ? timeToSecs(shift.end) - timeToSecs(shift.start) : 32400 // 9h default
  const elapsedSec = checkedIn ? (Date.now() / 1000 - todayEpoch(checkInStr)) : 0
  const elapsedH   = Math.max(0, elapsedSec / 3600)

  const isLate      = checkedIn && checkInStr && shiftLate(checkInStr, shift.start)
  const minutesLate = isLate ? calcLate(checkInStr, shift.start) : 0

  /* ── Derive leave balances ── */
  const leaveBalances = Array.isArray(balances)
    ? balances.map((b, i) => ({
        type:  b.leave_type ?? b.type ?? `Leave ${i+1}`,
        taken: Number(b.used ?? 0),
        total: Number(b.entitlement ?? b.total ?? 0),
        color: LEAVE_COLORS[i % LEAVE_COLORS.length],
      }))
    : []

  /* ── Derive tasks ── */
  const tasks = Array.isArray(tasksRaw?.tasks ?? tasksRaw)
    ? (tasksRaw?.tasks ?? tasksRaw).slice(0, 4)
    : []

  const openTasks   = tasks.filter(t => t.status !== 'DONE').length
  const urgentTasks = tasks.filter(t => t.priority === 'URGENT').length

  /* ── Derive activity from notifications ── */
  const activity = Array.isArray(notifRaw)
    ? notifRaw.slice(0, 4).map(n => ({
        icon: notifIcon(n.type),
        text: n.title,
        time: timeAgo(n.created_at),
        color: notifColor(n.type),
      }))
    : []

  /* ── Week hours from today record ── */
  const hoursToday = Number(today.total_hours ?? fmtHours(elapsedSec))
  const hoursWeek  = Number(today.week_hours ?? hoursToday)

  return (
    <div className="space-y-6 pb-6">
      {/* Hero */}
      <HeroStrip
        user={user}
        now={now}
        checkedIn={checkedIn}
        checkInStr={checkInStr}
        shift={shift}
        isLate={isLate}
        minutesLate={minutesLate}
        loading={loadingToday}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStatCard
          label="Today's hours"
          value={`${elapsedH.toFixed(1)}h`}
          sub={`of ${(shiftSecs/3600).toFixed(0)}h shift`}
          icon={<Clock size={17} />}
          color="#6366f1"
          bar={shiftSecs > 0 ? elapsedH / (shiftSecs/3600) : 0}
          loading={loadingToday}
        />
        <MiniStatCard
          label="This week"
          value={`${hoursWeek}h`}
          sub="hours logged"
          icon={<TrendingUp size={17} />}
          color="#10b981"
          loading={loadingToday}
        />
        <MiniStatCard
          label="Open tasks"
          value={loadingTasks ? '…' : openTasks}
          sub={urgentTasks > 0 ? `${urgentTasks} urgent` : 'all clear'}
          icon={<Target size={17} />}
          color="#a78bfa"
          loading={loadingTasks}
        />
        <MiniStatCard
          label="Leave balance"
          value={loadingBalance ? '…' : `${leaveBalances.reduce((s,b) => s + (b.total - b.taken), 0)}d`}
          sub="days remaining"
          icon={<Calendar size={17} />}
          color="#fbbf24"
          loading={loadingBalance}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Left col */}
        <div className="xl:col-span-2 space-y-5">

          {/* 7-day attendance */}
          <AttendanceWeekCard userId={user?.id} />

          {/* My Tasks */}
          <SectionCard title="My Tasks" icon={<CheckSquare size={15} />} linkTo="/dashboard/employee/tasks" linkLabel="All tasks">
            {loadingTasks ? (
              <LoadingRows count={3} />
            ) : tasks.length === 0 ? (
              <EmptyState icon={<CheckSquare size={20} />} text="No open tasks assigned to you" />
            ) : (
              <div className="space-y-2">
                {tasks.map(task => <TaskRow key={task.id} task={task} />)}
              </div>
            )}
          </SectionCard>

          {/* Recent Activity (from notifications) */}
          <SectionCard title="Recent Activity" icon={<Activity size={15} />}>
            {activity.length === 0 ? (
              <EmptyState icon={<Bell size={20} />} text="No recent activity" />
            ) : (
              <div className="space-y-0">
                {activity.map((item, i) => (
                  <div key={i} className={cn(
                    'flex items-start gap-3 py-3',
                    i < activity.length - 1 && 'border-b',
                  )} style={{ borderColor: 'rgba(99,102,241,0.08)' }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
                      style={{ background: item.color + '15', border: `1px solid ${item.color}30` }}>
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary">{item.text}</p>
                      <p className="text-xs text-text-muted mt-0.5">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right col */}
        <div className="space-y-5">

          {/* Presence */}
          <PresenceCard
            checkedIn={checkedIn}
            checkInStr={checkInStr}
            shift={shift}
            elapsedH={elapsedH}
            shiftH={shiftSecs / 3600}
            status={today.status ?? (checkedIn ? 'PRESENT' : null)}
            gps={gps}
          />

          {/* Leave balances */}
          <SectionCard title="Leave Balance" icon={<Calendar size={15} />} linkTo="/dashboard/employee/leave" linkLabel="Apply">
            {loadingBalance ? (
              <LoadingRows count={3} />
            ) : leaveBalances.length === 0 ? (
              <EmptyState icon={<Calendar size={20} />} text="No leave balances found" />
            ) : (
              <div className="space-y-3.5">
                {leaveBalances.map(lb => <LeaveBar key={lb.type} lb={lb} />)}
              </div>
            )}
          </SectionCard>

          {/* Quick actions */}
          <SectionCard title="Quick Actions" icon={<Star size={15} />}>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Check In',    icon: QrCode,      to: '/dashboard/employee/check-in', color: '#6366f1' },
                { label: 'Apply Leave', icon: Calendar,    to: '/dashboard/employee/leave',    color: '#10b981' },
                { label: 'View Tasks',  icon: CheckSquare, to: '/dashboard/employee/tasks',    color: '#a78bfa' },
                { label: 'My Profile',  icon: Award,       to: '/dashboard/employee/profile',  color: '#fbbf24' },
              ].map(action => {
                const Icon = action.icon
                return (
                  <Link key={action.label} to={action.to}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-200 hover:scale-105 active:scale-95"
                    style={{ background: action.color + '0d', borderColor: action.color + '25' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = action.color + '55'; e.currentTarget.style.boxShadow = `0 0 16px ${action.color}20` }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = action.color + '25'; e.currentTarget.style.boxShadow = 'none' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: action.color + '18' }}>
                      <Icon size={16} style={{ color: action.color }} />
                    </div>
                    <span className="text-xs font-medium text-text-secondary text-center leading-tight">{action.label}</span>
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

/* ── Attendance 7-day card — fetches its own data ── */
function AttendanceWeekCard({ userId }) {
  const { data, isLoading } = useAttendanceList7()

  const days = Array.isArray(data)
    ? data.slice(-7).map(r => ({
        day:    DAY_NAMES[new Date(r.date).getDay()],
        status: r.status ?? 'ABSENT',
        h:      Number(r.total_hours ?? 0),
      }))
    : []

  return (
    <SectionCard title="Last 7 Days" icon={<Calendar size={15} />} linkTo="/dashboard/employee/attendance" linkLabel="Full calendar">
      {isLoading ? (
        <div className="flex items-end gap-2 h-24">
          {Array.from({length:7}).map((_,i) => (
            <div key={i} className="flex-1 rounded-lg animate-pulse" style={{ height: `${40 + Math.random()*40}px`, background: 'rgba(99,102,241,0.1)' }} />
          ))}
        </div>
      ) : days.length === 0 ? (
        <EmptyState icon={<Calendar size={20} />} text="No attendance records yet" />
      ) : (
        <AttendanceStrip days={days} />
      )}
    </SectionCard>
  )
}

function useAttendanceList7() {
  const from = new Date(); from.setDate(from.getDate() - 6)
  const to   = new Date()
  return useQuery({
    queryKey: ['attendance', 'my_list', '7day'],
    queryFn:  () => attendanceApi.myList({
      from: from.toISOString().slice(0,10),
      to:   to.toISOString().slice(0,10),
    }),
    staleTime: 60_000,
  })
}

/* ── Hero Strip ── */
function HeroStrip({ user, now, checkedIn, checkInStr, shift, isLate, minutesLate, loading }) {
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="relative rounded-2xl overflow-hidden p-6"
      style={{
        background: 'linear-gradient(135deg, rgba(26,34,54,0.9) 0%, rgba(17,24,39,0.95) 100%)',
        border: '1px solid rgba(99,102,241,0.18)',
        boxShadow: '0 4px 32px rgba(0,0,0,0.3)',
      }}>
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)' }} />
      <div className="absolute bottom-0 left-1/3 w-48 h-48 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)' }} />

      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-text-muted mb-0.5">{fmt(now)}</p>
          <h1 className="text-xl font-bold text-text-primary">
            {greeting},{' '}
            <span className="gradient-text">{user?.full_name?.split(' ')[0] ?? 'there'}</span> 👋
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {loading ? (
              <span className="text-text-muted">Loading attendance…</span>
            ) : !checkedIn ? (
              <span className="text-warning-400">Not checked in yet — head to <Link to="/dashboard/employee/check-in" className="underline">Check In</Link></span>
            ) : isLate ? (
              <span className="text-warning-400">You checked in {minutesLate} min late today</span>
            ) : (
              <span className="text-success-400">You're on time today — great start!</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <LiveClock />
          <div className="flex flex-col items-end gap-1">
            {checkedIn ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-success-400" style={{ animation: 'pulse-dot 2s ease-in-out infinite' }} />
                <span className="text-xs font-semibold text-success-400">
                  Checked in {fmtTime(checkInStr)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-warning-400" />
                <span className="text-xs font-semibold text-warning-400">Not checked in</span>
              </div>
            )}
            <span className="text-[10px] text-text-muted">Shift {shift.start} – {shift.end}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Live Clock ── */
function LiveClock() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i) }, [])
  const h = String(t.getHours()).padStart(2,'0')
  const m = String(t.getMinutes()).padStart(2,'0')
  const s = String(t.getSeconds()).padStart(2,'0')
  return (
    <div className="text-center">
      <div className="font-mono text-2xl font-bold tracking-tight"
        style={{ background: 'linear-gradient(135deg, #818cf8, #22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
        {h}:{m}
      </div>
      <div className="font-mono text-xs text-text-muted">{s}s</div>
    </div>
  )
}

/* ── Mini stat card ── */
function MiniStatCard({ label, value, sub, icon, color, bar, loading }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: color + '15', border: `1px solid ${color}25` }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      {loading ? (
        <div className="h-6 w-16 rounded animate-pulse mb-1" style={{ background: 'rgba(99,102,241,0.1)' }} />
      ) : (
        <div className="text-xl font-bold text-text-primary mb-0.5">{value}</div>
      )}
      <div className="text-xs text-text-muted mb-2">{label}</div>
      {bar !== undefined && (
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
          <div className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${Math.min((bar ?? 0) * 100, 100)}%`, background: color, boxShadow: `0 0 6px ${color}80` }} />
        </div>
      )}
      {sub && <div className="text-[10px] text-text-muted mt-1">{sub}</div>}
    </div>
  )
}

/* ── Section card wrapper ── */
function SectionCard({ title, icon, children, linkTo, linkLabel }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-brand-400">{icon}</span>
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        </div>
        {linkTo && (
          <Link to={linkTo} className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors">
            {linkLabel} <ChevronRight size={12} />
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

/* ── 7-day attendance strip ── */
function AttendanceStrip({ days }) {
  const maxH = 10
  return (
    <div className="flex items-end gap-2">
      {days.map((d, i) => {
        const cfg   = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.PRESENT
        const barH  = d.h > 0 ? Math.max((d.h / maxH) * 72, 6) : 6
        const isToday = i === days.length - 1
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
            <div className="relative w-full flex items-end justify-center" style={{ height: 80 }}>
              <div className="absolute inset-x-0 bottom-0 rounded-lg transition-all duration-300 group-hover:opacity-80"
                style={{
                  height: barH,
                  background: d.h > 0 ? `linear-gradient(180deg, ${cfg.color}cc, ${cfg.color}55)` : 'rgba(71,85,105,0.2)',
                  boxShadow: isToday ? `0 0 10px ${cfg.color}50` : 'none',
                  border: isToday ? `1px solid ${cfg.color}40` : '1px solid transparent',
                }} />
              <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-10">
                <div className="px-2 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap"
                  style={{ background: '#1a2236', border: '1px solid rgba(99,102,241,0.2)', color: cfg.color }}>
                  {d.h > 0 ? `${d.h}h` : cfg.label}
                </div>
              </div>
            </div>
            <span className={cn('text-[10px] font-semibold', isToday ? 'text-brand-400' : 'text-text-muted')}>{d.day}</span>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color, boxShadow: `0 0 4px ${cfg.color}80` }} />
          </div>
        )
      })}
    </div>
  )
}

/* ── Task row ── */
function TaskRow({ task }) {
  const pCfg = TASK_PRIORITY_COLORS[task.priority]
  const sCfg = TASK_STATUS_CONFIG[task.status]
  const progress = Number(task.progress ?? 0)

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 hover:border-brand-500/25"
      style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.1)' }}>
      <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
        style={{ background: pCfg?.dot ?? '#475569', boxShadow: `0 0 6px ${pCfg?.dot}80` }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary truncate">{task.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ background: pCfg?.bg, color: pCfg?.text }}>{task.priority}</span>
          {task.due_date && <span className="text-[10px] text-text-muted">Due {task.due_date.slice(0,10)}</span>}
        </div>
        {progress > 0 && (
          <div className="mt-2 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.12)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: sCfg?.color ?? '#6366f1' }} />
          </div>
        )}
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: (sCfg?.color ?? '#6366f1') + '18', color: sCfg?.color ?? '#6366f1' }}>
          {sCfg?.label ?? task.status}
        </span>
        {progress > 0 && <span className="text-[9px] text-text-muted">{progress}%</span>}
      </div>
    </div>
  )
}

const GPS_STATUS_CFG = {
  CHECKED_IN:      { label: 'In Zone',       color: '#10b981' },
  OUT_OF_ZONE:     { label: 'Out of Zone',   color: '#ef4444' },
  INACTIVE_SIGNAL: { label: 'Inactive',      color: '#f59e0b' },
  PRESENCE_DOUBT:  { label: 'Flagged',       color: '#ef4444' },
  EXEMPT:          { label: 'Exempt',        color: '#06b6d4' },
  CHECKED_OUT:     { label: 'Checked Out',   color: '#475569' },
}

/* ── Presence card ── */
function PresenceCard({ checkedIn, checkInStr, shift, elapsedH, shiftH, status, gps }) {
  const presStatus = checkedIn ? (status ?? 'PRESENT') : null
  const cfg = presStatus ? (PRESENCE_STATUS_COLORS[presStatus] ?? { label: presStatus, color: '#6366f1' }) : { label: 'Not checked in', color: '#475569' }
  const shiftPct = shiftH > 0 ? Math.min((elapsedH / shiftH) * 100, 100) : 0
  const r = 50, C = 2 * Math.PI * r

  const gpsCfg   = gps?.status ? (GPS_STATUS_CFG[gps.status] ?? { label: gps.status, color: '#6366f1' }) : null
  const gpsColor = gpsCfg?.color ?? '#475569'

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin size={15} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-text-primary">My Presence</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: cfg.color, animation: checkedIn ? 'pulse-dot 2s ease-in-out infinite' : 'none' }} />
          <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
        </div>
      </div>

      <div className="relative w-28 h-28 mx-auto mb-4">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(99,102,241,0.1)" strokeWidth="8" />
          <circle cx="60" cy="60" r={r} fill="none"
            stroke={cfg.color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - shiftPct / 100)}
            style={{ transition: 'stroke-dashoffset 1s ease', filter: `drop-shadow(0 0 6px ${cfg.color}80)` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-text-primary">{elapsedH.toFixed(1)}h</span>
          <span className="text-[10px] text-text-muted">of {shiftH.toFixed(0)}h</span>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-text-muted">Checked in</span>
          <span className="text-text-secondary font-medium">{checkInStr ? fmtTime(checkInStr) : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Shift ends</span>
          <span className="text-text-secondary font-medium">{shift.end?.slice(0,5) ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Status</span>
          <span style={{ color: cfg.color }} className="font-medium">{cfg.label}</span>
        </div>
      </div>

      {/* GPS heartbeat row — only shown when checked in */}
      {checkedIn && (
        <div className="mt-4 pt-3 border-t space-y-2" style={{ borderColor: 'rgba(99,102,241,0.1)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Activity size={11} className="text-text-muted" />
              <span className="text-[10px] text-text-muted font-medium uppercase tracking-wide">GPS Heartbeat</span>
            </div>
            {gpsCfg ? (
              <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: gpsColor }}>
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: gpsColor }} />
                {gpsCfg.label}
              </div>
            ) : (
              <span className="text-[10px] text-text-muted">
                {gps?.error ? 'GPS off' : 'Acquiring…'}
              </span>
            )}
          </div>

          {gps?.position && (
            <div className="flex justify-between text-[10px] text-text-muted">
              <span>Zone distance</span>
              <span className="font-mono" style={{ color: gpsColor }}>
                {gps.distanceM != null ? `${gps.distanceM}m` : '—'}
                {gps.zoneName ? ` · ${gps.zoneName}` : ''}
              </span>
            </div>
          )}

          {gps?.error && (
            <p className="text-[10px] text-warning-400">{gps.error}</p>
          )}

          {!gps?.gpsAvailable && !gps?.error && (
            <p className="text-[10px] text-text-muted">GPS not available on this device</p>
          )}

          {gps?.status === 'OUT_OF_ZONE' && (
            <div className="flex items-center gap-1.5 p-2 rounded-lg text-[10px] font-medium"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              <MapPin size={10} />
              You have left the geofence zone — your manager has been notified.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Leave balance bar ── */
function LeaveBar({ lb }) {
  const avail = lb.total - lb.taken
  const pct   = lb.total > 0 ? (lb.taken / lb.total) * 100 : 0
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-medium text-text-secondary">{lb.type}</span>
        <span className="text-xs text-text-muted">
          <span className="font-semibold" style={{ color: lb.color }}>{avail}</span>/{lb.total}d
        </span>
      </div>
      {lb.total > 0 ? (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: lb.color, boxShadow: `0 0 6px ${lb.color}60` }} />
        </div>
      ) : (
        <div className="text-[10px] text-text-muted italic">Not applicable</div>
      )}
    </div>
  )
}

/* ── Shared UI helpers ── */
function LoadingRows({ count }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
      ))}
    </div>
  )
}

function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-text-muted">
      <span className="opacity-30">{icon}</span>
      <p className="text-xs">{text}</p>
    </div>
  )
}

/* ── Utility functions ── */
function timeToSecs(str) {
  if (!str) return 0
  const [h, m] = str.split(':').map(Number)
  return h * 3600 + m * 60
}

function todayEpoch(timeStr) {
  if (!timeStr) return Date.now() / 1000
  const d = new Date()
  const [h, m, s] = timeStr.split(':').map(Number)
  d.setHours(h, m, s ?? 0, 0)
  return d.getTime() / 1000
}

function shiftLate(checkInStr, shiftStart) {
  if (!checkInStr || !shiftStart) return false
  return timeToSecs(checkInStr) > timeToSecs(shiftStart) + 60
}

function calcLate(checkInStr, shiftStart) {
  return Math.round((timeToSecs(checkInStr) - timeToSecs(shiftStart)) / 60)
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 60)   return 'Just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return `${Math.floor(diff/86400)}d ago`
}

function notifIcon(type) {
  const m = { leave: '🏖', task: '📋', attendance: '✅', alert: '🔔', info: '💡', warning: '⚠️' }
  return m[type] ?? '🔔'
}

function notifColor(type) {
  const m = { leave: '#22d3ee', task: '#818cf8', attendance: '#10b981', alert: '#ef4444', warning: '#f59e0b', info: '#6366f1' }
  return m[type] ?? '#818cf8'
}
