import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { leaveApi, attendanceApi, usersApi } from '@/lib/api'
import {
  Users, Calendar, Clock, CheckCircle, AlertTriangle,
  ChevronRight, Activity, UserPlus, ScanFace, MapPin, Zap
} from 'lucide-react'

const QUICK_LINKS = [
  { label: 'Leave Queue',   to: '/dashboard/hr-officer/leave',         color: '#6366f1', icon: Calendar  },
  { label: 'Attendance',    to: '/dashboard/hr-officer/attendance',    color: '#10b981', icon: Clock     },
  { label: 'Invites',       to: '/dashboard/hr-officer/invites',       color: '#f59e0b', icon: UserPlus  },
  { label: 'Face Profiles', to: '/dashboard/hr-officer/face-profiles', color: '#a78bfa', icon: ScanFace  },
  { label: 'Presence',      to: '/dashboard/hr-officer/presence',      color: '#06b6d4', icon: MapPin    },
]

export default function HROfficerDashboard() {
  const { user } = useAuthStore()
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t) }, [])

  const { data: leaveRaw }  = useQuery({ queryKey: ['leave','pending','officer'], queryFn: () => leaveApi.list({ status: 'SUBMITTED', limit: 50 }), staleTime: 30_000 })
  const { data: teamToday } = useQuery({ queryKey: ['attendance','team_today'], queryFn: attendanceApi.teamToday, refetchInterval: 60_000 })
  const { data: usersRaw }  = useQuery({ queryKey: ['users','list','officer'], queryFn: () => usersApi.list({ limit: 200 }), staleTime: 120_000 })

  const pending    = Array.isArray(leaveRaw?.requests ?? leaveRaw) ? (leaveRaw?.requests ?? leaveRaw) : []
  const team       = Array.isArray(teamToday) ? teamToday : []
  const users      = Array.isArray(usersRaw?.users ?? usersRaw) ? (usersRaw?.users ?? usersRaw) : []

  const activeNow  = team.filter(e => e.check_in_time && !e.check_out_time).length
  const onLeave    = team.filter(e => e.status === 'ON_LEAVE').length
  const notEnrolled = users.filter(u => !u.face_enrolled && u.is_active).length
  const absent     = team.filter(e => !e.check_in_time && e.status !== 'ON_LEAVE').length

  const h = now.getHours()
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'

  /* Recent leave requests */
  const recentLeave = pending.slice(0, 5)

  return (
    <div className="space-y-5 pb-6">

      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden p-6"
        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(26,34,54,0.9) 60%, rgba(17,24,39,0.95) 100%)', border: '1px solid rgba(99,102,241,0.2)', boxShadow: '0 4px 32px rgba(0,0,0,0.3)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)' }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs text-text-muted mb-0.5">{now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}</p>
            <h1 className="text-xl font-bold text-text-primary">
              {greeting}, <span className="gradient-text">{user?.full_name?.split(' ')[0] ?? 'Officer'}</span>
            </h1>
            <p className="text-sm text-text-muted mt-1">
              <span className="text-success-400 font-medium">{activeNow}</span> employees active ·{' '}
              {pending.length > 0
                ? <span className="text-warning-400">{pending.length} leave request{pending.length > 1 ? 's' : ''} pending your review</span>
                : <span className="text-success-400">all leave requests handled</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Active',   val: activeNow,     color: '#10b981' },
              { label: 'On leave', val: onLeave,        color: '#06b6d4' },
              { label: 'Pending',  val: pending.length, color: '#fbbf24' },
              { label: 'Absent',   val: absent,         color: '#ef4444' },
            ].map(p => (
              <div key={p.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: p.color+'15', border: `1px solid ${p.color}30`, color: p.color }}>
                <span className="font-black text-sm">{p.val}</span>
                <span className="opacity-75">{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Leave pending',   val: pending.length, sub: 'awaiting approval', color: '#6366f1', icon: Calendar  },
          { label: 'Active today',    val: activeNow,       sub: `${onLeave} on leave`, color: '#10b981', icon: Activity  },
          { label: 'Absent today',    val: absent,          sub: 'no check-in',       color: '#ef4444', icon: AlertTriangle },
          { label: 'Face incomplete', val: notEnrolled,     sub: 'need enrollment',   color: '#a78bfa', icon: ScanFace  },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="glass-card p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: k.color+'15', border: `1px solid ${k.color}25` }}>
                  <Icon size={15} style={{ color: k.color }} />
                </div>
              </div>
              <div className="text-2xl font-black text-text-primary mb-0.5">{k.val}</div>
              <div className="text-xs text-text-muted">{k.label}</div>
              <div className="text-[10px] text-text-muted mt-0.5">{k.sub}</div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">

          {/* Pending leave requests */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-brand-400" />
                <h2 className="text-sm font-semibold text-text-primary">Pending Leave Requests</h2>
                {pending.length > 0 && (
                  <span className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center"
                    style={{ background: '#6366f1', color: '#fff' }}>
                    {pending.length}
                  </span>
                )}
              </div>
              <Link to="/dashboard/hr-officer/leave" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                All requests <ChevronRight size={11}/>
              </Link>
            </div>
            {recentLeave.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle size={28} className="mx-auto text-success-400 mb-2" />
                <p className="text-sm text-success-400 font-medium">All caught up!</p>
                <p className="text-xs text-text-muted mt-1">No pending leave requests</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentLeave.map(r => (
                  <LeaveRow key={r.id} req={r} />
                ))}
              </div>
            )}
          </div>

          {/* Today's attendance snapshot */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-brand-400" />
                <h2 className="text-sm font-semibold text-text-primary">Today's Attendance</h2>
              </div>
              <Link to="/dashboard/hr-officer/attendance" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                Full view <ChevronRight size={11}/>
              </Link>
            </div>
            {team.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No attendance data yet</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Checked in',  count: activeNow,  color: '#10b981' },
                  { label: 'On leave',    count: onLeave,    color: '#06b6d4' },
                  { label: 'Absent',      count: absent,     color: '#ef4444' },
                  { label: 'Checked out', count: team.filter(e => e.check_out_time).length, color: '#475569' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: s.color+'0a', border: `1px solid ${s.color}20` }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm"
                      style={{ background: s.color+'18', color: s.color }}>
                      {s.count}
                    </div>
                    <span className="text-xs text-text-muted">{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right col */}
        <div className="space-y-5">

          {/* Quick links */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-brand-400" />
              <h2 className="text-sm font-semibold text-text-primary">Quick Actions</h2>
            </div>
            <div className="space-y-2">
              {QUICK_LINKS.map(a => {
                const Icon = a.icon
                return (
                  <Link key={a.label} to={a.to}
                    className="flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 hover:scale-[1.01]"
                    style={{ background: a.color+'0d', borderColor: a.color+'25' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = a.color+'55'; e.currentTarget.style.boxShadow = `0 0 12px ${a.color}18` }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = a.color+'25'; e.currentTarget.style.boxShadow = 'none' }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: a.color+'18' }}>
                      <Icon size={14} style={{ color: a.color }} />
                    </div>
                    <span className="text-sm font-medium text-text-secondary">{a.label}</span>
                    <ChevronRight size={13} className="ml-auto text-text-muted" />
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Alerts */}
          {(notEnrolled > 0 || absent > 2) && (
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={14} className="text-warning-400" />
                <h2 className="text-sm font-semibold text-text-primary">Needs Attention</h2>
              </div>
              <div className="space-y-2">
                {notEnrolled > 0 && (
                  <Link to="/dashboard/hr-officer/face-profiles"
                    className="flex items-center gap-2 p-2.5 rounded-xl"
                    style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)' }}>
                    <ScanFace size={12} className="text-violet-400 flex-shrink-0" />
                    <p className="text-[10px] text-text-muted flex-1">{notEnrolled} employees missing face enrollment</p>
                    <ChevronRight size={10} className="text-text-muted" />
                  </Link>
                )}
                {absent > 2 && (
                  <Link to="/dashboard/hr-officer/attendance"
                    className="flex items-center gap-2 p-2.5 rounded-xl"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertTriangle size={12} className="text-danger-400 flex-shrink-0" />
                    <p className="text-[10px] text-text-muted flex-1">{absent} employees absent today — follow up</p>
                    <ChevronRight size={10} className="text-text-muted" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LeaveRow({ req }) {
  const statusColors = { SUBMITTED: '#f59e0b', APPROVED: '#10b981', REJECTED: '#ef4444' }
  const color = statusColors[req.status] ?? '#475569'
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border"
      style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.1)' }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ background: '#6366f118', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
        {initials(req.full_name ?? req.employee_name ?? '?')}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text-primary truncate">{req.full_name ?? req.employee_name ?? 'Employee'}</p>
        <p className="text-[10px] text-text-muted">{req.leave_type ?? 'Leave'} · {req.start_date?.slice(0,10)} → {req.end_date?.slice(0,10)}</p>
      </div>
      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ background: color+'18', color }}>
        {req.status}
      </span>
    </div>
  )
}

function initials(name) {
  return (name ?? '').split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}
