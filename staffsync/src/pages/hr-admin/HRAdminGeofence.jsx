import { useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  MapPin, Plus, Edit3, CheckCircle, XCircle,
  Activity, Save, Loader, Navigation, Target, Satellite, Map,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qrApi } from '@/lib/api'
import 'leaflet/dist/leaflet.css'

const ZONE_COLORS = ['#6366f1','#10b981','#06b6d4','#a78bfa','#f59e0b','#ec4899']

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

/* ─── Real Leaflet map component ─── */
function LeafletMap({ zones, previewZone, mapMode, onMapClick }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const layerRef     = useRef(null)
  const tileRef      = useRef(null)
  const clickRef     = useRef(onMapClick)
  clickRef.current   = onMapClick

  const TILES = {
    street:    { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                 attr: '© OpenStreetMap contributors' },
    satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                 attr: '© Esri' },
  }

  useEffect(() => {
    import('leaflet').then(({ default: L }) => {
      if (mapRef.current) return // already initialised

      // Fix Leaflet default icon broken paths in Vite
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
        iconUrl:       new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href,
        shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href,
      })

      // Default centre — Nairobi; adjust if zones exist
      const allZones = [...(zones ?? []), ...(previewZone ? [previewZone] : [])]
      const withGps  = allZones.filter(z => z.latitude && z.longitude)
      const centre   = withGps.length
        ? [parseFloat(withGps[0].latitude), parseFloat(withGps[0].longitude)]
        : [-1.2921, 36.8219]

      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true })
      mapRef.current = map

      // Initial tile layer
      const t = TILES.street
      tileRef.current = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 }).addTo(map)

      map.setView(centre, 14)

      // Click handler for coord picking
      map.on('click', e => {
        if (clickRef.current) clickRef.current(e.latlng.lat, e.latlng.lng)
      })

      layerRef.current = L.layerGroup().addTo(map)

      renderZones(L, zones, previewZone, layerRef.current, map)
    })
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, []) // eslint-disable-line

  // Update tile layer when mapMode changes
  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then(({ default: L }) => {
      if (tileRef.current) tileRef.current.remove()
      const t = TILES[mapMode] ?? TILES.street
      tileRef.current = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 }).addTo(mapRef.current)
    })
  }, [mapMode])

  // Re-render zone circles when data changes
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return
    import('leaflet').then(({ default: L }) => {
      layerRef.current.clearLayers()
      renderZones(L, zones, previewZone, layerRef.current, mapRef.current)
    })
  }, [zones, previewZone])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

function renderZones(L, zones, previewZone, group, map) {
  const allZones = [...(zones ?? []).map((z, i) => ({ ...z, _color: ZONE_COLORS[i % ZONE_COLORS.length] })),
                   ...(previewZone ? [{ ...previewZone, _color: '#f59e0b', _preview: true }] : [])]
  const withGps  = allZones.filter(z => z.latitude && z.longitude)
  if (!withGps.length) return

  withGps.forEach(z => {
    const lat = parseFloat(z.latitude)
    const lng = parseFloat(z.longitude)
    const r   = z.radius_metres ?? 200
    const col = z._color

    // Geofence circle
    L.circle([lat, lng], {
      radius:      r,
      color:       col,
      weight:      2,
      opacity:     z._preview ? 0.9 : 0.7,
      dashArray:   z._preview ? '6 4' : null,
      fillColor:   col,
      fillOpacity: z._preview ? 0.08 : 0.05,
    }).addTo(group)

    // Centre marker
    const icon = L.divIcon({
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${col};border:2px solid white;box-shadow:0 0 8px ${col}80"></div>`,
      className: '',
      iconSize:   [14, 14],
      iconAnchor: [7, 7],
    })
    L.marker([lat, lng], { icon })
      .bindPopup(`<b>${z.name ?? 'Zone'}</b><br/>r = ${r}m${z.address ? `<br/>${z.address}` : ''}`)
      .addTo(group)
  })

  // Fit map to show all zones
  if (withGps.length === 1) {
    map.setView([parseFloat(withGps[0].latitude), parseFloat(withGps[0].longitude)], 15)
  } else {
    const bounds = withGps.map(z => [parseFloat(z.latitude), parseFloat(z.longitude)])
    map.fitBounds(bounds, { padding: [40, 40] })
  }
}

/* ─── Live zone preview (in form — shows proposed circle) ─── */
function ZonePreviewMap({ lat, lng, radius, name, mapMode }) {
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ height: 200 }}>
      <LeafletMap
        zones={[]}
        previewZone={{ latitude: lat, longitude: lng, radius_metres: radius, name }}
        mapMode={mapMode}
        onMapClick={null}
      />
    </div>
  )
}

/* ─── Main page ─── */
export default function HRAdminGeofence() {
  const qc = useQueryClient()

  const [editId, setEditId]         = useState(null)
  const [showAdd, setShowAdd]       = useState(false)
  const [form, setForm]             = useState({ name: '', address: '', latitude: '', longitude: '', radius_metres: 200, grace_period_min: 10 })
  const [locating, setLocating]     = useState(false)
  const [locateAccuracy, setLocateAccuracy] = useState(null)
  const [mapMode, setMapMode]       = useState('street')  // 'street' | 'satellite'

  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data, isLoading } = useQuery({
    queryKey: ['qr', 'zones'],
    queryFn:  qrApi.listZones,
    staleTime: 30_000,
  })
  const zones = Array.isArray(data) ? data : []

  const createMut = useMutation({
    mutationFn: qrApi.createZone,
    onSuccess:  () => { toast.success('Zone created'); qc.invalidateQueries({ queryKey: ['qr'] }); closeForm() },
    onError:    e  => toast.error(e.message),
  })
  const updateMut = useMutation({
    mutationFn: qrApi.updateZone,
    onSuccess:  () => { toast.success('Zone updated'); qc.invalidateQueries({ queryKey: ['qr'] }); closeForm() },
    onError:    e  => toast.error(e.message),
  })
  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }) => qrApi.toggleZone(id, isActive),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['qr'] }),
    onError:    e  => toast.error(e.message),
  })

  function closeForm() {
    setShowAdd(false); setEditId(null); setLocateAccuracy(null)
    setForm({ name: '', address: '', latitude: '', longitude: '', radius_metres: 200, grace_period_min: 10 })
  }

  function startEdit(zone) {
    setForm({
      name:             zone.name             ?? '',
      address:          zone.address          ?? '',
      latitude:         zone.latitude         ?? '',
      longitude:        zone.longitude        ?? '',
      radius_metres:    zone.radius_metres    ?? 200,
      grace_period_min: zone.grace_period_min ?? 10,
    })
    setEditId(zone.id)
    setShowAdd(true)
    setLocateAccuracy(null)
  }

  function saveZone() {
    if (!form.name.trim()) return toast.error('Zone name required')
    const payload = {
      ...form,
      latitude:         form.latitude  ? parseFloat(form.latitude)  : null,
      longitude:        form.longitude ? parseFloat(form.longitude) : null,
      radius_metres:    parseInt(form.radius_metres,    10),
      grace_period_min: parseInt(form.grace_period_min, 10),
    }
    if (editId) updateMut.mutate({ zone_id: editId, ...payload })
    else        createMut.mutate(payload)
  }

  const locateMe = useCallback(() => {
    if (!navigator.geolocation) return toast.error('Geolocation not supported by this browser')
    setLocating(true)
    setLocateAccuracy(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const acc = Math.round(pos.coords.accuracy)
        setForm(f => ({ ...f, latitude: lat.toFixed(7), longitude: lng.toFixed(7) }))
        setLocateAccuracy(acc)
        setLocating(false)
        toast.success(`Location detected ±${acc}m accuracy`)
      },
      err => {
        setLocating(false)
        const msg = err.code === 1 ? 'Location permission denied — allow access in browser settings'
                  : err.code === 2 ? 'GPS position unavailable'
                  : 'Location timed out — try again'
        toast.error(msg)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  }, [])

  const isSaving     = createMut.isPending || updateMut.isPending
  const hasPreview   = !!(form.latitude && form.longitude)
  const previewLat   = parseFloat(form.latitude)  || 0
  const previewLng   = parseFloat(form.longitude) || 0
  const previewRadius = parseInt(form.radius_metres, 10) || 200

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Geofence Zones</h1>
          <p className="text-sm text-text-muted mt-0.5">Configure GPS check-in boundaries for all office locations</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Map mode toggle */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(26,34,54,0.6)' }}>
            {[
              { key: 'street',    icon: Map,       label: 'Street'    },
              { key: 'satellite', icon: Satellite, label: 'Satellite' },
            ].map(({ key, icon: Icon, label }) => (
              <button key={key} onClick={() => setMapMode(key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background:  mapMode === key ? 'rgba(99,102,241,0.2)' : 'transparent',
                  color:       mapMode === key ? '#818cf8' : '#64748b',
                  border:      mapMode === key ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                }}>
                <Icon size={12} />{label}
              </button>
            ))}
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={13}/>}
            onClick={() => { closeForm(); setShowAdd(v => !v) }}>
            {showAdd && !editId ? 'Cancel' : 'New Zone'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Active zones', val: zones.filter(z => z.is_active).length,                color: '#10b981' },
          { label: 'Total zones',  val: zones.length,                                          color: '#6366f1' },
          { label: 'With GPS',     val: zones.filter(z => z.latitude && z.longitude).length,   color: '#a78bfa' },
        ].map(s => (
          <div key={s.label} className="glass-card p-4 text-center">
            <div className="text-2xl font-black mb-0.5" style={{ color: s.color }}>
              {isLoading ? '—' : s.val}
            </div>
            <div className="text-[10px] text-text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Add / Edit form */}
      {showAdd && (
        <div className="glass-card p-5" style={{ borderColor: 'rgba(99,102,241,0.25)', boxShadow: '0 0 24px rgba(99,102,241,0.08)' }}>
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={14} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-text-primary">{editId ? 'Edit Zone' : 'New Geofence Zone'}</h2>
          </div>

          {/* Name + address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <Input label="Zone name" value={form.name} onChange={e => up('name', e.target.value)} placeholder="HQ Main" />
            <Input label="Address / Description" value={form.address} onChange={e => up('address', e.target.value)} placeholder="Westlands, Nairobi" />
          </div>

          {/* GPS section */}
          <div className="rounded-2xl p-4 mb-4 space-y-3"
            style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)' }}>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs font-semibold text-text-secondary">GPS Coordinates</p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  Click "Locate Me" to use your current position, type manually, or <span className="text-brand-300">click on the map below</span>
                </p>
              </div>
              <button type="button" onClick={locateMe} disabled={locating}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 disabled:opacity-60"
                style={{
                  background:  locating ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.12)',
                  border:      `1px solid ${locating ? 'rgba(99,102,241,0.3)' : 'rgba(16,185,129,0.35)'}`,
                  color:       locating ? '#818cf8' : '#10b981',
                  boxShadow:   locating ? 'none' : '0 0 12px rgba(16,185,129,0.15)',
                }}>
                {locating
                  ? <><Loader size={13} className="animate-spin" /> Locating…</>
                  : <><Navigation size={13} /> Locate Me</>}
              </button>
            </div>

            {locateAccuracy != null && !locating && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Target size={12} className="text-success-400 flex-shrink-0" />
                <p className="text-[10px] text-success-400 font-semibold">
                  GPS detected ±{locateAccuracy}m accuracy
                  {locateAccuracy > 50 ? ' — low accuracy, move outdoors for better signal' : ' — good signal'}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Latitude</label>
                <input type="number" step="0.0000001" value={form.latitude}
                  onChange={e => { up('latitude', e.target.value); setLocateAccuracy(null) }}
                  placeholder="-1.2921"
                  className="w-full h-10 px-3 rounded-xl text-sm border text-text-primary placeholder:text-text-muted outline-none focus:border-brand-500 transition-all font-mono"
                  style={{ background: 'rgba(26,34,54,0.5)', borderColor: form.latitude ? 'rgba(16,185,129,0.4)' : 'rgba(99,102,241,0.15)' }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Longitude</label>
                <input type="number" step="0.0000001" value={form.longitude}
                  onChange={e => { up('longitude', e.target.value); setLocateAccuracy(null) }}
                  placeholder="36.8219"
                  className="w-full h-10 px-3 rounded-xl text-sm border text-text-primary placeholder:text-text-muted outline-none focus:border-brand-500 transition-all font-mono"
                  style={{ background: 'rgba(26,34,54,0.5)', borderColor: form.longitude ? 'rgba(16,185,129,0.4)' : 'rgba(99,102,241,0.15)' }} />
              </div>
            </div>

            {/* Interactive preview map — click to set coords */}
            <div className="space-y-1">
              <p className="text-[10px] text-text-muted flex items-center gap-1">
                <MapPin size={9} className="text-brand-400" /> Click anywhere on the map to set zone centre
              </p>
              <div className="rounded-xl overflow-hidden" style={{ height: 220 }}>
                <LeafletMap
                  zones={[]}
                  previewZone={hasPreview ? { latitude: previewLat, longitude: previewLng, radius_metres: previewRadius, name: form.name || 'New Zone' } : null}
                  mapMode={mapMode}
                  onMapClick={(lat, lng) => {
                    setForm(f => ({ ...f, latitude: lat.toFixed(7), longitude: lng.toFixed(7) }))
                    setLocateAccuracy(null)
                  }}
                />
              </div>
            </div>
          </div>

          {/* Radius + grace period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Radius (metres)</label>
              <input type="range" min={50} max={1000} step={25} value={form.radius_metres}
                onChange={e => up('radius_metres', e.target.value)}
                className="w-full accent-indigo-500" />
              <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                <span>50m</span>
                <span className="text-brand-400 font-semibold">{form.radius_metres}m</span>
                <span>1000m</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Grace period (minutes)</label>
              <input type="range" min={0} max={30} step={5} value={form.grace_period_min}
                onChange={e => up('grace_period_min', e.target.value)}
                className="w-full accent-indigo-500" />
              <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                <span>0</span>
                <span className="text-brand-400 font-semibold">{form.grace_period_min} min</span>
                <span>30</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="primary" size="sm"
              icon={isSaving ? <Loader size={12} className="animate-spin"/> : <Save size={12}/>}
              onClick={saveZone} disabled={isSaving}>
              {editId ? 'Save Changes' : 'Create Zone'}
            </Button>
            <Button variant="ghost" size="sm" onClick={closeForm}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Zone list + map */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Zone cards */}
        <div className="space-y-3">
          {isLoading && Array.from({length:3}).map((_, i) => (
            <div key={i} className="glass-card h-24 animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
          ))}
          {!isLoading && zones.length === 0 && (
            <div className="glass-card p-8 text-center">
              <MapPin size={28} className="mx-auto text-text-muted mb-2 opacity-40" />
              <p className="text-sm text-text-muted">No zones configured yet</p>
            </div>
          )}
          {zones.map((zone, i) => {
            const color = ZONE_COLORS[i % ZONE_COLORS.length]
            return (
              <div key={zone.id} className="glass-card p-4"
                style={{ borderLeft: `3px solid ${color}`, opacity: zone.is_active ? 1 : 0.6 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: color + '15', border: `1px solid ${color}25` }}>
                      <MapPin size={16} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-semibold text-text-primary">{zone.name}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                          style={{ background: zone.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(71,85,105,0.15)', color: zone.is_active ? '#10b981' : '#64748b' }}>
                          {zone.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      {zone.address && <p className="text-[10px] text-text-muted">{zone.address}</p>}
                      <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] text-text-muted">
                        {zone.radius_metres && <span><span className="text-text-secondary font-medium">{zone.radius_metres}m</span> radius</span>}
                        {zone.grace_period_min != null && <span><span className="text-text-secondary font-medium">{zone.grace_period_min}min</span> grace</span>}
                        {zone.latitude && zone.longitude && (
                          <span className="font-mono">{Number(zone.latitude).toFixed(4)}, {Number(zone.longitude).toFixed(4)}</span>
                        )}
                        {!zone.latitude && <span className="text-danger-400">No GPS set</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => startEdit(zone)}
                      className="p-1.5 rounded-lg hover:scale-110 transition-all"
                      style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                      <Edit3 size={11}/>
                    </button>
                    <button onClick={() => toggleMut.mutate({ id: zone.id, isActive: !zone.is_active })}
                      disabled={toggleMut.isPending}
                      className="p-1.5 rounded-lg hover:scale-110 transition-all disabled:opacity-50"
                      style={{ background: zone.is_active ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: zone.is_active ? '#ef4444' : '#10b981' }}>
                      {zone.is_active ? <XCircle size={11}/> : <CheckCircle size={11}/>}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* All zones map */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-brand-400" />
              <h2 className="text-sm font-semibold text-text-primary">Zone Map</h2>
            </div>
            <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'rgba(26,34,54,0.5)' }}>
              {[{key:'street',icon:Map},{key:'satellite',icon:Satellite}].map(({key,icon:Icon}) => (
                <button key={key} onClick={() => setMapMode(key)}
                  className="p-1.5 rounded-md transition-all"
                  style={{ background: mapMode === key ? 'rgba(99,102,241,0.2)' : 'transparent', color: mapMode === key ? '#818cf8' : '#64748b' }}
                  title={key.charAt(0).toUpperCase() + key.slice(1)}>
                  <Icon size={13} />
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ height: 340 }}>
            <LeafletMap zones={zones} previewZone={null} mapMode={mapMode} onMapClick={null} />
          </div>
          <p className="text-[10px] text-text-muted mt-2 text-center">
            Coloured circles = geofence radius · Markers = zone centre
          </p>
        </div>
      </div>

      {/* Monitoring config */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={14} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-text-primary">Global Monitoring Settings</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'GPS poll interval',  val: '30s heartbeat', color: '#6366f1' },
            { label: 'Inactive threshold', val: '30 min',        color: '#f59e0b' },
            { label: 'Doubt threshold',    val: '10 min out',    color: '#ef4444' },
            { label: 'Monitoring scope',   val: 'All users',     color: '#06b6d4' },
          ].map(c => (
            <div key={c.label} className="p-3 rounded-xl text-center" style={{ background: c.color + '0d', border: `1px solid ${c.color}20` }}>
              <div className="text-sm font-bold mb-0.5" style={{ color: c.color }}>{c.val}</div>
              <div className="text-[9px] text-text-muted">{c.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
