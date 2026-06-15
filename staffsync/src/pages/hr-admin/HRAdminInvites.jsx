import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  UserPlus, Mail, Clock, CheckCircle, XCircle, RefreshCw,
  Copy, Trash2, Send, Search, AlertTriangle, Loader,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ROLE_LABELS } from '@/lib/constants'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/api'

const STATUS_CFG = {
  pending:  { label: 'Pending',  color: '#f59e0b', icon: Clock        },
  accepted: { label: 'Accepted', color: '#10b981', icon: CheckCircle  },
  expired:  { label: 'Expired',  color: '#ef4444', icon: XCircle      },
  revoked:  { label: 'Revoked',  color: '#475569', icon: XCircle      },
}

const ROLES_LIST  = ['EMPLOYEE','MANAGER','HR','IT_ADMIN']
const DEPTS_LIST  = ['Engineering','HR','Finance','Design','DevOps','Sales','IT','QA','Operations']

function fmtExpiry(expiresAt) {
  if (!expiresAt) return '—'
  const diff = new Date(expiresAt) - Date.now()
  if (diff <= 0) return 'Expired'
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ${h % 24}h`
  return `${h}h`
}

function fmtAgo(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr)
  const h    = Math.floor(diff / 3600000)
  const d    = Math.floor(h / 24)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  return 'just now'
}

function initials(name = '') {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || '??'
}

export default function HRAdminInvites() {
  const qc = useQueryClient()
  const [filter, setFilter]     = useState('all')
  const [search, setSearch]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', role: 'EMPLOYEE', department: 'Engineering' })
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data, isLoading } = useQuery({
    queryKey: ['invites', filter],
    queryFn:  () => authApi.inviteList(),
    staleTime: 30_000,
  })

  const invites = Array.isArray(data) ? data : []

  const sendMut = useMutation({
    mutationFn: (d) => authApi.inviteSend(d),
    onSuccess: () => {
      toast.success(`Invite sent to ${form.email}`)
      qc.invalidateQueries({ queryKey: ['invites'] })
      setShowForm(false)
      setForm({ email: '', name: '', role: 'EMPLOYEE', department: 'Engineering' })
    },
    onError: (e) => toast.error(e.message),
  })

  const resendMut = useMutation({
    mutationFn: (id) => authApi.inviteResend(id),
    onSuccess: () => {
      toast.success('Invite resent')
      qc.invalidateQueries({ queryKey: ['invites'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const revokeMut = useMutation({
    mutationFn: (id) => authApi.inviteRevoke(id),
    onSuccess: () => {
      toast.success('Invite revoked')
      qc.invalidateQueries({ queryKey: ['invites'] })
    },
    onError: (e) => toast.error(e.message),
  })

  function handleSend(e) {
    e.preventDefault()
    if (!form.email || !form.name) return toast.error('Email and name required')
    sendMut.mutate(form)
  }

  function copyLink(token) {
    if (!token) return
    const url = `${window.location.origin}/register?invite=${token}`
    navigator.clipboard.writeText(url)
    toast.success('Invite link copied!')
  }

  const visible = invites.filter(inv => {
    if (filter !== 'all' && inv.status !== filter) return false
    if (search && !(inv.email ?? '').includes(search) && !(inv.name ?? '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = {
    pending:  invites.filter(i => i.status === 'pending').length,
    accepted: invites.filter(i => i.status === 'accepted').length,
    expired:  invites.filter(i => i.status === 'expired').length,
  }

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Invitations</h1>
          <p className="text-sm text-text-muted mt-0.5">Invite new employees to StaffSync</p>
        </div>
        <Button variant="primary" size="sm" icon={<UserPlus size={13}/>} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : 'New Invite'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { key: 'pending',  label: 'Pending',  count: counts.pending,  color: '#f59e0b' },
          { key: 'accepted', label: 'Accepted', count: counts.accepted, color: '#10b981' },
          { key: 'expired',  label: 'Expired',  count: counts.expired,  color: '#ef4444' },
        ].map(s => (
          <button key={s.key} onClick={() => setFilter(filter === s.key ? 'all' : s.key)}
            className="glass-card p-4 text-center transition-all hover:scale-[1.02]"
            style={{ padding: 14, borderColor: filter === s.key ? s.color+'40' : undefined, boxShadow: filter === s.key ? `0 0 14px ${s.color}12` : undefined }}>
            <div className="text-2xl font-black mb-0.5" style={{ color: s.color }}>
              {isLoading ? '—' : s.count}
            </div>
            <div className="text-[10px] text-text-muted">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Compose form */}
      {showForm && (
        <div className="glass-card p-5" style={{ borderColor: 'rgba(99,102,241,0.25)', boxShadow: '0 0 24px rgba(99,102,241,0.08)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Send size={14} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-text-primary">Send Invitation</h2>
          </div>
          <form onSubmit={handleSend} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Full Name" value={form.name} onChange={e => up('name', e.target.value)} placeholder="Jane Doe" />
              <Input label="Email Address" value={form.email} onChange={e => up('email', e.target.value)} placeholder="jane@devx.com" icon={<Mail size={13}/>} />
              <div>
                <label className="block text-xs text-text-muted mb-1.5">Role</label>
                <select value={form.role} onChange={e => up('role', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs border text-text-secondary outline-none focus:border-brand-500"
                  style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }}>
                  {ROLES_LIST.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5">Department</label>
                <select value={form.department} onChange={e => up('department', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs border text-text-secondary outline-none focus:border-brand-500"
                  style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }}>
                  {DEPTS_LIST.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="p-3 rounded-xl text-[10px] text-text-muted"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
              The invite link expires in <strong className="text-text-secondary">7 days</strong>. The recipient must register, set a password, and complete face enrollment before their account is activated.
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" icon={sendMut.isPending ? <Loader size={12} className="animate-spin"/> : <Send size={12}/>}
                type="submit" disabled={sendMut.isPending}>
                {sendMut.isPending ? 'Sending…' : 'Send Invite'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…"
          className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-transparent border text-text-primary placeholder-text-muted outline-none focus:border-brand-500"
          style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }} />
      </div>

      {/* Invite cards */}
      <div className="space-y-3">
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-card h-20 animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
        ))}

        {!isLoading && visible.length === 0 && (
          <div className="glass-card p-10 text-center">
            <Mail size={28} className="mx-auto text-text-muted mb-3 opacity-40" />
            <p className="text-sm text-text-muted">No invites match this filter</p>
          </div>
        )}

        {visible.map(inv => {
          const stCfg = STATUS_CFG[inv.status] ?? { label: inv.status, color: '#94a3b8', icon: Clock }
          const StatusIcon = stCfg.icon
          const isPending = inv.status === 'pending'
          const isExpired = inv.status === 'expired'

          return (
            <div key={inv.id} className="glass-card p-4"
              style={{ borderColor: isExpired ? 'rgba(239,68,68,0.2)' : undefined }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
                  {initials(inv.name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text-primary">{inv.name}</span>
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                      style={{ background: stCfg.color + '15', color: stCfg.color }}>
                      <StatusIcon size={8}/>{stCfg.label}
                    </span>
                    {isExpired && <AlertTriangle size={11} className="text-danger-400" />}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-0.5 text-[10px] text-text-muted">
                    <span className="flex items-center gap-1"><Mail size={9}/>{inv.email}</span>
                    <span>{ROLE_LABELS[inv.role] ?? inv.role}{inv.department ? ` · ${inv.department}` : ''}</span>
                    <span className="flex items-center gap-1"><Clock size={9}/>Sent {fmtAgo(inv.created_at)}</span>
                    {isPending && <span className="text-warning-400">Expires: {fmtExpiry(inv.expires_at)}</span>}
                    {inv.invited_by_name && <span>by {inv.invited_by_name}</span>}
                  </div>
                </div>

                <div className="flex gap-1.5 flex-shrink-0">
                  {isPending && (
                    <button onClick={() => copyLink(inv.token)}
                      className="p-1.5 rounded-lg hover:scale-110 transition-all"
                      style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }} title="Copy link">
                      <Copy size={11}/>
                    </button>
                  )}
                  {(isPending || isExpired) && (
                    <button onClick={() => resendMut.mutate(inv.id)}
                      disabled={resendMut.isPending}
                      className="p-1.5 rounded-lg hover:scale-110 transition-all disabled:opacity-50"
                      style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }} title="Resend">
                      {resendMut.isPending ? <Loader size={11} className="animate-spin"/> : <RefreshCw size={11}/>}
                    </button>
                  )}
                  {inv.status !== 'accepted' && (
                    <button onClick={() => revokeMut.mutate(inv.id)}
                      disabled={revokeMut.isPending}
                      className="p-1.5 rounded-lg hover:scale-110 transition-all disabled:opacity-50"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }} title="Revoke">
                      {revokeMut.isPending ? <Loader size={11} className="animate-spin"/> : <Trash2 size={11}/>}
                    </button>
                  )}
                </div>
              </div>

              {/* Token link (pending only) */}
              {isPending && inv.token && (
                <div className="mt-3 pt-3 border-t flex items-center gap-2"
                  style={{ borderColor: 'rgba(99,102,241,0.08)' }}>
                  <code className="text-[9px] text-text-muted flex-1 truncate font-mono">
                    {window.location.origin}/register?invite={inv.token}
                  </code>
                  <button onClick={() => copyLink(inv.token)} className="text-[9px] text-brand-400 hover:text-brand-300 flex items-center gap-1">
                    <Copy size={9}/> Copy
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
