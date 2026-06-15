import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/api'
import { cn } from '@/lib/cn'
import { UserPlus, Send, RefreshCw, XCircle, Search, CheckCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

const ROLES = ['EMPLOYEE','MANAGER','HR','IT_ADMIN']
const STATUS_CFG = {
  pending:  { label: 'Pending',  color: '#f59e0b' },
  accepted: { label: 'Accepted', color: '#10b981' },
  revoked:  { label: 'Revoked',  color: '#ef4444' },
  expired:  { label: 'Expired',  color: '#475569' },
}

export default function HROfficerInvites() {
  const qc = useQueryClient()
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('all')
  const [form,   setForm]     = useState({ email: '', name: '', role: 'EMPLOYEE', department: '' })
  const [showForm, setShowForm] = useState(false)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['invites', status],
    queryFn:  () => authApi.inviteList(),
    staleTime: 30_000,
  })

  const sendMut = useMutation({
    mutationFn: () => authApi.inviteSend(form),
    onSuccess: () => {
      toast.success(`Invite sent to ${form.email}`)
      setForm({ email: '', name: '', role: 'EMPLOYEE', department: '' })
      setShowForm(false)
      qc.invalidateQueries({ queryKey: ['invites'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const resendMut = useMutation({
    mutationFn: (id) => authApi.inviteResend(id),
    onSuccess: () => { toast.success('Invite resent'); qc.invalidateQueries({ queryKey: ['invites'] }) },
    onError:   (e) => toast.error(e.message),
  })

  const revokeMut = useMutation({
    mutationFn: (id) => authApi.inviteRevoke(id),
    onSuccess: () => { toast.success('Invite revoked'); qc.invalidateQueries({ queryKey: ['invites'] }) },
    onError:   (e) => toast.error(e.message),
  })

  const invites = Array.isArray(raw) ? raw : []
  const filtered = invites.filter(inv => {
    const matchSearch = !search || inv.email.toLowerCase().includes(search.toLowerCase()) || (inv.name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = status === 'all' || inv.status === status
    return matchSearch && matchStatus
  })

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Invites</h1>
          <p className="text-sm text-text-muted mt-0.5">Send and manage employee registration invites</p>
        </div>
        <Button variant="primary" size="sm" icon={<UserPlus size={14}/>} onClick={() => setShowForm(v => !v)}>
          Send Invite
        </Button>
      </div>

      {/* Invite form */}
      {showForm && (
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">New Invite</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Full Name',   key: 'name',       type: 'text',  placeholder: 'Jane Doe' },
              { label: 'Email',       key: 'email',      type: 'email', placeholder: 'jane@devx.com' },
              { label: 'Department',  key: 'department', type: 'text',  placeholder: 'Engineering' },
            ].map(f2 => (
              <div key={f2.key}>
                <label className="text-xs text-text-muted block mb-1">{f2.label}</label>
                <input type={f2.type} value={form[f2.key]} onChange={f(f2.key)} placeholder={f2.placeholder}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-transparent border text-text-primary placeholder:text-text-muted outline-none focus:border-brand-500"
                  style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(26,34,54,0.4)' }} />
              </div>
            ))}
            <div>
              <label className="text-xs text-text-muted block mb-1">Role</label>
              <select value={form.role} onChange={f('role')}
                className="w-full px-3 py-2 rounded-xl text-sm bg-transparent border text-text-primary outline-none focus:border-brand-500"
                style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(26,34,54,0.8)' }}>
                {ROLES.map(r => <option key={r} value={r}>{r.replace('_',' ')}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={sendMut.isPending} icon={<Send size={13}/>}
              onClick={() => sendMut.mutate()}>
              Send Invite
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…"
            className="w-full pl-8 pr-3 py-2 rounded-xl text-sm bg-transparent border text-text-primary placeholder:text-text-muted outline-none focus:border-brand-500"
            style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(26,34,54,0.4)' }} />
        </div>
        <div className="flex gap-2">
          {['all', ...Object.keys(STATUS_CFG)].map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all', status === s ? '' : 'opacity-60 hover:opacity-100')}
              style={{
                background: status === s ? (STATUS_CFG[s]?.color ?? '#6366f1')+'18' : 'transparent',
                borderColor: (STATUS_CFG[s]?.color ?? '#6366f1')+(status === s ? '50' : '25'),
                color: STATUS_CFG[s]?.color ?? '#818cf8',
              }}>
              {s === 'all' ? 'All' : STATUS_CFG[s]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Invite list */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({length:3}).map((_,i) => <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />)
        ) : filtered.length === 0 ? (
          <div className="glass-card p-10 text-center text-text-muted text-xs">No invites found</div>
        ) : (
          filtered.map(inv => {
            const cfg = STATUS_CFG[inv.status] ?? STATUS_CFG.pending
            const isExpired = new Date(inv.expires_at) < new Date()
            return (
              <div key={inv.id} className="glass-card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: cfg.color+'15', border: `1px solid ${cfg.color}25` }}>
                  {inv.status === 'accepted' ? <CheckCircle size={16} style={{ color: cfg.color }} />
                    : inv.status === 'revoked' ? <XCircle size={16} style={{ color: cfg.color }} />
                    : <Clock size={16} style={{ color: cfg.color }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text-primary truncate">{inv.name ?? inv.email}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
                      {inv.role?.replace('_',' ')}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">{inv.email} · {inv.department ?? '—'}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Expires {inv.expires_at?.slice(0,10)}
                    {isExpired && inv.status === 'pending' && <span className="text-danger-400 ml-1">· Expired</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: cfg.color+'18', color: cfg.color }}>{cfg.label}</span>
                  {inv.status === 'pending' && (
                    <>
                      <button onClick={() => resendMut.mutate(inv.id)} title="Resend"
                        className="p-1.5 rounded-lg transition-colors hover:bg-white/5">
                        <RefreshCw size={12} className="text-brand-400" />
                      </button>
                      <button onClick={() => revokeMut.mutate(inv.id)} title="Revoke"
                        className="p-1.5 rounded-lg transition-colors hover:bg-white/5">
                        <XCircle size={12} className="text-danger-400" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
