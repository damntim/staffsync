import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { presenceApi } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import {
  Activity, MapPin, Clock, AlertTriangle, Shield,
  RefreshCw, Filter, CheckCircle, WifiOff,
} from 'lucide-react'
import toast from 'react-hot-toast'

const PRESENCE_CFG = {
  CHECKED_IN:      { label: 'Active',        color: '#10b981', dot: true  },
  INACTIVE_SIGNAL: { label: 'Inactive',      color: '#f59e0b', dot: true  },
  OUT_OF_ZONE:     { label: 'Out of Zone',   color: '#ef4444', dot: true  },
  PRESENCE_DOUBT:  { label: 'Flagged',       color: '#ef4444', dot: true  },
  EXEMPT:          { label: 'Exempt',        color: '#06b6d4', dot: false },
  CHECKED_OUT:     { label: 'Checked Out',   color: '#475569', dot: false },
}

function initials(name = '') {
  return name.split(' ').map(p => p[0] ?? '').join('').slice(0, 2).toUpperCase() || '??'
}

function hbAge(ts) {
  if (!ts) return '—'
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function evColor(type) {
  return type === 'OUT_OF_ZONE' ? '#ef4444' : '#f59e0b'
}

export default function ManagerPresence() {
  const qc = useQueryClient()
  const [filter, setFilter]   = useState('ALL')
  const [selected, setSelected] = useState(null)
  const [exemptModal, setExemptModal] = useState(null)   // user_id | null
  const [exemptReason, setExemptReason] = useState('')

  const { data: raw, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['presence', 'live'],
    queryFn:  presenceApi.liveList,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const team   = Array.isArray(raw?.team)   ? raw.team   : []
  const events = Array.isArray(raw?.events) ? raw.events : []

  const exemptMut = useMutation({
    mutationFn: ({ userId, reason }) => presenceApi.exempt(userId, reason),
    onSuccess: () => {
      toast.success('Exempt status granted')
      setExemptModal(null)
      setExemptReason('')
      qc.invalidateQueries({ queryKey: ['presence', 'live'] })
    },
    onError: () => toast.error('Failed to grant exempt'),
  })

  const flagMut = useMutation({
    mutationFn: (userId) => presenceApi.flag(userId),
    onSuccess: () => {
      toast.success('Flag raised')
      qc.invalidateQueries({ queryKey: ['presence', 'live'] })
    },
    onError: () => toast.error('Failed to raise flag'),
  })

  const clearMut = useMutation({
    mutationFn: (userId) => presenceApi.clearFlag(userId),
    onSuccess: () => {
      toast.success('Flag cleared')
      qc.invalidateQueries({ queryKey: ['presence', 'live'] })
    },
    onError: () => toast.error('Failed to clear flag'),
  })

  /* Derived counts */
  const activeCount  = team.filter(e => e.status === 'CHECKED_IN').length
  const flaggedCount = team.filter(e => ['OUT_OF_ZONE','INACTIVE_SIGNAL','PRESENCE_DOUBT'].includes(e.status)).length
  const exemptCount  = team.filter(e => e.status === 'EXEMPT').length
  const outCount     = team.filter(e => e.status === 'CHECKED_OUT').length

  const filtered = team.filter(e => filter === 'ALL' || e.status === filter)

  const lastRefresh = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—'

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Live Presence Board</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Real-time GPS heartbeat monitoring · last updated {lastRefresh}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse" />
            Live · 30s refresh
          </div>
          <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />} onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active',       val: activeCount,  color: '#10b981', sub: 'In zone, heartbeat OK' },
          { label: 'Flagged',      val: flaggedCount, color: '#ef4444', sub: 'Requires attention' },
          { label: 'Exempt',       val: exemptCount,  color: '#06b6d4', sub: 'Approved field visit' },
          { label: 'Checked Out',  val: outCount,     color: '#475569', sub: 'Shift ended' },
        ].map(s => (
          <div key={s.label} className="glass-card p-4">
            <div className="text-2xl font-black mb-0.5" style={{ color: s.color }}>
              {isLoading ? '—' : s.val}
            </div>
            <div className="text-xs font-semibold text-text-secondary">{s.label}</div>
            <div className="text-[10px] text-text-muted mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Flagged alert */}
      {flaggedCount > 0 && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl flex-wrap"
          style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)' }}>
          <AlertTriangle size={15} className="text-danger-400 flex-shrink-0" />
          <p className="text-xs text-danger-400 flex-1">
            <span className="font-bold">{flaggedCount} team member{flaggedCount > 1 ? 's' : ''}</span> require attention —
            {team.filter(e => ['OUT_OF_ZONE','INACTIVE_SIGNAL','PRESENCE_DOUBT'].includes(e.status))
              .map(e => e.full_name.split(' ')[0]).join(', ')}
          </p>
          <Button variant="danger" size="xs" onClick={() => setFilter('OUT_OF_ZONE')}>View Flags</Button>
        </div>
      )}

      {/* No data yet */}
      {!isLoading && team.length === 0 && (
        <div className="glass-card p-10 text-center">
          <WifiOff size={32} className="mx-auto text-text-muted mb-3" />
          <p className="text-sm text-text-muted">No presence data yet — employees will appear here once they check in and their device sends GPS heartbeats.</p>
        </div>
      )}

      {(isLoading || team.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Team grid */}
          <div className="xl:col-span-2 space-y-4">
            {/* Filter chips */}
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'ALL',             label: 'All',         count: team.length },
                { key: 'CHECKED_IN',      label: 'Active',      count: activeCount },
                { key: 'OUT_OF_ZONE',     label: 'Out of Zone', count: team.filter(e=>e.status==='OUT_OF_ZONE').length },
                { key: 'INACTIVE_SIGNAL', label: 'Inactive',    count: team.filter(e=>e.status==='INACTIVE_SIGNAL').length },
                { key: 'PRESENCE_DOUBT',  label: 'Flagged',     count: team.filter(e=>e.status==='PRESENCE_DOUBT').length },
              ].map(f => {
                const cfg = PRESENCE_CFG[f.key] ?? { color: '#818cf8' }
                const active = filter === f.key
                return (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200"
                    style={{
                      background:  active ? cfg.color+'18' : 'rgba(26,34,54,0.5)',
                      borderColor: active ? cfg.color+'45' : 'rgba(99,102,241,0.12)',
                      color:       active ? cfg.color : '#94a3b8',
                      boxShadow:   active ? `0 0 12px ${cfg.color}20` : 'none',
                    }}>
                    <span className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-black"
                      style={{ background: active ? cfg.color+'28' : 'rgba(99,102,241,0.1)' }}>
                      {f.count}
                    </span>
                    {f.label}
                  </button>
                )
              })}
            </div>

            {/* Employee cards */}
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filtered.map(emp => {
                  const cfg  = PRESENCE_CFG[emp.status] ?? PRESENCE_CFG.CHECKED_OUT
                  const flag = ['OUT_OF_ZONE','INACTIVE_SIGNAL','PRESENCE_DOUBT'].includes(emp.status)
                  const isSel = selected === emp.user_id
                  return (
                    <div key={emp.user_id}
                      onClick={() => setSelected(isSel ? null : emp.user_id)}
                      className="glass-card cursor-pointer transition-all duration-200 hover:scale-[1.01]"
                      style={{
                        padding: 14,
                        borderColor: flag ? 'rgba(239,68,68,0.3)' : isSel ? 'rgba(99,102,241,0.35)' : undefined,
                        boxShadow: flag ? '0 0 16px rgba(239,68,68,0.08)' : isSel ? '0 0 16px rgba(99,102,241,0.12)' : undefined,
                      }}>
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
                            style={{ background: cfg.color+'18', color: cfg.color, border: `1px solid ${cfg.color}30` }}>
                            {initials(emp.full_name)}
                          </div>
                          {cfg.dot && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                              style={{ background: cfg.color, borderColor: '#111827', boxShadow: `0 0 6px ${cfg.color}80` }}>
                              <div className="absolute inset-0 rounded-full animate-ping" style={{ background: cfg.color, opacity: 0.4 }} />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-sm font-semibold text-text-primary truncate">{emp.full_name}</span>
                            {flag && <AlertTriangle size={11} className="text-danger-400 flex-shrink-0" />}
                          </div>
                          <div className="mb-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: cfg.color+'18', color: cfg.color }}>
                              {cfg.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 text-[10px] text-text-muted">
                            <span className="flex items-center gap-1">
                              <Clock size={8} /> {emp.check_in_time?.slice(11,16) ?? '—'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Activity size={8} /> {hbAge(emp.last_heartbeat)}
                            </span>
                            <span className="flex items-center gap-1 truncate">
                              <MapPin size={8} /> {emp.zone_name ?? 'No zone'}
                            </span>
                            <span className="flex items-center gap-1">
                              {emp.last_dist_m != null ? `${emp.last_dist_m}m` : '—'}
                            </span>
                          </div>
                          {emp.status === 'EXEMPT' && emp.exempt_reason && (
                            <p className="text-[9px] text-cyan-400 mt-1 truncate">{emp.exempt_reason}</p>
                          )}
                        </div>
                      </div>

                      {/* Actions (expanded) */}
                      {isSel && (
                        <div className="mt-3 pt-3 flex flex-wrap gap-2 border-t" style={{ borderColor: 'rgba(99,102,241,0.1)' }}>
                          {emp.status !== 'EXEMPT' && emp.status !== 'CHECKED_OUT' && (
                            <Button variant="outline" size="xs" icon={<Shield size={11} />}
                              onClick={e => { e.stopPropagation(); setExemptModal(emp.user_id); setExemptReason('') }}>
                              Grant Exempt
                            </Button>
                          )}
                          {flag && (
                            <Button variant="ghost" size="xs" icon={<CheckCircle size={11} />}
                              onClick={e => { e.stopPropagation(); clearMut.mutate(emp.user_id) }}>
                              Clear Flag
                            </Button>
                          )}
                          {!flag && emp.status !== 'CHECKED_OUT' && (
                            <Button variant="danger" size="xs" icon={<AlertTriangle size={11} />}
                              onClick={e => { e.stopPropagation(); flagMut.mutate(emp.user_id) }}>
                              Raise Flag
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                {filtered.length === 0 && (
                  <div className="col-span-2 py-8 text-center text-xs text-text-muted">
                    No employees match this filter
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Event log + config */}
          <div className="space-y-4">
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity size={15} className="text-brand-400" />
                <h2 className="text-sm font-semibold text-text-primary">Geofence Events</h2>
              </div>
              {events.length === 0 ? (
                <div className="py-6 text-center">
                  <CheckCircle size={24} className="mx-auto text-success-400 mb-2" />
                  <p className="text-xs text-success-400">No geofence breaches today</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {events.map((ev, i) => (
                    <div key={i}
                      className={cn('flex items-start gap-3 py-3', i < events.length - 1 && 'border-b')}
                      style={{ borderColor: 'rgba(99,102,241,0.08)' }}>
                      <div className="flex flex-col items-center gap-1 flex-shrink-0">
                        <div className="w-2 h-2 rounded-full mt-0.5"
                          style={{ background: evColor(ev.type), boxShadow: `0 0 6px ${evColor(ev.type)}60` }} />
                        {i < events.length - 1 && (
                          <div className="w-px flex-1 min-h-4" style={{ background: 'rgba(99,102,241,0.12)' }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 -mt-0.5">
                        <p className="text-[10px] font-bold text-text-secondary">{ev.name}</p>
                        <p className="text-xs text-text-muted leading-relaxed mt-0.5">
                          Left {ev.zone_name ?? 'geofence'} — {ev.distance_m}m outside
                        </p>
                        <p className="text-[9px] text-text-muted mt-1">{ev.ts?.slice(11, 16) ?? ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Config summary */}
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Filter size={13} className="text-brand-400" />
                <h3 className="text-xs font-semibold text-text-secondary">Monitoring Config</h3>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Heartbeat interval',  value: '30 s' },
                  { label: 'Inactive threshold',  value: '30 min' },
                  { label: 'Doubt escalation',    value: '10 min out' },
                  { label: 'Board refresh',        value: '30 s' },
                  { label: 'Geofence engine',      value: 'Haversine' },
                ].map(c => (
                  <div key={c.label} className="flex justify-between text-xs">
                    <span className="text-text-muted">{c.label}</span>
                    <span className="text-text-secondary font-medium font-mono">{c.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Exempt modal */}
      {exemptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(6,9,18,0.8)', backdropFilter: 'blur(4px)' }}
          onClick={() => setExemptModal(null)}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-sm space-y-4"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-text-primary">Grant Exempt Status</h3>
            <p className="text-xs text-text-muted">
              {team.find(e => e.user_id === exemptModal)?.full_name} will be marked EXEMPT —
              geofence rules will not apply until they check out or the flag is cleared.
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
