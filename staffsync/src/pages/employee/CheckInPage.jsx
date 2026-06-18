import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import {
  QrCode, MapPin, ScanFace, CheckCircle, XCircle,
  AlertTriangle, RefreshCw, Shield, LogOut, Navigation,
  ChevronRight, Building2, Wifi, WifiOff, Loader, Satellite, Map,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { qrApi, attendanceApi, faceApi } from '@/lib/api'
import { loadModels, extractDescriptor, descriptorToArray } from '@/lib/faceEngine'
import 'leaflet/dist/leaflet.css'

/* ─── helpers ─── */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)))
}

function fmtTime(t) {
  if (!t) return '—'
  // Could be "HH:MM:SS", "HH:MM", or "YYYY-MM-DD HH:MM:SS"
  const part = t.includes(' ') ? t.split(' ')[1] : t
  return part.slice(0, 5)  // "HH:MM"
}

function calcElapsed(rec) {
  if (!rec?.check_in) return 0
  // check_in may be "HH:MM:SS" (TIME col) — pair with today's date
  const dateStr = rec.date ?? new Date().toISOString().slice(0, 10)
  // Strip any accidental date prefix already in check_in (datetime stored as "HH:MM:SS" or "YYYY-MM-DD HH:MM:SS")
  const timePart = rec.check_in.includes(' ') ? rec.check_in.split(' ')[1] : rec.check_in
  const inTs = new Date(`${dateStr}T${timePart}`)
  if (isNaN(inTs)) return 0
  return +Math.max(0, (Date.now() - inTs) / 3600000).toFixed(2)
}

function getGPS(opts = {}) {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      ()  => resolve(null),
      { timeout: 10000, enableHighAccuracy: true, ...opts }
    )
  })
}

/* ─── Continuous presence monitor ─── */
function usePresenceMonitor(zones, selectedZoneId, active) {
  const [nearestZone, setNearest] = useState(null)   // { zone, distance, inside }

  useEffect(() => {
    if (!active || !zones?.length) return
    let watchId = null

    const check = (pos) => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      let best = null
      zones.forEach(z => {
        if (!z.latitude) return
        const dist = haversine(lat, lng, parseFloat(z.latitude), parseFloat(z.longitude))
        const inside = dist <= (z.radius_metres ?? 200)
        if (!best || dist < best.distance) best = { zone: z, distance: dist, inside, lat, lng }
      })
      setNearest(best)
    }

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(check, () => {}, { enableHighAccuracy: true })
    }
    return () => { if (watchId != null) navigator.geolocation.clearWatch(watchId) }
  }, [active, zones])

  return nearestZone
}

/* ─── QR token hook (employee uses zones_public) ─── */
function useZones() {
  const [zones, setZones]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    qrApi.zonesPublic().then(z => {
      setZones(Array.isArray(z) ? z : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Refresh tokens every 25s
  useEffect(() => {
    const t = setInterval(() => {
      qrApi.zonesPublic().then(z => { if (Array.isArray(z)) setZones(z) }).catch(() => {})
    }, 25_000)
    return () => clearInterval(t)
  }, [])

  return { zones, loading }
}

/* ─── Step definitions ─── */
const STEP_IDS = ['location', 'qr', 'geo', 'face', 'done']

/* ─── Main page ─── */
export default function CheckInPage() {
  const qc = useQueryClient()
  const { zones, loading: zonesLoading } = useZones()

  const [step, setStep]           = useState(0)   // 0=location 1=qr 2=geo 3=face 4=done
  const [stepStatus, setStepStatus] = useState({}) // stepId → 'ok'|'fail'|'loading'
  const [selectedZoneId, setSelectedZoneId] = useState(null)
  const [wfh, setWfh]             = useState(false)
  const [geoResult, setGeoResult] = useState(null) // { lat,lng,accuracy,distance,inside,zoneName,zoneRadius }
  const [faceResult, setFaceResult] = useState(null) // { confidence, enrolled, verified }
  const [attendanceRec, setAttendanceRec] = useState(null)
  const [checkoutData, setCheckoutData]   = useState(null)
  const [checkedIn, setCheckedIn] = useState(false)
  const [checkedOut, setCheckedOut] = useState(false)
  const [elapsed, setElapsed]     = useState(0)

  const videoRef  = useRef(null)
  const streamRef = useRef(null)

  const selectedZone = zones.find(z => z.id === selectedZoneId) ?? null

  // Continuous presence monitor (active once checked in)
  const presence = usePresenceMonitor(zones, selectedZoneId, checkedIn)

  /* Restore today's state on mount */
  const { data: todayAtt } = useQuery({
    queryKey: ['attendance', 'my_today'],
    queryFn:  attendanceApi.myToday,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!todayAtt) return
    if (todayAtt.check_out) {
      setCheckoutData({ check_out: todayAtt.check_out, hours_worked: todayAtt.hours_worked })
      setCheckedOut(true)
    } else if (todayAtt.check_in) {
      setAttendanceRec(todayAtt)
      setCheckedIn(true)
      setElapsed(calcElapsed(todayAtt))
      setStep(4)
    }
  }, [todayAtt])

  /* Elapsed timer */
  useEffect(() => {
    if (!checkedIn || !attendanceRec) return
    const t = setInterval(() => setElapsed(calcElapsed(attendanceRec)), 5000)
    return () => clearInterval(t)
  }, [checkedIn, attendanceRec])

  function setStatus(id, s) { setStepStatus(p => ({ ...p, [id]: s })) }

  /* ── STEP HANDLERS ── */

  /* Step 0 → 1: Location chosen */
  function handleLocationNext() {
    if (!selectedZoneId && !wfh) return toast.error('Select your work location first')
    setStep(1)
  }

  /* Step 1: QR validate */
  async function handleQRStep() {
    const zone = selectedZone
    if (!zone && !wfh) return toast.error('No zone selected')
    setStatus('qr', 'loading')
    try {
      const geo = await getGPS()
      const result = await qrApi.validate({
        token:   zone?.token ?? '',
        zone_id: zone?.id    ?? 0,
        lat:     geo?.lat ?? null,
        lng:     geo?.lng ?? null,
      })
      setStatus('qr', 'ok')
      // Pre-store geo for next step
      if (geo && zone?.latitude) {
        const dist = haversine(geo.lat, geo.lng, parseFloat(zone.latitude), parseFloat(zone.longitude))
        setGeoResult({
          lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy,
          distance: dist, inside: dist <= (zone.radius_metres ?? 200),
          zoneName: zone.name, zoneRadius: zone.radius_metres ?? 200,
          zoneLat: parseFloat(zone.latitude), zoneLng: parseFloat(zone.longitude),
        })
      }
      setStep(2)
    } catch (err) {
      if (err.status === 403 || err.message?.toLowerCase().includes('geofence')) {
        // Token valid, geofence fail — still advance, handle in step 2
        setStatus('qr', 'ok')
        const geo = await getGPS()
        if (geo && selectedZone?.latitude) {
          const dist = haversine(geo.lat, geo.lng, parseFloat(selectedZone.latitude), parseFloat(selectedZone.longitude))
          setGeoResult({ lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy, distance: dist, inside: false, zoneName: selectedZone.name, zoneRadius: selectedZone.radius_metres ?? 200, zoneLat: selectedZone.latitude ? parseFloat(selectedZone.latitude) : null, zoneLng: selectedZone.longitude ? parseFloat(selectedZone.longitude) : null })
        }
        setStep(2)
      } else {
        setStatus('qr', 'fail')
        toast.error(err.message ?? 'QR validation failed')
      }
    }
  }

  /* Step 2: Geo confirm */
  async function handleGeoStep() {
    setStatus('geo', 'loading')
    // Re-acquire fresh GPS
    const geo = await getGPS()
    if (!geo) {
      setStatus('geo', 'fail')
      setGeoResult(r => r ? { ...r, inside: false } : null)
      toast.error('Could not get GPS location — please allow location access')
      return
    }
    const zone = selectedZone
    let inside = true
    let dist   = null
    if (zone?.latitude) {
      dist   = haversine(geo.lat, geo.lng, parseFloat(zone.latitude), parseFloat(zone.longitude))
      inside = dist <= (zone.radius_metres ?? 200)
    }
    setGeoResult({ lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy, distance: dist, inside: inside || wfh, zoneName: zone?.name ?? 'WFH', zoneRadius: zone?.radius_metres ?? 200, zoneLat: zone?.latitude ? parseFloat(zone.latitude) : null, zoneLng: zone?.longitude ? parseFloat(zone.longitude) : null })
    if (!inside && !wfh) {
      setStatus('geo', 'fail')
    } else {
      setStatus('geo', 'ok')
      setStep(3)
    }
  }

  /* Step 3: Face */
  async function handleFaceStep() {
    setStatus('face', 'loading')
    try {
      await loadModels()
    } catch {
      // models failed — skip face
      setFaceResult({ confidence: null, enrolled: false, verified: false })
      setStatus('face', 'ok')
      setStep(4)
      await doCheckIn(null)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch {
      toast('Camera unavailable — skipping face verification', { icon: 'ℹ️' })
      setFaceResult({ confidence: null, enrolled: false, verified: false })
      setStatus('face', 'ok')
      setStep(4)
      await doCheckIn(false)
      return
    }

    // Wait for video to be ready
    await new Promise(r => setTimeout(r, 1500))

    try {
      const descriptor = videoRef.current?.readyState >= 2
        ? await extractDescriptor(videoRef.current).catch(() => null)
        : null

      if (descriptor) {
        const res  = await faceApi.verify(descriptorToArray(descriptor))
        const dist = res?.distance != null ? Number(res.distance) : null
        const conf = dist != null ? (1 - dist).toFixed(3) : null
        const pass = dist != null ? dist < 0.5 : true

        stopCamera()
        if (!pass) {
          setFaceResult({ confidence: conf, enrolled: true, verified: false })
          setStatus('face', 'fail')
          toast.error(`Face not recognised (match: ${conf}). Try again in good lighting.`)
          return
        }
        setFaceResult({ confidence: conf, enrolled: true, verified: true })
        setStatus('face', 'ok')
      } else {
        stopCamera()
        toast('No face detected — biometric skipped', { icon: 'ℹ️' })
        setFaceResult({ confidence: null, enrolled: false, verified: false })
        setStatus('face', 'ok')
      }
    } catch (err) {
      stopCamera()
      if (err.message?.includes('not enrolled')) {
        toast('Face not enrolled — biometric skipped. Enroll in Settings.', { icon: 'ℹ️' })
        setFaceResult({ confidence: null, enrolled: false, verified: false })
        setStatus('face', 'ok')
      } else {
        setFaceResult({ confidence: null, enrolled: false, verified: false })
        setStatus('face', 'fail')
        toast.error('Face verification error — please retry')
        return
      }
    }

    setStep(4)
    await doCheckIn(faceResult?.verified ?? false)
  }

  /* Step 4: Record check-in */
  async function doCheckIn(faceVerified) {
    try {
      const result = await attendanceApi.checkIn({
        qr_token:      selectedZone?.token ?? '',
        zone_id:       selectedZone?.id    ?? null,
        lat:           geoResult?.lat  ?? null,
        lng:           geoResult?.lng  ?? null,
        face_verified: !!faceVerified,
        method:        wfh ? 'wfh' : 'qr',
      })
      setAttendanceRec(result)
      setCheckedIn(true)
      qc.invalidateQueries({ queryKey: ['attendance', 'my_today'] })
      toast.success('Checked in successfully!')
    } catch (err) {
      if (err.status === 409) {
        const existing = await attendanceApi.myToday().catch(() => null)
        if (existing) { setAttendanceRec(existing); setCheckedIn(true) }
        toast('Already checked in today', { icon: 'ℹ️' })
      } else {
        toast.error(`Check-in failed: ${err.message}`)
      }
    }
  }

  /* Check-out */
  const [checkingOut, setCheckingOut] = useState(false)
  async function handleCheckOut() {
    if (checkingOut) return            // guard against double-clicks
    setCheckingOut(true)
    const geo = await getGPS()
    try {
      const result = await attendanceApi.checkOut({ lat: geo?.lat ?? null, lng: geo?.lng ?? null })
      setCheckoutData(result)
      setCheckedIn(false)
      setCheckedOut(true)
      qc.invalidateQueries({ queryKey: ['attendance', 'my_today'] })
      toast.success(`Checked out — ${Number(result.hours_worked ?? 0).toFixed(1)}h recorded`)
    } catch (err) {
      // 404 = no active check-in (already checked out, or stale UI). Sync to the
      // real state instead of showing an error.
      if (err.status === 404) {
        const today = await attendanceApi.myToday().catch(() => null)
        if (today?.check_out) {
          setCheckoutData({ check_out: today.check_out, hours_worked: today.hours_worked })
          setCheckedIn(false)
          setCheckedOut(true)
          toast('You were already checked out today', { icon: 'ℹ️' })
        } else {
          setCheckedIn(false)
          toast('No active check-in found', { icon: 'ℹ️' })
        }
        qc.invalidateQueries({ queryKey: ['attendance', 'my_today'] })
      } else {
        toast.error(err.message ?? 'Check-out failed')
      }
    } finally {
      setCheckingOut(false)
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function reset() {
    stopCamera()
    setStep(0); setStepStatus({}); setSelectedZoneId(null); setWfh(false)
    setGeoResult(null); setFaceResult(null); setAttendanceRec(null)
    setCheckedIn(false); setCheckedOut(false)
  }

  /* ── Render ── */

  // Already checked out today
  if (checkedOut) {
    return (
      <div className="space-y-5 pb-6 max-w-xl mx-auto">
        <PageHeader />
        <div className="glass-card p-8 text-center space-y-4"
          style={{ border: '1px solid rgba(16,185,129,0.2)' }}>
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <LogOut size={28} className="text-success-400" />
          </div>
          <h2 className="text-lg font-bold text-success-400">Checked Out</h2>
          {checkoutData && (
            <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
              <InfoPill label="Check-out time"   value={checkoutData.check_out?.slice(0,5) ?? '—'}                     color="#10b981" />
              <InfoPill label="Hours worked"      value={`${Number(checkoutData.hours_worked ?? 0).toFixed(1)}h`} color="#10b981" />
            </div>
          )}
          <p className="text-xs text-text-muted">Your attendance has been recorded for today.</p>
          <Button variant="ghost" size="sm" onClick={reset}>Check In Again</Button>
        </div>
        <SecurityNotice />
      </div>
    )
  }

  // Active shift
  if (checkedIn) {
    return (
      <div className="space-y-5 pb-6 max-w-xl mx-auto">
        <PageHeader />
        <ActiveShiftView
          attendanceRec={attendanceRec}
          elapsed={elapsed}
          presence={presence}
          zones={zones}
          onCheckOut={handleCheckOut}
        />
        <SecurityNotice />
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-6 max-w-xl mx-auto">
      <PageHeader />

      {/* Step tracker */}
      <StepTracker step={step} stepStatus={stepStatus} wfh={wfh} />

      {/* Step panels */}
      {step === 0 && (
        <StepLocation
          zones={zones}
          loading={zonesLoading}
          selectedZoneId={selectedZoneId}
          onSelect={id => { setSelectedZoneId(id); setWfh(false) }}
          wfh={wfh}
          onWFH={() => { setWfh(true); setSelectedZoneId(null) }}
          onNext={handleLocationNext}
        />
      )}

      {step === 1 && (
        <StepQR
          zone={selectedZone}
          wfh={wfh}
          status={stepStatus.qr}
          onScan={handleQRStep}
          onBack={() => setStep(0)}
        />
      )}

      {step === 2 && (
        <StepGeo
          geoResult={geoResult}
          wfh={wfh}
          status={stepStatus.geo}
          onCheck={handleGeoStep}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <StepFace
          status={stepStatus.face}
          faceResult={faceResult}
          videoRef={videoRef}
          onVerify={handleFaceStep}
          onBack={() => setStep(2)}
        />
      )}

      {step === 4 && !checkedIn && (
        <div className="glass-card p-6 text-center space-y-2">
          <Loader size={28} className="mx-auto text-brand-400 animate-spin" />
          <p className="text-sm text-text-muted">Recording attendance…</p>
        </div>
      )}

      <SecurityNotice />
    </div>
  )
}

/* ─── Page header ─── */
function PageHeader() {
  return (
    <div>
      <h1 className="text-h2 text-text-primary">Check In / Out</h1>
      <p className="text-sm text-text-muted mt-0.5">3-step verification: Location → QR → Face</p>
    </div>
  )
}

/* ─── Step tracker ─── */
function StepTracker({ step, stepStatus, wfh }) {
  const steps = [
    { id: 'location', label: 'Location' },
    { id: 'qr',       label: wfh ? 'Skip QR' : 'QR Code' },
    { id: 'geo',      label: wfh ? 'WFH'     : 'Geofence' },
    { id: 'face',     label: 'Face ID' },
    { id: 'done',     label: 'Done' },
  ]
  return (
    <div className="glass-card px-5 py-4">
      <div className="flex items-center">
        {steps.map((s, i) => {
          const isCurrent = i === step
          const isPast    = i < step
          const isFail    = stepStatus[s.id] === 'fail'
          const isLoading = stepStatus[s.id] === 'loading'
          return (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div className={cn(
                  'w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all duration-300',
                  isFail    && 'border-danger-500 bg-danger-500/10',
                  isLoading && 'border-brand-500 bg-brand-500/10',
                  isPast && !isFail && 'border-success-500 bg-success-500/10',
                  isCurrent && !isFail && !isLoading && 'border-brand-500 bg-brand-500/10',
                  !isCurrent && !isPast && !isFail && 'border-border-subtle bg-transparent',
                )}>
                  {isFail    && <XCircle   size={14} className="text-danger-400" />}
                  {isLoading && <Loader    size={13} className="text-brand-400 animate-spin" />}
                  {isPast && !isFail && <CheckCircle size={14} className="text-success-400" />}
                  {isCurrent && !isFail && !isLoading && <span className="text-[11px] font-black text-brand-400">{i+1}</span>}
                  {!isCurrent && !isPast && !isFail && <span className="text-[11px] font-bold text-text-muted">{i+1}</span>}
                </div>
                <span className={cn('text-[9px] font-semibold whitespace-nowrap',
                  isFail    ? 'text-danger-400'
                  : isPast  ? 'text-success-400'
                  : isCurrent ? 'text-brand-300'
                  : 'text-text-muted'
                )}>{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="flex-1 mx-1.5 h-px transition-all duration-500"
                  style={{ background: i < step ? '#10b981' : 'rgba(99,102,241,0.15)' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Step 0: Location selector with live overview map ─── */
const ZONE_COLORS_L = ['#6366f1','#10b981','#06b6d4','#a78bfa','#f59e0b','#ec4899']

function LocationOverviewMap({ zones, selectedZoneId, userGps, mapMode }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const tileRef      = useRef(null)
  const layerRef     = useRef(null)

  // Init
  useEffect(() => {
    import('leaflet').then(({ default: L }) => {
      if (mapRef.current || !containerRef.current) return
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
        iconUrl:       new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href,
        shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href,
      })
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false })
      mapRef.current = map
      const t = GEO_TILES.street
      tileRef.current = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 }).addTo(map)
      layerRef.current = L.layerGroup().addTo(map)
      map.setView([-1.2921, 36.8219], 13)
    })
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }
  }, [])

  // Swap tiles
  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then(({ default: L }) => {
      if (tileRef.current) tileRef.current.remove()
      const t = GEO_TILES[mapMode] ?? GEO_TILES.street
      tileRef.current = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 }).addTo(mapRef.current)
    })
  }, [mapMode])

  // Re-draw whenever zones or user GPS changes
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return
    import('leaflet').then(({ default: L }) => {
      layerRef.current.clearLayers()
      const points = []

      // Draw all office zones
      zones.forEach((z, i) => {
        if (!z.latitude || !z.longitude) return
        const lat = parseFloat(z.latitude)
        const lng = parseFloat(z.longitude)
        const r   = z.radius_metres ?? 200
        const col = ZONE_COLORS_L[i % ZONE_COLORS_L.length]
        const sel = z.id === selectedZoneId

        L.circle([lat, lng], {
          radius:      r,
          color:       col,
          weight:      sel ? 3 : 1.5,
          opacity:     sel ? 0.9 : 0.6,
          fillColor:   col,
          fillOpacity: sel ? 0.12 : 0.05,
        }).addTo(layerRef.current)

        const icon = L.divIcon({
          html: `<div style="
            padding:3px 7px;border-radius:8px;
            background:${col}22;border:1.5px solid ${col};
            color:${col};font-size:10px;font-weight:700;
            white-space:nowrap;backdrop-filter:blur(4px);
            box-shadow:0 0 8px ${col}44
          ">${z.name}</div>`,
          className: '', iconAnchor: [0, 0],
        })
        L.marker([lat, lng], { icon })
          .bindPopup(`<b>${z.name}</b><br/>${lat.toFixed(6)}, ${lng.toFixed(6)}<br/>Radius: ${r}m${z.address ? `<br/>${z.address}` : ''}`)
          .addTo(layerRef.current)

        points.push([lat, lng])
      })

      // Draw user position
      if (userGps) {
        const { lat, lng, accuracy } = userGps
        const youIcon = L.divIcon({
          html: `<div style="
            width:20px;height:20px;border-radius:50%;
            background:rgba(16,185,129,0.9);border:3px solid white;
            box-shadow:0 0 16px rgba(16,185,129,0.8);
            display:flex;align-items:center;justify-content:center;
          ">
            <div style="width:6px;height:6px;border-radius:50%;background:white;"></div>
          </div>`,
          className: '', iconSize: [20,20], iconAnchor: [10,10],
        })
        L.marker([lat, lng], { icon: youIcon })
          .bindPopup(`<b>You are here</b><br/>${lat.toFixed(6)}, ${lng.toFixed(6)}<br/>±${Math.round(accuracy ?? 0)}m accuracy`)
          .addTo(layerRef.current)

        if (accuracy > 0) {
          L.circle([lat, lng], {
            radius: Math.min(accuracy, 1000),
            color: '#10b981', weight: 1, opacity: 0.4,
            fillColor: '#10b981', fillOpacity: 0.05,
          }).addTo(layerRef.current)
        }

        points.push([lat, lng])
      }

      // Fit bounds to show everything
      if (points.length === 1) {
        mapRef.current.setView(points[0], 15)
      } else if (points.length > 1) {
        mapRef.current.fitBounds(points, { padding: [40, 40], maxZoom: 16 })
      }
    })
  }, [zones, selectedZoneId, userGps])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

function StepLocation({ zones, loading, selectedZoneId, onSelect, wfh, onWFH, onNext }) {
  const [mapMode, setMapMode]   = useState('street')
  const [userGps, setUserGps]   = useState(null)
  const [locating, setLocating] = useState(false)

  // Auto-acquire GPS once on mount
  useEffect(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      p => { setUserGps({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); setLocating(false) },
      ()  => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  return (
    <div className="space-y-3">
      <div className="glass-card overflow-hidden">
        {/* Live overview map */}
        <div className="relative" style={{ height: 280 }}>
          <LocationOverviewMap zones={zones} selectedZoneId={selectedZoneId} userGps={userGps} mapMode={mapMode} />

          {/* Map mode toggle */}
          <div className="absolute top-2 left-2 z-[9999] flex gap-1 p-0.5 rounded-lg"
            style={{ background:'rgba(6,9,18,0.75)', backdropFilter:'blur(8px)', border:'1px solid rgba(99,102,241,0.2)' }}>
            {[{key:'street',icon:Map},{key:'satellite',icon:Satellite}].map(({key,icon:Icon}) => (
              <button key={key} onClick={() => setMapMode(key)}
                className="p-1.5 rounded-md transition-all"
                style={{ background: mapMode===key ? 'rgba(99,102,241,0.3)' : 'transparent', color: mapMode===key ? '#818cf8' : '#64748b' }}
                title={key.charAt(0).toUpperCase()+key.slice(1)}>
                <Icon size={11} />
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="absolute bottom-2 left-2 z-[9999] flex flex-col gap-1">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
              style={{ background:'rgba(6,9,18,0.75)', backdropFilter:'blur(8px)', border:'1px solid rgba(16,185,129,0.2)' }}>
              <div className="w-3 h-3 rounded-full bg-success-400 flex-shrink-0" style={{ boxShadow:'0 0 6px rgba(16,185,129,0.8)' }} />
              <span className="text-[9px] font-semibold text-success-400">
                {locating ? 'Locating you…' : userGps ? `You: ${userGps.lat.toFixed(5)}, ${userGps.lng.toFixed(5)}` : 'GPS unavailable'}
              </span>
            </div>
          </div>

          {/* GPS loading spinner */}
          {locating && (
            <div className="absolute top-2 right-2 z-[9999] flex items-center gap-1.5 px-2 py-1 rounded-lg"
              style={{ background:'rgba(6,9,18,0.75)', backdropFilter:'blur(8px)' }}>
              <Loader size={10} className="text-brand-400 animate-spin" />
              <span className="text-[9px] text-brand-400">Getting GPS…</span>
            </div>
          )}
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={15} className="text-brand-400" />
            <h2 className="text-sm font-bold text-text-primary">Where are you working today?</h2>
          </div>

          {loading && (
            <div className="flex items-center gap-3 py-3">
              <Loader size={15} className="text-brand-400 animate-spin" />
              <span className="text-sm text-text-muted">Loading office locations…</span>
            </div>
          )}

          {!loading && zones.length === 0 && (
            <div className="py-3 text-center">
              <p className="text-sm text-text-muted">No active office zones configured.</p>
              <p className="text-xs text-text-muted mt-1">Contact IT Admin to set up zones.</p>
            </div>
          )}

          {!loading && zones.length > 0 && (
            <div className="space-y-2 mb-3">
              {zones.map((z, i) => {
                const sel  = selectedZoneId === z.id && !wfh
                const col  = ZONE_COLORS_L[i % ZONE_COLORS_L.length]
                const dist = (userGps && z.latitude)
                  ? haversine(userGps.lat, userGps.lng, parseFloat(z.latitude), parseFloat(z.longitude))
                  : null
                const inside = dist != null && dist <= (z.radius_metres ?? 200)
                return (
                  <button key={z.id} onClick={() => onSelect(z.id)}
                    className="w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all duration-200"
                    style={{
                      background: sel ? `${col}18` : 'rgba(26,34,54,0.4)',
                      border:     `1px solid ${sel ? col + '55' : 'rgba(99,102,241,0.1)'}`,
                    }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: col + '20', border: `1px solid ${col}40` }}>
                      <MapPin size={13} style={{ color: col }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold" style={{ color: sel ? '#e2e8f0' : '#94a3b8' }}>{z.name}</p>
                        {sel && <CheckCircle size={11} style={{ color: col }} className="flex-shrink-0" />}
                        {dist != null && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto"
                            style={{ background: inside ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.08)', color: inside ? '#10b981' : '#64748b' }}>
                            {inside ? `✓ Inside (${dist}m)` : `${dist}m away`}
                          </span>
                        )}
                      </div>
                      {z.address && <p className="text-[10px] text-text-muted mt-0.5 truncate">{z.address}</p>}
                      <div className="flex items-center gap-3 mt-0.5">
                        {z.radius_metres && <p className="text-[10px] text-text-muted">{z.radius_metres}m radius</p>}
                        {z.latitude && (
                          <p className="text-[9px] font-mono text-text-muted">
                            {parseFloat(z.latitude).toFixed(5)}, {parseFloat(z.longitude).toFixed(5)}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* WFH option */}
          <button onClick={onWFH}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200"
            style={{
              background: wfh ? 'rgba(99,102,241,0.12)' : 'rgba(26,34,54,0.3)',
              border:     `1px solid ${wfh ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.08)'}`,
            }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: wfh ? 'rgba(99,102,241,0.2)' : 'rgba(26,34,54,0.5)', border: `1px solid ${wfh ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.1)'}` }}>
              <WifiOff size={13} style={{ color: wfh ? '#818cf8' : '#64748b' }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold" style={{ color: wfh ? '#e2e8f0' : '#94a3b8' }}>Working From Home</p>
                {wfh && <CheckCircle size={11} className="text-brand-400" />}
              </div>
              <p className="text-[10px] text-text-muted mt-0.5">Skips geofence — face verification still required</p>
            </div>
          </button>
        </div>
      </div>

      {/* My GPS coords strip */}
      {userGps && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.15)' }}>
          <Navigation size={11} className="text-success-400 flex-shrink-0" />
          <span className="text-[10px] text-text-muted">Your position:</span>
          <span className="text-[10px] font-mono font-semibold text-success-400">
            {userGps.lat.toFixed(6)}, {userGps.lng.toFixed(6)}
          </span>
          <span className="text-[9px] text-text-muted ml-auto">±{Math.round(userGps.accuracy)}m</span>
        </div>
      )}

      <Button variant="primary" fullWidth icon={<ChevronRight size={14} />}
        disabled={!selectedZoneId && !wfh}
        onClick={onNext}>
        Continue
      </Button>
    </div>
  )
}

/* ─── Step 1: QR ─── */
function StepQR({ zone, wfh, status, onScan, onBack }) {
  const loading = status === 'loading'
  const ok      = status === 'ok'
  const fail    = status === 'fail'

  // Countdown for zone token
  const [secs, setSecs] = useState(() => {
    if (!zone?.token_expires_at) return 30
    return Math.max(1, Math.round((new Date(zone.token_expires_at) - Date.now()) / 1000))
  })
  useEffect(() => {
    const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  const urgent = secs <= 8
  const r = 40, circ = 2 * Math.PI * r

  return (
    <div className="space-y-3">
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <QrCode size={15} className="text-brand-400" />
          <h2 className="text-sm font-bold text-text-primary">
            {wfh ? 'WFH — QR step skipped' : 'QR Token Verification'}
          </h2>
          {ok   && <CheckCircle size={14} className="text-success-400 ml-auto" />}
          {fail && <XCircle     size={14} className="text-danger-400 ml-auto"  />}
        </div>

        {wfh ? (
          <div className="py-4 text-center">
            <Wifi size={32} className="mx-auto text-brand-400 mb-2" />
            <p className="text-sm text-text-secondary">Working From Home mode</p>
            <p className="text-xs text-text-muted mt-1">QR token is not required</p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Animated QR with timer ring */}
            <div className="relative flex-shrink-0">
              <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90 absolute inset-0">
                <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(99,102,241,0.1)" strokeWidth="3" />
                <circle cx="60" cy="60" r={r} fill="none"
                  stroke={urgent ? '#ef4444' : '#6366f1'} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={circ} strokeDashoffset={circ * (1 - (secs / 30))}
                  style={{ transition: 'stroke-dashoffset 1s linear' }} />
              </svg>
              <div className="w-[120px] h-[120px] flex items-center justify-center">
                <div className="relative">
                  <QRGrid token={zone?.token ?? ''} />
                  {ok && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg"
                      style={{ background: 'rgba(16,185,129,0.2)' }}>
                      <CheckCircle size={24} className="text-success-400" />
                    </div>
                  )}
                </div>
              </div>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                  urgent ? 'text-danger-400 bg-danger-500/15' : 'text-brand-400 bg-brand-500/15')}>
                  {secs}s
                </span>
              </div>
            </div>

            <div className="flex-1">
              <p className="text-xs text-text-muted mb-1">Zone: <span className="font-semibold text-text-secondary">{zone?.name ?? '—'}</span></p>
              <p className="font-mono text-[10px] text-brand-400 mb-3">
                Token: <span className="font-black">{zone?.token?.slice(0,8) ?? '—'}…</span>
              </p>

              {fail && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl mb-3"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle size={12} className="text-danger-400 flex-shrink-0" />
                  <p className="text-xs text-danger-400">Token invalid or expired. Wait for rotation and try again.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack} disabled={loading}>Back</Button>
        <Button variant="primary" fullWidth loading={loading}
          icon={loading ? undefined : (ok ? <CheckCircle size={13} /> : <QrCode size={13} />)}
          onClick={onScan}>
          {loading ? 'Validating…' : ok ? 'Validated ✓ — Next' : wfh ? 'Continue' : 'Validate QR Token'}
        </Button>
      </div>
    </div>
  )
}

/* ─── Step 2: Geofence ─── */
function StepGeo({ geoResult, wfh, status, onCheck, onBack }) {
  const loading = status === 'loading'
  const ok      = status === 'ok'
  const fail    = status === 'fail'

  return (
    <div className="space-y-3">
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <MapPin size={15} className="text-neon-400" />
          <h2 className="text-sm font-bold text-text-primary">
            {wfh ? 'WFH — Location Check' : 'Geofence Verification'}
          </h2>
          {ok   && <CheckCircle size={14} className="text-success-400 ml-auto" />}
          {fail && <XCircle     size={14} className="text-danger-400 ml-auto"  />}
        </div>

        {/* Map visual */}
        <div className="relative rounded-2xl overflow-hidden mb-4" style={{ height: 220 }}>
          <MapVisual geoResult={geoResult} loading={loading} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <InfoPill label="Zone"       value={geoResult?.zoneName ?? (wfh ? 'WFH' : '—')} color="#22d3ee" />
          <InfoPill label="Radius"     value={geoResult?.zoneRadius ? `${geoResult.zoneRadius}m` : (wfh ? 'N/A' : '—')} color="#22d3ee" />
          <InfoPill label="Distance"   value={geoResult?.distance != null ? `${geoResult.distance}m` : (wfh ? 'N/A' : '—')}
            color={geoResult?.inside ? '#10b981' : geoResult?.distance != null ? '#ef4444' : '#64748b'} />
          <InfoPill label="Accuracy"   value={geoResult?.accuracy ? `±${Math.round(geoResult.accuracy)}m` : '—'} color="#22d3ee" />
          <InfoPill label="Status"     value={ok ? (wfh ? 'WFH ✓' : 'Inside ✓') : (fail ? 'Outside ✗' : (loading ? 'Checking…' : 'Pending'))}
            color={ok ? '#10b981' : fail ? '#ef4444' : '#94a3b8'} />
        </div>

        {/* Explicit lat/lng rows */}
        <div className="mt-3 space-y-1.5">
          {geoResult?.lat && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.15)' }}>
              <Navigation size={11} className="text-success-400 flex-shrink-0" />
              <span className="text-[10px] text-text-muted w-24 flex-shrink-0">Your position</span>
              <span className="text-[10px] font-mono font-bold text-success-400">
                {geoResult.lat.toFixed(6)},&nbsp;{geoResult.lng.toFixed(6)}
              </span>
              <span className="text-[9px] text-text-muted ml-auto">±{Math.round(geoResult.accuracy ?? 0)}m</span>
            </div>
          )}
          {geoResult?.zoneLat && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background:'rgba(6,182,212,0.07)', border:'1px solid rgba(6,182,212,0.15)' }}>
              <MapPin size={11} className="text-cyan-400 flex-shrink-0" />
              <span className="text-[10px] text-text-muted w-24 flex-shrink-0">Office ({geoResult.zoneName})</span>
              <span className="text-[10px] font-mono font-bold text-cyan-400">
                {geoResult.zoneLat.toFixed(6)},&nbsp;{geoResult.zoneLng.toFixed(6)}
              </span>
            </div>
          )}
        </div>

        {fail && geoResult && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertTriangle size={13} className="text-danger-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-danger-400">Outside geofence zone</p>
              <p className="text-xs text-text-muted mt-0.5">
                You are {geoResult.distance}m away — must be within {geoResult.zoneRadius}m of "{geoResult.zoneName}".
                {geoResult.accuracy > 50 ? ` GPS accuracy is low (±${Math.round(geoResult.accuracy)}m) — move outside for better signal.` : ''}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack} disabled={loading}>Back</Button>
        <Button variant="primary" fullWidth loading={loading}
          icon={loading ? undefined : ok ? <CheckCircle size={13} /> : <Navigation size={13} />}
          onClick={onCheck}>
          {loading ? 'Getting location…' : ok ? 'Verified ✓ — Next' : fail ? 'Retry GPS' : 'Check My Location'}
        </Button>
      </div>
    </div>
  )
}

/* ─── Step 3: Face ─── */
function StepFace({ status, faceResult, videoRef, onVerify, onBack }) {
  const loading = status === 'loading'
  const ok      = status === 'ok'
  const fail    = status === 'fail'
  const scanning = loading

  return (
    <div className="space-y-3">
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <ScanFace size={15} className="text-accent-400" />
          <h2 className="text-sm font-bold text-text-primary">Face Verification</h2>
          {ok   && <CheckCircle size={14} className="text-success-400 ml-auto" />}
          {fail && <XCircle     size={14} className="text-danger-400 ml-auto"  />}
        </div>

        {/* Camera */}
        <div className="relative mx-auto rounded-2xl overflow-hidden mb-4" style={{ width: 220, height: 240 }}>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)', filter: 'brightness(0.85) contrast(1.1)' }} />
          <div className="absolute inset-0" style={{ background: 'rgba(6,9,18,0.6)' }}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <FaceOutlineSVG scanning={scanning} done={ok} />
            </div>
            {scanning && (
              <div className="absolute left-6 right-6 h-px opacity-70"
                style={{ background: 'linear-gradient(90deg,transparent,#a78bfa,#22d3ee,transparent)', animation: 'face-scan 2s ease-in-out infinite' }} />
            )}
            {ok && (
              <div className="absolute inset-0 flex items-center justify-center">
                <CheckCircle size={48} className="text-success-400" style={{ filter: 'drop-shadow(0 0 16px rgba(16,185,129,0.8))' }} />
              </div>
            )}
          </div>
          {['tl','tr','bl','br'].map(c => <FaceCorner key={c} c={c} done={ok} />)}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
            <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap',
              ok   ? 'text-success-400 bg-success-500/15'
              : fail ? 'text-danger-400 bg-danger-500/15'
              : scanning ? 'text-accent-400 bg-accent-500/15'
              : 'text-text-muted bg-surface-3')}>
              {ok ? 'VERIFIED' : fail ? 'NOT MATCHED' : scanning ? 'SCANNING…' : 'READY'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <InfoPill label="Match score" value={ok && faceResult?.confidence ? faceResult.confidence : '—'} color={ok ? '#10b981' : '#475569'} />
          <InfoPill label="Threshold"   value="< 0.50"                                                      color="#475569" />
          <InfoPill label="Status"      value={ok ? (faceResult?.verified ? 'Verified ✓' : 'Skipped') : (fail ? 'Failed ✗' : '—')} color={ok ? '#10b981' : fail ? '#ef4444' : '#475569'} />
        </div>

        {!ok && !fail && (
          <p className="text-xs text-text-muted text-center mt-3">
            Click "Scan Face" — look directly at camera, ensure good lighting
          </p>
        )}
        {fail && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertTriangle size={13} className="text-danger-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-danger-400">
              Face not recognised (score: {faceResult?.confidence ?? '—'}). Ensure good lighting, remove glasses, look directly at camera.
            </p>
          </div>
        )}
      </div>
      <style>{`@keyframes face-scan { 0%{top:20%} 100%{top:80%} }`}</style>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack} disabled={loading}>Back</Button>
        <Button variant="primary" fullWidth loading={loading}
          icon={loading ? undefined : ok ? <CheckCircle size={13} /> : <ScanFace size={13} />}
          onClick={onVerify}>
          {loading ? 'Scanning…' : ok ? 'Verified ✓ — Complete' : fail ? 'Retry Scan' : 'Scan Face'}
        </Button>
      </div>
    </div>
  )
}

/* ─── Active shift view with continuous GPS ─── */
function ActiveShiftView({ attendanceRec, elapsed, presence, zones, onCheckOut }) {
  const statusColor = attendanceRec?.status === 'LATE' ? '#f59e0b' : '#10b981'

  return (
    <div className="space-y-4">
      {/* Shift banner */}
      <div className="relative rounded-2xl overflow-hidden p-5"
        style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.1),rgba(6,182,212,0.08))', border: '1px solid rgba(16,185,129,0.25)' }}>
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg,transparent,rgba(16,185,129,0.6),transparent)' }} />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-3 h-3 rounded-full bg-success-400" style={{ boxShadow: '0 0 8px rgba(16,185,129,0.8)' }} />
              <div className="absolute inset-0 rounded-full bg-success-400 animate-ping opacity-30" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-success-400">Shift Active</p>
                {attendanceRec?.status === 'LATE' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>LATE</span>
                )}
              </div>
              <p className="text-xs text-text-muted">
                Checked in at <span className="font-semibold text-text-secondary">{fmtTime(attendanceRec?.check_in)}</span>
                {attendanceRec?.method === 'wfh' && <span className="ml-1.5 text-[10px] text-brand-400">· WFH</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-xl font-black text-text-primary">{elapsed.toFixed(1)}h</div>
              <div className="text-[10px] text-text-muted">elapsed</div>
            </div>
            <Button variant="danger" size="sm" icon={<LogOut size={13} />} onClick={onCheckOut}>
              Check Out
            </Button>
          </div>
        </div>
      </div>

      {/* Continuous GPS presence */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Navigation size={13} className="text-neon-400" />
          <h3 className="text-xs font-semibold text-text-secondary">Live Presence Monitor</h3>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse" />
            <span className="text-[9px] text-text-muted">Live</span>
          </div>
        </div>

        {presence ? (
          <>
            <div className="relative rounded-xl overflow-hidden mb-3" style={{ height: 180 }}>
              <MapVisual geoResult={{
                lat:        presence.lat,
                lng:        presence.lng,
                accuracy:   0,
                distance:   presence.distance,
                inside:     presence.inside,
                zoneName:   presence.zone?.name,
                zoneRadius: presence.zone?.radius_metres,
                zoneLat:    presence.zone?.latitude  ? parseFloat(presence.zone.latitude)  : null,
                zoneLng:    presence.zone?.longitude ? parseFloat(presence.zone.longitude) : null,
              }} loading={false} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <InfoPill label="Nearest zone"  value={presence.zone?.name ?? '—'}                          color="#22d3ee" />
              <InfoPill label="Distance"       value={`${presence.distance}m`}                            color={presence.inside ? '#10b981' : '#f59e0b'} />
              <InfoPill label="Your location"  value={`${presence.lat.toFixed(4)}, ${presence.lng.toFixed(4)}`} color="#64748b" />
              <InfoPill label="Status"         value={presence.inside ? 'On-site ✓' : 'Off-site'}        color={presence.inside ? '#10b981' : '#f59e0b'} />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 py-3">
            <Loader size={14} className="text-text-muted animate-spin" />
            <p className="text-xs text-text-muted">Acquiring GPS — allow location access if prompted</p>
          </div>
        )}

        <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(99,102,241,0.08)' }}>
          <p className="text-[10px] text-text-muted font-semibold mb-1.5 uppercase tracking-wider">All office zones</p>
          <div className="space-y-1">
            {zones.map(z => {
              const dist = (presence?.lat && z.latitude)
                ? haversine(presence.lat, presence.lng, parseFloat(z.latitude), parseFloat(z.longitude))
                : null
              const inside = dist != null && dist <= (z.radius_metres ?? 200)
              return (
                <div key={z.id} className="flex items-center gap-2 py-1">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: inside ? '#10b981' : dist != null ? '#475569' : '#334155' }} />
                  <span className="text-[10px] text-text-secondary flex-1 truncate">{z.name}</span>
                  {dist != null ? (
                    <span className="text-[10px] font-semibold" style={{ color: inside ? '#10b981' : '#64748b' }}>
                      {inside ? '✓ Inside' : `${dist}m away`}
                    </span>
                  ) : (
                    <span className="text-[10px] text-text-muted">no GPS data</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Real Leaflet map for geofence step ─── */
const GEO_TILES = {
  street:    { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                                        attr: '© OpenStreetMap' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '© Esri' },
}

function MapVisual({ geoResult, loading }) {
  const inside   = geoResult?.inside ?? false
  const zoneName = geoResult?.zoneName ?? 'Office Zone'

  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const tileRef      = useRef(null)
  const layerRef     = useRef(null)
  const [mapMode, setMapMode] = useState('street')
  const mapModeRef = useRef('street')

  // Init map once
  useEffect(() => {
    import('leaflet').then(({ default: L }) => {
      if (mapRef.current || !containerRef.current) return

      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
        iconUrl:       new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href,
        shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href,
      })

      const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false })
      mapRef.current = map

      const t = GEO_TILES.street
      tileRef.current = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 }).addTo(map)
      layerRef.current = L.layerGroup().addTo(map)

      // default view — Nairobi
      map.setView([-1.2921, 36.8219], 15)
    })
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  // Switch tile on mode change
  useEffect(() => {
    if (!mapRef.current) return
    mapModeRef.current = mapMode
    import('leaflet').then(({ default: L }) => {
      if (tileRef.current) tileRef.current.remove()
      const t = GEO_TILES[mapMode]
      tileRef.current = L.tileLayer(t.url, { attribution: t.attr, maxZoom: 19 }).addTo(mapRef.current)
    })
  }, [mapMode])

  // Update markers when geoResult changes
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return
    import('leaflet').then(({ default: L }) => {
      layerRef.current.clearLayers()

      const hasZone = geoResult?.zoneName && geoResult?.zoneRadius
      const hasUser = geoResult?.lat && geoResult?.lng
      if (!hasUser) return

      const userLat = geoResult.lat
      const userLng = geoResult.lng
      const insideColor = inside ? '#10b981' : '#f59e0b'

      // Zone circle — same centre as the QR-validated zone
      // We don't have zone lat here but can draw approximate ring around user if inside
      // or at a fixed offset if outside
      if (hasZone) {
        // Use real zone centre if available, else estimate
        const zoneLat = geoResult.zoneLat ?? (userLat + (inside ? 0 : -(geoResult.distance ?? 500) / 111320 * 0.6))
        const zoneLng = geoResult.zoneLng ?? (userLng + (inside ? 0 :  (geoResult.distance ?? 500) / (111320 * Math.cos(userLat * Math.PI/180)) * 0.6))
        L.circle([zoneLat, zoneLng], {
          radius:      geoResult.zoneRadius,
          color:       '#22d3ee',
          weight:      2,
          opacity:     0.7,
          dashArray:   inside ? null : '6 4',
          fillColor:   '#22d3ee',
          fillOpacity: 0.05,
        }).addTo(layerRef.current)

        // Zone centre pin
        const zoneIcon = L.divIcon({
          html: `<div style="width:10px;height:10px;border-radius:50%;background:#22d3ee;border:2px solid white;box-shadow:0 0 8px rgba(6,182,212,0.8)"></div>`,
          className: '', iconSize: [10,10], iconAnchor: [5,5],
        })
        L.marker([zoneLat, zoneLng], { icon: zoneIcon })
          .bindPopup(`<b>${zoneName}</b><br/>r=${geoResult.zoneRadius}m`)
          .addTo(layerRef.current)
      }

      // User position pin
      const userIcon = L.divIcon({
        html: `<div style="width:16px;height:16px;border-radius:50%;background:${insideColor};border:2.5px solid white;box-shadow:0 0 12px ${insideColor}99;display:flex;align-items:center;justify-content:center">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M12 2L6 8h4v13h4V8h4z"/></svg>
        </div>`,
        className: '', iconSize: [16,16], iconAnchor: [8,8],
      })
      L.marker([userLat, userLng], { icon: userIcon })
        .bindPopup(`<b>Your position</b><br/>${userLat.toFixed(6)}, ${userLng.toFixed(6)}<br/>±${Math.round(geoResult.accuracy ?? 0)}m accuracy`)
        .addTo(layerRef.current)

      // Accuracy circle around user
      if (geoResult.accuracy > 0) {
        L.circle([userLat, userLng], {
          radius:      Math.min(geoResult.accuracy, 500),
          color:       insideColor,
          weight:      1,
          opacity:     0.4,
          fillColor:   insideColor,
          fillOpacity: 0.04,
        }).addTo(layerRef.current)
      }

      // Fit view — zoom out more if user is far from zone
      if (hasZone && geoResult.distance > (geoResult.zoneRadius ?? 200) * 3) {
        mapRef.current.setView([userLat, userLng], 14)
      } else {
        mapRef.current.setView([userLat, userLng], 16)
      }
    })
  }, [geoResult, inside])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} style={{ width:'100%', height:'100%' }} />

      {/* Map mode toggle */}
      <div className="absolute top-2 left-2 z-[9999] flex gap-1 p-0.5 rounded-lg"
        style={{ background:'rgba(6,9,18,0.75)', backdropFilter:'blur(8px)', border:'1px solid rgba(99,102,241,0.2)' }}>
        {[{key:'street',icon:Map},{key:'satellite',icon:Satellite}].map(({key,icon:Icon}) => (
          <button key={key} onClick={() => setMapMode(key)}
            className="p-1.5 rounded-md transition-all"
            style={{ background: mapMode===key ? 'rgba(99,102,241,0.3)' : 'transparent', color: mapMode===key ? '#818cf8' : '#64748b' }}
            title={key.charAt(0).toUpperCase()+key.slice(1)}>
            <Icon size={11} />
          </button>
        ))}
      </div>

      {/* Inside/outside badge */}
      <div className="absolute top-2 right-2 z-[9999] text-[9px] font-bold px-2 py-1 rounded-lg"
        style={{
          background: loading ? 'rgba(99,102,241,0.15)' : inside ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
          color:      loading ? '#818cf8' : inside ? '#10b981' : '#f59e0b',
          border:     `1px solid ${loading ? 'rgba(99,102,241,0.3)' : inside ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
          backdropFilter: 'blur(8px)',
        }}>
        {loading ? 'LOCATING…' : inside ? 'INSIDE ✓' : 'OUTSIDE'}
      </div>

      {/* Zone name tag */}
      <div className="absolute bottom-2 left-2 z-[9999] text-[9px] font-bold px-2 py-0.5 rounded"
        style={{ background:'rgba(6,182,212,0.15)', color:'#22d3ee', border:'1px solid rgba(6,182,212,0.3)', backdropFilter:'blur(8px)' }}>
        {zoneName}
      </div>

      {/* GPS coords tag */}
      {geoResult?.lat && (
        <div className="absolute bottom-2 right-2 z-[9999] text-[8px] font-mono px-1.5 py-0.5 rounded"
          style={{ background:'rgba(6,9,18,0.75)', color:'#64748b', border:'1px solid rgba(99,102,241,0.15)', backdropFilter:'blur(8px)' }}>
          {geoResult.lat.toFixed(5)}, {geoResult.lng.toFixed(5)}
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[9999] flex items-center justify-center"
          style={{ background:'rgba(6,9,18,0.45)' }}>
          <Loader size={20} className="text-brand-400 animate-spin" />
        </div>
      )}
    </div>
  )
}

/* ─── QR grid visual ─── */
function QRGrid({ token }) {
  const seed = token.split('').reduce((a,c) => a + c.charCodeAt(0), 0)
  const size = 7
  const cells = Array.from({length: size*size}, (_,i) => {
    const r = Math.floor(i/size), c = i%size
    if ((r<2&&c<2)||(r<2&&c>=size-2)||(r>=size-2&&c<2)) return true
    return ((seed*(i+1)*1103515245+12345)&0x80000000) !== 0
  })
  return (
    <div className="p-2 rounded-lg" style={{ background:'rgba(6,9,18,0.9)', border:'1px solid rgba(99,102,241,0.3)' }}>
      <div className="grid gap-0.5" style={{ gridTemplateColumns:`repeat(${size},1fr)` }}>
        {cells.map((f,i) => <div key={i} className="w-4 h-4 rounded-[2px] transition-all duration-300" style={{ background:f?'#818cf8':'transparent' }} />)}
      </div>
    </div>
  )
}

/* ─── Face SVG + corners ─── */
function FaceOutlineSVG({ scanning, done }) {
  const color = done ? '#10b981' : scanning ? '#a78bfa' : '#6366f1'
  return (
    <svg width="100" height="120" viewBox="0 0 100 120" fill="none" opacity="0.8">
      <ellipse cx="50" cy="55" rx="35" ry="45" stroke={color} strokeWidth="1.5" strokeDasharray={scanning?'5 3':'0'} />
      <ellipse cx="37" cy="46" rx="5"  ry="6"  stroke={color} strokeWidth="1" />
      <ellipse cx="63" cy="46" rx="5"  ry="6"  stroke={color} strokeWidth="1" />
      <path d="M38 70 Q50 78 62 70" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}
function FaceCorner({ c, done }) {
  const color = done ? '#10b981' : '#a78bfa'
  const s = {
    tl:{top:6,left:6,     borderTop:'2px solid',borderLeft:'2px solid',    borderRadius:'6px 0 0 0'},
    tr:{top:6,right:6,    borderTop:'2px solid',borderRight:'2px solid',   borderRadius:'0 6px 0 0'},
    bl:{bottom:6,left:6,  borderBottom:'2px solid',borderLeft:'2px solid', borderRadius:'0 0 0 6px'},
    br:{bottom:6,right:6, borderBottom:'2px solid',borderRight:'2px solid',borderRadius:'0 0 6px 0'},
  }[c]
  return <div className="absolute w-4 h-4 transition-colors duration-500" style={{ ...s, borderColor:color }} />
}

/* ─── Security notice ─── */
function SecurityNotice() {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl"
      style={{ background:'rgba(26,34,54,0.4)', border:'1px solid rgba(99,102,241,0.08)' }}>
      <Shield size={12} className="text-text-muted flex-shrink-0 mt-0.5" />
      <p className="text-[10px] text-text-muted leading-relaxed">
        <strong className="text-text-secondary">Privacy:</strong> Face verification runs in-browser. No images leave your device — only an encrypted descriptor. GPS is validated server-side and purged after 24 hours.
      </p>
    </div>
  )
}

/* ─── Info pill ─── */
function InfoPill({ label, value, color }) {
  return (
    <div className="flex flex-col gap-0.5 p-2 rounded-xl text-center"
      style={{ background:'rgba(26,34,54,0.5)', border:'1px solid rgba(99,102,241,0.08)' }}>
      <span className="text-[9px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
      <span className="text-[10px] font-semibold truncate" style={{ color }}>{value}</span>
    </div>
  )
}
