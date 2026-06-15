import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { syncApi, auditApi, qrApi, authApi, usersApi } from '@/lib/api'
import { ROLE_LABELS } from '@/lib/constants'
import {
  Server, Shield, QrCode, MapPin, Activity, RefreshCw,
  AlertTriangle, CheckCircle, Database, Cpu, Zap, ChevronRight,
  UserPlus, Mail, Copy, Send, Loader, ExternalLink, Trash2, RotateCcw, Clock
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'

const QUICK_LINKS = [
  { label: 'QR Codes',  to: '/dashboard/it-admin/qrcodes',  color: '#6366f1', icon: QrCode   },
  { label: 'Geofence',  to: '/dashboard/it-admin/geofence', color: '#f59e0b', icon: MapPin   },
  { label: 'Audit Log', to: '/dashboard/it-admin/audit',    color: '#10b981', icon: Activity  },
  { label: 'Security',  to: '/dashboard/it-admin/security', color: '#ef4444', icon: Shield   },
]

const ROLES_LIST = ['EMPLOYEE','MANAGER','HR','IT_ADMIN']
const DEPTS_LIST = ['Engineering','HR','Finance','Design','DevOps','Sales','IT','QA','Operations']

export default function ITAdminDashboard() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t) }, [])

  /* Invite form state */
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'EMPLOYEE', department: 'Engineering' })
  const [lastLink, setLastLink]     = useState(null)
  const upInvite = (k, v) => setInviteForm(f => ({ ...f, [k]: v }))

  const inviteMut = useMutation({
    mutationFn: (d) => authApi.inviteSend(d),
    onSuccess: (data) => {
      const link = data?.link ?? `${window.location.origin}/register?invite=...`
      setLastLink(link)
      toast.success(`Invite sent to ${inviteForm.email}`)
      qc.invalidateQueries({ queryKey: ['invites'] })
      setInviteForm({ email: '', name: '', role: 'EMPLOYEE', department: 'Engineering' })
    },
    onError: (e) => toast.error(e.message ?? 'Failed to send invite'),
  })

  function sendInvite(e) {
    e.preventDefault()
    if (!inviteForm.email || !inviteForm.name) return toast.error('Email and name required')
    inviteMut.mutate(inviteForm)
  }

  function copyLink(link) {
    navigator.clipboard.writeText(link)
    toast.success('Link copied!')
  }

  const { data: syncStatus }  = useQuery({ queryKey: ['sync','status'],       queryFn: syncApi.status,      staleTime: 60_000 })
  const { data: tableHealth } = useQuery({ queryKey: ['sync','table_health'], queryFn: syncApi.tableHealth, staleTime: 120_000 })
  const { data: auditStats }  = useQuery({ queryKey: ['audit','stats'],       queryFn: auditApi.stats,      staleTime: 60_000 })
  const { data: zones }       = useQuery({ queryKey: ['qr','zones'],          queryFn: qrApi.listZones,     staleTime: 120_000 })
  const { data: pendingRaw, refetch: refetchPending } = useQuery({ queryKey: ['users','pending'], queryFn: usersApi.pending, staleTime: 30_000 })
  const pendingUsers = Array.isArray(pendingRaw) ? pendingRaw : []

  const resetFaceMut = useMutation({
    mutationFn: (id) => usersApi.resetFace(id),
    onSuccess: (data) => { toast.success('Face reset — user must re-enrol'); refetchPending() },
    onError:   (e)    => toast.error(e.message ?? 'Reset failed'),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => usersApi.deleteUser(id),
    onSuccess: ()    => { toast.success('User deleted'); refetchPending() },
    onError:   (e)   => toast.error(e.message ?? 'Delete failed'),
  })
  const activateMut = useMutation({
    mutationFn: (id) => usersApi.reactivate(id),
    onSuccess: ()    => { toast.success('User activated'); refetchPending() },
    onError:   (e)   => toast.error(e.message ?? 'Activation failed'),
  })

  const lastSync   = syncStatus?.last_sync
  const syncOk     = lastSync?.status === 'success'
  const tables     = Array.isArray(tableHealth) ? tableHealth : []
  const unhealthy  = tables.filter(t => t.status !== 'ok').length
  const zoneList   = Array.isArray(zones) ? zones : []
  const activeZones = zoneList.filter(z => z.is_active).length

  const h = now.getHours()
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'

  const systemStatus = unhealthy === 0 && syncOk ? 'healthy' : unhealthy > 0 ? 'degraded' : 'warning'
  const statusColor  = { healthy: '#10b981', degraded: '#ef4444', warning: '#f59e0b' }[systemStatus]
  const statusLabel  = { healthy: 'All systems operational', degraded: `${unhealthy} table${unhealthy > 1 ? 's' : ''} need attention`, warning: 'Sync needs review' }[systemStatus]

  return (
    <div className="space-y-5 pb-6">

      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden p-6"
        style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(26,34,54,0.9) 60%, rgba(17,24,39,0.95) 100%)', border: '1px solid rgba(239,68,68,0.2)', boxShadow: '0 4px 32px rgba(0,0,0,0.3)' }}>
        <div className="absolute top-0 right-0 w-72 h-72 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.07) 0%, transparent 70%)' }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs text-text-muted mb-0.5">{now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}</p>
            <h1 className="text-xl font-bold text-text-primary">
              {greeting},{' '}
              <span style={{ background: 'linear-gradient(90deg,#ef4444,#f59e0b)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                {user?.full_name?.split(' ')[0] ?? 'IT Admin'}
              </span>
            </h1>
            <p className="text-sm text-text-muted mt-1">
              System status:{' '}
              <span style={{ color: statusColor }} className="font-medium">{statusLabel}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Sync',    val: syncOk ? 'OK' : 'Error',     color: syncOk ? '#10b981' : '#ef4444' },
              { label: 'Tables',  val: `${tables.length - unhealthy}/${tables.length}`, color: unhealthy > 0 ? '#f59e0b' : '#10b981' },
              { label: 'QR Zones', val: activeZones, color: '#a78bfa' },
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

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'DB Tables',       val: tables.length || '—', color: '#6366f1', icon: Database, sub: `${unhealthy} unhealthy` },
          { label: 'Last sync',       val: lastSync ? timeAgo(lastSync.started_at) : '—', color: syncOk ? '#10b981' : '#ef4444', icon: RefreshCw, sub: lastSync?.status ?? 'no sync yet' },
          { label: 'Active QR zones', val: activeZones,           color: '#a78bfa', icon: QrCode,    sub: `${zoneList.length} total` },
          { label: 'System health',   val: systemStatus === 'healthy' ? '100%' : `${Math.round(((tables.length - unhealthy) / Math.max(tables.length, 1)) * 100)}%`, color: statusColor, icon: Server, sub: statusLabel },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="glass-card p-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: k.color+'15', border: `1px solid ${k.color}25` }}>
                <Icon size={15} style={{ color: k.color }} />
              </div>
              <div className="text-xl font-black text-text-primary mb-0.5">{k.val}</div>
              <div className="text-xs text-text-muted">{k.label}</div>
              <div className="text-[10px] text-text-muted mt-0.5">{k.sub}</div>
            </div>
          )
        })}
      </div>

      {/* ── Invite a User — full-width panel ── */}
      <div className="glass-card p-5" style={{ border: '1px solid rgba(139,92,246,0.25)', background: 'linear-gradient(135deg,rgba(139,92,246,0.06) 0%,rgba(17,24,39,0.95) 100%)' }}>
        <div className="flex items-center gap-2 mb-4">
          <UserPlus size={15} className="text-violet-400" />
          <h2 className="text-sm font-semibold text-text-primary">Invite a User</h2>
          <span className="ml-auto text-[10px] text-text-muted px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
            Registration link generated on submit
          </span>
        </div>

        <form onSubmit={sendInvite}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Full Name</label>
              <input type="text" value={inviteForm.name} onChange={e => upInvite('name', e.target.value)}
                placeholder="Jane Smith"
                className="w-full px-3 py-2 rounded-xl text-sm border text-text-primary placeholder:text-text-muted focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }} />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Email Address</label>
              <input type="email" value={inviteForm.email} onChange={e => upInvite('email', e.target.value)}
                placeholder="jane@devx.com"
                className="w-full px-3 py-2 rounded-xl text-sm border text-text-primary placeholder:text-text-muted focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }} />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Role</label>
              <select value={inviteForm.role} onChange={e => upInvite('role', e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs border text-text-primary focus:outline-none"
                style={{ background: 'rgba(20,28,48,0.95)', borderColor: 'rgba(255,255,255,0.1)' }}>
                {ROLES_LIST.map(r => <option key={r} value={r} style={{ background: '#141c30' }}>{ROLE_LABELS[r] ?? r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Department</label>
              <select value={inviteForm.department} onChange={e => upInvite('department', e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs border text-text-primary focus:outline-none"
                style={{ background: 'rgba(20,28,48,0.95)', borderColor: 'rgba(255,255,255,0.1)' }}>
                {DEPTS_LIST.map(d => <option key={d} value={d} style={{ background: '#141c30' }}>{d}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={inviteMut.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#6366f1)', color: '#fff', opacity: inviteMut.isPending ? 0.7 : 1 }}>
            {inviteMut.isPending ? <><Loader size={13} className="animate-spin" /> Sending…</> : <><Send size={13} /> Send Invite</>}
          </button>
        </form>

        {lastLink && (
          <div className="mt-4 p-3 rounded-xl flex items-start gap-3" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <Mail size={13} className="text-success-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-success-400 mb-1">Invite sent — share this registration link:</p>
              <code className="text-[11px] text-text-secondary break-all leading-relaxed">{lastLink}</code>
            </div>
            <button onClick={() => copyLink(lastLink)} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/10" title="Copy"><Copy size={13} className="text-text-muted" /></button>
            <a href={lastLink} target="_blank" rel="noreferrer" className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/10" title="Open"><ExternalLink size={13} className="text-text-muted" /></a>
            <button onClick={() => setLastLink(null)} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-[10px] text-text-muted">✕</button>
          </div>
        )}
      </div>

      {/* ── Pending / Stuck Users ── only shown when there are issues */}
      {pendingUsers.length > 0 && (
        <div className="glass-card p-5" style={{ border: '1px solid rgba(245,158,11,0.3)', background: 'linear-gradient(135deg,rgba(245,158,11,0.05) 0%,rgba(17,24,39,0.95) 100%)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} className="text-warning-400" />
            <h2 className="text-sm font-semibold text-text-primary">Pending / Stuck Accounts</h2>
            <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
              {pendingUsers.length}
            </span>
            <span className="ml-auto text-[10px] text-text-muted">Users who registered but haven't completed face enrollment</span>
          </div>
          <div className="space-y-2">
            {pendingUsers.map(u => {
              const busy = resetFaceMut.isPending || deleteMut.isPending || activateMut.isPending
              return (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                    {u.full_name?.split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase() ?? '??'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text-primary">{u.full_name}</p>
                    <p className="text-[10px] text-text-muted truncate">{u.email} · {u.employee_id} · {ROLE_LABELS[u.role] ?? u.role}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: u.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: u.is_active ? '#10b981' : '#ef4444' }}>
                        {u.is_active ? 'active' : 'inactive'}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: u.face_enrolled ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: u.face_enrolled ? '#10b981' : '#ef4444' }}>
                        {u.face_enrolled ? 'face enrolled' : 'no face'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Activate without face (bypass) */}
                    {!u.is_active && (
                      <button disabled={busy} onClick={() => activateMut.mutate(u.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:scale-105"
                        style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}
                        title="Activate account (bypasses face requirement)">
                        <CheckCircle size={11} /> Activate
                      </button>
                    )}
                    {/* Reset face — clears descriptor, sets inactive, user must re-enrol */}
                    <button disabled={busy} onClick={() => resetFaceMut.mutate(u.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:scale-105"
                      style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}
                      title="Reset face data — user must re-enrol">
                      <RotateCcw size={11} /> Reset Face
                    </button>
                    {/* Delete user entirely */}
                    <button disabled={busy} onClick={() => { if (confirm(`Delete ${u.full_name}? This cannot be undone.`)) deleteMut.mutate(u.id) }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:scale-105"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                      title="Permanently delete this user">
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">

          {/* Database table health */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Database size={14} className="text-brand-400" />
                <h2 className="text-sm font-semibold text-text-primary">Database Table Health</h2>
              </div>
              {unhealthy > 0 && (
                <span className="text-xs font-bold text-danger-400 flex items-center gap-1">
                  <AlertTriangle size={11} /> {unhealthy} issue{unhealthy > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {tables.length === 0 ? (
              <div className="space-y-2">
                {Array.from({length:5}).map((_,i) => <div key={i} className="h-8 rounded-lg animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />)}
              </div>
            ) : (
              <div className="space-y-2">
                {tables.map(t => {
                  const ok = t.status === 'ok'
                  return (
                    <div key={t.table_name} className="flex items-center gap-3 p-2.5 rounded-xl"
                      style={{ background: ok ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.06)', border: `1px solid ${ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.2)'}` }}>
                      {ok ? <CheckCircle size={13} className="text-success-400 flex-shrink-0" />
                          : <AlertTriangle size={13} className="text-danger-400 flex-shrink-0" />}
                      <span className="text-xs font-mono text-text-secondary flex-1">{t.table_name}</span>
                      <span className="text-xs text-text-muted">{t.row_count ?? '—'} rows</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: (ok ? '#10b981' : '#ef4444')+'18', color: ok ? '#10b981' : '#ef4444' }}>
                        {t.status ?? 'unknown'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Sync history */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <RefreshCw size={14} className="text-brand-400" />
                <h2 className="text-sm font-semibold text-text-primary">Sync Status</h2>
              </div>
              <Link to="/dashboard/hr/sync" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                Full sync log <ChevronRight size={11}/>
              </Link>
            </div>
            {!lastSync ? (
              <div className="py-4 text-center text-xs text-text-muted">No sync records yet</div>
            ) : (
              <div className="space-y-3 text-xs">
                {[
                  { label: 'Last sync',       val: lastSync.started_at?.slice(0,19)?.replace('T',' ') ?? '—' },
                  { label: 'Status',          val: lastSync.status ?? '—', color: lastSync.status === 'success' ? '#10b981' : '#ef4444' },
                  { label: 'Records synced',  val: lastSync.records_synced ?? '—' },
                  { label: 'Duration',        val: lastSync.duration_ms ? `${lastSync.duration_ms}ms` : '—' },
                  { label: 'Next scheduled',  val: syncStatus?.auto_schedule ?? '—' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between py-1.5 border-b" style={{ borderColor: 'rgba(99,102,241,0.07)' }}>
                    <span className="text-text-muted">{row.label}</span>
                    <span className="font-medium" style={{ color: row.color ?? '#cbd5e1' }}>{row.val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right col */}
        <div className="space-y-5">

          {/* Quick nav */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-brand-400" />
              <h2 className="text-sm font-semibold text-text-primary">IT Tools</h2>
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

          {/* System info */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={14} className="text-brand-400" />
              <h2 className="text-sm font-semibold text-text-primary">System Info</h2>
            </div>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Environment', val: 'Development' },
                { label: 'Database',    val: 'MySQL (staffsync)' },
                { label: 'PHP',         val: 'PHP 8+ / XAMPP' },
                { label: 'JWT expiry',  val: '8 hours' },
                { label: 'QR rotation', val: '30 seconds' },
                { label: 'Invite TTL',  val: '7 days' },
              ].map(row => (
                <div key={row.label} className="flex justify-between py-1.5 border-b" style={{ borderColor: 'rgba(99,102,241,0.07)' }}>
                  <span className="text-text-muted">{row.label}</span>
                  <span className="text-text-secondary font-medium font-mono">{row.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
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
