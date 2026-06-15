import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  Users, Search, ScanFace, Shield, CheckCircle, XCircle,
  Mail, Phone, Calendar, Lock, Unlock, Loader, UserX, UserCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants'
import { useUserList, useDeactivateUser, useReactivateUser } from '@/hooks/useUsers'
import { useQueryClient } from '@tanstack/react-query'
import { faceApi } from '@/lib/api'

const ROLES_LIST = ['All', 'EMPLOYEE', 'MANAGER', 'HR', 'IT_ADMIN']

function initials(name = '') {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || '??'
}

export default function HRAdminUsers() {
  const [search, setSearch]   = useState('')
  const [dept, setDept]       = useState('')
  const [roleF, setRoleF]     = useState('')
  const [statusF, setStatusF] = useState('All')
  const [expanded, setExpanded] = useState(null)
  const [faceLoading, setFaceLoading] = useState({})

  const qc = useQueryClient()
  const { data, isLoading } = useUserList({ search: search || undefined, dept: dept || undefined, role: roleF || undefined })
  const deactivate = useDeactivateUser()
  const reactivate = useReactivateUser()

  const users = Array.isArray(data) ? data : []

  const depts = ['All', ...Array.from(new Set(users.map(u => u.department).filter(Boolean))).sort()]

  const visible = users.filter(u => {
    if (dept   && dept   !== 'All' && u.department !== dept)  return false
    if (roleF  && roleF  !== 'All' && u.role       !== roleF) return false
    if (statusF === 'active'   && !u.is_active)       return false
    if (statusF === 'inactive' &&  u.is_active)       return false
    if (statusF === 'no-face'  &&  u.face_enrolled)   return false
    return true
  })

  function toggleActive(u) {
    if (u.is_active) {
      if (!confirm(`Deactivate ${u.full_name}? They will no longer be able to log in.`)) return
      deactivate.mutate(u.id)
    } else {
      reactivate.mutate(u.id)
    }
  }

  async function resetFace(userId, userName) {
    if (!confirm(`Reset face biometric for ${userName}? They will need to re-enroll.`)) return
    setFaceLoading(s => ({ ...s, [userId]: true }))
    try {
      await faceApi.delete(userId)
      toast.success(`Face descriptor cleared for ${userName}`)
      qc.invalidateQueries({ queryKey: ['users'] })
    } catch (e) {
      toast.error(e.message ?? 'Face reset failed')
    } finally {
      setFaceLoading(s => ({ ...s, [userId]: false }))
    }
  }

  const counts = {
    active:   users.filter(u =>  u.is_active).length,
    inactive: users.filter(u => !u.is_active).length,
    noFace:   users.filter(u => !u.face_enrolled).length,
  }

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">User Management</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {isLoading ? 'Loading…' : `${users.length} employees · ${counts.noFace} not face-enrolled`}
          </p>
        </div>
      </div>

      {/* Summary pills */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Active',    val: counts.active,   color: '#10b981', key: 'active'   },
          { label: 'Inactive',  val: counts.inactive, color: '#475569', key: 'inactive' },
          { label: 'No face',   val: counts.noFace,   color: '#f59e0b', key: 'no-face'  },
        ].map(s => (
          <button key={s.key} onClick={() => setStatusF(statusF === s.key ? 'All' : s.key)}
            className="glass-card p-3 text-left transition-all hover:scale-[1.02]"
            style={{ padding: 12, borderColor: statusF === s.key ? s.color+'40' : undefined, boxShadow: statusF === s.key ? `0 0 14px ${s.color}12` : undefined }}>
            <div className="text-xl font-black mb-0.5" style={{ color: s.color }}>
              {isLoading ? '—' : s.val}
            </div>
            <div className="text-[10px] text-text-muted">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / ID…"
            className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-transparent border text-text-primary placeholder-text-muted outline-none focus:border-brand-500 transition-colors"
            style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }} />
        </div>
        <select value={dept} onChange={e => setDept(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs border text-text-secondary outline-none bg-transparent"
          style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }}>
          {depts.map(d => <option key={d} value={d === 'All' ? '' : d}>{d}</option>)}
        </select>
        <select value={roleF} onChange={e => setRoleF(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs border text-text-secondary outline-none bg-transparent"
          style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }}>
          {ROLES_LIST.map(r => <option key={r} value={r === 'All' ? '' : r}>{r === 'All' ? 'All roles' : ROLE_LABELS[r] ?? r}</option>)}
        </select>
        <span className="text-xs text-text-muted ml-auto">{visible.length} shown</span>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(99,102,241,0.1)', background: 'rgba(26,34,54,0.4)' }}>
                {['Employee', 'Role', 'Dept', 'Face', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(99,102,241,0.06)' }}>
                  {[0,1,2,3,4,5].map(c => (
                    <td key={c} className="px-4 py-3">
                      <div className="h-4 w-20 rounded animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
                    </td>
                  ))}
                </tr>
              ))}

              {!isLoading && visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-text-muted">
                    No users match this filter
                  </td>
                </tr>
              )}

              {visible.map(u => {
                const rc    = ROLE_COLORS[u.role] ?? {}
                const isExp = expanded === u.id

                return (
                  <>
                    <tr key={u.id}
                      onClick={() => setExpanded(isExp ? null : u.id)}
                      className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                      style={{ borderBottom: '1px solid rgba(99,102,241,0.06)', opacity: u.is_active ? 1 : 0.55 }}>

                      {/* Employee */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                            style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
                            {initials(u.full_name)}
                          </div>
                          <div>
                            <div className="font-semibold text-text-primary">{u.full_name}</div>
                            <div className="text-text-muted text-[9px]">{u.employee_id}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                          style={{ background: rc.bg ?? 'rgba(99,102,241,0.1)', color: rc.text ?? '#818cf8', border: `1px solid ${rc.border ?? 'rgba(99,102,241,0.2)'}` }}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </td>

                      {/* Dept */}
                      <td className="px-4 py-3 text-text-muted">{u.department ?? '—'}</td>

                      {/* Face */}
                      <td className="px-4 py-3">
                        {u.face_enrolled
                          ? <CheckCircle size={14} className="text-success-400" />
                          : <XCircle    size={14} className="text-danger-400"  />}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase"
                          style={{
                            background: u.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(71,85,105,0.2)',
                            color:      u.is_active ? '#10b981'               : '#64748b',
                          }}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          {/* Deactivate / reactivate */}
                          <button
                            onClick={() => toggleActive(u)}
                            disabled={deactivate.isPending || reactivate.isPending}
                            className="p-1.5 rounded-lg transition-all hover:scale-110 disabled:opacity-50"
                            style={{ background: u.is_active ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: u.is_active ? '#ef4444' : '#10b981' }}
                            title={u.is_active ? 'Deactivate account' : 'Reactivate account'}>
                            {u.is_active ? <UserX size={11}/> : <UserCheck size={11}/>}
                          </button>

                          {/* Face reset */}
                          <button
                            onClick={() => resetFace(u.id, u.full_name)}
                            disabled={!!faceLoading[u.id]}
                            className="p-1.5 rounded-lg transition-all hover:scale-110 disabled:opacity-50"
                            style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}
                            title="Reset face descriptor">
                            {faceLoading[u.id]
                              ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                              : <ScanFace size={11}/>}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {isExp && (
                      <tr key={`exp-${u.id}`}>
                        <td colSpan={6} className="px-4 pb-4 pt-2" style={{ background: 'rgba(26,34,54,0.3)' }}>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            {[
                              { label: 'Email',      val: u.email       ?? '—', icon: Mail     },
                              { label: 'Phone',      val: u.phone       ?? '—', icon: Phone    },
                              { label: 'Joined',     val: u.created_at  ? new Date(u.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—', icon: Calendar },
                              { label: 'Last login', val: u.last_login  ? new Date(u.last_login).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : 'Never', icon: Shield },
                            ].map(f => {
                              const Icon = f.icon
                              return (
                                <div key={f.label} className="flex items-center gap-2 p-2 rounded-xl"
                                  style={{ background: 'rgba(26,34,54,0.5)', border: '1px solid rgba(99,102,241,0.08)' }}>
                                  <Icon size={11} className="text-text-muted flex-shrink-0" />
                                  <div>
                                    <div className="text-[9px] text-text-muted">{f.label}</div>
                                    <div className="font-medium text-text-secondary">{f.val}</div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
