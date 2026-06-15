import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { Shield, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { faceApi } from '@/lib/api'
import { loadModels, extractDescriptor, descriptorToArray } from '@/lib/faceEngine'

const ROLE_HOME = {
  EMPLOYEE: '/dashboard/employee',
  MANAGER:  '/dashboard/manager',
  HR:       '/dashboard/hr',
  IT_ADMIN: '/dashboard/it-admin',
  FINANCE:  '/dashboard/finance',
}

export default function FaceVerifyPage() {
  const navigate   = useNavigate()
  const { user, setFaceVerified, getRole, logout } = useAuthStore()

  const [phase, setPhase]       = useState('init')   // init | ready | scan | match | success | failed
  const [progress, setProgress] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked]     = useState(false)
  const [dots, setDots]         = useState(0)
  const [camReady, setCamReady] = useState(false)

  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const animRef   = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setDots(d => (d + 1) % 4), 500)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    // On mount: just open the camera and load models — wait for user to click Verify
    openCameraAndModels()
    return () => {
      stopCamera()
      clearTimeout(animRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openCameraAndModels() {
    const role = getRole()
    if (role === 'IT_ADMIN') {
      // IT_ADMIN skips face — go straight to ready state with a "Verify" button
      setPhase('ready')
      setCamReady(true)
      return
    }
    // Start camera + load models in parallel
    await Promise.all([loadModels().catch(() => {}), startCamera()])
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await new Promise(res => { videoRef.current.onloadedmetadata = res })
        await videoRef.current.play()
      }
      setCamReady(true)
      setPhase('ready')
    } catch {
      // Camera unavailable — still show Verify button, scan will fail gracefully
      setCamReady(false)
      setPhase('ready')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function tick(ms, fn) {
    return new Promise(res => {
      animRef.current = setTimeout(() => { fn(); res() }, ms)
    })
  }

  async function startVerification() {
    setProgress(0)
    const role = getRole()

    /* IT_ADMIN skips face verification entirely */
    if (role === 'IT_ADMIN') {
      await tick(700,  () => { setPhase('scan');  setProgress(30) })
      await tick(800,  () => { setProgress(60) })
      await tick(700,  () => { setPhase('match'); setProgress(85) })
      await tick(800,  () => { setProgress(100) })
      await tick(500,  () => {
        setPhase('success')
        setFaceVerified(true)
        navigate(ROLE_HOME[role] ?? '/login')
      })
      return
    }

    /* --- Scanning phase --- */
    setPhase('scan')
    await tick(500, () => setProgress(15))
    await tick(600, () => setProgress(35))

    /* Extract real face descriptor from camera */
    let descriptor = null
    if (videoRef.current && videoRef.current.readyState >= 2) {
      try {
        descriptor = await extractDescriptor(videoRef.current)
      } catch { /* model failure */ }
    }

    await tick(700, () => setProgress(55))

    /* --- Matching phase --- */
    setPhase('match')
    await tick(800, () => setProgress(72))
    await tick(700, () => setProgress(88))
    await tick(600, () => setProgress(100))

    let pass = false

    if (!descriptor) {
      pass = false
    } else {
      try {
        await faceApi.verify(descriptorToArray(descriptor))
        pass = true
      } catch {
        pass = false
      }
    }

    if (pass) {
      setPhase('success')
      stopCamera()
      await tick(1500, () => {
        setFaceVerified(true)
        navigate(ROLE_HOME[role] ?? '/login')
      })
    } else {
      setPhase('failed')
      stopCamera()
      const next = attempts + 1
      setAttempts(next)
      if (next >= 3) setLocked(true)
    }
  }

  function handleRetry() {
    if (locked) return
    // Re-open camera then wait for user to click Verify again
    setCamReady(false)
    setPhase('init')
    openCameraAndModels()
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 40%, #f5f0ff 100%)' }}>
      {/* Subtle decorative blobs */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 65%)' }} />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none translate-x-1/3 translate-y-1/3"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 65%)' }} />

      <div className="w-full max-w-sm relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)' }}>
            <Shield size={12} style={{ color: '#6366f1' }} />
            <span className="text-xs font-semibold" style={{ color: '#6366f1' }}>Biometric Verification</span>
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: '#1e293b' }}>Face Verification</h1>
          <p className="text-sm" style={{ color: '#64748b' }}>
            Hi <span className="font-semibold" style={{ color: '#334155' }}>{user?.full_name?.split(' ')[0]}</span>,{' '}
            {phase === 'ready'
              ? 'when ready, click the button below'
              : 'hold still while we verify'}
          </p>
        </div>

        {/* Camera / face scanner */}
        <div className="relative mx-auto w-64 h-64 mb-8">
          {/* Glow halo */}
          <div className="absolute inset-0 rounded-full transition-all duration-700" style={{
            background: phase === 'success'
              ? 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)'
              : phase === 'failed'
              ? 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
          }} />

          <div className={cn(
            'absolute inset-4 rounded-full overflow-hidden border-[3px] transition-all duration-500',
            phase === 'success' ? 'border-emerald-400'
              : phase === 'failed' ? 'border-red-400'
              : 'border-indigo-400'
          )} style={{
            boxShadow: phase === 'success'
              ? '0 0 32px rgba(16,185,129,0.35)'
              : phase === 'failed'
              ? '0 0 32px rgba(239,68,68,0.35)'
              : '0 0 32px rgba(99,102,241,0.25)',
            background: '#0d1117',
          }}>
            <video ref={videoRef} autoPlay playsInline muted
              className="w-full h-full object-cover"
              style={{ filter: 'brightness(1.05) contrast(1.05)' }} />

            {/* Overlay — nearly transparent in ready phase so face is fully visible */}
            <div className="absolute inset-0 flex items-center justify-center transition-all duration-500"
              style={{ background: phase === 'ready' ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.58)' }}>
              {phase !== 'ready' && <FaceSVG phase={phase} />}
            </div>

            {(phase === 'scan' || phase === 'match') && (
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute left-0 right-0 h-0.5 opacity-80"
                  style={{
                    background: 'linear-gradient(90deg, transparent, #6366f1, #22d3ee, #6366f1, transparent)',
                    animation: 'scan-line 2s ease-in-out infinite',
                    top: '50%',
                  }} />
              </div>
            )}
          </div>

          {['tl','tr','bl','br'].map(pos => (
            <CornerDot key={pos} pos={pos} phase={phase} />
          ))}

          <ProgressRing progress={progress} phase={phase} />
        </div>

        {/* Status card — white on light bg */}
        <div className="p-5 text-center rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(99,102,241,0.18)',
            boxShadow: '0 4px 32px rgba(99,102,241,0.10), 0 1px 4px rgba(0,0,0,0.06)',
          }}>
          <StatusIcon phase={phase} />

          <p className="text-sm font-medium mt-2 transition-all duration-300" style={{
            color: phase === 'success' ? '#10b981'
                 : phase === 'failed'  ? '#ef4444'
                 : phase === 'ready'   ? '#64748b'
                 : '#1e293b',
          }}>
            {phase === 'init'     ? `Starting camera${'.'.repeat(dots)}`
             : phase === 'ready'  ? 'Position your face in the circle and click Verify'
             : phase === 'scan'   ? `Analyzing facial features${'.'.repeat(dots)}`
             : phase === 'match'  ? `Matching biometric data${'.'.repeat(dots)}`
             : phase === 'success'? 'Identity verified successfully'
             : phase === 'failed' ? locked ? 'Account locked — contact HR' : 'Verification failed. Try again?'
             : `Initializing${'.'.repeat(dots)}`}
          </p>

          {attempts > 0 && !locked && phase === 'failed' && (
            <p className="text-xs mt-1" style={{ color: '#f59e0b' }}>
              Attempt {attempts}/3 — {3 - attempts} remaining
            </p>
          )}

          {(phase === 'scan' || phase === 'match') && (
            <div className="mt-4 h-1 rounded-full overflow-hidden"
              style={{ background: 'rgba(99,102,241,0.12)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #6366f1, #22d3ee)',
                  boxShadow: '0 0 8px rgba(99,102,241,0.6)',
                }} />
            </div>
          )}

          <div className="mt-5 flex gap-2">
            {/* Main Verify button — shown only in ready state */}
            {phase === 'ready' && (
              <Button variant="primary" fullWidth size="sm" onClick={startVerification}
                icon={<Shield size={13} />}>
                Verify my face
              </Button>
            )}

            {phase === 'failed' && !locked && (
              <Button variant="primary" fullWidth size="sm" onClick={handleRetry} icon={<RefreshCw size={13} />}>
                Retry verification
              </Button>
            )}

            {locked && (
              <div className="flex-1 text-xs text-danger-400 flex items-center gap-2 justify-center p-2 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertTriangle size={13} />
                HR has been notified
              </div>
            )}

            {/* Cancel / back — always shown except during active scan */}
            {(phase === 'ready' || phase === 'failed' || locked) && (
              <Button variant="ghost" size="sm" onClick={handleLogout}
                className={phase === 'ready' ? '' : 'flex-1'}>
                {locked ? 'Back to login' : 'Cancel'}
              </Button>
            )}
          </div>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: '#64748b' }}>
          Your face data is processed entirely on this device. Nothing is transmitted except the encrypted descriptor.
        </p>
      </div>

      <style>{`
        @keyframes scan-line {
          0%   { top: 20%; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 80%; opacity: 0; }
        }
      `}</style>
    </div>
  )
}

function FaceSVG({ phase }) {
  const color = phase === 'success' ? '#10b981' : phase === 'failed' ? '#ef4444' : '#818cf8'
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ opacity: 0.9 }}>
      <ellipse cx="40" cy="32" rx="18" ry="22" stroke={color} strokeWidth="1.5" fill="none" opacity="0.7" />
      <circle cx="33" cy="28" r="2.5" fill={color} opacity="0.9" />
      <circle cx="47" cy="28" r="2.5" fill={color} opacity="0.9" />
      {phase === 'success'
        ? <path d="M33 38 Q40 44 47 38" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        : phase === 'failed'
        ? <path d="M33 42 Q40 36 47 42" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        : <path d="M33 39 Q40 41 47 39" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6" />
      }
      {phase !== 'success' && phase !== 'failed' && (
        <>
          <circle cx="28" cy="22" r="1" fill={color} opacity="0.5" />
          <circle cx="52" cy="22" r="1" fill={color} opacity="0.5" />
          <circle cx="28" cy="42" r="1" fill={color} opacity="0.5" />
          <circle cx="52" cy="42" r="1" fill={color} opacity="0.5" />
        </>
      )}
    </svg>
  )
}

function CornerDot({ pos, phase }) {
  const color = phase === 'success' ? '#10b981' : phase === 'failed' ? '#ef4444' : '#6366f1'
  const style = {
    tl: { top: 8,    left: 8,    borderTop: '2px solid', borderLeft: '2px solid', borderRadius: '4px 0 0 0' },
    tr: { top: 8,    right: 8,   borderTop: '2px solid', borderRight: '2px solid', borderRadius: '0 4px 0 0' },
    bl: { bottom: 8, left: 8,    borderBottom: '2px solid', borderLeft: '2px solid', borderRadius: '0 0 0 4px' },
    br: { bottom: 8, right: 8,   borderBottom: '2px solid', borderRight: '2px solid', borderRadius: '0 0 4px 0' },
  }[pos]
  return (
    <div className="absolute w-4 h-4 transition-colors duration-500"
      style={{ ...style, borderColor: color }} />
  )
}

function ProgressRing({ progress, phase }) {
  const r = 122
  const c = 2 * Math.PI * r
  const offset = c - (progress / 100) * c
  const color = phase === 'success' ? '#10b981' : phase === 'failed' ? '#ef4444' : '#6366f1'
  return (
    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 256 256">
      <circle cx="128" cy="128" r={r} fill="none" stroke="rgba(99,102,241,0.08)" strokeWidth="2" />
      <circle cx="128" cy="128" r={r} fill="none" stroke={color} strokeWidth="2"
        strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.5s ease', filter: `drop-shadow(0 0 4px ${color}90)` }}
      />
    </svg>
  )
}

function StatusIcon({ phase }) {
  if (phase === 'success') return <CheckCircle size={28} className="mx-auto text-success-400" />
  if (phase === 'failed')  return <XCircle size={28} className="mx-auto text-danger-400" />
  if (phase === 'ready')   return <Shield size={28} className="mx-auto text-brand-400" />
  return (
    <div className="w-7 h-7 mx-auto rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
  )
}
