import { useState } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Clock, Activity, Database, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { syncApi } from '@/lib/api'

const SYNC_LOG = [
  { id:1, ts:'2026-06-12 09:30:00', type:'auto',   records:47, conflicts:0, duration:'1.2s',  status:'success', details:'Full sync — all tables' },
  { id:2, ts:'2026-06-12 06:00:00', type:'auto',   records:47, conflicts:0, duration:'0.9s',  status:'success', details:'Scheduled nightly sync' },
  { id:3, ts:'2026-06-11 17:12:05', type:'manual', records:47, conflicts:2, duration:'2.1s',  status:'conflict',details:'2 attendance records had conflicts — resolved by last-write-wins' },
  { id:4, ts:'2026-06-11 12:00:00', type:'auto',   records:45, conflicts:0, duration:'1.1s',  status:'success', details:'Midday sync' },
  { id:5, ts:'2026-06-11 06:00:00', type:'auto',   records:45, conflicts:0, duration:'0.8s',  status:'success', details:'Scheduled nightly sync' },
  { id:6, ts:'2026-06-10 14:33:12', type:'manual', records:44, conflicts:1, duration:'1.8s',  status:'conflict',details:'1 leave record conflict — resolved' },
  { id:7, ts:'2026-06-10 06:00:00', type:'auto',   records:44, conflicts:0, duration:'1.0s',  status:'success', details:'Scheduled nightly sync' },
]

const TABLE_HEALTH = [
  { name:'users',          rows:47,  lastSync:'09:30', status:'ok' },
  { name:'attendance',     rows:2840, lastSync:'09:30', status:'ok' },
  { name:'leaves',         rows:193, lastSync:'09:30', status:'ok' },
  { name:'face_descriptors',rows:43, lastSync:'09:30', status:'warn', note:'4 employees not enrolled' },
  { name:'tasks',          rows:618, lastSync:'09:30', status:'ok' },
  { name:'geofence_zones', rows:3,   lastSync:'09:30', status:'ok' },
  { name:'qr_tokens',      rows:4,   lastSync:'09:30', status:'ok' },
  { name:'audit_log',      rows:8472, lastSync:'09:30', status:'ok' },
]

export default function HRAdminSync() {
  const [syncPct, setSyncPct] = useState(0)
  const qc = useQueryClient()

  const { data: history }    = useQuery({ queryKey: ['sync','history'],  queryFn: syncApi.history  })
  const { data: tableHealth } = useQuery({ queryKey: ['sync','health'],  queryFn: syncApi.tableHealth })

  const syncMutation = useMutation({
    mutationFn: async () => {
      // Animate progress bar while waiting for response
      for (let p = 0; p < 90; p += 10) {
        await new Promise(r => setTimeout(r, 90))
        setSyncPct(p)
      }
      return syncApi.trigger()
    },
    onSuccess: (data) => {
      setSyncPct(100)
      toast.success(`Sync completed — ${data.records_synced ?? 0} records, ${data.conflicts ?? 0} conflicts`)
      qc.invalidateQueries({ queryKey: ['sync'] })
      setTimeout(() => setSyncPct(0), 1500)
    },
    onError: (e) => {
      setSyncPct(0)
      toast.error(e.message)
    },
  })

  const syncing = syncMutation.isPending
  const log     = history   ?? SYNC_LOG
  const health  = tableHealth ?? TABLE_HEALTH

  const STATUS_CFG = {
    success:  { label:'Success',  color:'#10b981' },
    conflict: { label:'Conflict', color:'#f59e0b' },
    error:    { label:'Error',    color:'#ef4444' },
  }

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Sync Engine</h1>
          <p className="text-sm text-text-muted mt-0.5">Database synchronisation control and health monitor</p>
        </div>
        <Button variant="primary" size="sm" icon={<RefreshCw size={13} className={syncing?'animate-spin':''}/>}
          loading={syncing} onClick={() => syncMutation.mutate()}>
          Run Sync Now
        </Button>
      </div>

      {/* Sync progress */}
      {syncing && (
        <div className="glass-card p-5" style={{ borderColor:'rgba(99,102,241,0.3)', boxShadow:'0 0 24px rgba(99,102,241,0.1)' }}>
          <div className="flex items-center gap-3 mb-3">
            <RefreshCw size={14} className="text-brand-400 animate-spin" />
            <span className="text-sm font-semibold text-text-primary">Syncing…</span>
            <span className="text-xs text-brand-400 font-bold">{syncPct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background:'rgba(99,102,241,0.1)' }}>
            <div className="h-full rounded-full transition-all duration-100"
              style={{ width:`${syncPct}%`, background:'linear-gradient(90deg,#6366f1,#8b5cf6)', boxShadow:'0 0 10px rgba(99,102,241,0.5)' }}/>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:'Last sync',      val:'09:30',              color:'#10b981' },
          { label:'Total records',  val:health.reduce((a,t)=>a+t.rows,0).toLocaleString(), color:'#6366f1' },
          { label:'Conflicts total',val:log.reduce((a,e)=>a+e.conflicts,0),               color:'#f59e0b' },
          { label:'Auto schedule',  val:'06:00 & 12:00',     color:'#06b6d4' },
        ].map(s => (
          <div key={s.label} className="glass-card p-4" style={{ padding:14 }}>
            <div className="text-lg font-black mb-0.5" style={{ color:s.color }}>{s.val}</div>
            <div className="text-[10px] text-text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Table health */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Database size={14} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-text-primary">Table Health</h2>
          </div>
          <div className="space-y-2">
            {health.map(t => (
              <div key={t.name} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background:'rgba(26,34,54,0.5)', border:`1px solid ${t.status==='warn'?'rgba(245,158,11,0.2)':'rgba(99,102,241,0.08)'}` }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-text-primary">{t.name}</code>
                    {t.note && <AlertTriangle size={10} className="text-warning-400 flex-shrink-0" title={t.note}/>}
                  </div>
                  <div className="text-[9px] text-text-muted mt-0.5">
                    {t.rows.toLocaleString()} rows · synced {t.lastSync}
                  </div>
                  {t.note && <div className="text-[9px] text-warning-400 mt-0.5">{t.note}</div>}
                </div>
                {t.status === 'ok'
                  ? <CheckCircle size={14} className="text-success-400 flex-shrink-0"/>
                  : <AlertTriangle size={14} className="text-warning-400 flex-shrink-0"/>
                }
              </div>
            ))}
          </div>
        </div>

        {/* Sync log */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={14} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-text-primary">Sync History</h2>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {log.map(entry => {
              const stCfg = STATUS_CFG[entry.status]
              return (
                <div key={entry.id} className="p-3 rounded-xl"
                  style={{ background:'rgba(26,34,54,0.5)', border:`1px solid ${entry.status!=='success'?stCfg.color+'25':'rgba(99,102,241,0.08)'}` }}>
                  <div className="flex items-start gap-2 mb-1">
                    {entry.status === 'success'
                      ? <CheckCircle size={12} className="text-success-400 flex-shrink-0 mt-0.5"/>
                      : <AlertTriangle size={12} className="text-warning-400 flex-shrink-0 mt-0.5"/>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-text-primary">
                          {entry.records} records · {entry.conflicts} conflicts
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                          style={{ background:stCfg.color+'15', color:stCfg.color }}>
                          {stCfg.label}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded uppercase"
                          style={{ background:'rgba(99,102,241,0.1)', color:'#818cf8' }}>
                          {entry.type}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-muted mt-0.5">{entry.details}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[9px] font-mono text-text-muted">{entry.duration}</div>
                    </div>
                  </div>
                  <div className="text-[9px] font-mono text-text-muted mt-1">{entry.ts}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Sync config */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={14} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-text-primary">Sync Configuration</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label:'Auto-sync schedule',  val:'06:00 · 12:00 · 18:00', color:'#6366f1' },
            { label:'Conflict resolution', val:'Last-write-wins',        color:'#10b981' },
            { label:'Encryption in transit',val:'TLS 1.3',              color:'#a78bfa' },
            { label:'Face descriptor sync', val:'AES-256 encrypted',    color:'#06b6d4' },
          ].map(c => (
            <div key={c.label} className="p-3 rounded-xl text-center" style={{ background:c.color+'0d', border:`1px solid ${c.color}20` }}>
              <div className="text-xs font-bold mb-0.5" style={{ color:c.color }}>{c.val}</div>
              <div className="text-[9px] text-text-muted">{c.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
