import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email) return toast.error('Enter your email address')
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (err) {
      toast.error(err.message ?? 'Failed to send reset link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen mesh-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text-primary mb-1">Reset Password</h1>
          <p className="text-sm text-text-muted">We'll send a reset link to your email</p>
        </div>

        <div className="glass-card p-8">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px"
            style={{ background: 'linear-gradient(90deg,transparent,rgba(99,102,241,0.5),transparent)' }} />

          {sent ? (
            <div className="text-center space-y-4 py-2">
              <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <CheckCircle size={32} className="text-success-400" />
              </div>
              <div>
                <h2 className="font-semibold text-text-primary mb-1">Check your email</h2>
                <p className="text-xs text-text-muted leading-relaxed">
                  A password reset link has been sent to <span className="text-text-secondary">{email}</span>.
                  The link expires in 1 hour.
                </p>
              </div>
              <p className="text-xs text-text-muted">
                Didn't receive it?{' '}
                <button onClick={() => setSent(false)} className="text-brand-400 hover:text-brand-300">
                  Resend
                </button>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Email address"
                type="email"
                placeholder="you@devx.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                icon={<Mail size={15} />}
                autoFocus
              />
              <Button type="submit" fullWidth size="lg" loading={loading}>
                Send Reset Link
              </Button>
            </form>
          )}
        </div>

        <Link to="/login" className="flex items-center justify-center gap-1.5 mt-5 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <ArrowLeft size={13} />
          Back to login
        </Link>
      </div>
    </div>
  )
}
