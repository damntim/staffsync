import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { QrCode, RefreshCw, CheckCircle, XCircle, MapPin, Copy, AlertTriangle, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qrApi } from '@/lib/api'

const ZONE_COLORS = ['#6366f1','#a78bfa','#10b981','#06b6d4','#f59e0b','#ec4899']

/* Deterministic pixel QR grid from token */
function makeQRGrid(token, size = 11) {
  const seed = (token ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const grid = []
  for (let r = 0; r < size; r++) {
    const row = []
    for (let c = 0; c < size; c++) {
      const corner = (r < 3 && c < 3) || (r < 3 && c >= size - 3) || (r >= size - 3 && c < 3)
      if (corner) { row.push(true); continue }
      const v = Math.sin(seed * (r + 1) * (c + 1) * 0.317) * 10000
      row.push(v - Math.floor(v) > 0.42)
    }
    grid.push(row)
  }
  return grid
}

function QRDisplay({ token, color = '#6366f1', pixelSize = 14 }) {
  const grid = makeQRGrid(token ?? 'placeholder')
  return (
    <div className="inline-flex flex-col gap-px p-3 rounded-xl" style={{ background: '#fff' }}>
      {grid.map((row, ri) => (
        <div key={ri} className="flex gap-px">
          {row.map((filled, ci) => (
            <div key={ci} style={{ width: pixelSize, height: pixelSize, background: filled ? '#0a0e1a' : '#fff', borderRadius: 1 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function HRAdminQRCodes() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState(null)
  const [tick, setTick]         = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['qr', 'zones'],
    queryFn:  qrApi.listZones,
    refetchInterval: 30_000,
    staleTime: 25_000,
  })
  const zones = Array.isArray(data) ? data : []

  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!selected && zones.length > 0) setSelected(zones[0].id)
  }, [zones])

  const rotateMut = useMutation({
    mutationFn: (zoneId) => qrApi.rotate(zoneId),
    onSuccess: () => {
      toast.success('QR token rotated')
      qc.invalidateQueries({ queryKey: ['qr'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }) => qrApi.toggleZone(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qr'] }),
    onError: (e) => toast.error(e.message),
  })

  function copyToken(token) {
    if (!token) return
    navigator.clipboard.writeText(token)
    toast.success('Token copied')
  }

  const activeZone = zones.find(z => z.id === selected) ?? null
  const secondsLeft = activeZone?.seconds_left != null
    ? Math.max(0, Number(activeZone.seconds_left) - tick % 30)
    : 0
  const rotateInterval = 30
  const pct = (secondsLeft / rotateInterval) * 100

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">QR Code Zones</h1>
          <p className="text-sm text-text-muted mt-0.5">Manage rotating QR tokens for check-in zones</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse"/>
          Tokens rotate every 30s
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Active zones', val: zones.filter(z => z.is_active).length,       color: '#10b981' },
          { label: 'Total scans',  val: zones.reduce((a, z) => a + Number(z.scan_count ?? 0), 0), color: '#6366f1' },
          { label: 'Total zones',  val: zones.length,                                 color: '#a78bfa' },
        ].map(s => (
          <div key={s.label} className="glass-card p-4 text-center">
            <div className="text-2xl font-black mb-0.5" style={{ color: s.color }}>
              {isLoading ? '—' : s.val}
            </div>
            <div className="text-[10px] text-text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Zone list */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary">Zones</h2>

          {isLoading && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-card h-24 animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
          ))}

          {zones.map((zone, idx) => {
            const color      = ZONE_COLORS[idx % ZONE_COLORS.length]
            const isSelected = selected === zone.id
            const sLeft      = zone.id === selected ? secondsLeft : Math.max(0, Number(zone.seconds_left ?? 0) - tick % 30)
            const pctFill    = zone.is_active ? (sLeft / rotateInterval) * 100 : 0
            const stale      = zone.is_active && sLeft < 5

            return (
              <div key={zone.id}
                onClick={() => setSelected(zone.id)}
                className="glass-card p-4 cursor-pointer transition-all duration-200 hover:scale-[1.005]"
                style={{
                  borderLeft:  `3px solid ${color}`,
                  borderColor: isSelected ? color + '40' : stale ? 'rgba(245,158,11,0.25)' : undefined,
                  boxShadow:   isSelected ? `0 0 18px ${color}15` : undefined,
                  opacity:     zone.is_active ? 1 : 0.55,
                }}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: color + '15', border: `1px solid ${color}25` }}>
                    <QrCode size={15} style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-text-primary">{zone.name}</span>
                      {stale && <AlertTriangle size={10} className="text-warning-400" />}
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                        style={{ background: zone.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(71,85,105,0.15)', color: zone.is_active ? '#10b981' : '#64748b' }}>
                        {zone.is_active ? 'Active' : 'Off'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-text-muted mt-0.5">
                      <MapPin size={9}/>{zone.address ?? '—'}
                      <span>·</span>
                      <span>{zone.scan_count ?? 0} scans</span>
                    </div>
                    {zone.is_active && (
                      <>
                        <div className="flex justify-between text-[9px] mt-2 mb-1">
                          <span className="text-text-muted">Next rotation</span>
                          <span className={stale ? 'text-warning-400 font-bold' : 'text-text-muted'}>{sLeft}s</span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
                          <div className="h-full rounded-full transition-all duration-1000"
                            style={{ width: `${pctFill}%`, background: stale ? '#f59e0b' : color }} />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-1.5 mt-3">
                  <button onClick={e => { e.stopPropagation(); rotateMut.mutate(zone.id) }}
                    disabled={rotateMut.isPending || !zone.is_active}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold transition-all hover:scale-105 disabled:opacity-40"
                    style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
                    {rotateMut.isPending && rotateMut.variables === zone.id
                      ? <div className="w-2.5 h-2.5 border border-brand-400 border-t-transparent rounded-full animate-spin"/>
                      : <RefreshCw size={9}/>}
                    Force rotate
                  </button>
                  <button onClick={e => { e.stopPropagation(); toggleMut.mutate({ id: zone.id, isActive: !zone.is_active }) }}
                    disabled={toggleMut.isPending}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold transition-all hover:scale-105 disabled:opacity-50"
                    style={{
                      background:   zone.is_active ? 'rgba(239,68,68,0.1)'  : 'rgba(16,185,129,0.1)',
                      color:        zone.is_active ? '#ef4444' : '#10b981',
                      border: `1px solid ${zone.is_active ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                    }}>
                    {zone.is_active ? <XCircle size={9}/> : <CheckCircle size={9}/>}
                    {zone.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* QR preview panel */}
        {activeZone && (
          <div className="glass-card p-5 flex flex-col items-center gap-4"
            style={{ borderColor: ZONE_COLORS[zones.indexOf(activeZone) % ZONE_COLORS.length] + '25' }}>
            <div className="flex items-center gap-2 self-start">
              <QrCode size={14} className="text-brand-400" />
              <h2 className="text-sm font-semibold text-text-primary">{activeZone.name}</h2>
            </div>

            {/* Countdown ring */}
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
                <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(99,102,241,0.1)" strokeWidth="6"/>
                <circle cx="48" cy="48" r="40" fill="none" stroke="#6366f1" strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 40}
                  strokeDashoffset={2 * Math.PI * 40 * (1 - pct / 100)}
                  style={{ transition: 'stroke-dashoffset 0.9s linear', filter: 'drop-shadow(0 0 6px rgba(99,102,241,0.5))' }}/>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-brand-400">{secondsLeft}</span>
                <span className="text-[9px] text-text-muted">seconds</span>
              </div>
            </div>

            {/* QR Code */}
            {activeZone.is_active
              ? <QRDisplay token={activeZone.token} />
              : (
                <div className="w-40 h-40 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(26,34,54,0.5)', border: '1px solid rgba(99,102,241,0.1)' }}>
                  <div className="text-center">
                    <QrCode size={32} className="mx-auto text-text-muted mb-2 opacity-40"/>
                    <p className="text-xs text-text-muted">Zone disabled</p>
                  </div>
                </div>
              )
            }

            {/* Token info */}
            <div className="w-full p-3 rounded-xl" style={{ background: 'rgba(26,34,54,0.5)', border: '1px solid rgba(99,102,241,0.08)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-text-muted">Current token</span>
                <button onClick={() => copyToken(activeZone.token)}
                  className="flex items-center gap-1 text-[9px] text-brand-400 hover:text-brand-300">
                  <Copy size={9}/> Copy
                </button>
              </div>
              <code className="text-[9px] font-mono text-text-secondary break-all">{activeZone.token ?? '—'}</code>
            </div>

            <div className="w-full grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl text-center" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.12)' }}>
                <div className="text-sm font-black text-brand-400">{activeZone.scan_count ?? 0}</div>
                <div className="text-[9px] text-text-muted">Scans total</div>
              </div>
              <div className="p-2.5 rounded-xl text-center" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.12)' }}>
                <div className="text-sm font-black text-brand-400">{activeZone.radius_metres ?? '—'}m</div>
                <div className="text-[9px] text-text-muted">Radius</div>
              </div>
            </div>

            <Button variant="outline" size="sm" icon={rotateMut.isPending ? <Loader size={12} className="animate-spin"/> : <RefreshCw size={12}/>}
              onClick={() => rotateMut.mutate(activeZone.id)}
              disabled={rotateMut.isPending || !activeZone.is_active}
              className="w-full">
              Force Rotate Now
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
