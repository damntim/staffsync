import { useState, useMemo } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import {
  Users, Search, Mail, Phone, AlertTriangle,
  ChevronRight, Activity, Plus, X, Loader,
  Pencil, Trash2, UserMinus, UserPlus, Layers,
  BarChart3, CheckCircle2, Circle, Tag,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi, presenceApi, teamsApi } from '@/lib/api'
import { useLeaveBalance } from '@/hooks/useLeave'
import toast from 'react-hot-toast'

const PRESENCE_CFG = {
  CHECKED_IN:      { label: 'Active',       color: '#10b981' },
  CHECKED_OUT:     { label: 'Checked Out',  color: '#475569' },
  INACTIVE_SIGNAL: { label: 'Inactive',     color: '#f59e0b' },
  OUT_OF_ZONE:     { label: 'Out of Zone',  color: '#ef4444' },
  PRESENCE_DOUBT:  { label: 'Flagged',      color: '#ef4444' },
  EXEMPT:          { label: 'Exempt',       color: '#06b6d4' },
  NO_DATA:         { label: 'Not tracked',  color: '#64748b' },
}
const DEFAULT_P = { label: 'Unknown', color: '#64748b' }

const ROLE_LABELS = { EMPLOYEE: 'Employee', MANAGER: 'Manager', HR: 'HR', IT_ADMIN: 'IT Admin' }

const TEAM_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f97316','#ef4444']
const ROLE_TAGS   = ['member','lead','reader','reviewer','contributor']

function initials(name = '') {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || '??'
}

/* ── Create / Edit Team modal ── */
function TeamModal({ team, allUsers, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!team

  const [form, setForm] = useState({
    name:        team?.name        ?? '',
    description: team?.description ?? '',
    department:  team?.department  ?? '',
    color:       team?.color       ?? '#6366f1',
  })
  const [selectedIds, setSelectedIds] = useState(
    isEdit ? (team.members ?? []).map(m => m.id) : []
  )
  const [memberSearch, setMemberSearch] = useState('')
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const createMut = useMutation({
    mutationFn: (data) => teamsApi.create(data),
    onSuccess: () => { toast.success('Team created'); qc.invalidateQueries({ queryKey: ['teams'] }); onClose() },
    onError:   (e) => toast.error(e.message),
  })
  const updateMut = useMutation({
    mutationFn: (data) => teamsApi.update(data),
    onSuccess: () => { toast.success('Team updated'); qc.invalidateQueries({ queryKey: ['teams'] }); onClose() },
    onError:   (e) => toast.error(e.message),
  })

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Team name required')
    if (isEdit) {
      updateMut.mutate({ team_id: team.id, ...form })
    } else {
      createMut.mutate({ ...form, member_ids: selectedIds })
    }
  }

  const filteredUsers = allUsers.filter(u =>
    !memberSearch ||
    (u.full_name ?? '').toLowerCase().includes(memberSearch.toLowerCase()) ||
    (u.department ?? '').toLowerCase().includes(memberSearch.toLowerCase())
  )

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(6,9,18,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="w-full max-w-xl glass-strong rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(99,102,241,0.25)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0"
          style={{ borderColor: 'rgba(99,102,241,0.15)', background: 'rgba(13,17,23,0.98)' }}>
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-brand-400" />
            <h2 className="font-semibold text-text-primary">{isEdit ? 'Edit Team' : 'Create Team'}</h2>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-4 transition-all">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <Input label="Team name" value={form.name} onChange={e => up('name', e.target.value)}
            placeholder="e.g. Frontend Squad" />

          <div className="grid grid-cols-2 gap-4">
            <Input label="Department" value={form.department} onChange={e => up('department', e.target.value)}
              placeholder="e.g. Engineering" />
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">Color</label>
              <div className="flex gap-1.5 flex-wrap">
                {TEAM_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => up('color', c)}
                    className="w-6 h-6 rounded-lg border-2 transition-all"
                    style={{
                      background:   c,
                      borderColor:  form.color === c ? '#fff' : 'transparent',
                      boxShadow:    form.color === c ? `0 0 8px ${c}80` : 'none',
                    }} />
                ))}
              </div>
            </div>
          </div>

          <Textarea label="Description (optional)" rows={2} value={form.description}
            onChange={e => up('description', e.target.value)} placeholder="What does this team work on?" />

          {/* Member picker — only on create */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                Add members ({selectedIds.length} selected)
              </label>
              <div className="relative mb-2">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Search employees…"
                  className="w-full pl-7 pr-3 py-1.5 rounded-xl text-xs bg-transparent border text-text-primary placeholder-text-muted outline-none focus:border-brand-500"
                  style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }} />
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {filteredUsers.map(u => {
                  const sel = selectedIds.includes(u.id)
                  return (
                    <button key={u.id} type="button"
                      onClick={() => setSelectedIds(ids => sel ? ids.filter(i => i !== u.id) : [...ids, u.id])}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left"
                      style={{
                        background:  sel ? 'rgba(99,102,241,0.1)' : 'rgba(26,34,54,0.4)',
                        borderColor: sel ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.1)',
                      }}>
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                        style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>
                        {initials(u.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-text-primary truncate">{u.full_name}</div>
                        <div className="text-[10px] text-text-muted">{u.department ?? ROLE_LABELS[u.role] ?? u.role}</div>
                      </div>
                      {sel && <CheckCircle2 size={13} className="text-brand-400 flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" fullWidth onClick={onClose}>Cancel</Button>
            <Button variant="primary" fullWidth type="submit"
              style={{ background: form.color }}
              icon={isPending ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}>
              {isPending ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Team' : 'Create Team')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Add Member modal ── */
function AddMemberModal({ team, allUsers, onClose }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleTag, setRoleTag] = useState('member')

  const existingIds = new Set((team.members ?? []).map(m => m.id))

  const addMut = useMutation({
    mutationFn: ({ userId }) => teamsApi.addMember(team.id, userId, roleTag),
    onSuccess: () => { toast.success('Member added'); qc.invalidateQueries({ queryKey: ['teams'] }) },
    onError:   (e) => toast.error(e.message),
  })

  const candidates = allUsers.filter(u =>
    !existingIds.has(u.id) && (
      !search ||
      (u.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (u.department ?? '').toLowerCase().includes(search.toLowerCase())
    )
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(6,9,18,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="w-full max-w-md glass-strong rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(99,102,241,0.25)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0"
          style={{ borderColor: 'rgba(99,102,241,0.15)', background: 'rgba(13,17,23,0.98)' }}>
          <div className="flex items-center gap-2">
            <UserPlus size={15} className="text-brand-400" />
            <h2 className="font-semibold text-sm text-text-primary">Add member to {team.name}</h2>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={15} /></button>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full pl-7 pr-3 py-1.5 rounded-xl text-xs bg-transparent border text-text-primary placeholder-text-muted outline-none focus:border-brand-500"
                style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }} />
            </div>
            <select value={roleTag} onChange={e => setRoleTag(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl text-xs border outline-none text-text-secondary"
              style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }}>
              {ROLE_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {candidates.length === 0 && (
              <p className="text-xs text-text-muted text-center py-6">No more employees to add</p>
            )}
            {candidates.map(u => (
              <div key={u.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border"
                style={{ background: 'rgba(26,34,54,0.4)', borderColor: 'rgba(99,102,241,0.1)' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                  {initials(u.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-text-primary truncate">{u.full_name}</div>
                  <div className="text-[10px] text-text-muted">{u.department ?? ROLE_LABELS[u.role] ?? u.role}</div>
                </div>
                <Button variant="primary" size="xs"
                  onClick={() => addMut.mutate({ userId: u.id })}
                  icon={addMut.isPending ? <Loader size={11} className="animate-spin" /> : <Plus size={11} />}>
                  Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Team detail panel ── */
function TeamPanel({ team, presenceMap, allUsers, onClose, onEdit }) {
  const qc = useQueryClient()
  const [showAddMember, setShowAddMember] = useState(false)

  const { data: teamDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['teams', 'get', team.id],
    queryFn:  () => teamsApi.get(team.id),
    staleTime: 30_000,
  })

  const { data: teamTasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['teams', 'tasks', team.id],
    queryFn:  () => teamsApi.tasks(team.id),
    staleTime: 30_000,
  })

  const removeMut = useMutation({
    mutationFn: (userId) => teamsApi.removeMember(team.id, userId),
    onSuccess: () => { toast.success('Member removed'); qc.invalidateQueries({ queryKey: ['teams'] }) },
    onError:   (e) => toast.error(e.message),
  })

  const members  = teamDetail?.members ?? []
  const tasks    = Array.isArray(teamTasks) ? teamTasks : []
  const doneCnt  = tasks.filter(t => t.status === 'DONE').length
  const totalPct = tasks.length > 0 ? Math.round(tasks.reduce((a, t) => a + (t.progress ?? 0), 0) / tasks.length) : 0

  return (
    <>
      {showAddMember && (
        <AddMemberModal
          team={teamDetail ?? team}
          allUsers={allUsers}
          onClose={() => { setShowAddMember(false); qc.invalidateQueries({ queryKey: ['teams', 'get', team.id] }) }}
        />
      )}
      <div className="glass-card p-5 h-fit sticky top-20">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black"
              style={{ background: team.color + '20', color: team.color, border: `1px solid ${team.color}30` }}>
              {team.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">{team.name}</h3>
              {team.department && <p className="text-[10px] text-text-muted">{team.department}</p>}
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={onEdit}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-all">
              <Pencil size={13} />
            </button>
            <button onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-4 transition-all">
              <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
          </div>
        </div>

        {team.description && (
          <p className="text-xs text-text-muted mb-4 leading-relaxed">{team.description}</p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Members', val: members.length,       color: team.color },
            { label: 'Tasks',   val: tasks.length,         color: '#818cf8' },
            { label: 'Done',    val: `${doneCnt}/${tasks.length}`, color: '#10b981' },
          ].map(s => (
            <div key={s.label} className="text-center p-2 rounded-xl"
              style={{ background: s.color + '10', border: `1px solid ${s.color}20` }}>
              <div className="text-sm font-black" style={{ color: s.color }}>{s.val}</div>
              <div className="text-[9px] text-text-muted">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Overall progress */}
        {tasks.length > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-[10px] text-text-muted mb-1">
              <span>Overall progress</span><span>{totalPct}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${totalPct}%`, background: `linear-gradient(90deg, ${team.color}, #22d3ee)` }} />
            </div>
          </div>
        )}

        {/* Members */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Members</span>
            <button onClick={() => setShowAddMember(true)}
              className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors">
              <Plus size={10} /> Add
            </button>
          </div>
          {detailLoading ? (
            <div className="space-y-1.5">
              {[0,1,2].map(i => <div key={i} className="h-8 rounded-lg animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />)}
            </div>
          ) : members.length === 0 ? (
            <p className="text-[10px] text-text-muted">No members yet</p>
          ) : (
            <div className="space-y-1.5">
              {members.map(m => {
                const pData = presenceMap[m.id]
                const pCfg  = PRESENCE_CFG[pData?.status ?? 'NO_DATA'] ?? DEFAULT_P
                return (
                  <div key={m.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl group"
                    style={{ background: 'rgba(26,34,54,0.5)' }}>
                    <div className="relative flex-shrink-0">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold"
                        style={{ background: pCfg.color + '15', color: pCfg.color }}>
                        {initials(m.full_name)}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border"
                        style={{ background: pCfg.color, borderColor: '#111827' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-text-primary truncate">{m.full_name}</div>
                      <div className="text-[9px] text-text-muted flex items-center gap-1">
                        <Tag size={8} />{m.role_tag}
                      </div>
                    </div>
                    <button onClick={() => removeMut.mutate(m.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-danger-400 p-0.5 rounded">
                      <UserMinus size={11} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent tasks */}
        <div>
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Team Tasks</div>
          {tasksLoading ? (
            <div className="space-y-1.5">
              {[0,1].map(i => <div key={i} className="h-8 rounded-lg animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />)}
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-[10px] text-text-muted">No tasks yet — create one in Tasks tab</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
              {tasks.slice(0, 8).map(t => {
                const pct = t.progress ?? 0
                const STATUS_COLOR = { TODO: '#475569', IN_PROGRESS: '#6366f1', REVIEW: '#f59e0b', DONE: '#10b981' }
                const col = STATUS_COLOR[t.status] ?? '#64748b'
                return (
                  <div key={t.id} className="px-2.5 py-2 rounded-xl"
                    style={{ background: 'rgba(26,34,54,0.5)', borderLeft: `2px solid ${col}` }}>
                    <div className="text-[11px] font-medium text-text-primary truncate mb-0.5">{t.title}</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: col }} />
                      </div>
                      <span className="text-[9px] font-bold" style={{ color: col }}>{pct}%</span>
                    </div>
                    {t.assignee_name && <div className="text-[9px] text-text-muted mt-0.5">{t.assignee_name}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ── Member detail panel (from People tab) ── */
function MemberDetailPanel({ emp, presenceMap, onClose }) {
  const { data: balData, isLoading: balLoading } = useLeaveBalance(emp.id)
  const balances = Array.isArray(balData) ? balData : []
  const presence = presenceMap[emp.id] ?? null
  const pCfg = PRESENCE_CFG[presence?.status ?? 'NO_DATA'] ?? DEFAULT_P

  return (
    <div className="glass-card p-5 h-fit sticky top-20">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg"
            style={{ background: pCfg.color + '18', color: pCfg.color, border: `1px solid ${pCfg.color}30` }}>
            {initials(emp.full_name)}
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary">{emp.full_name}</h3>
            <p className="text-xs text-text-muted">{ROLE_LABELS[emp.role] ?? emp.role}</p>
            {emp.department && <p className="text-[10px] text-text-muted">{emp.department}</p>}
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-1 inline-block"
              style={{ background: pCfg.color + '15', color: pCfg.color }}>
              {pCfg.label}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
          <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
        </button>
      </div>

      <div className="space-y-2 mb-5">
        {emp.email && <div className="flex items-center gap-2 text-xs text-text-muted"><Mail size={11}/>{emp.email}</div>}
        {emp.phone && <div className="flex items-center gap-2 text-xs text-text-muted"><Phone size={11}/>{emp.phone}</div>}
      </div>

      {presence && (
        <div className="mb-4 p-3 rounded-xl"
          style={{ background: pCfg.color + '0d', border: `1px solid ${pCfg.color}20` }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: pCfg.color }}>GPS Presence</div>
          {presence.zone_name && <div className="text-xs text-text-secondary">Zone: {presence.zone_name}</div>}
          {presence.distance_m != null && <div className="text-xs text-text-muted">{Math.round(presence.distance_m)}m from zone</div>}
        </div>
      )}

      <div className="mb-5">
        <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Leave balance</div>
        {balLoading ? (
          <div className="space-y-1.5">{[0,1,2].map(i => <div key={i} className="h-5 rounded animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />)}</div>
        ) : balances.length === 0 ? (
          <p className="text-[10px] text-text-muted">No balance data</p>
        ) : (
          <div className="space-y-1.5">
            {balances.map(b => {
              const ent = Number(b.entitlement ?? 0)
              const rem = Number(b.balance ?? 0)
              const pct = ent > 0 ? Math.min((rem / ent) * 100, 100) : 0
              return (
                <div key={b.type} className="flex justify-between items-center text-xs">
                  <span className="capitalize text-text-muted">{b.type}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#6366f1' }} />
                    </div>
                    <span className="text-text-secondary font-medium w-10 text-right">{rem} left</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {[
          { label: 'Employee ID', val: emp.employee_id ?? '—' },
          { label: 'Department',  val: emp.department  ?? '—' },
        ].map(r => (
          <div key={r.label} className="flex justify-between text-xs">
            <span className="text-text-muted">{r.label}</span>
            <span className="text-text-secondary font-medium">{r.val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Main page ── */
export default function ManagerTeam() {
  const [tab, setTab]           = useState('teams')   // 'teams' | 'people'
  const [search, setSearch]     = useState('')
  const [deptFilter, setDept]   = useState('All')
  const [selected, setSelected] = useState(null)
  const [showCreate, setCreate] = useState(false)
  const [editTeam, setEditTeam] = useState(null)

  const qc = useQueryClient()

  const { data: usersData,    isLoading: usersLoading }    = useQuery({ queryKey: ['users','list'],     queryFn: () => usersApi.list({ limit: 200 }),  staleTime: 60_000 })
  const { data: presenceData, isLoading: presenceLoading } = useQuery({ queryKey: ['presence','live_list'], queryFn: presenceApi.liveList, refetchInterval: 30_000 })
  const { data: teamsData,    isLoading: teamsLoading }    = useQuery({ queryKey: ['teams'],             queryFn: teamsApi.list, staleTime: 30_000 })

  const allUsers = Array.isArray(usersData)    ? usersData    : []
  const presence = Array.isArray(presenceData) ? presenceData : []
  const teams    = Array.isArray(teamsData)    ? teamsData    : []

  const presenceMap = useMemo(() => {
    const m = {}
    for (const p of presence) m[p.user_id] = p
    return m
  }, [presence])

  const depts = useMemo(() => {
    const set = new Set(allUsers.map(u => u.department).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [allUsers])

  const visiblePeople = useMemo(() => {
    return allUsers
      .filter(u => {
        if (deptFilter !== 'All' && u.department !== deptFilter) return false
        if (search) {
          const q = search.toLowerCase()
          return (u.full_name ?? '').toLowerCase().includes(q) ||
                 (u.department ?? '').toLowerCase().includes(q)
        }
        return true
      })
      .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
  }, [allUsers, deptFilter, search])

  const visibleTeams = useMemo(() => {
    if (!search) return teams
    return teams.filter(t =>
      (t.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (t.department ?? '').toLowerCase().includes(search.toLowerCase())
    )
  }, [teams, search])

  const deleteMut = useMutation({
    mutationFn: (id) => teamsApi.delete(id),
    onSuccess: () => { toast.success('Team deleted'); qc.invalidateQueries({ queryKey: ['teams'] }); setSelected(null) },
    onError:   (e) => toast.error(e.message),
  })

  const activeCount  = presence.filter(p => p.status === 'CHECKED_IN').length
  const isLoading    = usersLoading || presenceLoading

  const selectedTeam = tab === 'teams'  ? teams.find(t => t.id === selected)     : null
  const selectedEmp  = tab === 'people' ? allUsers.find(u => u.id === selected)   : null

  return (
    <div className="space-y-5 pb-6">
      {showCreate && (
        <TeamModal allUsers={allUsers} onClose={() => { setCreate(false); qc.invalidateQueries({ queryKey: ['teams'] }) }} />
      )}
      {editTeam && (
        <TeamModal team={editTeam} allUsers={allUsers} onClose={() => { setEditTeam(null); qc.invalidateQueries({ queryKey: ['teams'] }) }} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Team Management</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {isLoading ? 'Loading…' : `${allUsers.length} members · ${teams.length} teams · ${activeCount} active`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" icon={<Plus size={13}/>} onClick={() => setCreate(true)}>
            New Team
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'rgba(26,34,54,0.6)' }}>
        {[
          { key: 'teams',  label: 'Teams',  icon: Layers },
          { key: 'people', label: 'People', icon: Users  },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => { setTab(key); setSelected(null); setSearch('') }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200"
            style={{
              background:  tab === key ? 'rgba(99,102,241,0.2)' : 'transparent',
              color:       tab === key ? '#818cf8' : '#64748b',
              border:      tab === key ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
            }}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Employees',   val: allUsers.length,                                              color: '#6366f1' },
          { label: 'Active now',  val: activeCount,                                                  color: '#10b981' },
          { label: 'Teams',       val: teams.length,                                                 color: '#8b5cf6' },
          { label: 'Out of zone', val: presence.filter(p => p.status === 'OUT_OF_ZONE').length,      color: '#ef4444' },
        ].map(s => (
          <div key={s.label} className="glass-card p-3 text-center">
            <div className="text-xl font-black mb-0.5" style={{ color: s.color }}>{isLoading ? '—' : s.val}</div>
            <div className="text-[10px] text-text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        {tab === 'people' && (
          <div className="flex gap-1.5 flex-wrap">
            {depts.map(d => (
              <button key={d} onClick={() => setDept(d)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                style={{
                  background:  deptFilter === d ? 'rgba(99,102,241,0.15)' : 'rgba(26,34,54,0.5)',
                  borderColor: deptFilter === d ? 'rgba(99,102,241,0.4)'  : 'rgba(99,102,241,0.12)',
                  color:       deptFilter === d ? '#818cf8' : '#94a3b8',
                }}>
                {d}
              </button>
            ))}
          </div>
        )}
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'teams' ? 'Search teams…' : 'Search members…'}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-transparent border text-text-primary placeholder-text-muted outline-none focus:border-brand-500"
            style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }} />
        </div>
      </div>

      <div className={cn('grid gap-4', selected ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1')}>
        {/* ── TEAMS tab ── */}
        {tab === 'teams' && (
          <div className="space-y-3">
            {teamsLoading && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-card h-24 animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
            ))}

            {!teamsLoading && visibleTeams.length === 0 && (
              <div className="glass-card p-10 text-center">
                <Layers size={32} className="mx-auto text-text-muted mb-3 opacity-40" />
                <p className="text-sm text-text-muted mb-3">No teams yet</p>
                <Button variant="primary" size="sm" icon={<Plus size={12}/>} onClick={() => setCreate(true)}>
                  Create first team
                </Button>
              </div>
            )}

            {visibleTeams.map(team => {
              const isSelected = selected === team.id
              const donePct = Number(team.task_count) > 0
                ? Math.round((Number(team.done_count) / Number(team.task_count)) * 100)
                : 0

              return (
                <div key={team.id}
                  onClick={() => setSelected(isSelected ? null : team.id)}
                  className="glass-card cursor-pointer transition-all duration-200 hover:scale-[1.005]"
                  style={{
                    padding: 16,
                    borderLeft:  `3px solid ${team.color}`,
                    borderColor: isSelected ? team.color + '50' : undefined,
                    boxShadow:   isSelected ? `0 0 20px ${team.color}15` : undefined,
                  }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-black flex-shrink-0"
                      style={{ background: team.color + '18', color: team.color, border: `1px solid ${team.color}25` }}>
                      {team.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-text-primary">{team.name}</span>
                        {team.department && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                            style={{ background: team.color + '15', color: team.color }}>
                            {team.department}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-text-muted">
                        <span className="flex items-center gap-1"><Users size={9}/>{team.member_count} members</span>
                        <span className="flex items-center gap-1"><BarChart3 size={9}/>{team.done_count}/{team.task_count} tasks done</span>
                      </div>
                    </div>
                    <div className="hidden sm:flex flex-col items-end gap-1.5">
                      <div className="text-xs font-bold" style={{ color: team.color }}>{donePct}%</div>
                      <div className="w-20 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
                        <div className="h-full rounded-full" style={{ width: `${donePct}%`, background: team.color }} />
                      </div>
                    </div>
                    <div className="flex gap-1 ml-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setEditTeam(team); setSelected(null) }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-brand-400 hover:bg-brand-500/10 transition-all">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => { if (confirm(`Delete team "${team.name}"?`)) deleteMut.mutate(team.id) }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-danger-400 hover:bg-danger-500/10 transition-all">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <ChevronRight size={14} className="text-text-muted flex-shrink-0"
                      style={{ transform: isSelected ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── PEOPLE tab ── */}
        {tab === 'people' && (
          <div className="space-y-3">
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="glass-card h-20 animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
            ))}
            {!isLoading && visiblePeople.length === 0 && (
              <div className="glass-card p-10 text-center">
                <Users size={28} className="mx-auto text-text-muted mb-2 opacity-40" />
                <p className="text-sm text-text-muted">No team members found</p>
              </div>
            )}
            {visiblePeople.map(emp => {
              const pData   = presenceMap[emp.id]
              const pStatus = pData?.status ?? 'NO_DATA'
              const pCfg    = PRESENCE_CFG[pStatus] ?? DEFAULT_P
              const isSel   = selected === emp.id
              return (
                <div key={emp.id}
                  onClick={() => setSelected(isSel ? null : emp.id)}
                  className="glass-card cursor-pointer transition-all duration-200 hover:scale-[1.005]"
                  style={{
                    padding: 14,
                    borderColor: isSel ? 'rgba(99,102,241,0.4)' : undefined,
                    boxShadow:   isSel ? '0 0 20px rgba(99,102,241,0.12)' : undefined,
                  }}>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold"
                        style={{ background: pCfg.color + '15', color: pCfg.color, border: `1px solid ${pCfg.color}30`, fontSize: 13 }}>
                        {initials(emp.full_name)}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                        style={{ background: pCfg.color, borderColor: '#111827' }}>
                        {['CHECKED_IN','OUT_OF_ZONE','PRESENCE_DOUBT'].includes(pStatus) && (
                          <div className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: pCfg.color }} />
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary">{emp.full_name}</span>
                        {pStatus === 'OUT_OF_ZONE' && <AlertTriangle size={11} className="text-danger-400" />}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {ROLE_LABELS[emp.role] ?? emp.role}{emp.department ? ` · ${emp.department}` : ''}
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-3">
                      {emp.employee_id && <span className="text-[10px] text-text-muted">{emp.employee_id}</span>}
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: pCfg.color + '15', color: pCfg.color }}>
                        {pCfg.label}
                      </span>
                    </div>
                    <ChevronRight size={14} className="text-text-muted flex-shrink-0"
                      style={{ transform: isSel ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>
                  {pData?.distance_m != null && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <Activity size={9} className="text-text-muted" />
                      <span className="text-[10px] text-text-muted">{Math.round(pData.distance_m)}m from {pData.zone_name ?? 'zone'}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Detail panel */}
        {selectedTeam && (
          <TeamPanel
            team={selectedTeam}
            presenceMap={presenceMap}
            allUsers={allUsers}
            onClose={() => setSelected(null)}
            onEdit={() => { setEditTeam(selectedTeam); setSelected(null) }}
          />
        )}
        {selectedEmp && (
          <MemberDetailPanel emp={selectedEmp} presenceMap={presenceMap} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  )
}
