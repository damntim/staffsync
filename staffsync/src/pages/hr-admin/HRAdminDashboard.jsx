import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { usersApi, auditApi, syncApi, leaveApi, qrApi, attendanceApi } from '@/lib/api'
import {
  Users, UserPlus, Shield, MapPin, QrCode, FileText,
  TrendingUp, AlertTriangle, Activity, CheckCircle,
  RefreshCw, Bell, Zap, ScanFace, BarChart2, ChevronRight
} from 'lucide-react'

const QUICK_LINKS = [
  { label: 'Users',    to: '/dashboard/hradmin/users',    color: '#6366f1', icon: Users     },
  { label: 'Invites',  to: '/dashboard/hradmin/invites',  color: '#10b981', icon: UserPlus  },
  { label: 'Geofence', to: '/dashboard/hradmin/geofence', color: '#f59e0b', icon: MapPin    },
  { label: 'QR Codes', to: '/dashboard/hradmin/qr-codes', color: '#a78bfa', icon: QrCode    },
  { label: 'RBAC',     to: '/dashboard/hradmin/rbac',     color: '#ef4444', icon: Shield    },
  { label: 'Policy',   to: '/dashboard/hradmin/policy',   color: '#ec4899', icon: FileText  },
  { label: 'Reports',  to: '/dashboard/hradmin/reports',  color: '#06b6d4', icon: BarChart2 },
  { label: 'Audit',    to: '/dashboard/hradmin/audit',    color: '#fbbf24', icon: Activity  },
  { label: 'Sync',     to: '/dashboard/hradmin/sync',     color: '#14b8a6', icon: RefreshCw },
]

const DEPT_COLORS = ['#6366f1','#10b981','#f59e0b','#a78bfa','#06b6d4','#ec4899','#ef4444','#14b8a6']

export default function HRAdminDashboard() {
  const { user } = useAuthStore()
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t) }, [])

  /* ── API queries ── */
  const { data: usersData }   = useQuery({ queryKey: ['users','list','dashboard'], queryFn: () => usersApi.list({ limit: 200 }), staleTime: 120_000 })
  const { data: auditData }   = useQuery({ queryKey: ['audit','stats'], queryFn: auditApi.stats, staleTime: 60_000 })
  const { data: syncData }    = useQuery({ queryKey: ['sync','status'], queryFn: syncApi.status, staleTime: 60_000 })
  const { data: leaveData }   = useQuery({ queryKey: ['leave','list','pending-hr'], queryFn: () => leaveApi.list({ status: 'SUBMITTED', limit: 50 }), staleTime: 30_000 })
  const { data: zonesData }   = useQuery({ queryKey: ['qr','zones'], queryFn: qrApi.listZones, staleTime: 120_000 })
  const { data: teamToday }   = useQuery({ queryKey: ['attendance','team_today'], queryFn: attendanceApi.teamToday, refetchInterval: 60_000 })
  const { data: auditLog }    = useQuery({
    queryKey: ['audit','list','today'],
    queryFn:  () => auditApi.list({ from: now.toISOString().slice(0,10), to: now.toISOString().slice(0,10), limit: 8 }),
    staleTime: 60_000,
  })

  /* ── Derive stats ── */
  const users         = Array.isArray(usersData?.users ?? usersData) ? (usersData?.users ?? usersData) : []
  const totalStaff    = users.length
  const notEnrolled   = users.filter(u => !u.face_enrolled).length
  const enrolledPct   = totalStaff > 0 ? Math.round(((totalStaff - notEnrolled) / totalStaff) * 100) : 0

  const teamArr       = Array.isArray(teamToday) ? teamToday : []
  const activeToday   = teamArr.filter(e => e.check_in_time).length
  const onLeaveToday  = teamArr.filter(e => e.status === 'ON_LEAVE').length

  const pendingLeaves = Array.isArray(leaveData?.requests ?? leaveData) ? (leaveData?.requests ?? leaveData).length : 0

  const zones         = Array.isArray(zonesData) ? zonesData : []
  const activeZones   = zones.filter(z => z.is_active).length

  const lastSync      = syncData?.last_sync
  const syncHealth    = lastSync?.status === 'success' ? 100 : lastSync ? 75 : 0
  const syncAgo       = lastSync ? timeAgo(lastSync.started_at) : 'Never'

  /* ── Dept breakdown from users list ── */
  const deptMap = {}
  users.forEach(u => {
    const d = u.department ?? 'Other'
    if (!deptMap[d]) deptMap[d] = { count: 0, active: 0 }
    deptMap[d].count++
    if (u.is_active) deptMap[d].active++
  })
  const depts = Object.entries(deptMap)
    .map(([name, v], i) => ({ name, ...v, color: DEPT_COLORS[i % DEPT_COLORS.length] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  /* ── Recent audit events ── */
  const recentEvents = Array.isArray(auditLog) ? auditLog : []

  /* ── Alerts derived from real data ── */
  const alerts = [
    notEnrolled > 0 && { msg: `${notEnrolled} employee${notEnrolled > 1 ? 's' : ''} not face-enrolled`, color: '#ef4444', icon: ScanFace, link: '/dashboard/hradmin/users' },
    pendingLeaves > 0 && { msg: `${pendingLeaves} leave request${pendingLeaves > 1 ? 's' : ''} awaiting approval`, color: '#fbbf24', icon: CheckCircle, link: '/dashboard/hradmin/users' },
    activeZones === 0 && { msg: 'No active geofence zones configured', color: '#f59e0b', icon: MapPin, link: '/dashboard/hradmin/geofence' },
    (!lastSync || syncHealth < 100) && { msg: lastSync ? 'Last sync had issues — review sync log' : 'No sync run yet — trigger first sync', color: '#06b6d4', icon: RefreshCw, link: '/dashboard/hradmin/sync' },
  ].filter(Boolean)

  const h = now.getHours()
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-5 pb-6">

      {/* ── Hero ── */}
      <div className="relative rounded-2xl overflow-hidden p-6"
        style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(26,34,54,0.9) 60%, rgba(17,24,39,0.95) 100%)', border: '1px solid rgba(16,185,129,0.2)', boxShadow: '0 4px 32px rgba(0,0,0,0.3)' }}>
        <div className="absolute top-0 right-0 w-72 h-72 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)' }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs text-text-muted mb-0.5">{now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}</p>
            <h1 className="text-xl font-bold text-text-primary">
              {greeting},{' '}
              <span style={{ background: 'linear-gradient(90deg,#10b981,#06b6d4)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                {user?.full_name?.split(' ')[0] ?? 'Admin'}
              </span>
            </h1>
            <p className="text-sm text-text-muted mt-1">
              <span className="text-success-400 font-medium">{activeToday}</span> of{' '}
              <span className="text-text-secondary font-medium">{totalStaff}</span> employees active today
              {alerts.length > 0 && <> · <span className="text-warning-400">{alerts.length} alert{alerts.length > 1 ? 's' : ''} need attention</span></>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Staff',      val: totalStaff,       color: '#10b981' },
              { label: 'Pending',    val: pendingLeaves,     color: '#fbbf24' },
              { label: 'Face rate',  val: `${enrolledPct}%`, color: '#6366f1' },
              { label: 'Sync',       val: syncHealth > 0 ? `${syncHealth}%` : '—', color: '#06b6d4' },
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

      {/* ── KPI grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total staff',     val: totalStaff || '—',        color: '#6366f1', icon: Users,       sub: `${depts.length} departments` },
          { label: 'Active today',    val: activeToday || '—',       color: '#10b981', icon: Activity,    sub: `${onLeaveToday} on leave` },
          { label: 'Pending approvals', val: pendingLeaves || 0,     color: '#fbbf24', icon: CheckCircle, sub: 'needs action' },
          { label: 'Face enrolled',   val: `${enrolledPct}%`,        color: '#a78bfa', icon: ScanFace,    sub: `${notEnrolled} missing` },
          { label: 'Geofence zones',  val: activeZones || '—',       color: '#f59e0b', icon: MapPin,      sub: `${zones.length} total` },
          { label: 'Open alerts',     val: alerts.length,            color: '#ef4444', icon: Bell,        sub: 'requires review' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="glass-card group" style={{ padding: 14 }}>
              <div className="flex items-start justify-between mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: k.color+'15', border: `1px solid ${k.color}25` }}>
                  <Icon size={13} style={{ color: k.color }} />
                </div>
              </div>
              <div className="text-xl font-black text-text-primary mb-0.5">{k.val}</div>
              <div className="text-[10px] font-semibold text-text-muted">{k.label}</div>
              <div className="text-[9px] text-text-muted mt-0.5">{k.sub}</div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* LEFT 2/3 */}
        <div className="xl:col-span-2 space-y-5">

          {/* Dept breakdown */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart2 size={14} className="text-brand-400" />
                <h2 className="text-sm font-semibold text-text-primary">Department Breakdown</h2>
              </div>
              <Link to="/dashboard/hradmin/reports" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                Reports <ChevronRight size={11}/>
              </Link>
            </div>
            {depts.length === 0 ? (
              <LoadingRows count={4} />
            ) : (
              <div className="space-y-3">
                {depts.map(d => {
                  const pct = d.count > 0 ? Math.round((d.active / d.count) * 100) : 0
                  return (
                    <div key={d.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-text-secondary">{d.name}</span>
                        <span className="text-text-muted">{d.active}/{d.count} active · <span style={{ color: d.color }}>{pct}%</span></span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.08)' }}>
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: d.color, boxShadow: `0 0 8px ${d.color}40` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* System health row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Active zones',  val: activeZones || '—', sub: `${zones.length} configured`,  color: '#f59e0b', icon: MapPin    },
              { label: 'Active QR',     val: zones.filter(z => z.is_active).length || '—', sub: 'Rotating 30s', color: '#a78bfa', icon: QrCode    },
              { label: 'Sync health',   val: syncHealth > 0 ? `${syncHealth}%` : '—', sub: `Last: ${syncAgo}`, color: '#06b6d4', icon: RefreshCw },
            ].map(s => {
              const Icon = s.icon
              return (
                <div key={s.label} className="glass-card p-4 text-center" style={{ padding: 14 }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2" style={{ background: s.color+'15', border: `1px solid ${s.color}25` }}>
                    <Icon size={16} style={{ color: s.color }} />
                  </div>
                  <div className="text-xl font-black mb-0.5" style={{ color: s.color }}>{s.val}</div>
                  <div className="text-[10px] font-semibold text-text-muted">{s.label}</div>
                  <div className="text-[9px] text-text-muted mt-0.5">{s.sub}</div>
                </div>
              )
            })}
          </div>

          {/* Recent activity from audit log */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-brand-400" />
                <h2 className="text-sm font-semibold text-text-primary">Recent Activity</h2>
              </div>
              <Link to="/dashboard/hradmin/audit" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                Full audit log <ChevronRight size={11}/>
              </Link>
            </div>
            {recentEvents.length === 0 ? (
              <div className="py-4 text-center text-xs text-text-muted">No activity recorded today yet</div>
            ) : (
              <div className="space-y-0">
                {recentEvents.map((ev, i) => {
                  const { icon: Icon, color } = auditEventStyle(ev.action_type, ev.status)
                  return (
                    <div key={ev.id ?? i} className="flex items-start gap-3 py-3"
                      style={{ borderBottom: i < recentEvents.length - 1 ? '1px solid rgba(99,102,241,0.07)' : 'none' }}>
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: color+'15', border: `1px solid ${color}25` }}>
                        <Icon size={11} style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-muted leading-relaxed">
                          <span className="text-text-secondary font-medium">{ev.full_name ?? ev.employee_id ?? 'System'}</span>
                          {' — '}{ev.action}: {ev.detail ?? ''}
                        </p>
                      </div>
                      <span className="text-[9px] text-text-muted flex-shrink-0 mt-0.5">{shortTime(ev.created_at)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT 1/3 */}
        <div className="space-y-5">

          {/* Quick nav */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-brand-400" />
              <h2 className="text-sm font-semibold text-text-primary">Admin Modules</h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_LINKS.map(a => {
                const Icon = a.icon
                return (
                  <Link key={a.label} to={a.to}
                    className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all duration-200 hover:scale-105"
                    style={{ background: a.color+'0d', borderColor: a.color+'20' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = a.color+'50'; e.currentTarget.style.boxShadow = `0 0 14px ${a.color}18` }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = a.color+'20'; e.currentTarget.style.boxShadow = 'none' }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: a.color+'15' }}>
                      <Icon size={14} style={{ color: a.color }} />
                    </div>
                    <span className="text-[9px] font-semibold text-text-muted text-center leading-tight">{a.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Alerts (real) */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell size={14} className="text-brand-400" />
              <h2 className="text-sm font-semibold text-text-primary">Open Alerts</h2>
              {alerts.length > 0 && (
                <span className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center"
                  style={{ background: '#ef4444', color: '#fff' }}>
                  {alerts.length}
                </span>
              )}
            </div>
            {alerts.length === 0 ? (
              <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <span className="text-success-400 text-sm">✅</span>
                <p className="text-[10px] text-success-400">All systems normal — no alerts</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((a, i) => {
                  const Icon = a.icon
                  return (
                    <Link key={i} to={a.link}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl transition-all hover:scale-[1.01] group"
                      style={{ background: a.color+'08', border: `1px solid ${a.color}20` }}>
                      <Icon size={12} style={{ color: a.color }} className="flex-shrink-0" />
                      <p className="text-[10px] text-text-muted group-hover:text-text-secondary flex-1 leading-relaxed">{a.msg}</p>
                      <ChevronRight size={10} className="text-text-muted flex-shrink-0" />
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Face enrollment donut */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <ScanFace size={14} className="text-brand-400" />
              <h2 className="text-sm font-semibold text-text-primary">Face Enrollment</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                  <circle cx="40" cy="40" r="30" fill="none" stroke="rgba(99,102,241,0.08)" strokeWidth="8" />
                  <circle cx="40" cy="40" r="30" fill="none" stroke="#6366f1" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={2*Math.PI*30}
                    strokeDashoffset={2*Math.PI*30*(1 - enrolledPct/100)}
                    style={{ filter: 'drop-shadow(0 0 6px rgba(99,102,241,0.5))', transition: 'stroke-dashoffset 1s ease' }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-sm font-black text-brand-400">{enrolledPct}%</span>
                  <span className="text-[8px] text-text-muted">enrolled</span>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Enrolled',    val: totalStaff - notEnrolled, color: '#6366f1' },
                  { label: 'Not enrolled', val: notEnrolled,             color: '#f59e0b' },
                  { label: 'Total staff',  val: totalStaff,              color: '#475569' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    <span className="text-text-muted">{s.label}</span>
                    <span className="font-bold ml-auto" style={{ color: s.color }}>{s.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Helpers ── */
function LoadingRows({ count }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-6 rounded-lg animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
      ))}
    </div>
  )
}

function timeAgo(ts) {
  if (!ts) return 'never'
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return `${Math.floor(diff/86400)}d ago`
}

function shortTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function auditEventStyle(type, status) {
  const map = {
    auth:       { icon: Shield,       color: '#6366f1' },
    face:       { icon: ScanFace,     color: '#a78bfa' },
    leave:      { icon: FileText,     color: '#10b981' },
    attendance: { icon: Activity,     color: '#06b6d4' },
    user:       { icon: UserPlus,     color: '#f59e0b' },
    sync:       { icon: RefreshCw,    color: '#14b8a6' },
    qr:         { icon: QrCode,       color: '#ec4899' },
    system:     { icon: TrendingUp,   color: '#475569' },
  }
  const base = map[type] ?? map.system
  if (status === 'warn' || status === 'error') return { ...base, color: '#ef4444' }
  return base
}
