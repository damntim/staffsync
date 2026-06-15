import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { payrollApi } from '@/lib/api'
import { Plus, Trash2, Shield, AlertCircle, Info, X } from 'lucide-react'

const SYSTEM_DEDUCTIONS = [
  { name: 'PAYE (Income Tax)',     type: 'percentage', value: 30.0, mandatory: true,  note: 'Applied to all employees. Configurable via Deduction Templates.' },
  { name: 'RSSB Pension',         type: 'percentage', value: 5.0,  mandatory: true,  note: 'Rwanda Social Security Board — employee pension contribution.' },
  { name: 'RSSB Medical',         type: 'percentage', value: 2.5,  mandatory: true,  note: 'Rwanda Social Security Board — community-based health insurance.' },
  { name: 'BRD Student Loan',     type: 'percentage', value: 8.0,  mandatory: false, note: 'Applied only to employees flagged with BRD Student Loan in Salary Config.' },
]

const EMPTY = { name: '', type: 'percentage', value: '', applies_to: 'all', is_mandatory: false, description: '' }

export default function FinanceDeductions() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [error, setError]       = useState('')

  const { data: deductions = [], isLoading } = useQuery({
    queryKey: ['payroll', 'deductions'],
    queryFn:  payrollApi.deductionList,
  })

  const add = useMutation({
    mutationFn: payrollApi.deductionAdd,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['payroll', 'deductions'] }); setShowForm(false); setForm(EMPTY) },
    onError:    (e) => setError(e.message),
  })

  const del = useMutation({
    mutationFn: payrollApi.deductionDelete,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['payroll', 'deductions'] }),
  })

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError('Name required')
    if (!form.value || Number(form.value) <= 0) return setError('Value must be > 0')
    add.mutate({ ...form, value: Number(form.value), is_mandatory: form.is_mandatory ? 1 : 0 })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Deduction Templates</h1>
          <p className="text-text-muted text-sm mt-1">Configure deductions applied during payroll processing</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
        >
          <Plus size={16} /> Add Deduction
        </button>
      </div>

      {/* System deductions info */}
      <div className="glass rounded-2xl p-5 border border-white/5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={16} style={{ color: '#818cf8' }} />
          <h2 className="font-semibold text-text-primary text-sm">Built-in Deductions (Rwanda Statutory)</h2>
        </div>
        <div className="space-y-3">
          {SYSTEM_DEDUCTIONS.map((d) => (
            <div key={d.name} className="flex items-start justify-between p-3 rounded-xl bg-surface-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{d.name}</span>
                  {d.mandatory && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 font-semibold">Mandatory</span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-1">{d.note}</p>
              </div>
              <div className="ml-4 text-right">
                <span className="text-sm font-bold" style={{ color: '#f87171' }}>
                  {d.value}%
                </span>
                <p className="text-[10px] text-text-muted">{d.type}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2 p-3 rounded-xl bg-brand-500/5 border border-brand-500/15">
          <Info size={14} className="text-brand-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-text-muted">
            Add custom deduction templates below to override rates or add org-specific deductions. Custom templates with matching names (e.g. "PAYE") will override the built-in defaults during processing.
          </p>
        </div>
      </div>

      {/* Add form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-md border border-white/10">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-text-primary">Add Deduction Template</h3>
              <button onClick={() => { setShowForm(false); setError('') }} className="text-text-muted hover:text-text-primary">
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 flex gap-2 text-sm text-danger-400">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-text-muted font-medium">Deduction Name</label>
                <input
                  required
                  className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary"
                  placeholder="e.g. PAYE, RSSB Pension, Union Fee…"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted font-medium">Type</label>
                  <select
                    className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (RWF)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-muted font-medium">
                    {form.type === 'percentage' ? 'Rate (%)' : 'Amount (RWF)'}
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step={form.type === 'percentage' ? '0.01' : '1'}
                    className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-text-muted font-medium">Applies To</label>
                <select
                  className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary"
                  value={form.applies_to}
                  onChange={(e) => setForm({ ...form, applies_to: e.target.value })}
                >
                  <option value="all">All Employees</option>
                  <option value="individual">Individual (per-entry adjustment)</option>
                </select>
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-surface-3 cursor-pointer hover:bg-surface-4">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-brand-500"
                  checked={!!form.is_mandatory}
                  onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })}
                />
                <span className="text-sm text-text-primary">Mandatory deduction</span>
              </label>

              <div>
                <label className="text-xs text-text-muted font-medium">Description (optional)</label>
                <textarea
                  rows={2}
                  className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2 text-sm text-text-primary resize-none"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError('') }}
                  className="flex-1 py-2.5 rounded-xl border border-border-default text-sm text-text-secondary hover:bg-surface-3"
                >Cancel</button>
                <button
                  type="submit"
                  disabled={add.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                >{add.isPending ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom deductions */}
      <div>
        <h2 className="font-semibold text-text-primary mb-3">Custom Deduction Templates</h2>
        {isLoading ? (
          <div className="text-center py-8 text-text-muted text-sm">Loading…</div>
        ) : !deductions.length ? (
          <div className="glass rounded-2xl p-8 text-center text-text-muted border border-white/5">
            <p className="text-sm">No custom deductions yet.</p>
            <p className="text-xs mt-1 opacity-60">Add templates to override rates or create org-specific deductions.</p>
          </div>
        ) : (
          <div className="glass rounded-2xl border border-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Name','Type','Value','Applies To','Mandatory','Description',''].map((h) => (
                    <th key={h} className="py-3 px-4 text-left text-[10px] font-semibold text-text-muted uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {deductions.map((d) => (
                  <tr key={d.id} className="hover:bg-white/2 transition-colors">
                    <td className="py-3 px-4 font-medium text-text-primary">{d.name}</td>
                    <td className="py-3 px-4 text-xs text-text-secondary capitalize">{d.type}</td>
                    <td className="py-3 px-4 text-xs font-bold" style={{ color: '#f87171' }}>
                      {d.type === 'percentage' ? `${d.value}%` : `RWF ${Number(d.value).toLocaleString()}`}
                    </td>
                    <td className="py-3 px-4 text-xs text-text-secondary capitalize">{d.applies_to}</td>
                    <td className="py-3 px-4">
                      {Number(d.is_mandatory) ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-400 font-semibold">Yes</span>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-text-muted max-w-[180px] truncate">{d.description || '—'}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => del.mutate(d.id)}
                        disabled={del.isPending}
                        className="p-1.5 rounded-lg hover:bg-danger-500/10 text-text-muted hover:text-danger-400 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
