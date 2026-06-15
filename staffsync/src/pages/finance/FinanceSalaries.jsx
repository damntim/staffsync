import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { payrollApi, usersApi } from '@/lib/api'
import { Search, Plus, Edit3, X, Check, AlertCircle } from 'lucide-react'

function fmtRwf(n) {
  return 'RWF ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const EMPTY = {
  user_id: '',
  basic_salary: '',
  pay_frequency: 'monthly',
  has_brd_loan: false,
  overtime_rate: '1.5',
  effective_from: new Date().toISOString().slice(0, 10),
  notes: '',
}

export default function FinanceSalaries() {
  const qc = useQueryClient()
  const [search, setSearch]   = useState('')
  const [showForm, setShowForm]= useState(false)
  const [form, setForm]       = useState(EMPTY)
  const [formError, setFormError] = useState('')

  const { data: salaries = [], isLoading } = useQuery({
    queryKey: ['payroll', 'salaries'],
    queryFn:  payrollApi.salaryList,
  })

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users', 'list'],
    queryFn:  () => usersApi.list({ limit: 200 }),
  })

  const save = useMutation({
    mutationFn: payrollApi.salarySet,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['payroll', 'salaries'] })
      setShowForm(false)
      setForm(EMPTY)
      setFormError('')
    },
    onError: (e) => setFormError(e.message),
  })

  const filtered = salaries.filter(
    (s) => s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
           s.department?.toLowerCase().includes(search.toLowerCase())
  )

  function openEdit(s) {
    setForm({
      user_id:       s.user_id,
      basic_salary:  s.basic_salary,
      pay_frequency: s.pay_frequency,
      has_brd_loan:  !!Number(s.has_brd_loan),
      overtime_rate: s.overtime_rate,
      effective_from:s.effective_from?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      notes:         s.notes ?? '',
    })
    setShowForm(true)
  }

  function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!form.user_id) return setFormError('Select an employee')
    if (!form.basic_salary || Number(form.basic_salary) <= 0) return setFormError('Enter a valid basic salary')
    save.mutate({ ...form, basic_salary: Number(form.basic_salary), overtime_rate: Number(form.overtime_rate), has_brd_loan: form.has_brd_loan ? 1 : 0 })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Salary Configurations</h1>
          <p className="text-text-muted text-sm mt-1">Set basic salary and deduction flags per employee</p>
        </div>
        <button
          onClick={() => { setForm(EMPTY); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
        >
          <Plus size={16} /> Set Salary
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          className="w-full pl-9 pr-4 py-2.5 bg-surface-3 border border-border-default rounded-xl text-sm text-text-primary"
          placeholder="Search employees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="glass-strong rounded-2xl p-6 w-full max-w-lg border border-white/10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-text-primary">
                {form.user_id && salaries.find((s) => s.user_id == form.user_id) ? 'Edit Salary' : 'Set Salary'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary">
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 flex gap-2 text-sm text-danger-400">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Employee select */}
              <div>
                <label className="text-xs text-text-muted font-medium">Employee</label>
                <select
                  required
                  className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary"
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                >
                  <option value="">Select employee…</option>
                  {allUsers.map?.((u) => (
                    <option key={u.id} value={u.id}>{u.full_name} ({u.employee_id})</option>
                  ))}
                </select>
              </div>

              {/* Basic salary */}
              <div>
                <label className="text-xs text-text-muted font-medium">Basic Salary (RWF)</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="1000"
                  className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary"
                  placeholder="e.g. 500000"
                  value={form.basic_salary}
                  onChange={(e) => setForm({ ...form, basic_salary: e.target.value })}
                />
                {form.basic_salary > 0 && (
                  <p className="text-xs text-brand-400 mt-1">{fmtRwf(Number(form.basic_salary))}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted font-medium">Pay Frequency</label>
                  <select
                    className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary"
                    value={form.pay_frequency}
                    onChange={(e) => setForm({ ...form, pay_frequency: e.target.value })}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="biweekly">Bi-weekly</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-muted font-medium">Overtime Rate</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="3"
                    className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary"
                    value={form.overtime_rate}
                    onChange={(e) => setForm({ ...form, overtime_rate: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-text-muted font-medium">Effective From</label>
                <input
                  type="date"
                  className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary"
                  value={form.effective_from}
                  onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                />
              </div>

              {/* BRD loan flag */}
              <label className="flex items-center gap-3 p-3 rounded-xl bg-surface-3 cursor-pointer hover:bg-surface-4 transition-colors">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-brand-500"
                  checked={!!form.has_brd_loan}
                  onChange={(e) => setForm({ ...form, has_brd_loan: e.target.checked })}
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">Has BRD Student Loan</p>
                  <p className="text-xs text-text-muted">8% deduction will be applied automatically</p>
                </div>
              </label>

              <div>
                <label className="text-xs text-text-muted font-medium">Notes (optional)</label>
                <textarea
                  className="w-full mt-1 bg-surface-3 border border-border-default rounded-xl px-3 py-2 text-sm text-text-primary resize-none"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setFormError('') }}
                  className="flex-1 py-2.5 rounded-xl border border-border-default text-sm text-text-secondary hover:bg-surface-3"
                >Cancel</button>
                <button
                  type="submit"
                  disabled={save.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                >{save.isPending ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-16 text-text-muted">Loading…</div>
      ) : !filtered.length ? (
        <div className="text-center py-16 text-text-muted">
          {search ? 'No results for that search.' : 'No salary configurations yet.'}
        </div>
      ) : (
        <div className="glass rounded-2xl border border-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['Employee','Department','Basic Salary','Frequency','OT Rate','BRD Loan','Effective',''].map((h) => (
                  <th key={h} className="py-3 px-4 text-left text-[10px] font-semibold text-text-muted uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-white/2 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-medium text-text-primary">{s.full_name}</div>
                    <div className="text-[10px] text-text-muted">{s.employee_id}</div>
                  </td>
                  <td className="py-3 px-4 text-xs text-text-secondary">{s.department || '—'}</td>
                  <td className="py-3 px-4 text-xs font-bold" style={{ color: '#34d399' }}>{fmtRwf(s.basic_salary)}</td>
                  <td className="py-3 px-4 text-xs text-text-secondary capitalize">{s.pay_frequency}</td>
                  <td className="py-3 px-4 text-xs text-text-secondary">{s.overtime_rate}×</td>
                  <td className="py-3 px-4">
                    {Number(s.has_brd_loan) ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                        <Check size={10} /> Yes (8%)
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-text-muted">{s.effective_from?.slice(0, 10)}</td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => openEdit(s)}
                      className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text-primary"
                    >
                      <Edit3 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
