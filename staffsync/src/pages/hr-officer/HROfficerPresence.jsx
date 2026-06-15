import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { attendanceApi, presenceApi } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { MapPin, Activity, AlertTriangle, Clock, Shield, CheckCircle, RefreshCw, WifiOff } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS_CFG = {
  CHECKED_IN:      { label: 'Active',       color: '#10b981' },
  CHECKED_OUT:     { label: 'Checked Out',  color: '#475569' },
  ON_LEAVE:        { label: 'On Leave',     color: '#06b6d4' },
  ABSENT:          { label: 'Absent',       color: '#ef4444' },
  OUT_OF_ZONE:     { label: 'Out of Zone',  color: '#ef4444' },
  INACTIVE_SIGNAL: { label: 'Inactive',     color: '#f59e0b' },
  PRESENCE_DOUBT:  { label: 'Flagged',      color: '#ef4444' },
  EXEMPT:          { label: 'Exempt',       color: '#06b6d4' },
}

function initials(name = '') {
  return (name ?? '').split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '??'
}

function hbAge(ts) {
  if (!ts) return null
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export default function HROfficerPresence() {
  const qc = useQueryClient()
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [exemptModal, setExemptModal]   = useState(null)
  const [exemptReason, setExemptReason] = useState('')

  /* Attendance roster (who checked in today) */
  const { data: teamToday, isLoading: loadingAttend } = useQuery({
    queryKey: ['attendance', 'team_today'],
    queryFn:  attendanceApi.teamToday,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  /* GPS presence board */
  const { data: presenceRaw, isLoading: loadingPresence, refetch } = useQuery({
    queryKey: ['presence', 'live'],
    queryFn:  presenceApi.liveList,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const attendTeam  = Array.isArray(teamToday) ? teamToday : []
  const presTeam    = Array.isArray(presenceRaw?.team) ? presenceRaw.team : []
  const geoEvents   = Array.isArray(presenceRaw?.events) ? presenceRaw.events : []

  /* Merge: attendance record + presence GPS status */
  const merged = attendTeam.map(a => {
    const ps = presTeam.find(p => p.user_id === (a.user_id ?? a.id))
    return {
      ...a,
      gps_status:     ps?.status ?? null,
      last_heartbeat: ps?.last_heartbeat ?? null,
      last_dist_m:    ps?.last_dist_m ?? null,
      zone_name:      ps?.zone_name ?? null,
      exempt_reason:  ps?.exempt_reason ?? null,
    }
  })

  const effectiveStatus = (e) => {
    if (e.gps_status && e.gps_status !== 'CHECKED_OUT') return e.gps_status
    if (e.check_in_time && !e.check_out_time) return 'CHECKED_IN'
    if (e.status === 'ON_LEAVE') return 'ON_LEAVE'
    if (!e.check_in_time) return 'ABSENT'
    return 'CHECKED_OUT'
  }

  const activeCount  = merged.filter(e => effectiveStatus(e) === 'CHECKED_IN').length
  const flaggedCount = merged.filter(e => ['OUT_OF_ZONE','PRESENCE_DOUBT','INACTIVE_SIGNAL'].includes(effectiveStatus(e))).length
  const onLeaveCount = merged.filter(e => effectiveStatus(e) === 'ON_LEAVE').length
  const absentCount  = merged.filter(e => effectiveStatus(e) === 'ABSENT').length

  const flagged = merged.filter(e => ['OUT_OF_ZONE','PRESENCE_DOUBT','INACTIVE_SIGNAL'].includes(effectiveStatus(e)))

  const displayed = filterStatus === 'ALL'
    ? merged
    : merged.filter(e => effectiveStatus(e) === filterStatus)

  /* Mutations */
  const exemptMut = useMutation({
    mutationFn: ({ userId, reason }) => presenceApi.exempt(userId, reason),
    onSuccess: () => {
      toast.success('Exempt granted')
      setExemptModal(null)
      setExemptReason('')
      qc.invalidateQueries({ queryKey: ['presence', 'live'] })
    },
    onError: () => toast.error('Failed to grant exempt'),
  })

  const clearMut = useMutation({
    mutationFn: (userId) => presenceApi.clearFlag(userId),
    onSuccess: () => {
      toast.success('Flag cleared')
      qc.invalidateQueries({ queryKey: ['presence', 'live'] })
    },
    onError: () => toast.error('Failed to clear flag'),
  })

  const isLoading = loadingAttend || loadingPresence

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Presence Monitor</h1>
          <p className="text-sm text-text-muted mt-0.5">Live GPS heartbeat + attendance — refreshes every 30s</p>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />}
          onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ['attendance','team_today'] }) }}>
          Refresh
        </Button>
      </div>

      {/* Summary pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active',    count: activeCount,  color: '#10b981', icon: Activity      },
          { label: 'Flagged',   count: flaggedCount, color: '#ef4444', icon: AlertTriangle },
          { label: 'On Leave',  count: onLeaveCount, color: '#06b6d4', icon: Clock         },
          { label: 'Absent',    count: absentCount,  color: '#f59e0b', icon: MapPin        },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="glass-card p-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2"
                style={{ background: s.color+'15', border: `1px solid ${s.color}25` }}>
                <Icon size={13} style={{ color: s.color }} />
              </div>
              <div className="text-2xl font-black mb-0.5" style={{ color: s.color }}>
                {isLoading ? '—' : s.count}
              </div>
              <div className="text-xs text-text-muted">{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* Flagged banner */}
      {flaggedCount > 0 && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl flex-wrap"
          style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)' }}>
          <AlertTriangle size={15} className="text-danger-400 flex-shrink-0" />
          <p className="text-xs text-danger-400 flex-1">
            <span className="font-bold">{flaggedCount} employee{flaggedCount > 1 ? 's' : ''}</span> require attention —
            {flagged.map(e => (e.full_name ?? e.name ?? '').split(' ')[0]).join(', ')}
          </p>
          <Button variant="danger" size="xs" onClick={() => setFilterStatus('OUT_OF_ZONE')}>View</Button>
        </div>
      )}

      {/* GPS events panel */}
      {geoEvents.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={14} className="text-danger-400" />
            <h2 className="text-sm font-semibold text-text-primary">Recent Geofence Breaches</h2>
          </div>
          <div className="space-y-2">
            {geoEvents.slice(0, 8).map((ev, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <AlertTriangle size={12} className="text-danger-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-text-primary">{ev.name}</span>
                  <span className="text-[10px] text-text-muted ml-2">
                    {ev.distance_m}m outside {ev.zone_name ?? 'zone'}
                  </span>
                </div>
                <span className="text-[9px] text-text-muted flex-shrink-0">{ev.ts?.slice(11, 16)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flagged employees with actions */}
      {flagged.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={14} className="text-danger-400" />
            <h2 className="text-sm font-semibold text-text-primary">Flagged Employees</h2>
            <span className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center"
              style={{ background: '#ef4444', color: '#fff' }}>{flagged.length}</span>
          </div>
          <div className="space-y-2">
            {flagged.map(e => {
              const st  = effectiveStatus(e)
              const cfg = STATUS_CFG[st] ?? { label: st, color: '#ef4444' }
              const uid = e.user_id ?? e.id
              return (
                <div key={uid} className="flex items-center gap-3 p-3 rounded-xl flex-wrap"
                  style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: cfg.color+'18', color: cfg.color, border: `1px solid ${cfg.color}30` }}>
                    {initials(e.full_name ?? e.name ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{e.full_name ?? e.name}</p>
                    <p className="text-[10px] text-text-muted">
                      {e.department ?? ''}{e.last_dist_m != null ? ` · ${e.last_dist_m}m from zone` : ''}
                      {e.last_heartbeat ? ` · HB ${hbAge(e.last_heartbeat)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                    style={{ background: cfg.color+'18', color: cfg.color }}>
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
                    {cfg.label}
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="xs" icon={<Shield size={10} />}
                      onClick={() => { setExemptModal(uid); setExemptReason('') }}>
                      Exempt
                    </Button>
                    <Button variant="ghost" size="xs" icon={<CheckCircle size={10} />}
                      onClick={() => clearMut.mutate(uid)}>
                      Clear
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Full team grid */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-text-primary">All Staff — Today</h2>
          </div>
          {/* Filter chips */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: 'ALL',         label: 'All' },
              { key: 'CHECKED_IN',  label: 'Active' },
              { key: 'OUT_OF_ZONE', label: 'Out of Zone' },
              { key: 'ABSENT',      label: 'Absent' },
              { key: 'CHECKED_OUT', label: 'Done' },
            ].map(f => (
              <button key={f.key}
                onClick={() => setFilterStatus(f.key)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all',
                  filterStatus === f.key
                    ? 'bg-brand-500/15 border-brand-500/40 text-brand-300'
                    : 'bg-surface-2 border-border-subtle text-text-muted'
                )}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-8 text-center">
            <WifiOff size={28} className="mx-auto text-text-muted mb-2" />
            <p className="text-xs text-text-muted">No attendance records yet today</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {displayed.map(e => {
              const st  = effectiveStatus(e)
              const cfg = STATUS_CFG[st] ?? { label: st, color: '#475569' }
              const uid = e.user_id ?? e.id
              const pulsing = ['CHECKED_IN','OUT_OF_ZONE','INACTIVE_SIGNAL','PRESENCE_DOUBT'].includes(st)
              return (
                <div key={uid} className="p-3 rounded-xl border transition-all hover:scale-[1.02]"
                  style={{ background: 'rgba(26,34,54,0.5)', borderColor: cfg.color+'25' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ background: cfg.color+'18', color: cfg.color, border: `1px solid ${cfg.color}25` }}>
                      {initials(e.full_name ?? e.name ?? '?')}
                    </div>
                    <p className="text-xs font-semibold text-text-primary truncate">
                      {(e.full_name ?? e.name ?? '').split(' ')[0]}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[9px] font-bold" style={{ color: cfg.color }}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: cfg.color, animation: pulsing ? 'pulse 2s ease-in-out infinite' : 'none' }} />
                    {cfg.label}
                  </div>
                  {e.check_in_time && (
                    <p className="text-[9px] text-text-muted mt-1 font-mono">In {e.check_in_time.slice(11, 16)}</p>
                  )}
                  {e.last_heartbeat && (
                    <p className="text-[9px] text-text-muted font-mono">HB {hbAge(e.last_heartbeat)}</p>
                  )}
                  {e.last_dist_m != null && (
                    <p className="text-[9px]" style={{ color: cfg.color }}>{e.last_dist_m}m</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Exempt modal */}
      {exemptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(6,9,18,0.8)', backdropFilter: 'blur(4px)' }}
          onClick={() => setExemptModal(null)}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-sm space-y-4"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-text-primary">Grant Exempt Status</h3>
            <p className="text-xs text-text-muted">
              Employee will be marked EXEMPT — geofence alerts suppressed until check-out.
            </p>
            <textarea
              rows={3}
              placeholder="Reason (e.g. Field visit — client site)"
              value={exemptReason}
              onChange={e => setExemptReason(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm text-text-primary resize-none"
              style={{ background: 'rgba(26,34,54,0.6)', border: '1px solid rgba(99,102,241,0.2)', outline: 'none' }}
            />
            <div className="flex gap-2">
              <Button variant="primary" fullWidth size="sm"
                onClick={() => exemptMut.mutate({ userId: exemptModal, reason: exemptReason || 'Field visit' })}>
                Confirm Exempt
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setExemptModal(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
