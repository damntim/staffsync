import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth, setFaceVerified } = useAuthStore()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    if (!email || !password) return toast.error('Please fill in all fields')
    setLoading(true)
    try {
      const data = await authApi.login(email, password)
      setAuth(data.user, data.token)
      if (data.user?.role === 'IT_ADMIN') {
        setFaceVerified(true)
        navigate('/dashboard/it-admin')
      } else {
        navigate('/face-verify')
      }
    } catch (err) {
      toast.error(err.message ?? 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen mesh-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)' }} />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 relative">
            <div className="absolute inset-0 rounded-2xl"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 40px rgba(99,102,241,0.5)' }} />
            <div className="absolute inset-0.5 rounded-[14px] flex items-center justify-center" style={{ background: '#060912' }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 3L23 8V20L14 25L5 20V8L14 3Z" stroke="url(#li)" strokeWidth="1.5" fill="none" />
                <path d="M14 3V25M5 8L23 20M23 8L5 20" stroke="url(#li)" strokeWidth="0.75" opacity="0.4" />
                <defs>
                  <linearGradient id="li" x1="0" y1="0" x2="28" y2="28">
                    <stop stopColor="#818cf8" /><stop offset="1" stopColor="#22d3ee" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold gradient-text mb-1">StaffSync</h1>
          <p className="text-text-muted text-sm">DevX Ltd — Workforce Platform</p>
        </div>

        {/* Card with animated gradient border */}
        <div className="gradient-border">
          <div className="relative rounded-[23px] p-8 overflow-hidden" style={{ background: 'rgba(13,17,23,0.95)' }}>
            {/* Top shimmer line */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)' }} />

            <h2 className="text-xl font-semibold text-text-primary mb-1">Welcome back</h2>
            <p className="text-sm text-text-muted mb-7">Sign in to continue to your workspace</p>

            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                label="Email address"
                type="email"
                placeholder="you@devx.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                icon={<Mail size={15} />}
                autoComplete="email"
              />
              <div>
                <Input
                  label="Password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  icon={<Lock size={15} />}
                  iconRight={
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="text-text-muted hover:text-text-secondary transition-colors p-0.5">
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  }
                  autoComplete="current-password"
                />
                <div className="flex justify-end mt-1.5">
                  <Link to="/forgot-password"
                    className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                    Forgot password?
                  </Link>
                </div>
              </div>

              <Button type="submit" fullWidth size="lg" loading={loading} className="mt-1">
                Sign in to StaffSync
              </Button>
            </form>

            {/* Face verification notice */}
            <div className="mt-5 flex items-start gap-3 p-3.5 rounded-xl"
              style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.16)' }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: 'rgba(99,102,241,0.15)' }}>
                <FaceIcon />
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                After password verification, <span className="text-brand-400">face recognition</span> is required to access your workspace.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-text-muted mt-6">
          No account?{' '}
          <span className="text-text-secondary">Registration is invite-only. Contact HR.</span>
        </p>
      </div>
    </div>
  )
}


function FaceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="10" r="4" />
      <path d="M8 14.5c-2 1-3 2.5-3 4h14c0-1.5-1-3-3-4" opacity="0.6" />
      <path d="M4 6c2-3 5-4 8-4s6 1 8 4" opacity="0.35" />
    </svg>
  )
}
