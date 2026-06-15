import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditApi, usersApi } from '@/lib/api'
import { Shield, AlertTriangle, Lock, Users, Activity, Eye } from 'lucide-react'

export default function ITAdminSecurity() {
  const [from] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0,10)
  })
  const to = new Date().toISOString().slice(0,10)

  const { data: auditRaw, isLoading: loadingAudit } = useQuery({
    queryKey: ['audit','list','security', from, to],
    queryFn:  () => auditApi.list({ from, to, status: 'warn', limit: 50 }),
    staleTime: 60_000,
  })

  const { data: usersRaw } = useQuery({
    queryKey: ['users','list','security'],
    queryFn:  () => usersApi.list({ limit: 200 }),
    staleTime: 120_000,
  })

  const events = Array.isArray(auditRaw) ? auditRaw : []
  const users  = Array.isArray(usersRaw?.users ?? usersRaw) ? (usersRaw?.users ?? usersRaw) : []

  const lockedUsers = users.filter(u => u.locked_until && new Date(u.locked_until) > new Date())
  const inactiveUsers = users.filter(u => !u.is_active)
  const noFace  = users.filter(u => u.is_active && !u.face_enrolled)

  const EVENT_COLORS = {
    warn:  '#f59e0b',
    error: '#ef4444',
  }

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Security Overview</h1>
        <p className="text-sm text-text-muted mt-0.5">Security events and account status — last 7 days</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Security events', val: events.length,       color: '#f59e0b', icon: AlertTriangle },
          { label: 'Locked accounts', val: lockedUsers.length,  color: '#ef4444', icon: Lock         },
          { label: 'Inactive users',  val: inactiveUsers.length,color: '#475569', icon: Users        },
          { label: 'No face enrolled',val: noFace.length,       color: '#a78bfa', icon: Eye          },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="glass-card p-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: s.color+'15', border: `1px solid ${s.color}25` }}>
                <Icon size={15} style={{ color: s.color }} />
              </div>
              <div className="text-xl font-black mb-0.5" style={{ color: s.color }}>{s.val}</div>
              <div className="text-xs text-text-muted">{s.label}</div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Security events */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={14} className="text-warning-400" />
            <h2 className="text-sm font-semibold text-text-primary">Security Events (7 days)</h2>
          </div>
          {loadingAudit ? (
            <div className="space-y-2">{Array.from({length:4}).map((_,i) => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />)}</div>
          ) : events.length === 0 ? (
            <div className="py-6 text-center">
              <Shield size={28} className="mx-auto text-success-400 mb-2" />
              <p className="text-xs text-success-400 font-medium">No security events in the last 7 days</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {events.map((ev, i) => (
                <div key={ev.id ?? i} className="flex items-start gap-3 p-2.5 rounded-xl"
                  style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <Activity size={12} className="text-warning-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-primary font-medium truncate">{ev.action}</p>
                    <p className="text-[10px] text-text-muted truncate">{ev.full_name ?? ev.employee_id ?? 'System'} · {ev.detail ?? ''}</p>
                  </div>
                  <span className="text-[9px] text-text-muted flex-shrink-0">{ev.created_at?.slice(0,10)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Locked accounts */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={14} className="text-danger-400" />
            <h2 className="text-sm font-semibold text-text-primary">Locked Accounts</h2>
          </div>
          {lockedUsers.length === 0 ? (
            <div className="py-6 text-center">
              <Shield size={28} className="mx-auto text-success-400 mb-2" />
              <p className="text-xs text-success-400 font-medium">No locked accounts</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lockedUsers.map(u => (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                    {u.full_name.split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text-primary">{u.full_name}</p>
                    <p className="text-[10px] text-text-muted">Locked until {u.locked_until?.slice(0,16)?.replace('T',' ')}</p>
                  </div>
                  <Lock size={12} className="text-danger-400 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
