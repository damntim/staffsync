import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { CheckCircle, AlertTriangle, Camera, Shield, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { faceApi } from '@/lib/api'
import { loadModels, extractDescriptor, averageDescriptors, descriptorToArray } from '@/lib/faceEngine'

const CAPTURES_REQUIRED = 3

const PROMPTS = [
  { id: 0, label: 'Look straight at the camera', icon: '👁' },
  { id: 1, label: 'Slowly turn your head left',  icon: '↩️' },
  { id: 2, label: 'Slowly turn your head right', icon: '↪️' },
]

export default function FaceEnrollPage() {
  const navigate = useNavigate()
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const timerRef  = useRef(null)

  const [phase, setPhase]               = useState('loading')   // loading | consent | camera | capturing | noface | enrolling | done | error
  const [captures, setCaptures]         = useState([])          // { id, descriptor }[]
  const [currentPrompt, setCurrentPrompt] = useState(0)
  const [consentGiven, setConsent]      = useState(false)
  const [countdown, setCountdown]       = useState(null)
  const [errorMsg, setErrorMsg]         = useState('')

  /* Pre-load models on mount so there's no delay when user starts */
  useEffect(() => {
    loadModels()
      .then(() => setPhase('consent'))
      .catch(() => {
        setPhase('consent')   // graceful — show UI, errors will surface at capture time
      })
    return () => {
      stopCamera()
      clearTimeout(timerRef.current)
    }
  }, [])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await new Promise(res => { videoRef.current.onloadedmetadata = res })
        await videoRef.current.play()
      }
    } catch {
      toast.error('Camera access denied — please allow camera permission')
      setPhase('consent')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function beginEnrollment() {
    setPhase('camera')
    setCaptures([])
    await startCamera()
    await delay(800)
    runCapture(0, [])
  }

  async function runCapture(idx, prev) {
    if (idx >= CAPTURES_REQUIRED) {
      /* All 3 captures done — average descriptors and enroll */
      setPhase('enrolling')
      const descriptors = prev.map(c => new Float32Array(c.descriptor))
      const avg = averageDescriptors(descriptors)
      if (!avg) {
        setPhase('error')
        setErrorMsg('Could not compute descriptor. Please retry.')
        return
      }
      try {
        await faceApi.enroll(descriptorToArray(avg))
        stopCamera()
        setPhase('done')
      } catch (err) {
        stopCamera()
        setPhase('error')
        setErrorMsg(err.message ?? 'Enrollment failed — please retry.')
      }
      return
    }

    setCurrentPrompt(idx)
    setPhase('camera')

    /* Countdown 3..2..1 */
    for (let i = 3; i >= 1; i--) {
      setCountdown(i)
      await delay(900)
    }
    setCountdown(null)
    setPhase('capturing')
    await delay(400)  // brief pause so the flash overlay renders

    /* Extract real descriptor */
    let descriptor = null
    if (videoRef.current && videoRef.current.readyState >= 2) {
      try {
        descriptor = await extractDescriptor(videoRef.current)
      } catch {
        /* model error — will surface below */
      }
    }

    if (!descriptor) {
      /* No face detected — show warning and let user retry this prompt */
      setPhase('noface')
      await delay(2000)
      runCapture(idx, prev)   // retry same prompt
      return
    }

    const updated = [...prev, { id: idx, descriptor: Array.from(descriptor) }]
    setCaptures(updated)
    await delay(400)
    runCapture(idx + 1, updated)
  }

  function handleConsent() {
    if (!consentGiven) return toast.error('You must consent before enrolling')
    beginEnrollment()
  }

  const showCamera = ['camera','capturing','noface','enrolling'].includes(phase)

  return (
    <div className="min-h-screen mesh-bg flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.05) 0%, transparent 70%)' }} />

      <div className="w-full max-w-lg relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <Shield size={12} className="text-brand-400" />
            <span className="text-xs font-semibold text-brand-300">Biometric Enrollment</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">Face Enrollment</h1>
          <p className="text-sm text-text-muted">This one-time setup enables secure face login</p>
        </div>

        {/* LOADING models */}
        {phase === 'loading' && (
          <div className="glass-card p-12 text-center space-y-4">
            <Loader size={32} className="mx-auto text-brand-400 animate-spin" />
            <p className="text-sm text-text-muted">Loading face recognition models…</p>
          </div>
        )}

        {/* CONSENT phase */}
        {phase === 'consent' && (
          <div className="glass-card p-8 space-y-6 relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px"
              style={{ background: 'linear-gradient(90deg,transparent,rgba(99,102,241,0.5),transparent)' }} />

            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.22)' }}>
                <Camera size={28} className="text-brand-400" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">GDPR Consent</h2>
              <p className="text-sm text-text-muted mt-1">Required before biometric data is collected</p>
            </div>

            <div className="space-y-3">
              {[
                { icon: '🔒', text: 'Only a 128-dimension mathematical descriptor is stored — never a photo or video' },
                { icon: '🛡️', text: 'Your descriptor is encrypted at rest with AES-256 and transmitted over TLS' },
                { icon: '🗑️', text: 'Your biometric data is deleted immediately upon offboarding or on request' },
                { icon: '📋', text: 'This data is used solely for attendance verification within StaffSync' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(26,34,54,0.5)', border: '1px solid rgba(99,102,241,0.1)' }}>
                  <span className="text-base flex-shrink-0 mt-0.5">{item.icon}</span>
                  <span className="text-xs text-text-muted leading-relaxed">{item.text}</span>
                </div>
              ))}
            </div>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div
                onClick={() => setConsent(!consentGiven)}
                className={cn(
                  'w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 border-2 transition-all duration-200 cursor-pointer',
                  consentGiven
                    ? 'bg-brand-500 border-brand-500'
                    : 'border-border-default group-hover:border-brand-500/60'
                )}
              >
                {consentGiven && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-xs text-text-secondary leading-relaxed">
                I consent to the collection and encrypted storage of my biometric face descriptor for attendance verification purposes.
                I understand I may request deletion at any time.
              </span>
            </label>

            <Button variant="primary" fullWidth size="lg" onClick={handleConsent}>
              I Consent — Begin Enrollment
            </Button>
          </div>
        )}

        {/* CAMERA / CAPTURING / NOFACE / ENROLLING phases */}
        {showCamera && (
          <div className="space-y-5">
            {/* Capture progress */}
            <div className="flex items-center justify-center gap-3">
              {Array.from({ length: CAPTURES_REQUIRED }).map((_, i) => (
                <CaptureIndicator key={i} idx={i} captures={captures} current={currentPrompt} phase={phase} />
              ))}
            </div>

            {/* Camera viewport */}
            <div className="relative mx-auto" style={{ width: 300, height: 340 }}>
              <div className="absolute inset-0 rounded-3xl"
                style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)' }} />

              <div className={cn(
                'absolute inset-3 rounded-2xl overflow-hidden border-2 transition-colors duration-300',
                phase === 'capturing' ? 'border-cyan-400/60' : phase === 'noface' ? 'border-warning-500/60' : 'border-brand-500/40'
              )} style={{
                boxShadow: phase === 'capturing'
                  ? '0 0 30px rgba(34,211,238,0.3), inset 0 0 20px rgba(34,211,238,0.05)'
                  : phase === 'noface'
                  ? '0 0 30px rgba(245,158,11,0.25), inset 0 0 20px rgba(245,158,11,0.05)'
                  : '0 0 30px rgba(99,102,241,0.25), inset 0 0 20px rgba(99,102,241,0.05)'
              }}>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)', filter: 'brightness(0.85) contrast(1.1)' }} />

                <div className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'rgba(6,9,18,0.45)' }}>
                  <FaceOutline phase={phase} />
                </div>

                {countdown !== null && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-6xl font-black text-white"
                      style={{ textShadow: '0 0 30px rgba(99,102,241,0.8)', animation: 'pop 0.9s ease' }}>
                      {countdown}
                    </span>
                  </div>
                )}

                {phase === 'capturing' && (
                  <div className="absolute inset-0 rounded-2xl"
                    style={{ background: 'rgba(34,211,238,0.18)', animation: 'flash 0.4s ease' }} />
                )}

                {phase === 'camera' && countdown === null && (
                  <div className="absolute left-4 right-4 h-0.5 opacity-60"
                    style={{
                      background: 'linear-gradient(90deg, transparent, #6366f1, #22d3ee, transparent)',
                      animation: 'scan-v 2.5s ease-in-out infinite',
                    }} />
                )}

                {phase === 'noface' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                    style={{ background: 'rgba(6,9,18,0.7)' }}>
                    <AlertTriangle size={28} className="text-warning-400" />
                    <span className="text-xs font-medium text-warning-300 text-center px-4">No face detected<br/>Please centre your face</span>
                  </div>
                )}
              </div>

              {['tl','tr','bl','br'].map(c => <Corner key={c} c={c} phase={phase} />)}
            </div>

            {/* Prompt */}
            <div className="glass-card p-4 text-center">
              {phase === 'enrolling' ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                  <span className="text-sm font-medium text-brand-300">Encrypting and storing descriptor…</span>
                </div>
              ) : phase === 'noface' ? (
                <p className="text-sm font-medium text-warning-400">Adjusting — retrying in a moment…</p>
              ) : (
                <>
                  <div className="text-2xl mb-1">{PROMPTS[currentPrompt]?.icon}</div>
                  <p className="text-sm font-medium text-text-primary">{PROMPTS[currentPrompt]?.label}</p>
                  {countdown !== null && (
                    <p className="text-xs text-brand-400 mt-1">Capturing in {countdown}…</p>
                  )}
                  {countdown === null && phase === 'camera' && (
                    <p className="text-xs text-text-muted mt-1">Hold still — auto-capture in progress</p>
                  )}
                  {phase === 'capturing' && (
                    <p className="text-xs text-cyan-400 mt-1">Extracting descriptor…</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* DONE */}
        {phase === 'done' && (
          <div className="glass-card p-10 text-center space-y-5 relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px"
              style={{ background: 'linear-gradient(90deg,transparent,rgba(16,185,129,0.6),transparent)' }} />

            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', boxShadow: '0 0 30px rgba(16,185,129,0.2)' }}>
              <CheckCircle size={36} className="text-success-400" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-success-400 mb-2">Enrollment Complete!</h2>
              <p className="text-sm text-text-muted leading-relaxed">
                Your face descriptor has been encrypted and stored securely.
                From now on, face verification will be required at every login.
              </p>
            </div>

            <div className="space-y-2">
              {captures.map((_, i) => (
                <div key={i} className="flex items-center gap-2 justify-center">
                  <CheckCircle size={13} className="text-success-400" />
                  <span className="text-xs text-text-muted">Capture {i + 1} — {PROMPTS[i].label}</span>
                </div>
              ))}
            </div>

            <Button variant="primary" fullWidth size="lg" onClick={() => navigate('/login')}>
              Go to Login
            </Button>
          </div>
        )}

        {/* ERROR */}
        {phase === 'error' && (
          <div className="glass-card p-10 text-center space-y-5">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <AlertTriangle size={36} className="text-danger-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-danger-400 mb-2">Enrollment Failed</h2>
              <p className="text-sm text-text-muted">{errorMsg}</p>
            </div>
            <Button variant="primary" fullWidth size="lg" onClick={beginEnrollment}>
              Try Again
            </Button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan-v {
          0%   { top: 20%; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 80%; opacity: 0; }
        }
        @keyframes pop {
          0%   { transform: scale(1.4); opacity: 0; }
          40%  { transform: scale(1);   opacity: 1; }
          100% { transform: scale(0.9); opacity: 0; }
        }
        @keyframes flash {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms))
}

function CaptureIndicator({ idx, captures, current, phase }) {
  const done   = !!captures[idx]
  const active = idx === current && (phase === 'camera' || phase === 'capturing' || phase === 'noface')
  return (
    <div className="flex flex-col items-center gap-1 transition-all duration-300">
      <div className={cn(
        'w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all duration-300',
        done   ? 'border-success-500/50 bg-success-500/10'
               : active ? 'border-brand-500/70 bg-brand-500/10'
               : 'border-border-subtle bg-surface-2'
      )} style={{
        boxShadow: active ? '0 0 16px rgba(99,102,241,0.3)' : done ? '0 0 12px rgba(16,185,129,0.2)' : 'none',
      }}>
        {done
          ? <CheckCircle size={16} className="text-success-400" />
          : active
          ? <div className="w-3 h-3 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
          : <span className="text-xs text-text-muted font-bold">{idx + 1}</span>
        }
      </div>
      <span className={cn('text-[9px] font-semibold uppercase tracking-wide',
        done ? 'text-success-400' : active ? 'text-brand-400' : 'text-text-muted')}>
        {done ? 'Done' : active ? 'Active' : 'Pending'}
      </span>
    </div>
  )
}

function FaceOutline({ phase }) {
  const color = phase === 'capturing' ? '#22d3ee' : phase === 'noface' ? '#f59e0b' : '#6366f1'
  return (
    <svg width="120" height="140" viewBox="0 0 120 140" fill="none" opacity="0.65">
      <ellipse cx="60" cy="65" rx="40" ry="52" stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />
      <ellipse cx="45" cy="55" rx="5" ry="6" stroke={color} strokeWidth="1" />
      <ellipse cx="75" cy="55" rx="5" ry="6" stroke={color} strokeWidth="1" />
      <path d="M48 82 Q60 90 72 82" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M42 40 Q60 30 78 40" stroke={color} strokeWidth="1" opacity="0.5" strokeDasharray="3 2" />
    </svg>
  )
}

function Corner({ c, phase }) {
  const color = phase === 'capturing' ? '#22d3ee' : phase === 'noface' ? '#f59e0b' : '#6366f1'
  const s = {
    tl: { top: 6,    left: 6,    borderTop: '2px solid', borderLeft: '2px solid',  borderRadius: '6px 0 0 0' },
    tr: { top: 6,    right: 6,   borderTop: '2px solid', borderRight: '2px solid', borderRadius: '0 6px 0 0' },
    bl: { bottom: 6, left: 6,    borderBottom: '2px solid', borderLeft: '2px solid',  borderRadius: '0 0 0 6px' },
    br: { bottom: 6, right: 6,   borderBottom: '2px solid', borderRight: '2px solid', borderRadius: '0 0 6px 0' },
  }[c]
  return <div className="absolute w-5 h-5 transition-colors duration-300" style={{ ...s, borderColor: color }} />
}
