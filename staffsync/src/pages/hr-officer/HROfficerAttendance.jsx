import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { attendanceApi } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Clock, Search, AlertTriangle, CheckCircle, Edit3 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

const STATUS_CFG = {
  PRESENT:        { label: 'Present',  color: '#10b981' },
  LATE:           { label: 'Late',     color: '#f59e0b' },
  ABSENT:         { label: 'Absent',   color: '#ef4444' },
  ON_LEAVE:       { label: 'On Leave', color: '#06b6d4' },
  HALF_DAY:       { label: 'Half Day', color: '#8b5cf6' },
  WORK_FROM_HOME: { label: 'WFH',      color: '#6366f1' },
  HOLIDAY:        { label: 'Holiday',  color: '#475569' },
}

export default function HROfficerAttendance() {
  const qc = useQueryClient()
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')
  const [modal,  setModal]    = useState(null)  // { record } for regularisation
  const [form,   setForm]     = useState({ check_in: '', check_out: '', reason: '' })

  const today = new Date().toISOString().slice(0,10)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['attendance','list','officer-today'],
    queryFn:  () => attendanceApi.list({ from: today, to: today, limit: 200 }),
    refetchInterval: 60_000,
  })

  const regulariseMut = useMutation({
    mutationFn: (data) => attendanceApi.override(data),
    onSuccess: () => {
      toast.success('Attendance corrected')
      setModal(null)
      qc.invalidateQueries({ queryKey: ['attendance'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const records = Array.isArray(raw) ? raw : []
  const filtered = records.filter(r => {
    const matchSearch = !search || (r.full_name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || r.status === filter
    return matchSearch && matchFilter
  })

  const counts = {
    PRESENT:  records.filter(r => r.status === 'PRESENT').length,
    LATE:     records.filter(r => r.status === 'LATE').length,
    ABSENT:   records.filter(r => r.status === 'ABSENT').length,
    ON_LEAVE: records.filter(r => r.status === 'ON_LEAVE').length,
  }

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Attendance</h1>
        <p className="text-sm text-text-muted mt-0.5">Today's attendance — {today}</p>
      </div>

      {/* Summary pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(counts).map(([s, n]) => {
          const cfg = STATUS_CFG[s]
          return (
            <button key={s} onClick={() => setFilter(filter === s ? 'all' : s)}
              className={cn('glass-card p-4 text-left transition-all hover:scale-[1.02]', filter === s && 'ring-1')}
              style={{ ringColor: cfg.color }}>
              <div className="text-2xl font-black mb-1" style={{ color: cfg.color }}>{n}</div>
              <div className="text-xs text-text-muted">{cfg.label}</div>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="glass-card p-4">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…"
            className="w-full pl-8 pr-3 py-2 rounded-xl text-sm bg-transparent border text-text-primary placeholder:text-text-muted outline-none focus:border-brand-500"
            style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(26,34,54,0.4)' }} />
        </div>
      </div>

      {/* Records table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(99,102,241,0.1)' }}>
                {['Employee','Status','Check In','Check Out','Hours','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({length:5}).map((_,i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-5 rounded animate-pulse" style={{ background: 'rgba(99,102,241,0.07)' }} /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted">No records found</td></tr>
              ) : (
                filtered.map(r => {
                  const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.ABSENT
                  return (
                    <tr key={r.id ?? r.user_id} style={{ borderBottom: '1px solid rgba(99,102,241,0.06)' }}
                      className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-text-primary">{r.full_name ?? '—'}</div>
                        <div className="text-text-muted">{r.employee_id ?? ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: cfg.color+'18', color: cfg.color }}>{cfg.label}</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary font-mono">{r.check_in_time?.slice(0,5) ?? '—'}</td>
                      <td className="px-4 py-3 text-text-secondary font-mono">{r.check_out_time?.slice(0,5) ?? '—'}</td>
                      <td className="px-4 py-3 text-text-secondary">{r.total_hours ? `${Number(r.total_hours).toFixed(1)}h` : '—'}</td>
                      <td className="px-4 py-3">
                        {(r.status === 'ABSENT' || r.status === 'LATE') && (
                          <button onClick={() => { setModal(r); setForm({ check_in: r.check_in_time?.slice(0,5) ?? '', check_out: r.check_out_time?.slice(0,5) ?? '', reason: '' }) }}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all hover:scale-105"
                            style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
                            <Edit3 size={10} /> Override
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Override modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="glass-card p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-text-primary">Override Attendance</h3>
            <p className="text-xs text-text-muted">{modal.full_name} · {today}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">Check In</label>
                <input type="time" value={form.check_in} onChange={e => setForm(p => ({ ...p, check_in: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-transparent border text-text-primary outline-none focus:border-brand-500"
                  style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(26,34,54,0.4)' }} />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Check Out</label>
                <input type="time" value={form.check_out} onChange={e => setForm(p => ({ ...p, check_out: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-transparent border text-text-primary outline-none focus:border-brand-500"
                  style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(26,34,54,0.4)' }} />
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Reason</label>
              <textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="Reason for override…" rows={2}
                className="w-full px-3 py-2 rounded-xl text-sm bg-transparent border text-text-primary placeholder:text-text-muted outline-none resize-none focus:border-brand-500"
                style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(26,34,54,0.4)' }} />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setModal(null)}>Cancel</Button>
              <Button variant="primary" size="sm" className="flex-1" loading={regulariseMut.isPending}
                onClick={() => regulariseMut.mutate({ user_id: modal.user_id ?? modal.id, date: today, check_in: form.check_in, check_out: form.check_out, reason: form.reason })}>
                Save Override
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
