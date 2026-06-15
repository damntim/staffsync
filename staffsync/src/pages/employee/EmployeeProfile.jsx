import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useMutation } from '@tanstack/react-query'
import { usersApi } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  User, Mail, Phone, MapPin, Shield, Camera,
  CheckCircle, Edit3, Save, X, ScanFace, Lock,
  AlertCircle, Loader, Eye, EyeOff,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants'

export default function EmployeeProfile() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const role      = user?.role ?? 'EMPLOYEE'
  const roleColor = ROLE_COLORS[role]

  const [editing, setEditing]         = useState(false)
  const [showPwForm, setShowPwForm]   = useState(false)
  const [showPw, setShowPw]           = useState({ cur: false, new: false, conf: false })

  const [form, setForm] = useState({
    phone:             user?.phone             ?? '',
    emergency_contact: user?.emergency_contact ?? '',
    address:           user?.address           ?? '',
  })

  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const up   = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const upPw = (k, v) => setPwForm(f => ({ ...f, [k]: v }))

  /* Save profile mutation */
  const saveMut = useMutation({
    mutationFn: (data) => usersApi.update(data),
    onSuccess: (res) => {
      if (res?.user) setUser(res.user)
      setEditing(false)
      toast.success('Profile updated')
    },
    onError: (err) => toast.error(err.message ?? 'Update failed'),
  })

  /* Change password mutation */
  const pwMut = useMutation({
    mutationFn: (data) => usersApi.changePassword(data),
    onSuccess: () => {
      setShowPwForm(false)
      setPwForm({ current_password: '', new_password: '', confirm: '' })
      toast.success('Password changed successfully')
    },
    onError: (err) => toast.error(err.message ?? 'Password change failed'),
  })

  function handleSave() {
    saveMut.mutate({ phone: form.phone, emergency_contact: form.emergency_contact, address: form.address })
  }

  function handlePasswordChange(e) {
    e.preventDefault()
    if (!pwForm.current_password) return toast.error('Enter your current password')
    if (pwForm.new_password.length < 8) return toast.error('New password must be at least 8 characters')
    if (pwForm.new_password !== pwForm.confirm) return toast.error('Passwords do not match')
    pwMut.mutate({ current_password: pwForm.current_password, new_password: pwForm.new_password })
  }

  const initials = (name = '') => name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'U'

  return (
    <div className="space-y-5 pb-6 max-w-3xl">
      <div>
        <h1 className="text-h2 text-text-primary">My Profile</h1>
        <p className="text-sm text-text-muted mt-0.5">Manage your personal information and security settings</p>
      </div>

      {/* Profile hero */}
      <div className="glass-card p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <div className="relative flex-shrink-0">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.25))', border: '2px solid rgba(99,102,241,0.3)', boxShadow: '0 0 24px rgba(99,102,241,0.2)', color: '#818cf8' }}>
            {initials(user?.full_name)}
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl flex items-center justify-center border-2"
            style={{ background: '#6366f1', borderColor: '#111827' }}>
            <Camera size={12} className="text-white" />
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-text-primary">{user?.full_name}</h2>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border"
              style={{ background: roleColor?.bg, color: roleColor?.text, borderColor: roleColor?.border }}>
              {ROLE_LABELS[role]}
            </span>
          </div>
          <p className="text-sm text-text-muted mt-0.5">{user?.email}</p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-success-400" />
              <span className="text-xs font-semibold text-success-400">Active</span>
            </div>
            {user?.face_enrolled ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <ScanFace size={11} className="text-brand-400" />
                <span className="text-xs font-semibold text-brand-400">Face Enrolled</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <AlertCircle size={11} className="text-warning-400" />
                <span className="text-xs font-semibold text-warning-400">Face Not Enrolled</span>
              </div>
            )}
          </div>
        </div>

        {!editing ? (
          <Button variant="secondary" size="sm" icon={<Edit3 size={13} />} onClick={() => setEditing(true)}>
            Edit Profile
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" icon={<X size={13} />} onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" size="sm" icon={saveMut.isPending ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
              onClick={handleSave}>
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* System info (read-only) */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Shield size={14} className="text-brand-400" /> System Information
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Employee ID', value: user?.employee_id ?? '—', icon: Shield },
              { label: 'Email',       value: user?.email       ?? '—', icon: Mail   },
              { label: 'Department',  value: user?.department  ?? '—', icon: MapPin },
              { label: 'Role',        value: ROLE_LABELS[role] ?? role, icon: User  },
            ].map(row => {
              const Icon = row.icon
              return (
                <div key={row.label} className="flex items-center gap-3 py-2.5 px-3 rounded-xl"
                  style={{ background: 'rgba(26,34,54,0.5)', border: '1px solid rgba(99,102,241,0.08)' }}>
                  <Icon size={13} className="text-text-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-text-muted">{row.label}</div>
                    <div className="text-sm font-medium text-text-primary truncate">{row.value}</div>
                  </div>
                  <span className="text-[9px] font-bold text-text-muted px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(71,85,105,0.2)' }}>LOCKED</span>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-text-muted mt-3 leading-relaxed">
            System fields require HR Admin approval to change. Submit a request via the support form.
          </p>
        </div>

        {/* Editable personal info */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <User size={14} className="text-brand-400" /> Personal Details
          </h3>
          <div className="space-y-3">
            {editing ? (
              <>
                <Input label="Phone" value={form.phone}
                  onChange={e => up('phone', e.target.value)} icon={<Phone size={13} />} placeholder="+254 7XX XXX XXX" />
                <Input label="Emergency Contact" value={form.emergency_contact}
                  onChange={e => up('emergency_contact', e.target.value)} icon={<Phone size={13} />} placeholder="Name — phone number" />
                <Input label="Location / Address" value={form.address}
                  onChange={e => up('address', e.target.value)} icon={<MapPin size={13} />} placeholder="City, Country" />
              </>
            ) : (
              [
                { label: 'Phone',             value: user?.phone             ?? form.phone             ?? '—', icon: Phone },
                { label: 'Emergency Contact', value: user?.emergency_contact ?? form.emergency_contact ?? '—', icon: Phone },
                { label: 'Location',          value: user?.address           ?? form.address           ?? '—', icon: MapPin },
              ].map(row => {
                const Icon = row.icon
                return (
                  <div key={row.label} className="flex items-center gap-3 py-2.5 px-3 rounded-xl"
                    style={{ background: 'rgba(26,34,54,0.5)', border: '1px solid rgba(99,102,241,0.08)' }}>
                    <Icon size={13} className="text-text-muted flex-shrink-0" />
                    <div>
                      <div className="text-[10px] text-text-muted">{row.label}</div>
                      <div className="text-sm text-text-primary">{row.value}</div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Biometric */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <ScanFace size={14} className="text-brand-400" /> Biometric Security
          </h3>
          <div className="space-y-3">
            {user?.face_enrolled ? (
              <div className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)' }}>
                <div className="flex items-center gap-2">
                  <CheckCircle size={15} className="text-success-400" />
                  <div>
                    <div className="text-xs font-semibold text-success-400">Face enrolled</div>
                    <div className="text-[10px] text-text-muted">Used for login verification</div>
                  </div>
                </div>
                <Button variant="ghost" size="xs" onClick={() => navigate('/face-enroll')}>Re-enroll</Button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)' }}>
                <div className="flex items-center gap-2">
                  <AlertCircle size={15} className="text-warning-400" />
                  <div>
                    <div className="text-xs font-semibold text-warning-400">Face not enrolled</div>
                    <div className="text-[10px] text-text-muted">Required for secure login</div>
                  </div>
                </div>
                <Button variant="primary" size="xs" onClick={() => navigate('/face-enroll')}>Enroll Now</Button>
              </div>
            )}
            <div className="text-[10px] text-text-muted leading-relaxed p-3 rounded-xl"
              style={{ background: 'rgba(26,34,54,0.4)', border: '1px solid rgba(99,102,241,0.08)' }}>
              Your face descriptor (128D encrypted vector) is stored server-side using AES-256. No photos or videos are ever stored.
            </div>
          </div>
        </div>

        {/* Password */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Lock size={14} className="text-brand-400" /> Password & Security
          </h3>
          <div className="space-y-3">
            {!showPwForm ? (
              <div className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: 'rgba(26,34,54,0.5)', border: '1px solid rgba(99,102,241,0.1)' }}>
                <div>
                  <div className="text-xs font-medium text-text-primary">Password</div>
                  <div className="text-[10px] text-text-muted">Click to change your password</div>
                </div>
                <Button variant="outline" size="xs" onClick={() => setShowPwForm(true)}>Change</Button>
              </div>
            ) : (
              <form onSubmit={handlePasswordChange} className="space-y-3">
                {[
                  { key: 'current_password', label: 'Current password',  show: showPw.cur,  toggle: () => setShowPw(s => ({ ...s, cur:  !s.cur  })) },
                  { key: 'new_password',     label: 'New password',      show: showPw.new,  toggle: () => setShowPw(s => ({ ...s, new:  !s.new  })) },
                  { key: 'confirm',          label: 'Confirm new',       show: showPw.conf, toggle: () => setShowPw(s => ({ ...s, conf: !s.conf })) },
                ].map(f => (
                  <div key={f.key} className="relative">
                    <Input
                      label={f.label}
                      type={f.show ? 'text' : 'password'}
                      value={pwForm[f.key]}
                      onChange={e => upPw(f.key, e.target.value)}
                      icon={<Lock size={13} />}
                    />
                    <button type="button" onClick={f.toggle}
                      className="absolute right-3 top-8 text-text-muted hover:text-text-primary transition-colors">
                      {f.show ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button variant="primary" fullWidth size="sm" type="submit"
                    icon={pwMut.isPending ? <Loader size={13} className="animate-spin" /> : undefined}>
                    {pwMut.isPending ? 'Changing…' : 'Change Password'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowPwForm(false)}>Cancel</Button>
                </div>
              </form>
            )}

            <div className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: 'rgba(26,34,54,0.5)', border: '1px solid rgba(99,102,241,0.1)' }}>
              <div>
                <div className="text-xs font-medium text-text-primary">Face Verification</div>
                <div className="text-[10px] text-text-muted">Required at every login</div>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-success-400" />
                <span className="text-[10px] font-semibold text-success-400">Enabled</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
