import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { attendanceApi } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Clock, Download, ChevronLeft, ChevronRight, AlertCircle, CheckCircle, Loader } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS_CFG = {
  PRESENT:        { label: 'Present',   color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  LATE:           { label: 'Late',      color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  ABSENT:         { label: 'Absent',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  ON_LEAVE:       { label: 'On Leave',  color: '#06b6d4', bg: 'rgba(6,182,212,0.12)'   },
  HALF_DAY:       { label: 'Half Day',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
  WFH:            { label: 'WFH',       color: '#6366f1', bg: 'rgba(99,102,241,0.12)'  },
  HOLIDAY:        { label: 'Holiday',   color: '#475569', bg: 'rgba(71,85,105,0.12)'   },
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function isoDate(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function monthRange(y, m) {
  const from = isoDate(y, m, 1)
  const days  = new Date(y, m + 1, 0).getDate()
  const to    = isoDate(y, m, days)
  return { from, to }
}

/* Build a full month grid from API records */
function buildMonthRows(y, m, records) {
  const days = new Date(y, m + 1, 0).getDate()
  const recMap = {}
  records.forEach(r => { recMap[r.date?.slice(0, 10)] = r })

  const rows = []
  for (let d = 1; d <= days; d++) {
    const date   = new Date(y, m, d)
    const dow    = date.getDay()
    const key    = isoDate(y, m, d)
    const rec    = recMap[key]

    if (dow === 0 || dow === 6) {
      rows.push({ date, key, status: 'HOLIDAY', checkIn: null, checkOut: null, hours: 0, rec: null })
      continue
    }

    const status = rec?.status ?? 'ABSENT'
    const checkIn  = rec?.check_in  ?? null
    const checkOut = rec?.check_out ?? null
    const hours    = rec?.hours_worked ? +rec.hours_worked : 0

    rows.push({ date, key, status, checkIn, checkOut, hours, rec })
  }
  return rows
}

export default function EmployeeAttendance() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const today = new Date()

  const [viewMonth, setViewMonth] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [view, setView]           = useState('calendar')
  const [regulariseModal, setRegulariseModal] = useState(null)   // { key, date } | null
  const [regNote, setRegNote]     = useState('')

  const { from, to } = monthRange(viewMonth.y, viewMonth.m)

  const { data: rawRecords, isLoading } = useQuery({
    queryKey: ['attendance', 'my_list', from, to],
    queryFn:  () => attendanceApi.myList({ from, to }),
    staleTime: 60_000,
  })

  const records = Array.isArray(rawRecords) ? rawRecords : []
  const rows    = buildMonthRows(viewMonth.y, viewMonth.m, records)

  const summary = {
    present:  rows.filter(r => r.status === 'PRESENT').length,
    late:     rows.filter(r => r.status === 'LATE').length,
    absent:   rows.filter(r => r.status === 'ABSENT').length,
    leave:    rows.filter(r => r.status === 'ON_LEAVE').length,
    totalHrs: +rows.reduce((a, r) => a + r.hours, 0).toFixed(1),
  }

  const regulariseMut = useMutation({
    mutationFn: (data) => attendanceApi.regularise(data),
    onSuccess: () => {
      toast.success('Regularisation request submitted')
      setRegulariseModal(null)
      setRegNote('')
      qc.invalidateQueries({ queryKey: ['attendance', 'list'] })
    },
    onError: (err) => toast.error(err.message ?? 'Request failed'),
  })

  const prevMonth = () => setViewMonth(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 })
  const nextMonth = () => setViewMonth(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 })

  const firstDow  = new Date(viewMonth.y, viewMonth.m, 1).getDay()
  const gridCells = [...Array(firstDow).fill(null), ...rows]

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">My Attendance</h1>
          <p className="text-sm text-text-muted mt-0.5">Personal attendance record and history</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(99,102,241,0.2)' }}>
            {['calendar', 'list'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn('px-4 py-2 text-xs font-semibold capitalize transition-all duration-200',
                  view === v ? 'bg-brand-500 text-white' : 'text-text-muted hover:text-text-primary hover:bg-surface-3'
                )}>
                {v}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" icon={<Download size={13} />}
            onClick={() => toast('CSV export coming soon')}>Export</Button>
        </div>
      </div>

      {/* Summary pills */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Present',   val: summary.present,           color: '#10b981' },
          { label: 'Late',      val: summary.late,              color: '#f59e0b' },
          { label: 'Absent',    val: summary.absent,            color: '#ef4444' },
          { label: 'On Leave',  val: summary.leave,             color: '#06b6d4' },
          { label: 'Total hrs', val: `${summary.totalHrs}h`,    color: '#818cf8' },
        ].map(s => (
          <div key={s.label} className="glass-card p-3 text-center">
            {isLoading
              ? <div className="h-5 w-8 mx-auto rounded animate-pulse mb-1" style={{ background: 'rgba(99,102,241,0.1)' }} />
              : <div className="text-lg font-bold" style={{ color: s.color }}>{s.val}</div>
            }
            <div className="text-[10px] text-text-muted mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="w-8 h-8 rounded-xl flex items-center justify-center glass border border-border-subtle hover:border-brand-500/40 text-text-muted hover:text-text-primary transition-all">
          <ChevronLeft size={15} />
        </button>
        <h2 className="text-sm font-semibold text-text-primary">
          {MONTH_NAMES[viewMonth.m]} {viewMonth.y}
        </h2>
        <button onClick={nextMonth} className="w-8 h-8 rounded-xl flex items-center justify-center glass border border-border-subtle hover:border-brand-500/40 text-text-muted hover:text-text-primary transition-all">
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="glass-card p-5">
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="rounded-xl min-h-[52px] animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} />
            ))}
          </div>
        </div>
      )}

      {/* Calendar view */}
      {!isLoading && view === 'calendar' && (
        <div className="glass-card p-5">
          <div className="grid grid-cols-7 mb-2">
            {DAY_SHORT.map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-text-muted uppercase tracking-wider py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {gridCells.map((cell, i) => {
              if (!cell) return <div key={i} />
              const cfg     = STATUS_CFG[cell.status] ?? STATUS_CFG.HOLIDAY
              const isToday = cell.date.toDateString() === today.toDateString()
              const isFuture = cell.date > today
              return (
                <div key={i}
                  className={cn('relative rounded-xl p-1.5 min-h-[52px] flex flex-col items-center justify-between transition-all duration-200 group', !isFuture && 'cursor-pointer hover:scale-105')}
                  style={{
                    background: isFuture ? 'rgba(26,34,54,0.3)' : cfg.bg,
                    border: `1px solid ${isToday ? cfg.color : isFuture ? 'rgba(99,102,241,0.08)' : cfg.color + '30'}`,
                    opacity: isFuture ? 0.4 : 1,
                  }}>
                  <span className={cn('text-[11px] font-bold', isToday ? 'text-white' : 'text-text-secondary')}>
                    {cell.date.getDate()}
                  </span>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: isFuture ? '#475569' : cfg.color }} />
                  {cell.hours > 0 && (
                    <span className="text-[9px] font-semibold" style={{ color: cfg.color }}>{cell.hours}h</span>
                  )}
                  {isToday && (
                    <div className="absolute inset-0 rounded-xl border-2" style={{ borderColor: cfg.color, boxShadow: `0 0 12px ${cfg.color}50` }} />
                  )}
                  {/* Tooltip */}
                  {!isFuture && (
                    <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                      <div className="px-2 py-1 rounded-lg text-[10px] whitespace-nowrap"
                        style={{ background: '#1a2236', border: `1px solid ${cfg.color}40`, color: cfg.color }}>
                        {cfg.label}
                        {cell.checkIn ? ` · ${cell.checkIn.slice(0, 5)}` : ''}
                        {cell.checkOut ? `→${cell.checkOut.slice(0, 5)}` : ''}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-5 pt-4 border-t" style={{ borderColor: 'rgba(99,102,241,0.1)' }}>
            {Object.entries(STATUS_CFG).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: v.color }} />
                <span className="text-[10px] text-text-muted">{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List view */}
      {!isLoading && view === 'list' && (
        <div className="glass-card overflow-hidden" style={{ padding: 0 }}>
          {rows.filter(r => r.status !== 'HOLIDAY').length === 0 ? (
            <div className="py-12 text-center text-xs text-text-muted">No records for this month</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(99,102,241,0.1)' }}>
                    {['Date', 'Day', 'Status', 'Check In', 'Check Out', 'Hours', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(r => r.status !== 'HOLIDAY').map((row, i) => {
                    const cfg     = STATUS_CFG[row.status] ?? STATUS_CFG.PRESENT
                    const isFuture = row.date > today
                    return (
                      <tr key={i}
                        className="transition-colors hover:bg-surface-3/50"
                        style={{ borderBottom: '1px solid rgba(99,102,241,0.06)', opacity: isFuture ? 0.4 : 1 }}>
                        <td className="px-4 py-3 text-text-secondary font-medium text-xs">
                          {row.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-text-muted text-xs">{DAY_SHORT[row.date.getDay()]}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
                            <span className="w-1 h-1 rounded-full" style={{ background: cfg.color }} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-text-secondary">
                          {row.checkIn ? row.checkIn.slice(0, 5) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-text-secondary">
                          {row.checkOut ? row.checkOut.slice(0, 5) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold" style={{ color: row.hours > 0 ? '#818cf8' : '#475569' }}>
                          {row.hours > 0 ? `${row.hours}h` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {row.status === 'ABSENT' && !isFuture && (
                            <button
                              onClick={() => { setRegulariseModal({ key: row.key, date: row.date }); setRegNote('') }}
                              className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors">
                              <AlertCircle size={10} /> Regularise
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Regularise modal */}
      {regulariseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(6,9,18,0.8)', backdropFilter: 'blur(4px)' }}
          onClick={() => setRegulariseModal(null)}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-sm space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-warning-400" />
              <h3 className="text-base font-bold text-text-primary">Regularisation Request</h3>
            </div>
            <p className="text-xs text-text-muted">
              Requesting regularisation for{' '}
              <span className="text-text-secondary font-semibold">
                {regulariseModal.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              . HR will review and approve.
            </p>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Reason</label>
              <textarea
                rows={3}
                placeholder="Explain why you were absent (e.g. medical emergency, power outage…)"
                value={regNote}
                onChange={e => setRegNote(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm text-text-primary resize-none"
                style={{ background: 'rgba(26,34,54,0.6)', border: '1px solid rgba(99,102,241,0.2)', outline: 'none' }}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="primary" fullWidth size="sm"
                icon={regulariseMut.isPending ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                onClick={() => {
                  if (!regNote.trim()) return toast.error('Please provide a reason')
                  regulariseMut.mutate({ date: regulariseModal.key, note: regNote.trim() })
                }}>
                {regulariseMut.isPending ? 'Submitting…' : 'Submit Request'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRegulariseModal(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
