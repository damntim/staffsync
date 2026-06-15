import { useState } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import {
  CheckSquare, Plus, Search, CheckCircle2, Circle,
  AlertTriangle, ChevronDown, User, Calendar, Clock,
  X, Loader, Layers, GripVertical, ListChecks,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi, usersApi, teamsApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

const PRIORITY = {
  CRITICAL: { label: 'Critical', color: '#ef4444' },
  HIGH:     { label: 'High',     color: '#f97316' },
  MEDIUM:   { label: 'Medium',   color: '#f59e0b' },
  LOW:      { label: 'Low',      color: '#10b981' },
}

const STATUS = {
  TODO:        { label: 'To Do',       color: '#475569', next: 'IN_PROGRESS' },
  IN_PROGRESS: { label: 'In Progress', color: '#6366f1', next: 'REVIEW'      },
  REVIEW:      { label: 'Review',      color: '#f59e0b', next: 'DONE'        },
  DONE:        { label: 'Done',        color: '#10b981', next: null          },
}

function isOverdue(dueDate, status) {
  if (!dueDate || status === 'DONE') return false
  return new Date(dueDate) < new Date()
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  const hasTime = d.includes('T') && !d.endsWith('T00:00:00') && !d.endsWith(' 00:00:00')
  if (hasTime) {
    return dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ── Steps builder used inside CreateTaskModal ── */
function StepsBuilder({ steps, onChange }) {
  const [draft, setDraft] = useState('')

  function addStep() {
    const label = draft.trim()
    if (!label) return
    onChange([...steps, { label }])
    setDraft('')
  }

  function removeStep(idx) {
    onChange(steps.filter((_, i) => i !== idx))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); addStep() }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-text-muted mb-1.5">
        Steps / Checklist <span className="text-text-muted font-normal">(employee ticks each one to update progress)</span>
      </label>

      {/* Existing steps */}
      {steps.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
              <GripVertical size={12} className="text-text-muted flex-shrink-0" />
              <span className="text-xs text-text-secondary flex-1">{i + 1}. {s.label}</span>
              <button type="button" onClick={() => removeStep(i)}
                className="text-text-muted hover:text-danger-400 transition-colors">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new step */}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={steps.length === 0 ? 'e.g. Write unit tests' : 'Add another step…'}
          className="flex-1 px-3 py-2 rounded-xl text-xs bg-transparent border text-text-primary placeholder-text-muted outline-none focus:border-brand-500 transition-colors"
          style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }}
        />
        <button type="button" onClick={addStep}
          className="px-3 py-2 rounded-xl text-xs font-semibold transition-all"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
          <Plus size={13} />
        </button>
      </div>

      {steps.length === 0 && (
        <p className="text-[10px] text-text-muted mt-1.5">Press Enter or + to add a step. Leave empty for freeform progress.</p>
      )}
    </div>
  )
}

/* ── Create Task Modal ── */
function CreateTaskModal({ onClose, users, teams }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: '', description: '', priority: 'MEDIUM',
    assignee_id: '', due_date: '', due_time: '', team_id: '',
  })
  const [steps, setSteps] = useState([])
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const create = useMutation({
    mutationFn: tasksApi.create,
    onSuccess: () => { toast.success('Task created'); qc.invalidateQueries({ queryKey: ['tasks'] }); onClose() },
    onError:   (e) => toast.error(e.message),
  })

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('Task title required')
    if (!form.assignee_id)  return toast.error('Select an assignee')
    const dueDateTime = form.due_date
      ? (form.due_time ? `${form.due_date}T${form.due_time}:00` : form.due_date)
      : undefined
    create.mutate({
      ...form,
      due_date: dueDateTime,
      team_id:  form.team_id  || undefined,
      subtasks: steps.map((s, i) => ({ label: s.label, sort_order: i })),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(6,9,18,0.8)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="w-full max-w-lg glass-strong rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(99,102,241,0.25)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0"
          style={{ borderColor: 'rgba(99,102,241,0.15)', background: 'rgba(13,17,23,0.98)' }}>
          <div className="flex items-center gap-2">
            <CheckSquare size={16} className="text-brand-400" />
            <h2 className="font-semibold text-text-primary">New Task</h2>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-4 transition-all">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Input label="Task title" value={form.title} onChange={e => up('title', e.target.value)}
            placeholder="What needs to be done?" />

          <Textarea label="Description (optional)" rows={2} value={form.description}
            onChange={e => up('description', e.target.value)} placeholder="More context for the assignee…" />

          {/* Steps builder */}
          <StepsBuilder steps={steps} onChange={setSteps} />

          <div className="grid grid-cols-2 gap-4">
            <Select label="Priority" value={form.priority} onChange={e => up('priority', e.target.value)}>
              {Object.entries(PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>

            <Select label="Team (optional)" value={form.team_id}
              onChange={e => { up('team_id', e.target.value); up('assignee_id', '') }}>
              <option value="">— No team —</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>

          <Select label="Assign to" value={form.assignee_id} onChange={e => up('assignee_id', e.target.value)}>
            <option value="">— Select member —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.full_name}{u.department ? ` (${u.department})` : ''}</option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Due date" type="date" value={form.due_date} onChange={e => up('due_date', e.target.value)} />
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                Due time <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <div className="relative">
                <Clock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  type="time"
                  value={form.due_time}
                  onChange={e => up('due_time', e.target.value)}
                  disabled={!form.due_date}
                  className="w-full h-10 pl-9 pr-3 rounded-xl text-sm border text-text-primary outline-none focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }}
                />
              </div>
              {!form.due_date && (
                <p className="text-[10px] text-text-muted mt-1">Set date first</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" fullWidth onClick={onClose}>Cancel</Button>
            <Button variant="primary" fullWidth type="submit"
              icon={create.isPending ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}>
              {create.isPending ? 'Creating…' : 'Create Task'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Read-only steps list for manager view ── */
function StepsReadOnly({ steps }) {
  if (!steps?.length) return null
  const done  = steps.filter(s => s.is_done).length
  const total = steps.length
  const pct   = Math.round((done / total) * 100)

  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(99,102,241,0.08)' }}>
      <div className="flex items-center gap-2 mb-2">
        <ListChecks size={11} className="text-brand-400" />
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
          Steps — {done}/{total} done
        </span>
        <div className="flex-1 h-1 rounded-full overflow-hidden ml-1" style={{ background: 'rgba(99,102,241,0.1)' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: pct === 100 ? '#10b981' : '#6366f1' }} />
        </div>
        <span className="text-[10px] font-bold" style={{ color: pct === 100 ? '#10b981' : '#6366f1' }}>{pct}%</span>
      </div>
      <div className="space-y-1">
        {steps.map((s, i) => (
          <div key={s.id ?? i} className="flex items-center gap-2 text-xs">
            {s.is_done
              ? <CheckCircle2 size={13} style={{ color: '#10b981' }} className="flex-shrink-0" />
              : <Circle      size={13} className="text-text-muted flex-shrink-0" />
            }
            <span className={cn(s.is_done ? 'line-through text-text-muted' : 'text-text-secondary')}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Main page ── */
export default function ManagerTasks() {
  const qc = useQueryClient()
  const { getRole } = useAuthStore()
  const isManager = ['MANAGER','HR','IT_ADMIN'].includes(getRole())

  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState('ALL')
  const [priorityFilter, setPri]    = useState('ALL')
  const [teamFilter, setTeamFilter] = useState('ALL')
  const [expanded, setExpanded]     = useState(null)
  const [showCreate, setCreate]     = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'list', teamFilter],
    queryFn:  () => tasksApi.list({ limit: 200, team_id: teamFilter !== 'ALL' ? teamFilter : undefined }),
    staleTime: 30_000,
  })

  const { data: usersData } = useQuery({
    queryKey: ['users', 'list'],
    queryFn:  () => usersApi.list({ limit: 200 }),
    staleTime: 120_000,
    enabled:  isManager,
  })

  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn:  teamsApi.list,
    staleTime: 60_000,
    enabled:  isManager,
  })

  const tasks = Array.isArray(data)      ? data      : []
  const users = Array.isArray(usersData) ? usersData : []
  const teams = Array.isArray(teamsData) ? teamsData : []

  const updateTask = useMutation({
    mutationFn: tasksApi.update,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError:   (e) => toast.error(e.message),
  })

  function advanceStatus(taskId, currentStatus) {
    const next = STATUS[currentStatus]?.next
    if (!next) return
    updateTask.mutate({ task_id: taskId, status: next })
    toast.success(`Moved to ${STATUS[next].label}`)
  }

  const visible = tasks.filter(t => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false
    if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false
    if (search && !(t.title ?? '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const overdueCount = tasks.filter(t => isOverdue(t.due_date, t.status)).length

  return (
    <div className="space-y-5 pb-6">
      {showCreate && <CreateTaskModal users={users} teams={teams} onClose={() => setCreate(false)} />}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Tasks</h1>
          <p className="text-sm text-text-muted mt-0.5">Create tasks with steps — employees tick each step to update progress</p>
        </div>
        {isManager && (
          <Button variant="primary" size="sm" icon={<Plus size={13}/>} onClick={() => setCreate(true)}>
            New Task
          </Button>
        )}
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(STATUS).map(([k, cfg]) => {
          const count = tasks.filter(t => t.status === k).length
          return (
            <button key={k} onClick={() => setStatus(statusFilter === k ? 'ALL' : k)}
              className="glass-card p-3 text-left transition-all duration-200 hover:scale-[1.02]"
              style={{
                padding:     12,
                borderColor: statusFilter === k ? cfg.color + '45' : undefined,
                boxShadow:   statusFilter === k ? `0 0 14px ${cfg.color}15` : undefined,
              }}>
              <div className="text-xl font-black mb-0.5" style={{ color: cfg.color }}>
                {isLoading ? '—' : count}
              </div>
              <div className="text-[10px] text-text-muted">{cfg.label}</div>
            </button>
          )
        })}
      </div>

      {overdueCount > 0 && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)' }}>
          <AlertTriangle size={14} className="text-danger-400 flex-shrink-0" />
          <p className="text-xs text-danger-400">
            <span className="font-bold">{overdueCount} overdue task{overdueCount > 1 ? 's' : ''}</span> — action required
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        {isManager && teams.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setTeamFilter('ALL')}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all"
              style={{
                background:  teamFilter === 'ALL' ? 'rgba(139,92,246,0.18)' : 'rgba(26,34,54,0.5)',
                borderColor: teamFilter === 'ALL' ? 'rgba(139,92,246,0.45)' : 'rgba(99,102,241,0.12)',
                color:       teamFilter === 'ALL' ? '#a78bfa' : '#94a3b8',
              }}>
              <Layers size={9} style={{ display: 'inline', marginRight: 3 }} />All teams
            </button>
            {teams.map(t => (
              <button key={t.id} onClick={() => setTeamFilter(String(t.id))}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all"
                style={{
                  background:  teamFilter === String(t.id) ? t.color + '18' : 'rgba(26,34,54,0.5)',
                  borderColor: teamFilter === String(t.id) ? t.color + '45' : 'rgba(99,102,241,0.12)',
                  color:       teamFilter === String(t.id) ? t.color : '#94a3b8',
                }}>
                {t.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 flex-wrap">
          {[{ key: 'ALL', label: 'All', color: '#818cf8' }, ...Object.entries(PRIORITY).map(([k,v]) => ({ key: k, ...v }))].map(f => (
            <button key={f.key} onClick={() => setPri(f.key)}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all"
              style={{
                background:  priorityFilter === f.key ? f.color+'18' : 'rgba(26,34,54,0.5)',
                borderColor: priorityFilter === f.key ? f.color+'45' : 'rgba(99,102,241,0.12)',
                color:       priorityFilter === f.key ? f.color : '#94a3b8',
              }}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-transparent border text-text-primary placeholder-text-muted outline-none focus:border-brand-500 transition-colors"
            style={{ background: 'rgba(26,34,54,0.5)', borderColor: 'rgba(99,102,241,0.15)' }} />
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-3">
        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card h-20 animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
        ))}

        {!isLoading && visible.length === 0 && (
          <div className="glass-card p-10 text-center">
            <CheckSquare size={32} className="mx-auto text-text-muted mb-3 opacity-40" />
            <p className="text-sm text-text-muted">No tasks match this filter</p>
          </div>
        )}

        {visible.map(task => {
          const priCfg   = PRIORITY[task.priority] ?? { label: task.priority, color: '#818cf8' }
          const stCfg    = STATUS[task.status]     ?? { label: task.status,   color: '#94a3b8' }
          const isOpen   = expanded === task.id
          const isDone   = task.status === 'DONE'
          const overdue  = isOverdue(task.due_date, task.status)
          const steps    = Array.isArray(task.steps) ? task.steps : []
          const progress = task.progress ?? 0
          const teamName = teams.find(t => t.id === task.team_id)?.name

          return (
            <div key={task.id}
              className="glass-card overflow-hidden transition-all duration-300"
              style={{
                borderLeft:  `3px solid ${priCfg.color}`,
                borderColor: overdue ? 'rgba(239,68,68,0.25)' : undefined,
                opacity:     isDone  ? 0.75 : 1,
              }}>
              <div className="p-4">
                {/* Row */}
                <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpanded(isOpen ? null : task.id)}>
                  <div className="flex-shrink-0 mt-0.5"
                    onClick={e => { e.stopPropagation(); if (!isDone && isManager) advanceStatus(task.id, task.status) }}>
                    {isDone
                      ? <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                      : <Circle size={18} className={cn('text-text-muted transition-colors', isManager && 'hover:text-brand-400')} />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn('text-sm font-semibold text-text-primary', isDone && 'line-through text-text-muted')}>
                        {task.title}
                      </span>
                      {overdue && <AlertTriangle size={11} className="text-danger-400" />}
                      {teamName && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
                          <Layers size={8} style={{ display: 'inline', marginRight: 2 }} />{teamName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                        style={{ background: priCfg.color+'15', color: priCfg.color }}>{priCfg.label}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                        style={{ background: stCfg.color+'15', color: stCfg.color }}>{stCfg.label}</span>
                      {task.due_date && (
                        <span className="flex items-center gap-1 text-[10px] text-text-muted">
                          <Calendar size={9}/>{fmtDate(task.due_date)}
                        </span>
                      )}
                      {task.assignee_name && (
                        <span className="flex items-center gap-1 text-[10px] text-text-muted">
                          <User size={9}/>{task.assignee_name}
                        </span>
                      )}
                      {steps.length > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-text-muted">
                          <ListChecks size={9}/>{task.subtask_done}/{steps.length} steps
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2.5">
                      <div className="flex justify-between text-[9px] text-text-muted mb-1">
                        <span>{steps.length > 0 ? `${progress}% complete` : 'Progress'}</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{
                            width:   `${progress}%`,
                            background: isDone ? '#10b981' : `linear-gradient(90deg, ${stCfg.color}, ${stCfg.color}cc)`,
                            boxShadow: `0 0 6px ${stCfg.color}60`,
                          }} />
                      </div>
                    </div>
                  </div>

                  <button className="flex-shrink-0 text-text-muted transition-transform duration-200 mt-0.5"
                    style={{ transform: isOpen ? 'rotate(180deg)' : '' }}>
                    <ChevronDown size={14} />
                  </button>
                </div>

                {/* Expanded panel — read-only for manager */}
                {isOpen && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: 'rgba(99,102,241,0.1)' }}>
                    {task.description && (
                      <p className="text-xs text-text-muted mb-3 leading-relaxed">{task.description}</p>
                    )}

                    {/* Read-only steps */}
                    <StepsReadOnly steps={steps} />

                    {/* Manager: advance status button */}
                    {isManager && !isDone && STATUS[task.status]?.next && (
                      <div className="mt-3">
                        <Button variant="primary" size="xs"
                          disabled={updateTask.isPending}
                          onClick={() => advanceStatus(task.id, task.status)}>
                          Move to {STATUS[STATUS[task.status].next]?.label}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
