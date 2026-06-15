import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { tasksApi } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import {
  CheckSquare, Clock, AlertTriangle, Search,
  ChevronDown, ChevronUp, Send, MessageSquare, Loader,
  ListChecks, CheckCircle2, Bell, BellOff, BellRing,
  LayoutList, Calendar, Columns3, ChevronLeft, ChevronRight,
  X, Flame, Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'

/* ─── constants ─────────────────────────────────────── */
const PRIORITY_CFG = {
  LOW:      { label: 'Low',      color: '#475569', bg: 'rgba(71,85,105,0.15)'   },
  MEDIUM:   { label: 'Medium',   color: '#06b6d4', bg: 'rgba(6,182,212,0.15)'  },
  HIGH:     { label: 'High',     color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  CRITICAL: { label: 'Critical', color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
  URGENT:   { label: 'Urgent',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
}

const STATUS_CFG = {
  TODO:        { label: 'To Do',       color: '#475569', bg: 'rgba(71,85,105,0.12)',   col: 0 },
  IN_PROGRESS: { label: 'In Progress', color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  col: 1 },
  REVIEW:      { label: 'In Review',   color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',   col: 2 },
  DONE:        { label: 'Done',        color: '#10b981', bg: 'rgba(16,185,129,0.12)',  col: 3 },
}

const KANBAN_COLS = ['TODO','IN_PROGRESS','REVIEW','DONE']

const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

/* ─── helpers ───────────────────────────────────────── */
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }
function firstDayOf(y, m)  { return new Date(y, m, 1).getDay() }
function toISO(d)           { return d?.slice(0,10) ?? '' }
function isOverdueTask(t)   { return t.status !== 'DONE' && t.due_date && new Date(t.due_date) < new Date() }
function daysUntil(d) {
  if (!d) return null
  const diff = new Date(d) - new Date()
  return Math.ceil(diff / 86400000)
}
function stepsOf(t)    { return Array.isArray(t.steps) ? t.steps : [] }
function progressOf(t) {
  const s = stepsOf(t)
  if (s.length) return Math.round(s.filter(x => x.is_done).length / s.length * 100)
  return t.progress ?? 0
}

/* ─── Reminder engine ───────────────────────────────── */
function useReminders(tasks) {
  const [reminders, setReminders] = useState(() => {
    try { return JSON.parse(localStorage.getItem('task_reminders') ?? '{}') } catch { return {} }
  })

  const save = (r) => { setReminders(r); localStorage.setItem('task_reminders', JSON.stringify(r)) }

  const set = useCallback((taskId, minutesBefore) => {
    const updated = { ...reminders, [taskId]: minutesBefore }
    save(updated)
    toast.success(`Reminder set: ${minutesBefore}m before due`)
  }, [reminders])

  const clear = useCallback((taskId) => {
    const updated = { ...reminders }
    delete updated[taskId]
    save(updated)
    toast.success('Reminder cleared')
  }, [reminders])

  /* Browser notification permission + fire reminders */
  useEffect(() => {
    if (!('Notification' in window)) return
    const interval = setInterval(() => {
      tasks.forEach(t => {
        if (!t.due_date || t.status === 'DONE') return
        const mins = reminders[t.id]
        if (mins == null) return
        const msLeft = new Date(t.due_date) - Date.now()
        const minsLeft = msLeft / 60000
        if (minsLeft > 0 && minsLeft <= mins && minsLeft > mins - 1) {
          if (Notification.permission === 'granted') {
            new Notification(`⏰ Task due in ${Math.round(minsLeft)}m`, {
              body: t.title,
              icon: '/favicon.ico',
            })
          } else {
            toast(`⏰ "${t.title}" due in ${Math.round(minsLeft)}m`, { icon: '🔔', duration: 6000 })
          }
        }
      })
    }, 60_000)
    return () => clearInterval(interval)
  }, [tasks, reminders])

  return { reminders, set, clear }
}

/* ─── ReminderPopover ───────────────────────────────── */
function ReminderPopover({ task, reminders, onSet, onClear, onClose }) {
  const OPTIONS = [15, 30, 60, 120, 1440]
  const LABELS  = { 15: '15 min', 30: '30 min', 60: '1 hour', 120: '2 hours', 1440: '1 day' }
  const current = reminders[task.id]

  function requestAndSet(mins) {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    onSet(task.id, mins)
    onClose()
  }

  return (
    <div className="absolute right-0 top-8 z-50 w-52 rounded-2xl overflow-hidden shadow-2xl"
      style={{ background: 'rgba(13,17,23,0.98)', border: '1px solid rgba(99,102,241,0.25)' }}
      onClick={e => e.stopPropagation()}>
      <div className="px-3 py-2.5 border-b flex items-center justify-between"
        style={{ borderColor: 'rgba(99,102,241,0.15)' }}>
        <div className="flex items-center gap-1.5">
          <BellRing size={12} className="text-brand-400" />
          <span className="text-[11px] font-semibold text-text-primary">Set reminder</span>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={12} /></button>
      </div>
      <div className="p-2 space-y-0.5">
        {OPTIONS.map(m => (
          <button key={m} onClick={() => requestAndSet(m)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all"
            style={{
              background:  current === m ? 'rgba(99,102,241,0.15)' : 'transparent',
              color:       current === m ? '#818cf8' : '#94a3b8',
            }}>
            <span>{LABELS[m]} before</span>
            {current === m && <CheckCircle2 size={11} className="text-brand-400" />}
          </button>
        ))}
      </div>
      {current != null && (
        <div className="p-2 pt-0">
          <button onClick={() => { onClear(task.id); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-danger-400 transition-all hover:bg-danger-500/10">
            <BellOff size={11} /> Clear reminder
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── TaskCard (shared between list + kanban) ──────── */
function TaskCard({ task, expanded, onExpand, stepMut, commentMut, commentText, setCommentText, comments, reminders, onSetReminder, onClearReminder, compact = false }) {
  const pcfg     = PRIORITY_CFG[task.priority] ?? PRIORITY_CFG.MEDIUM
  const scfg     = STATUS_CFG[task.status]     ?? STATUS_CFG.TODO
  const isExp    = expanded === task.id
  const isDone   = task.status === 'DONE'
  const overdue  = isOverdueTask(task)
  const steps    = stepsOf(task)
  const stepDone = steps.filter(s => s.is_done).length
  const progress = progressOf(task)
  const due      = daysUntil(task.due_date)
  const hasReminder = reminders[task.id] != null
  const [showReminder, setShowReminder] = useState(false)

  if (compact) {
    return (
      <div className="glass-card cursor-pointer transition-all duration-200 hover:scale-[1.01]"
        style={{
          padding: 12,
          borderLeft: `3px solid ${pcfg.color}`,
          opacity: isDone ? 0.7 : 1,
        }}
        onClick={() => onExpand(task.id)}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className={cn('text-xs font-semibold truncate mb-1', isDone && 'line-through text-text-muted')}>
              {task.title}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: scfg.bg, color: scfg.color }}>{scfg.label}</span>
              {steps.length > 0 && (
                <span className="text-[9px] text-text-muted">{stepDone}/{steps.length} steps</span>
              )}
              {overdue && <span className="text-[9px] font-bold text-danger-400">OVERDUE</span>}
            </div>
            <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: isDone ? '#10b981' : scfg.color }} />
            </div>
          </div>
          {hasReminder && <BellRing size={10} className="text-brand-400 flex-shrink-0 mt-0.5" />}
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card transition-all duration-300"
      style={{ padding: 0, border: overdue ? '1px solid rgba(239,68,68,0.25)' : undefined, opacity: isDone ? 0.85 : 1 }}>

      {/* Header row */}
      <div className="flex items-start gap-3 p-4 cursor-pointer select-none"
        onClick={() => onExpand(isExp ? null : task.id)}>
        <div className="w-1 self-stretch rounded-full flex-shrink-0"
          style={{ background: pcfg.color, boxShadow: `0 0 8px ${pcfg.color}60` }} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className={cn('text-sm font-semibold', isDone ? 'line-through text-text-muted' : 'text-text-primary')}>
              {task.title}
            </span>
            {overdue && <span className="text-[9px] font-bold text-danger-400 px-1.5 py-0.5 rounded bg-danger-500/10">OVERDUE</span>}
            {due != null && !isDone && due <= 2 && due >= 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5"
                style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                <Flame size={8} />{due === 0 ? 'Today' : `${due}d left`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: pcfg.bg, color: pcfg.color }}>{pcfg.label}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: scfg.bg, color: scfg.color }}>{scfg.label}</span>
            {task.due_date && (
              <span className="text-[10px] text-text-muted flex items-center gap-1">
                <Clock size={9} /> Due {task.due_date?.slice(0,10)}
                {task.due_date?.includes('T') && task.due_date?.slice(11,16) !== '00:00' ? ` · ${task.due_date.slice(11,16)}` : ''}
              </span>
            )}
            {steps.length > 0 && (
              <span className="text-[10px] text-text-muted flex items-center gap-1">
                <ListChecks size={9} />{stepDone}/{steps.length} steps
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: isDone ? '#10b981' : scfg.color, boxShadow: `0 0 6px ${scfg.color}60` }} />
            </div>
            <span className="text-[10px] font-mono font-bold" style={{ color: scfg.color, minWidth: 28, textAlign: 'right' }}>
              {progress}%
            </span>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <div className="relative">
            <button onClick={() => setShowReminder(v => !v)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-brand-500/10"
              title="Set reminder">
              {hasReminder
                ? <BellRing size={13} className="text-brand-400" />
                : <Bell size={13} className="text-text-muted hover:text-brand-400" />
              }
            </button>
            {showReminder && (
              <ReminderPopover
                task={task}
                reminders={reminders}
                onSet={onSetReminder}
                onClear={onClearReminder}
                onClose={() => setShowReminder(false)}
              />
            )}
          </div>
          <button onClick={() => onExpand(isExp ? null : task.id)}
            className="text-text-muted transition-transform duration-200"
            style={{ transform: isExp ? 'rotate(180deg)' : '' }}>
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Expanded panel */}
      {isExp && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: 'rgba(99,102,241,0.1)' }}>
          <div className="pt-3">
            {task.description
              ? <p className="text-xs text-text-muted leading-relaxed">{task.description}</p>
              : <p className="text-xs text-text-muted italic">No description</p>
            }
            {task.creator_name && (
              <p className="text-[10px] text-text-muted mt-1.5">
                Assigned by <span className="text-text-secondary">{task.creator_name}</span>
              </p>
            )}
          </div>

          {/* Steps */}
          {steps.length > 0 && (
            <div className="rounded-xl overflow-hidden"
              style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.1)' }}>
              <div className="flex items-center gap-2 px-3 py-2.5 border-b"
                style={{ borderColor: 'rgba(99,102,241,0.1)' }}>
                <ListChecks size={13} className="text-brand-400" />
                <span className="text-xs font-semibold text-text-secondary">Steps to complete</span>
                <span className="ml-auto text-[10px] font-bold" style={{ color: scfg.color }}>{stepDone}/{steps.length}</span>
              </div>
              <div className="divide-y" style={{ borderColor: 'rgba(99,102,241,0.06)' }}>
                {steps.map((step, idx) => {
                  const done = !!step.is_done
                  return (
                    <div key={step.id}
                      onClick={() => { if (!isDone) stepMut.mutate({ stepId: step.id, isDone: !done }) }}
                      className={cn('flex items-center gap-3 px-3 py-2.5 transition-all duration-200',
                        !isDone && 'cursor-pointer hover:bg-brand-500/5', done && 'opacity-70')}>
                      <div className={cn('w-5 h-5 rounded-lg flex items-center justify-center border-2 flex-shrink-0 transition-all duration-200',
                        done ? 'border-success-500 bg-success-500' : 'border-border-default hover:border-brand-500')}>
                        {done && (
                          <svg width="10" height="7" viewBox="0 0 10 7" fill="none">
                            <path d="M1 3.5L3.5 6L9 1" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-[10px] font-bold flex-shrink-0" style={{ color: done ? '#10b981' : '#64748b' }}>
                          {idx + 1}
                        </span>
                        <span className={cn('text-sm', done ? 'line-through text-text-muted' : 'text-text-secondary')}>
                          {step.label}
                        </span>
                      </div>
                      {done && <CheckCircle2 size={14} style={{ color: '#10b981' }} className="flex-shrink-0" />}
                    </div>
                  )
                })}
              </div>
              {stepDone === steps.length && steps.length > 0 && (
                <div className="px-3 py-2 flex items-center gap-2"
                  style={{ background: 'rgba(16,185,129,0.08)', borderTop: '1px solid rgba(16,185,129,0.15)' }}>
                  <CheckCircle2 size={13} style={{ color: '#10b981' }} />
                  <span className="text-xs font-semibold text-success-400">All steps done — task complete!</span>
                </div>
              )}
            </div>
          )}

          {/* Comments */}
          <div>
            <p className="text-xs font-semibold text-text-secondary mb-2 flex items-center gap-1.5">
              <MessageSquare size={12} className="text-brand-400" />
              Comments {comments.length > 0 ? `(${comments.length})` : ''}
            </p>
            {comments.length > 0 && (
              <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2 text-xs">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                      style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                      {(c.full_name ?? '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-text-secondary">{c.full_name}</span>
                      <span className="text-text-muted ml-1.5 text-[10px]">{c.created_at?.slice(0,16).replace('T',' ')}</span>
                      <p className="text-text-muted mt-0.5">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                placeholder="Add a comment… (Enter to send)"
                value={commentText[task.id] ?? ''}
                onChange={e => setCommentText(c => ({ ...c, [task.id]: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    const text = commentText[task.id]?.trim()
                    if (text) commentMut.mutate({ taskId: task.id, text })
                  }
                }}
                className="flex-1 h-8 px-3 rounded-xl text-xs bg-surface-2 border border-border-subtle text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500 transition-all"
              />
              <button
                onClick={() => { const text = commentText[task.id]?.trim(); if (text) commentMut.mutate({ taskId: task.id, text }) }}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                {commentMut.isPending ? <Loader size={12} className="animate-spin" /> : <Send size={12} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Calendar view ─────────────────────────────────── */
function CalendarView({ tasks, onExpand, reminders }) {
  const today = new Date()
  const [yr, setYr]   = useState(today.getFullYear())
  const [mo, setMo]   = useState(today.getMonth())
  const [selected, setSelected] = useState(null)   // 'YYYY-MM-DD'

  const dim  = daysInMonth(yr, mo)
  const fd   = firstDayOf(yr, mo)
  const cells = Array.from({ length: fd + dim }, (_, i) => i < fd ? null : i - fd + 1)

  // pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null)

  const tasksByDate = useMemo(() => {
    const m = {}
    tasks.forEach(t => {
      const d = toISO(t.due_date)
      if (d) { m[d] = m[d] ?? []; m[d].push(t) }
    })
    return m
  }, [tasks])

  const todayStr = toISO(today.toISOString())
  const selTasks = selected ? (tasksByDate[selected] ?? []) : []

  function prev() { if (mo === 0) { setYr(y=>y-1); setMo(11) } else setMo(m=>m-1); setSelected(null) }
  function next() { if (mo === 11) { setYr(y=>y+1); setMo(0) } else setMo(m=>m+1); setSelected(null) }

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prev}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-4 transition-all">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-bold text-text-primary">
            {MONTHS[mo]} {yr}
          </h2>
          <button onClick={next}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-4 transition-all">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-text-muted py-1">{d}</div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />
            const iso  = `${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const dTasks = tasksByDate[iso] ?? []
            const isToday  = iso === todayStr
            const isSel    = iso === selected
            const hasOverdue = dTasks.some(t => isOverdueTask(t))
            const allDone   = dTasks.length > 0 && dTasks.every(t => t.status === 'DONE')

            return (
              <button key={i} onClick={() => setSelected(isSel ? null : iso)}
                className="relative aspect-square rounded-xl flex flex-col items-center justify-start pt-1 transition-all duration-200 hover:scale-105"
                style={{
                  background:  isSel    ? 'rgba(99,102,241,0.2)'
                             : isToday  ? 'rgba(99,102,241,0.1)'
                             : dTasks.length ? 'rgba(26,34,54,0.6)' : 'transparent',
                  border: isSel    ? '1px solid rgba(99,102,241,0.5)'
                        : isToday  ? '1px solid rgba(99,102,241,0.3)'
                        : '1px solid transparent',
                }}>
                <span className="text-[11px] font-semibold" style={{
                  color: isSel ? '#818cf8' : isToday ? '#a5b4fc' : '#94a3b8'
                }}>
                  {day}
                </span>

                {/* Task dots */}
                {dTasks.length > 0 && (
                  <div className="flex gap-0.5 flex-wrap justify-center mt-0.5 px-0.5">
                    {dTasks.slice(0, 3).map((t, ti) => {
                      const c = isOverdueTask(t) ? '#ef4444'
                              : t.status === 'DONE' ? '#10b981'
                              : (PRIORITY_CFG[t.priority]?.color ?? '#6366f1')
                      return (
                        <div key={ti} className="w-1.5 h-1.5 rounded-full"
                          style={{ background: c, boxShadow: `0 0 4px ${c}80` }} />
                      )
                    })}
                    {dTasks.length > 3 && (
                      <span className="text-[8px] text-text-muted">+{dTasks.length - 3}</span>
                    )}
                  </div>
                )}

                {/* Reminder dot */}
                {dTasks.some(t => reminders[t.id] != null) && (
                  <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-brand-400" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day tasks */}
      {selected && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 rounded-full" style={{ background: '#6366f1' }} />
            <p className="text-sm font-semibold text-text-primary">
              {new Date(selected + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <span className="text-[10px] text-text-muted">{selTasks.length} task{selTasks.length !== 1 ? 's' : ''}</span>
          </div>
          {selTasks.length === 0 ? (
            <div className="glass-card p-6 text-center">
              <p className="text-xs text-text-muted">No tasks due this day</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selTasks.map(t => (
                <div key={t.id} className="glass-card p-3 flex items-center gap-3 cursor-pointer hover:scale-[1.005] transition-all"
                  onClick={() => onExpand(t.id)}>
                  <div className="w-1 self-stretch rounded-full flex-shrink-0"
                    style={{ background: PRIORITY_CFG[t.priority]?.color ?? '#6366f1' }} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-semibold truncate', t.status === 'DONE' && 'line-through text-text-muted')}>
                      {t.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: STATUS_CFG[t.status]?.bg, color: STATUS_CFG[t.status]?.color }}>
                        {STATUS_CFG[t.status]?.label}
                      </span>
                      {stepsOf(t).length > 0 && (
                        <span className="text-[9px] text-text-muted">
                          {stepsOf(t).filter(s => s.is_done).length}/{stepsOf(t).length} steps
                        </span>
                      )}
                      {isOverdueTask(t) && <span className="text-[9px] font-bold text-danger-400">OVERDUE</span>}
                    </div>
                  </div>
                  {reminders[t.id] != null && <BellRing size={12} className="text-brand-400 flex-shrink-0" />}
                  <div className="w-12">
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.1)' }}>
                      <div className="h-full rounded-full" style={{ width: `${progressOf(t)}%`, background: STATUS_CFG[t.status]?.color ?? '#6366f1' }} />
                    </div>
                    <p className="text-[9px] text-text-muted text-right mt-0.5">{progressOf(t)}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upcoming tasks strip */}
      <div className="glass-card p-4">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-3">Upcoming (next 7 days)</p>
        {(() => {
          const upcoming = tasks
            .filter(t => {
              if (!t.due_date || t.status === 'DONE') return false
              const d = daysUntil(t.due_date)
              return d != null && d >= 0 && d <= 7
            })
            .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
          if (!upcoming.length) return <p className="text-xs text-text-muted">No tasks due in the next 7 days</p>
          return (
            <div className="space-y-2">
              {upcoming.map(t => {
                const d = daysUntil(t.due_date)
                return (
                  <div key={t.id} className="flex items-center gap-3 py-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => onExpand(t.id)}>
                    <div className="w-8 text-center flex-shrink-0">
                      <div className="text-xs font-black" style={{ color: d === 0 ? '#f59e0b' : d <= 2 ? '#ef4444' : '#6366f1' }}>
                        {d === 0 ? 'Today' : `${d}d`}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">{t.title}</p>
                    </div>
                    <div className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: PRIORITY_CFG[t.priority]?.bg, color: PRIORITY_CFG[t.priority]?.color }}>
                      {PRIORITY_CFG[t.priority]?.label}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

/* ─── Kanban view ───────────────────────────────────── */
function KanbanView({ tasks, stepMut, commentMut, commentText, setCommentText, commentsMap, reminders, onSetReminder, onClearReminder, expanded, onExpand }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {KANBAN_COLS.map(status => {
        const cfg    = STATUS_CFG[status]
        const colTasks = tasks.filter(t => t.status === status)
        return (
          <div key={status} className="flex flex-col gap-2">
            {/* Column header */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: cfg.bg, border: `1px solid ${cfg.color}25` }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>
                {cfg.label}
              </span>
              <span className="ml-auto text-[10px] font-black" style={{ color: cfg.color }}>{colTasks.length}</span>
            </div>

            {/* Cards */}
            <div className="space-y-2 flex-1">
              {colTasks.length === 0 && (
                <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(26,34,54,0.3)', border: '1px dashed rgba(99,102,241,0.12)' }}>
                  <p className="text-[10px] text-text-muted">Empty</p>
                </div>
              )}
              {colTasks.map(t => (
                <TaskCard
                  key={t.id}
                  task={t}
                  expanded={expanded}
                  onExpand={onExpand}
                  stepMut={stepMut}
                  commentMut={commentMut}
                  commentText={commentText}
                  setCommentText={setCommentText}
                  comments={commentsMap[t.id] ?? []}
                  reminders={reminders}
                  onSetReminder={onSetReminder}
                  onClearReminder={onClearReminder}
                  compact
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Main page ─────────────────────────────────────── */
export default function EmployeeTasks() {
  const qc = useQueryClient()

  const [view, setView]               = useState('list')   // 'list' | 'calendar' | 'kanban'
  const [search, setSearch]           = useState('')
  const [filter, setFilter]           = useState('ALL')
  const [expanded, setExpanded]       = useState(null)
  const [commentText, setCommentText] = useState({})

  const { data: rawTasks, isLoading } = useQuery({
    queryKey: ['tasks', 'mine'],
    queryFn:  () => tasksApi.list({ limit: 100 }),
    staleTime: 30_000,
  })

  const { data: rawComments } = useQuery({
    queryKey: ['tasks', 'comments', expanded],
    queryFn:  () => tasksApi.commentList(expanded),
    enabled:  !!expanded,
    staleTime: 15_000,
  })

  const tasks    = Array.isArray(rawTasks)    ? rawTasks    : []
  const comments = Array.isArray(rawComments) ? rawComments : []

  const { reminders, set: setReminder, clear: clearReminder } = useReminders(tasks)

  const stepMut = useMutation({
    mutationFn: ({ stepId, isDone }) => tasksApi.subtaskUpdate(stepId, isDone),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', 'mine'] }),
    onError:   () => toast.error('Failed to update step'),
  })

  const commentMut = useMutation({
    mutationFn: ({ taskId, text }) => tasksApi.commentAdd(taskId, text),
    onSuccess: (_, vars) => {
      setCommentText(c => ({ ...c, [vars.taskId]: '' }))
      qc.invalidateQueries({ queryKey: ['tasks', 'comments', vars.taskId] })
    },
    onError: () => toast.error('Failed to add comment'),
  })

  const filtered = tasks.filter(t => {
    if (filter !== 'ALL' && t.status !== filter) return false
    if (search && !(t.title ?? '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const overdueTasks = tasks.filter(isOverdueTask)
  const todayTasks   = tasks.filter(t => toISO(t.due_date) === toISO(new Date().toISOString()) && t.status !== 'DONE')

  const counts = {
    all:    tasks.length,
    todo:   tasks.filter(t => t.status === 'TODO').length,
    active: tasks.filter(t => t.status === 'IN_PROGRESS').length,
    review: tasks.filter(t => t.status === 'REVIEW').length,
    done:   tasks.filter(t => t.status === 'DONE').length,
  }

  const reminderCount = tasks.filter(t => reminders[t.id] != null).length

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">My Tasks</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Tick each step to update progress · Your manager sees changes in real time
          </p>
        </div>
        {reminderCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}>
            <BellRing size={12} />
            {reminderCount} reminder{reminderCount !== 1 ? 's' : ''} active
          </div>
        )}
      </div>

      {/* View switcher */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(26,34,54,0.6)' }}>
          {[
            { key: 'list',     label: 'List',     icon: LayoutList },
            { key: 'calendar', label: 'Calendar', icon: Calendar   },
            { key: 'kanban',   label: 'Board',    icon: Columns3   },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setView(key)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
              style={{
                background:  view === key ? 'rgba(99,102,241,0.2)' : 'transparent',
                color:       view === key ? '#818cf8' : '#64748b',
                border:      view === key ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
              }}>
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        {/* Quick stats */}
        {todayTasks.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
            <Zap size={11} />
            {todayTasks.length} due today
          </div>
        )}
        {overdueTasks.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
            <AlertTriangle size={11} />
            {overdueTasks.length} overdue
          </div>
        )}
      </div>

      {/* ─── LIST + KANBAN: show filter chips + search ─── */}
      {view !== 'calendar' && (
        <>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'All',         val: counts.all,    key: 'ALL',         color: '#818cf8' },
              { label: 'To Do',       val: counts.todo,   key: 'TODO',        color: '#475569' },
              { label: 'In Progress', val: counts.active, key: 'IN_PROGRESS', color: '#6366f1' },
              { label: 'In Review',   val: counts.review, key: 'REVIEW',      color: '#06b6d4' },
              { label: 'Done',        val: counts.done,   key: 'DONE',        color: '#10b981' },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200"
                style={{
                  background:  filter === f.key ? f.color + '20' : 'rgba(26,34,54,0.5)',
                  borderColor: filter === f.key ? f.color + '50' : 'rgba(99,102,241,0.12)',
                  color:       filter === f.key ? f.color : '#94a3b8',
                  boxShadow:   filter === f.key ? `0 0 12px ${f.color}20` : 'none',
                }}>
                <span className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-black"
                  style={{ background: filter === f.key ? f.color + '30' : 'rgba(99,102,241,0.1)' }}>
                  {f.val}
                </span>
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-xl text-sm bg-surface-2 border border-border-subtle text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)] transition-all" />
          </div>
        </>
      )}

      {/* ─── Loading ─── */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
          ))}
        </div>
      )}

      {/* ─── LIST VIEW ─── */}
      {!isLoading && view === 'list' && (
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="glass-card p-10 text-center">
              <CheckSquare size={32} className="mx-auto text-text-muted mb-3" />
              <p className="text-text-muted text-sm">
                {tasks.length === 0 ? 'No tasks assigned to you yet' : 'No tasks match your filter'}
              </p>
            </div>
          )}
          {filtered.map(t => (
            <TaskCard
              key={t.id}
              task={t}
              expanded={expanded}
              onExpand={setExpanded}
              stepMut={stepMut}
              commentMut={commentMut}
              commentText={commentText}
              setCommentText={setCommentText}
              comments={expanded === t.id ? comments : []}
              reminders={reminders}
              onSetReminder={setReminder}
              onClearReminder={clearReminder}
            />
          ))}
        </div>
      )}

      {/* ─── CALENDAR VIEW ─── */}
      {!isLoading && view === 'calendar' && (
        <CalendarView
          tasks={tasks}
          onExpand={id => { setView('list'); setExpanded(id) }}
          reminders={reminders}
        />
      )}

      {/* ─── KANBAN VIEW ─── */}
      {!isLoading && view === 'kanban' && (
        <KanbanView
          tasks={filtered}
          stepMut={stepMut}
          commentMut={commentMut}
          commentText={commentText}
          setCommentText={setCommentText}
          commentsMap={expanded ? { [expanded]: comments } : {}}
          reminders={reminders}
          onSetReminder={setReminder}
          onClearReminder={clearReminder}
          expanded={expanded}
          onExpand={setExpanded}
        />
      )}
    </div>
  )
}
