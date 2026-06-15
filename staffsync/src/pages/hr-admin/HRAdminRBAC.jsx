import { useState } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Shield, Users, Edit3, Save, CheckCircle, XCircle, AlertTriangle, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '@/lib/api'
import { useChangeRole } from '@/hooks/useUsers'

const ROLE_LIST = ['EMPLOYEE','MANAGER','HR','IT_ADMIN']

/* Module permission matrix */
const MODULES = [
  { key: 'dashboard',       label: 'Dashboard',           icon: '📊' },
  { key: 'checkin',         label: 'Check-in (QR+Face)',  icon: '📲' },
  { key: 'attendance',      label: 'Attendance records',  icon: '📅' },
  { key: 'leave_self',      label: 'Leave — self-service',icon: '🏖️' },
  { key: 'leave_approve',   label: 'Leave approvals',     icon: '✅' },
  { key: 'team_view',       label: 'Team roster',         icon: '👥' },
  { key: 'tasks',           label: 'Task management',     icon: '✔️' },
  { key: 'presence',        label: 'Presence monitor',    icon: '📡' },
  { key: 'reports',         label: 'Reports & analytics', icon: '📈' },
  { key: 'user_mgmt',       label: 'User management',     icon: '👤' },
  { key: 'invite_send',     label: 'Send invitations',    icon: '📨' },
  { key: 'geofence_cfg',    label: 'Geofence config',     icon: '🗺️' },
  { key: 'qr_mgmt',         label: 'QR zone management',  icon: '🔳' },
  { key: 'policy_edit',     label: 'Policy editor',       icon: '📋' },
  { key: 'rbac_edit',       label: 'Role/permission edit',icon: '🛡️' },
  { key: 'audit_log',       label: 'Audit log access',    icon: '🔍' },
  { key: 'sync_control',    label: 'Sync control',        icon: '🔄' },
  { key: 'face_admin',      label: 'Biometric admin',     icon: '🫡' },
]

const DEFAULT_PERMS = {
  EMPLOYEE:   ['dashboard','checkin','attendance','leave_self','tasks'],
  MANAGER:    ['dashboard','checkin','attendance','leave_self','leave_approve','team_view','tasks','presence','reports'],
  HR:         MODULES.map(m => m.key).filter(k => k !== 'rbac_edit' && k !== 'sync_control'),
  IT_ADMIN:   MODULES.map(m => m.key),
}


export default function HRAdminRBAC() {
  const [perms, setPerms]       = useState(DEFAULT_PERMS)
  const [editing, setEditing]   = useState(null)
  const [draftPerms, setDraft]  = useState({})
  const [tab, setTab]           = useState('matrix')

  const changeRole = useChangeRole()
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users', 'list'],
    queryFn:  () => usersApi.list({ limit: 200 }),
    staleTime: 60_000,
  })
  const liveUsers = Array.isArray(usersData) ? usersData : []

  function initials(name = '') {
    return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || '??'
  }

  function startEdit(role) {
    setDraft({ ...perms })
    setEditing(role)
  }

  function toggleDraft(role, mod) {
    setDraft(prev => {
      const arr = prev[role] ?? []
      return { ...prev, [role]: arr.includes(mod) ? arr.filter(m=>m!==mod) : [...arr, mod] }
    })
  }

  function savePerms() {
    setPerms(draftPerms)
    setEditing(null)
    toast.success(`Permissions updated for ${ROLE_LABELS[editing]}`)
  }

  function changeUserRole(userId, newRole) {
    changeRole.mutate({ id: userId, role: newRole })
  }

  const activePerms = editing ? draftPerms : perms

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Role & Permission Management</h1>
          <p className="text-sm text-text-muted mt-0.5">Configure module access per role (RBAC)</p>
        </div>
        {editing && (
          <div className="flex gap-2">
            <Button variant="primary" size="sm" icon={<Save size={12}/>} onClick={savePerms}>
              Save {ROLE_LABELS[editing]}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        {['matrix','users'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all"
            style={{
              background:  tab===t?'rgba(99,102,241,0.15)':'rgba(26,34,54,0.5)',
              borderColor: tab===t?'rgba(99,102,241,0.4)':'rgba(99,102,241,0.12)',
              color:       tab===t?'#818cf8':'#94a3b8',
            }}>
            {t === 'matrix' ? 'Permission Matrix' : 'User Roles'}
          </button>
        ))}
      </div>

      {tab === 'matrix' && (
        <div className="space-y-3">
          {/* Role column headers */}
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom:'1px solid rgba(99,102,241,0.1)', background:'rgba(26,34,54,0.5)' }}>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-text-muted uppercase w-48">Module</th>
                    {ROLE_LIST.map(role => {
                      const rc = ROLE_COLORS[role] ?? {}
                      const isEdit = editing === role
                      return (
                        <th key={role} className="px-3 py-3 min-w-[100px]">
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded uppercase"
                              style={{ background:rc.bg, color:rc.text, border:`1px solid ${rc.border}` }}>
                              {ROLE_LABELS[role]}
                            </span>
                            {isEdit ? (
                              <div className="flex gap-1">
                                <button onClick={savePerms} className="text-[8px] font-bold text-success-400 hover:underline">Save</button>
                                <span className="text-text-muted">·</span>
                                <button onClick={() => setEditing(null)} className="text-[8px] font-bold text-text-muted hover:underline">Cancel</button>
                              </div>
                            ) : role !== 'IT_ADMIN' && (
                              <button onClick={() => startEdit(role)}
                                className="text-[8px] text-brand-400 hover:text-brand-300 flex items-center gap-0.5">
                                <Edit3 size={8}/> Edit
                              </button>
                            )}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((mod, i) => (
                    <tr key={mod.key}
                      style={{ borderBottom:'1px solid rgba(99,102,241,0.05)', background:i%2===0?'transparent':'rgba(26,34,54,0.2)' }}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{mod.icon}</span>
                          <span className="text-text-secondary text-xs">{mod.label}</span>
                        </div>
                      </td>
                      {ROLE_LIST.map(role => {
                        const has = (activePerms[role] ?? []).includes(mod.key)
                        const isEdit = editing === role && role !== 'IT_ADMIN'
                        return (
                          <td key={role} className="px-3 py-2.5 text-center">
                            {isEdit ? (
                              <button onClick={() => toggleDraft(role, mod.key)}
                                className="w-5 h-5 rounded flex items-center justify-center mx-auto transition-all hover:scale-110"
                                style={{
                                  background: has ? 'rgba(16,185,129,0.15)' : 'rgba(71,85,105,0.15)',
                                  border: `1px solid ${has?'rgba(16,185,129,0.4)':'rgba(71,85,105,0.25)'}`,
                                }}>
                                {has ? <CheckCircle size={11} className="text-success-400"/> : <XCircle size={11} className="text-text-muted opacity-40"/>}
                              </button>
                            ) : has ? (
                              <CheckCircle size={13} className="text-success-400 mx-auto"/>
                            ) : (
                              <div className="w-3 h-0.5 bg-text-muted opacity-20 mx-auto rounded-full"/>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 rounded-xl" style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.15)' }}>
            <p className="text-[10px] text-warning-400">
              <strong>IT Admin</strong> has full access to all modules and cannot be restricted.
              Changes to roles take effect immediately and are logged in the audit trail.
            </p>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom:'1px solid rgba(99,102,241,0.1)', background:'rgba(26,34,54,0.4)' }}>
                  {['Employee','Current Role','Permissions','Change Role'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-text-muted uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usersLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(99,102,241,0.06)' }}>
                    {[0,1,2,3].map(c => (
                      <td key={c} className="px-4 py-3">
                        <div className="h-4 w-20 rounded animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
                      </td>
                    ))}
                  </tr>
                ))}
                {liveUsers.map((u, i) => {
                  const rc = ROLE_COLORS[u.role] ?? {}
                  const permCount = (perms[u.role] ?? []).length
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(99,102,241,0.06)', background: i%2===0 ? 'transparent' : 'rgba(26,34,54,0.15)' }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold"
                            style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
                            {initials(u.full_name)}
                          </div>
                          <div>
                            <div className="font-semibold text-text-primary">{u.full_name}</div>
                            <div className="text-[9px] text-text-muted">{u.employee_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                          style={{ background: rc.bg ?? 'rgba(99,102,241,0.1)', color: rc.text ?? '#818cf8', border: `1px solid ${rc.border ?? 'rgba(99,102,241,0.2)'}` }}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-text-muted">{permCount} modules</span>
                      </td>
                      <td className="px-4 py-3">
                        <select value={u.role}
                          onChange={e => changeUserRole(u.id, e.target.value)}
                          disabled={changeRole.isPending}
                          className="px-2 py-1 rounded-lg text-[10px] border text-text-secondary outline-none disabled:opacity-50"
                          style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }}>
                          {ROLE_LIST.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
