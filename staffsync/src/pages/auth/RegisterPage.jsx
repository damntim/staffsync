import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { User, Lock, Eye, EyeOff, Phone, CheckCircle, ChevronRight, AlertTriangle, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'
import { ROLE_LABELS } from '@/lib/constants'

const STEPS = [
  { id: 1, label: 'Verify Invite', icon: '✉️' },
  { id: 2, label: 'Your Details',  icon: '👤' },
  { id: 3, label: 'Set Password',  icon: '🔐' },
  { id: 4, label: 'Face Enroll',   icon: '🪪' },
]

function getStrength(pw) {
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return s
}
const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong']
const STRENGTH_COLOR = ['', '#ef4444', '#f59e0b', '#06b6d4', '#10b981']

export default function RegisterPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [params] = useSearchParams()
  const token = params.get('invite') ?? params.get('token') ?? ''

  const [step, setStep]   = useState(1)
  const [form, setForm]   = useState({ fullName: '', phone: '', password: '', confirm: '' })
  const [showPw, setShowPw] = useState(false)
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const strength = getStrength(form.password)

  /* Fetch invite info */
  const inviteQ = useQuery({
    queryKey: ['invite', token],
    queryFn:  () => authApi.inviteVerify(token),
    enabled:  !!token,
    retry:    false,
  })
  const invite = inviteQ.data ?? null

  /* Resume: user already registered but never finished face enroll */
  useEffect(() => {
    if (invite?.resume && invite.token && invite.user) {
      setAuth(invite.user, invite.token)
      toast('Resuming face enrollment…', { icon: '👤' })
      navigate('/enroll-face?from=register')
    }
  }, [invite?.resume])

  /* Pre-fill name from invite once loaded */
  useEffect(() => {
    if (invite?.full_name && !form.fullName) up('fullName', invite.full_name)
  }, [invite?.full_name])

  /* Registration mutation */
  const registerMut = useMutation({
    mutationFn: () => authApi.register({
      invite_token: token,
      email:        invite?.email ?? '',
      full_name:    form.fullName.trim(),
      password:     form.password,
      phone:        form.phone.trim() || undefined,
    }),
    onSuccess: (data) => {
      toast.success('Account created! Please enrol your face.')
      setAuth(data.user ?? { id: data.user_id, employee_id: data.employee_id, email: invite?.email }, data.token ?? null)
      navigate('/enroll-face?from=register')
    },
    onError: (e) => toast.error(e.message ?? 'Registration failed'),
  })

  async function next() {
    if (step === 1) {
      if (!invite) return toast.error('Invalid or expired invite link')
      setStep(2); return
    }
    if (step === 2) {
      if (!form.fullName.trim()) return toast.error('Full name is required')
      setStep(3); return
    }
    if (step === 3) {
      if (form.password.length < 8) return toast.error('Password must be at least 8 characters')
      if (form.password !== form.confirm) return toast.error('Passwords do not match')
      if (strength < 2) return toast.error('Please use a stronger password')
      registerMut.mutate()
      return
    }
    if (step === 4) {
      navigate('/enroll-face?from=register')
    }
  }

  /* If no token in URL */
  if (!token) {
    return (
      <div className="min-h-screen mesh-bg flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-sm text-center">
          <AlertTriangle size={32} className="mx-auto text-warning-400 mb-4" />
          <h2 className="text-lg font-semibold text-text-primary mb-2">No Invite Token</h2>
          <p className="text-sm text-text-muted mb-4">This registration link is missing an invite token. Please use the link from your invitation email.</p>
          <Button variant="ghost" onClick={() => navigate('/login')}>Back to Login</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen mesh-bg flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 right-1/3 w-80 h-80 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)' }} />

      <div className="w-full max-w-lg relative z-10">
        <div className="text-center mb-8">
          <LogoMark />
          <h1 className="text-2xl font-bold text-text-primary mt-4 mb-1">Create Your Account</h1>
          <p className="text-sm text-text-muted">You've been invited to join StaffSync</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5 transition-all duration-300">
                <div className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center text-base font-bold transition-all duration-300 border',
                  step > s.id  ? 'text-success-400 border-success-500/40'
                  : step === s.id ? 'border-brand-500/50 text-brand-300'
                  : 'border-border-subtle text-text-muted',
                )} style={{
                  background: step > s.id ? 'rgba(16,185,129,0.12)' : step === s.id ? 'rgba(99,102,241,0.12)' : 'rgba(17,24,39,0.5)',
                  boxShadow:  step === s.id ? '0 0 16px rgba(99,102,241,0.25)' : 'none',
                }}>
                  {step > s.id ? <CheckCircle size={16} className="text-success-400" /> : s.icon}
                </div>
                <span className={cn(
                  'text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap',
                  step === s.id ? 'text-brand-400' : step > s.id ? 'text-success-400' : 'text-text-muted'
                )}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="h-px w-10 mx-1 mb-5 transition-all duration-500"
                  style={{ background: step > s.id ? '#10b981' : 'rgba(99,102,241,0.18)' }} />
              )}
            </div>
          ))}
        </div>

        <div className="glass-card p-8">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.5), transparent)' }} />

          {/* Step 1 — Invite verification */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">Invitation Details</h2>
                <p className="text-sm text-text-muted">Please review your invite before continuing.</p>
              </div>

              {inviteQ.isLoading && (
                <div className="flex items-center justify-center py-8 gap-3">
                  <Loader size={18} className="animate-spin text-brand-400" />
                  <span className="text-sm text-text-muted">Verifying invite…</span>
                </div>
              )}

              {inviteQ.isError && (
                <div className="p-4 rounded-xl flex items-start gap-3"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle size={16} className="text-danger-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-danger-400">Invite Invalid</p>
                    <p className="text-xs text-text-muted mt-0.5">{inviteQ.error?.message ?? 'This invite link is expired or has already been used.'}</p>
                  </div>
                </div>
              )}

              {invite && (
                <>
                  <div className="space-y-3">
                    {[
                      { label: 'Email',       value: invite.email },
                      { label: 'Role',        value: ROLE_LABELS[invite.role] ?? invite.role },
                      { label: 'Department',  value: invite.department },
                      { label: 'Invited by',  value: invite.invited_by_name ?? 'HR Admin' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                        style={{ background: 'rgba(26,34,54,0.6)', border: '1px solid rgba(99,102,241,0.1)' }}>
                        <span className="text-xs text-text-muted">{row.label}</span>
                        <span className="text-sm font-medium text-text-primary">{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-2.5 p-3 rounded-xl"
                    style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)' }}>
                    <CheckCircle size={14} className="text-success-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-text-muted">
                      Invite token verified. Expires: <span className="text-warning-400">{new Date(invite.expires_at).toLocaleDateString()}</span>.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2 — Personal details */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">Your Details</h2>
                <p className="text-sm text-text-muted">Tell us a bit about yourself.</p>
              </div>
              <Input label="Full Name" placeholder="e.g. Jane Wanjiku Kamau"
                value={form.fullName} onChange={e => up('fullName', e.target.value)} icon={<User size={15} />} />
              <Input label="Phone Number (optional)" placeholder="+254 7xx xxx xxx"
                value={form.phone} onChange={e => up('phone', e.target.value)} icon={<Phone size={15} />} />
              <div className="text-xs text-text-muted p-3 rounded-xl"
                style={{ background: 'rgba(26,34,54,0.5)', border: '1px solid rgba(99,102,241,0.1)' }}>
                Your employee ID and department are pre-configured by HR and cannot be changed here.
              </div>
            </div>
          )}

          {/* Step 3 — Password */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">Set Password</h2>
                <p className="text-sm text-text-muted">Choose a strong, unique password.</p>
              </div>
              <div>
                <Input label="Password" type={showPw ? 'text' : 'password'} placeholder="At least 8 characters"
                  value={form.password} onChange={e => up('password', e.target.value)} icon={<Lock size={15} />}
                  iconRight={
                    <button type="button" onClick={() => setShowPw(!showPw)} className="text-text-muted hover:text-text-secondary p-0.5">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  }
                />
                {form.password && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
                          style={{ background: i <= strength ? STRENGTH_COLOR[strength] : 'rgba(99,102,241,0.12)' }} />
                      ))}
                    </div>
                    <span className="text-[10px] font-medium" style={{ color: STRENGTH_COLOR[strength] }}>
                      {STRENGTH_LABEL[strength]}
                    </span>
                  </div>
                )}
              </div>
              <Input label="Confirm Password" type="password" placeholder="Repeat your password"
                value={form.confirm} onChange={e => up('confirm', e.target.value)} icon={<Lock size={15} />}
                error={form.confirm && form.password !== form.confirm ? 'Passwords do not match' : ''} />
              <div className="space-y-1.5">
                {[
                  ['8+ characters',    form.password.length >= 8],
                  ['Uppercase letter', /[A-Z]/.test(form.password)],
                  ['Number',           /[0-9]/.test(form.password)],
                  ['Special character',/[^A-Za-z0-9]/.test(form.password)],
                ].map(([rule, ok]) => (
                  <div key={rule} className="flex items-center gap-2">
                    <div className={cn('w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all duration-200',
                      ok ? 'bg-success-500/20' : 'bg-surface-4')}>
                      {ok && <div className="w-1.5 h-1.5 rounded-full bg-success-400" />}
                    </div>
                    <span className={cn('text-xs transition-colors duration-200', ok ? 'text-success-400' : 'text-text-muted')}>{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4 — Face enrollment prompt */}
          {step === 4 && (
            <div className="space-y-5 text-center">
              <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', boxShadow: '0 0 30px rgba(99,102,241,0.2)' }}>
                <span className="text-4xl">🪪</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-2">Face Enrollment Required</h2>
                <p className="text-sm text-text-muted leading-relaxed">
                  Your account is almost ready. The final step is to enroll your face for biometric verification.
                  This is <span className="text-brand-400 font-medium">mandatory</span> and cannot be skipped.
                </p>
              </div>
              <div className="space-y-2 text-left">
                {[
                  'Your camera will be activated',
                  '3 captures are required for accuracy',
                  'No images are stored — only an encrypted 128D descriptor',
                  'GDPR consent will be captured',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontSize: 10, fontWeight: 700 }}>
                      {i + 1}
                    </div>
                    <span className="text-xs text-text-muted">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-7 flex items-center gap-3">
            {step > 1 && !registerMut.isSuccess && (
              <Button variant="ghost" size="md" onClick={() => setStep(s => s - 1)} disabled={registerMut.isPending}>
                Back
              </Button>
            )}
            <Button variant="primary" fullWidth size="lg"
              loading={registerMut.isPending}
              disabled={step === 1 && (inviteQ.isLoading || inviteQ.isError)}
              onClick={next}
              iconRight={step < 4 ? <ChevronRight size={15} /> : undefined}>
              {step === 1 ? 'Confirm & Continue'
               : step === 2 ? 'Continue'
               : step === 3 ? 'Create Account'
               : 'Start Face Enrollment'}
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-text-muted mt-5">
          Already registered?{' '}
          <a href="/login" className="text-brand-400 hover:text-brand-300">Sign in here</a>
        </p>
      </div>
    </div>
  )
}

function LogoMark() {
  return (
    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl relative">
      <div className="absolute inset-0 rounded-xl"
        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 24px rgba(99,102,241,0.4)' }} />
      <div className="absolute inset-0.5 rounded-[10px] flex items-center justify-center" style={{ background: '#060912' }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" stroke="url(#lm)" strokeWidth="1.5" fill="none" />
          <defs>
            <linearGradient id="lm" x1="0" y1="0" x2="20" y2="20">
              <stop stopColor="#818cf8" /><stop offset="1" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  )
}
