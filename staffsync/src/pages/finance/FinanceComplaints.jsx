import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { payrollApi } from '@/lib/api'
import { MessageCircle, CheckCircle, Clock, AlertCircle, Send, X } from 'lucide-react'

const STATUS_META = {
  open:      { label: 'Open',       color: '#fbbf24', bg: 'rgba(245,158,11,0.15)' },
  in_review: { label: 'In Review',  color: '#818cf8', bg: 'rgba(99,102,241,0.15)' },
  resolved:  { label: 'Resolved',   color: '#34d399', bg: 'rgba(16,185,129,0.15)' },
}

export default function FinanceComplaints() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState(null)
  const [reply, setReply]       = useState('')
  const [filter, setFilter]     = useState('all')

  const { data: complaints = [], isLoading } = useQuery({
    queryKey: ['payroll', 'complaints'],
    queryFn:  payrollApi.complaintList,
    refetchInterval: 30_000,
  })

  const sendReply = useMutation({
    mutationFn: ({ id, r }) => payrollApi.complaintReply(id, r),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['payroll', 'complaints'] })
      setReply('')
    },
  })

  const resolve = useMutation({
    mutationFn: payrollApi.complaintResolve,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['payroll', 'complaints'] })
      setSelected(null)
    },
  })

  const filtered = filter === 'all' ? complaints : complaints.filter((c) => c.status === filter)
  const selected_item = complaints.find((c) => c.id === selected)

  const stats = {
    total:    complaints.length,
    open:     complaints.filter((c) => c.status === 'open').length,
    review:   complaints.filter((c) => c.status === 'in_review').length,
    resolved: complaints.filter((c) => c.status === 'resolved').length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Payslip Complaints</h1>
        <p className="text-text-muted text-sm mt-1">Review and respond to employee payslip disputes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total',    value: stats.total,    color: '#94a3b8' },
          { label: 'Open',     value: stats.open,     color: '#fbbf24' },
          { label: 'In Review',value: stats.review,   color: '#818cf8' },
          { label: 'Resolved', value: stats.resolved, color: '#34d399' },
        ].map((s) => (
          <div key={s.label} className="glass rounded-xl p-4 border border-white/5 text-center">
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-text-muted mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {['all','open','in_review','resolved'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={
              filter === f
                ? { background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }
                : { background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.05)' }
            }
          >
            {f === 'all' ? 'All' : f === 'in_review' ? 'In Review' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        {/* List */}
        <div className="xl:col-span-2 space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-text-muted text-sm">Loading…</div>
          ) : !filtered.length ? (
            <div className="text-center py-8 text-text-muted">
              <MessageCircle size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No complaints{filter !== 'all' ? ` in "${filter}"` : ''}</p>
            </div>
          ) : (
            filtered.map((c) => {
              const sm = STATUS_META[c.status] ?? STATUS_META.open
              return (
                <div
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className="p-4 rounded-xl cursor-pointer border transition-all"
                  style={
                    selected === c.id
                      ? { background: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.3)' }
                      : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{c.full_name ?? c.user_id}</p>
                      <p className="text-xs text-text-muted truncate mt-0.5">{c.subject}</p>
                      <p className="text-[10px] text-text-muted mt-1">{c.period_label}</p>
                    </div>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                      style={{ background: sm.bg, color: sm.color }}
                    >
                      {sm.label}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-2 line-clamp-2 opacity-70">{c.message}</p>
                </div>
              )
            })
          )}
        </div>

        {/* Detail */}
        <div className="xl:col-span-3">
          {!selected_item ? (
            <div className="glass rounded-2xl border border-white/5 h-full min-h-[300px] flex items-center justify-center">
              <div className="text-center text-text-muted">
                <MessageCircle size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Select a complaint to view details</p>
              </div>
            </div>
          ) : (
            <div className="glass rounded-2xl border border-white/5 overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-white/5">
                <div>
                  <p className="font-semibold text-text-primary">{selected_item.full_name}</p>
                  <p className="text-xs text-text-muted">{selected_item.period_label} · {selected_item.email}</p>
                </div>
                <div className="flex gap-2">
                  {selected_item.status !== 'resolved' && (
                    <button
                      onClick={() => resolve.mutate(selected_item.id)}
                      disabled={resolve.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 disabled:opacity-50"
                    >
                      <CheckCircle size={12} /> {resolve.isPending ? 'Resolving…' : 'Mark Resolved'}
                    </button>
                  )}
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Subject & message */}
                <div>
                  <p className="text-sm font-semibold text-text-primary mb-1">{selected_item.subject}</p>
                  <p className="text-sm text-text-secondary bg-surface-3 rounded-xl p-3 leading-relaxed">
                    {selected_item.message}
                  </p>
                  <p className="text-[10px] text-text-muted mt-1">
                    {new Date(selected_item.created_at).toLocaleString()}
                  </p>
                </div>

                {/* Existing reply */}
                {selected_item.reply && (
                  <div className="border-l-2 border-brand-500 pl-4">
                    <p className="text-[10px] text-brand-400 font-semibold uppercase mb-1">Finance Response</p>
                    <p className="text-sm text-text-secondary">{selected_item.reply}</p>
                  </div>
                )}

                {/* Reply form */}
                {selected_item.status !== 'resolved' && (
                  <div className="space-y-3 pt-2">
                    <textarea
                      rows={3}
                      className="w-full bg-surface-3 border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary resize-none"
                      placeholder="Write your response…"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                    />
                    <button
                      onClick={() => sendReply.mutate({ id: selected_item.id, r: reply })}
                      disabled={!reply.trim() || sendReply.isPending}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                    >
                      <Send size={14} /> {sendReply.isPending ? 'Sending…' : 'Send Reply'}
                    </button>
                  </div>
                )}

                {selected_item.status === 'resolved' && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-sm text-emerald-400">
                    <CheckCircle size={16} />
                    Complaint resolved on {new Date(selected_item.resolved_at).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
