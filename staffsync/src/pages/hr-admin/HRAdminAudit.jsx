import { useState } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Activity, Search, Download, Filter, ChevronDown, Shield, User, Clock, MapPin, QrCode, ScanFace, FileText, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import { auditApi } from '@/lib/api'

const ICON_MAP = {
  auth:       { icon: Shield,   color: '#6366f1' },
  checkin:    { icon: QrCode,   color: '#a78bfa' },
  face:       { icon: ScanFace, color: '#06b6d4' },
  leave:      { icon: FileText, color: '#10b981' },
  user:       { icon: User,     color: '#f59e0b' },
  geofence:   { icon: MapPin,   color: '#ef4444' },
  sync:       { icon: RefreshCw,color: '#14b8a6' },
  policy:     { icon: FileText, color: '#ec4899' },
  rbac:       { icon: Shield,   color: '#fbbf24' },
}

const EVENTS = [
  { id:1,  ts:'2026-06-12 11:42:08', actor:'Grace Wanjiku', actorId:'EMP-009', type:'user',     action:'Invite sent',                detail:'carol@devx.com invited as Engineer',          ip:'197.246.10.1',  status:'success' },
  { id:2,  ts:'2026-06-12 11:34:22', actor:'System',        actorId:'SYS',     type:'geofence', action:'Geofence breach detected',   detail:'Priya Sharma left HQ Main zone (230m)',       ip:'—',             status:'warn'    },
  { id:3,  ts:'2026-06-12 11:28:45', actor:'Grace Wanjiku', actorId:'EMP-009', type:'face',     action:'Face descriptor cleared',    detail:'Daniel Muriuki — re-enrollment required',     ip:'197.246.10.1',  status:'success' },
  { id:4,  ts:'2026-06-12 11:02:11', actor:'System',        actorId:'SYS',     type:'checkin',  action:'QR token rotated',           detail:'HQ Floor 2 zone — auto 30s rotation',         ip:'—',             status:'success' },
  { id:5,  ts:'2026-06-12 10:55:30', actor:'Grace Wanjiku', actorId:'EMP-009', type:'rbac',     action:'Role changed',               detail:'James Okeyo: EMPLOYEE → MANAGER',             ip:'197.246.10.1',  status:'success' },
  { id:6,  ts:'2026-06-12 10:30:00', actor:'System',        actorId:'SYS',     type:'sync',     action:'Sync completed',             detail:'47 records synced, 0 conflicts',              ip:'—',             status:'success' },
  { id:7,  ts:'2026-06-12 09:47:00', actor:'Grace Wanjiku', actorId:'EMP-009', type:'policy',   action:'Policy published',           detail:'Leave Policy v3.2 published',                 ip:'197.246.10.1',  status:'success' },
  { id:8,  ts:'2026-06-12 09:15:22', actor:'Alice Mwangi',  actorId:'EMP-001', type:'auth',     action:'Login successful',           detail:'Chrome/Windows — JWT issued',                 ip:'41.90.200.12',  status:'success' },
  { id:9,  ts:'2026-06-12 09:10:01', actor:'Carlos Mendez', actorId:'EMP-008', type:'auth',     action:'Login failed (3 attempts)',  detail:'Account locked — threshold reached',          ip:'41.90.200.44',  status:'error'   },
  { id:10, ts:'2026-06-12 08:59:33', actor:'James Okeyo',   actorId:'EMP-002', type:'checkin',  action:'Check-in completed',         detail:'QR + Geofence + Face — all 3 layers passed', ip:'41.90.200.15',  status:'success' },
  { id:11, ts:'2026-06-12 08:47:19', actor:'Priya Sharma',  actorId:'EMP-003', type:'face',     action:'Face verify failed (x2)',    detail:'Attempt 2/3 — liveness check failed',         ip:'41.90.200.31',  status:'warn'    },
  { id:12, ts:'2026-06-12 08:30:00', actor:'System',        actorId:'SYS',     type:'geofence', action:'Monitoring started',         detail:'All 3 active zones now monitoring',            ip:'—',             status:'success' },
  { id:13, ts:'2026-06-11 17:12:05', actor:'Kwame Asante',  actorId:'EMP-006', type:'leave',    action:'Leave approved',             detail:'James Okeyo — Annual Jul 14-18 (5 days)',     ip:'41.90.200.19',  status:'success' },
  { id:14, ts:'2026-06-11 16:55:44', actor:'Tom Harrison',  actorId:'EMP-010', type:'sync',     action:'Manual sync triggered',      detail:'Full re-sync initiated — 47 records',         ip:'197.246.10.5',  status:'success' },
]

const STATUS_CFG = {
  success: { label:'Success', color:'#10b981', bg:'rgba(16,185,129,0.1)' },
  warn:    { label:'Warning', color:'#f59e0b', bg:'rgba(245,158,11,0.1)' },
  error:   { label:'Error',   color:'#ef4444', bg:'rgba(239,68,68,0.1)'  },
}

const EVENT_TYPES = ['all','auth','checkin','face','leave','user','geofence','sync','policy','rbac']

export default function HRAdminAudit() {
  const [search, setSearch]   = useState('')
  const [typeF, setTypeF]     = useState('all')
  const [statusF, setStatusF] = useState('all')
  const today = new Date().toISOString().slice(0, 10)

  const { data: liveEvents } = useQuery({
    queryKey: ['audit', 'list', { type: typeF, status: statusF, search }],
    queryFn:  () => auditApi.list({
      type:   typeF   !== 'all' ? typeF   : undefined,
      status: statusF !== 'all' ? statusF : undefined,
      search: search  || undefined,
      from:   new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
      to:     today,
    }),
  })

  const events  = liveEvents ?? EVENTS
  const visible = events.filter(e => {
    if (typeF !== 'all' && (e.action_type ?? e.type) !== typeF) return false
    if (statusF !== 'all' && e.status !== statusF) return false
    if (search) {
      const q = search.toLowerCase()
      const hit = (e.full_name ?? e.actor ?? '').toLowerCase().includes(q) ||
                  (e.action ?? '').toLowerCase().includes(q) ||
                  (e.detail  ?? '').toLowerCase().includes(q)
      if (!hit) return false
    }
    return true
  })

  function exportLog() {
    auditApi.export(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), today)
    toast.success('Downloading audit log…')
  }

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Audit Log</h1>
          <p className="text-sm text-text-muted mt-0.5">Full immutable event trail — authentication, actions, and system events</p>
        </div>
        <Button variant="outline" size="sm" icon={<Download size={13}/>} onClick={exportLog}>
          Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Events today', val:EVENTS.filter(e=>e.ts.startsWith('2026-06-12')).length, color:'#6366f1' },
          { label:'Warnings',     val:EVENTS.filter(e=>e.status==='warn').length,              color:'#f59e0b' },
          { label:'Errors',       val:EVENTS.filter(e=>e.status==='error').length,             color:'#ef4444' },
        ].map(s => (
          <div key={s.label} className="glass-card p-4 text-center" style={{ padding:14 }}>
            <div className="text-2xl font-black mb-0.5" style={{ color:s.color }}>{s.val}</div>
            <div className="text-[10px] text-text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search actor, action…"
            className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-transparent border text-text-primary placeholder-text-muted outline-none focus:border-brand-500"
            style={{ background:'rgba(26,34,54,0.5)', borderColor:'rgba(99,102,241,0.15)' }}/>
        </div>
        {/* Type filter */}
        <div className="flex flex-wrap gap-1.5">
          {EVENT_TYPES.map(t => (
            <button key={t} onClick={() => setTypeF(t)}
              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold border capitalize transition-all"
              style={{
                background:  typeF===t?'rgba(99,102,241,0.15)':'rgba(26,34,54,0.5)',
                borderColor: typeF===t?'rgba(99,102,241,0.4)':'rgba(99,102,241,0.12)',
                color:       typeF===t?'#818cf8':'#94a3b8',
              }}>
              {t}
            </button>
          ))}
        </div>
        {/* Status */}
        <div className="flex gap-1.5">
          {['all','success','warn','error'].map(s => {
            const cfg = STATUS_CFG[s] ?? { color:'#818cf8', bg:'rgba(99,102,241,0.1)' }
            return (
              <button key={s} onClick={() => setStatusF(s)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold border capitalize transition-all"
                style={{
                  background:  statusF===s?cfg.bg:'rgba(26,34,54,0.5)',
                  borderColor: statusF===s?cfg.color+'40':'rgba(99,102,241,0.12)',
                  color:       statusF===s?cfg.color:'#94a3b8',
                }}>
                {s}
              </button>
            )
          })}
        </div>
        <span className="text-xs text-text-muted ml-auto">{visible.length} events</span>
      </div>

      {/* Event list */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(99,102,241,0.1)', background:'rgba(26,34,54,0.4)' }}>
                {['Timestamp','Actor','Type','Action','Detail','IP','Status'].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-[10px] font-semibold text-text-muted uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((ev, i) => {
                const typeCfg = ICON_MAP[ev.type] ?? { icon:Activity, color:'#818cf8' }
                const stCfg   = STATUS_CFG[ev.status]
                const Icon    = typeCfg.icon

                return (
                  <tr key={ev.id}
                    className="transition-colors hover:bg-white/[0.015]"
                    style={{ borderBottom:'1px solid rgba(99,102,241,0.05)', background:i%2===0?'transparent':'rgba(26,34,54,0.15)' }}>
                    {/* Timestamp */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-mono text-[10px] text-text-muted">{ev.ts}</div>
                    </td>
                    {/* Actor */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-semibold text-text-secondary">{ev.actor}</div>
                      <div className="text-[9px] text-text-muted">{ev.actorId}</div>
                    </td>
                    {/* Type */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{ background:typeCfg.color+'15', border:`1px solid ${typeCfg.color}25` }}>
                          <Icon size={10} style={{ color:typeCfg.color }}/>
                        </div>
                        <span className="capitalize text-[10px] text-text-muted">{ev.type}</span>
                      </div>
                    </td>
                    {/* Action */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-text-primary">{ev.action}</span>
                    </td>
                    {/* Detail */}
                    <td className="px-3 py-2.5 max-w-xs">
                      <span className="text-text-muted leading-relaxed">{ev.detail}</span>
                    </td>
                    {/* IP */}
                    <td className="px-3 py-2.5">
                      <code className="text-[9px] font-mono text-text-muted">{ev.ip}</code>
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2.5">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase whitespace-nowrap"
                        style={{ background:stCfg.bg, color:stCfg.color }}>
                        {stCfg.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {visible.length === 0 && (
          <div className="py-12 text-center">
            <Activity size={28} className="mx-auto text-text-muted mb-3 opacity-40"/>
            <p className="text-sm text-text-muted">No events match this filter</p>
          </div>
        )}
      </div>
    </div>
  )
}
