import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  Clock, Plus, Edit3, Trash2, Users, Calendar, Save,
  Loader, ChevronDown, ChevronUp, X, UserMinus, Mail,
  Sun, Star, Coffee, CheckCircle, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { shiftsApi, usersApi } from '@/lib/api'

/* ── constants ── */
const DAY_OPTIONS = [
  { value: '1', label: 'Mon' }, { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' }, { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' }, { value: '6', label: 'Sat' },
  { value: '0', label: 'Sun' },
]
const SHIFT_COLORS = [
  '#6366f1','#10b981','#06b6d4','#a78bfa','#f59e0b','#ec4899','#ef4444','#84cc16',
]
const HOLIDAY_TYPES = [
  { value: 'public',   label: 'Public Holiday',  icon: Sun   },
  { value: 'company',  label: 'Company Day Off',  icon: Star  },
  { value: 'optional', label: 'Optional',         icon: Coffee},
]
const HOLIDAY_COLORS = { public: '#f59e0b', company: '#10b981', optional: '#6366f1' }

function emptyShift() {
  return { name:'', description:'', start_time:'09:00', end_time:'17:00', days_of_week:'1,2,3,4,5', grace_minutes:15, color:'#6366f1' }
}
function emptyHoliday() {
  return { name:'', date:'', type:'public', shift_id:'' }
}

function fmtTime(t) { return t ? t.slice(0,5) : '—' }
function daysStr(str) {
  const map = {'1':'Mon','2':'Tue','3':'Wed','4':'Thu','5':'Fri','6':'Sat','0':'Sun'}
  return (str||'').split(',').map(d=>map[d.trim()]||d).join(' · ')
}

/* ══════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════ */
export default function HRAdminShifts() {
  const qc = useQueryClient()

  // which panel is open: 'shift' | 'holiday' | null
  const [panel, setPanel]         = useState(null)
  const [editShift, setEditShift] = useState(null)   // null = create
  const [shiftForm, setShiftForm] = useState(emptyShift())

  const [holidayForm, setHolidayForm] = useState(emptyHoliday())
  const [holYear, setHolYear]         = useState(new Date().getFullYear())

  // expanded shift card (shows members)
  const [expanded, setExpanded] = useState(null)

  // assign modal
  const [assignModal, setAssignModal] = useState(null) // shift object
  const [searchUser, setSearchUser]   = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])

  const upS = (k, v) => setShiftForm(f => ({ ...f, [k]: v }))
  const upH = (k, v) => setHolidayForm(f => ({ ...f, [k]: v }))

  /* ── queries ── */
  const { data: shiftsRaw, isLoading: shiftsLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn:  shiftsApi.list,
    staleTime: 30_000,
  })
  const shifts = Array.isArray(shiftsRaw) ? shiftsRaw : []

  const { data: holidaysRaw, isLoading: holLoading } = useQuery({
    queryKey: ['shifts', 'holidays', holYear],
    queryFn:  () => shiftsApi.holidays({ year: holYear }),
    staleTime: 30_000,
  })
  const holidays = Array.isArray(holidaysRaw) ? holidaysRaw : []

  const { data: allUsersRaw } = useQuery({
    queryKey: ['users', 'list'],
    queryFn:  () => usersApi.list({ limit: 500 }),
    staleTime: 60_000,
    enabled:  !!assignModal,
  })
  const allUsers = Array.isArray(allUsersRaw) ? allUsersRaw : (allUsersRaw?.users ?? [])

  const { data: membersRaw } = useQuery({
    queryKey: ['shifts', 'members', expanded],
    queryFn:  () => shiftsApi.members(expanded),
    enabled:  !!expanded,
    staleTime: 20_000,
  })
  const members = Array.isArray(membersRaw) ? membersRaw : []

  /* ── mutations ── */
  const createMut = useMutation({
    mutationFn: shiftsApi.create,
    onSuccess: () => { toast.success('Shift created'); qc.invalidateQueries({ queryKey:['shifts'] }); closePanel() },
    onError: e => toast.error(e.message),
  })
  const updateMut = useMutation({
    mutationFn: shiftsApi.update,
    onSuccess: () => { toast.success('Shift updated'); qc.invalidateQueries({ queryKey:['shifts'] }); closePanel() },
    onError: e => toast.error(e.message),
  })
  const deleteMut = useMutation({
    mutationFn: shiftsApi.delete,
    onSuccess: () => { toast.success('Shift deleted'); qc.invalidateQueries({ queryKey:['shifts'] }) },
    onError: e => toast.error(e.message),
  })
  const assignMut = useMutation({
    mutationFn: ({ shiftId, userIds }) => shiftsApi.assign(shiftId, userIds),
    onSuccess: (_, vars) => {
      toast.success(`Assigned ${vars.userIds.length} user(s) — email sent`)
      qc.invalidateQueries({ queryKey:['shifts'] })
      qc.invalidateQueries({ queryKey:['shifts','members', vars.shiftId] })
      setAssignModal(null); setSelectedUsers([]); setSearchUser('')
    },
    onError: e => toast.error(e.message),
  })
  const unassignMut = useMutation({
    mutationFn: ({ shiftId, userId }) => shiftsApi.unassign(shiftId, userId),
    onSuccess: () => { toast.success('Removed from shift'); qc.invalidateQueries({ queryKey:['shifts'] }); qc.invalidateQueries({ queryKey:['shifts','members',expanded] }) },
    onError: e => toast.error(e.message),
  })
  const addHolMut = useMutation({
    mutationFn: shiftsApi.addHoliday,
    onSuccess: () => { toast.success('Holiday added'); qc.invalidateQueries({ queryKey:['shifts','holidays'] }); setHolidayForm(emptyHoliday()) },
    onError: e => toast.error(e.message?.includes('already') ? 'A holiday already exists on that date for this shift' : e.message),
  })
  const delHolMut = useMutation({
    mutationFn: shiftsApi.deleteHoliday,
    onSuccess: () => { toast.success('Holiday removed'); qc.invalidateQueries({ queryKey:['shifts','holidays'] }) },
    onError: e => toast.error(e.message),
  })

  /* ── helpers ── */
  function openCreate() { setEditShift(null); setShiftForm(emptyShift()); setPanel('shift') }
  function openEdit(s)  { setEditShift(s); setShiftForm({ name:s.name, description:s.description??'', start_time:fmtTime(s.start_time), end_time:fmtTime(s.end_time), days_of_week:s.days_of_week, grace_minutes:s.grace_minutes, color:s.color }); setPanel('shift') }
  function closePanel() { setPanel(null); setEditShift(null); setShiftForm(emptyShift()); setHolidayForm(emptyHoliday()) }

  function saveShift() {
    if (!shiftForm.name.trim()) return toast.error('Shift name required')
    if (!shiftForm.days_of_week) return toast.error('Select at least one working day')
    const payload = { ...shiftForm, start_time: shiftForm.start_time+':00', end_time: shiftForm.end_time+':00', grace_minutes: +shiftForm.grace_minutes }
    if (editShift) updateMut.mutate({ shift_id: editShift.id, ...payload })
    else           createMut.mutate(payload)
  }

  function toggleDay(d) {
    const days = shiftForm.days_of_week ? shiftForm.days_of_week.split(',').filter(Boolean) : []
    const next = days.includes(d) ? days.filter(x=>x!==d) : [...days, d]
    next.sort(); upS('days_of_week', next.join(','))
  }

  const filteredUsers = useMemo(() => {
    if (!allUsers.length || !assignModal) return []
    const q = searchUser.toLowerCase()
    const memberIds = new Set(members.map(m=>m.id))
    return allUsers.filter(u =>
      u.id !== assignModal.id &&
      !memberIds.has(u.id) &&
      (u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.employee_id?.toLowerCase?.()?.includes(q))
    )
  }, [allUsers, searchUser, assignModal, members])

  const isSaving = createMut.isPending || updateMut.isPending

  /* ── grouped holidays by month ── */
  const holByMonth = useMemo(() => {
    const groups = {}
    holidays.forEach(h => {
      const m = h.date?.slice(0,7) ?? 'unknown'
      if (!groups[m]) groups[m] = []
      groups[m].push(h)
    })
    return groups
  }, [holidays])

  return (
    <div className="space-y-5 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h2 text-text-primary">Shift Management</h1>
          <p className="text-sm text-text-muted mt-0.5">Create shifts, assign employees, manage holidays</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" icon={<Sun size={13}/>}
            onClick={() => setPanel(p => p === 'holiday' ? null : 'holiday')}>
            Holidays
          </Button>
          <Button variant="primary" size="sm" icon={<Plus size={13}/>} onClick={openCreate}>
            New Shift
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Active shifts',    val: shifts.filter(s=>s.is_active).length,            color:'#6366f1' },
          { label:'Employees assigned', val: shifts.reduce((a,s)=>a+(+s.member_count||0),0), color:'#10b981' },
          { label:'Holidays this year', val: holidays.length,                               color:'#f59e0b' },
        ].map(s => (
          <div key={s.label} className="glass-card p-4 text-center">
            <div className="text-2xl font-black mb-0.5" style={{ color: s.color }}>
              {s.val}
            </div>
            <div className="text-[10px] text-text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Shift form panel ── */}
      {panel === 'shift' && (
        <div className="glass-card p-5" style={{ borderColor:'rgba(99,102,241,0.25)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-brand-400" />
              <h2 className="text-sm font-semibold text-text-primary">{editShift ? 'Edit Shift' : 'New Shift'}</h2>
            </div>
            <button onClick={closePanel} className="p-1 rounded-lg text-text-muted hover:text-text-primary"><X size={14}/></button>
          </div>

          {/* Name + color row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Input label="Shift name" value={shiftForm.name} onChange={e=>upS('name',e.target.value)} placeholder="Morning Shift" />
            <div>
              <label className="block text-[10px] font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Colour</label>
              <div className="flex gap-2 flex-wrap">
                {SHIFT_COLORS.map(c => (
                  <button key={c} onClick={()=>upS('color',c)}
                    className="w-7 h-7 rounded-lg border-2 transition-all"
                    style={{ background:c, borderColor: shiftForm.color===c ? 'white' : 'transparent', boxShadow: shiftForm.color===c ? `0 0 10px ${c}` : 'none' }} />
                ))}
              </div>
            </div>
          </div>

          <div className="mb-3">
            <Input label="Description (optional)" value={shiftForm.description} onChange={e=>upS('description',e.target.value)} placeholder="Standard office hours" />
          </div>

          {/* Time + grace */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Start time</label>
              <input type="time" value={shiftForm.start_time} onChange={e=>upS('start_time',e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm border text-text-primary outline-none focus:border-brand-500 transition-all"
                style={{ background:'rgba(26,34,54,0.5)', borderColor:'rgba(99,102,241,0.2)' }} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-text-muted mb-1.5 uppercase tracking-wider">End time</label>
              <input type="time" value={shiftForm.end_time} onChange={e=>upS('end_time',e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm border text-text-primary outline-none focus:border-brand-500 transition-all"
                style={{ background:'rgba(26,34,54,0.5)', borderColor:'rgba(99,102,241,0.2)' }} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Grace (min)</label>
              <input type="number" min={0} max={60} value={shiftForm.grace_minutes} onChange={e=>upS('grace_minutes',e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm border text-text-primary outline-none focus:border-brand-500 transition-all"
                style={{ background:'rgba(26,34,54,0.5)', borderColor:'rgba(99,102,241,0.2)' }} />
            </div>
          </div>

          {/* Working days */}
          <div className="mb-4">
            <label className="block text-[10px] font-semibold text-text-muted mb-2 uppercase tracking-wider">Working days</label>
            <div className="flex gap-2 flex-wrap">
              {DAY_OPTIONS.map(d => {
                const active = (shiftForm.days_of_week||'').split(',').includes(d.value)
                return (
                  <button key={d.value} onClick={()=>toggleDay(d.value)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={{
                      background: active ? shiftForm.color+'22' : 'rgba(26,34,54,0.5)',
                      border:     `1px solid ${active ? shiftForm.color+'66' : 'rgba(99,102,241,0.12)'}`,
                      color:      active ? shiftForm.color : '#64748b',
                    }}>
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="primary" size="sm" icon={isSaving ? <Loader size={12} className="animate-spin"/> : <Save size={12}/>}
              onClick={saveShift} disabled={isSaving}>
              {editShift ? 'Save Changes' : 'Create Shift'}
            </Button>
            <Button variant="ghost" size="sm" onClick={closePanel}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── Holiday form panel ── */}
      {panel === 'holiday' && (
        <div className="glass-card p-5" style={{ borderColor:'rgba(245,158,11,0.2)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sun size={14} className="text-yellow-400" />
              <h2 className="text-sm font-semibold text-text-primary">Add Holiday / Day Off</h2>
            </div>
            <button onClick={closePanel} className="p-1 rounded-lg text-text-muted hover:text-text-primary"><X size={14}/></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Input label="Holiday name" value={holidayForm.name} onChange={e=>upH('name',e.target.value)} placeholder="Christmas Day" />
            <div>
              <label className="block text-[10px] font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Date</label>
              <input type="date" value={holidayForm.date} onChange={e=>upH('date',e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm border text-text-primary outline-none focus:border-brand-500 transition-all"
                style={{ background:'rgba(26,34,54,0.5)', borderColor:'rgba(99,102,241,0.2)' }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {/* Type */}
            <div>
              <label className="block text-[10px] font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Type</label>
              <div className="flex gap-2">
                {HOLIDAY_TYPES.map(t => {
                  const Icon = t.icon
                  const active = holidayForm.type === t.value
                  const col = HOLIDAY_COLORS[t.value]
                  return (
                    <button key={t.value} onClick={()=>upH('type',t.value)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all"
                      style={{ background: active ? col+'22' : 'rgba(26,34,54,0.5)', border:`1px solid ${active ? col+'55' : 'rgba(99,102,241,0.1)'}`, color: active ? col : '#64748b' }}>
                      <Icon size={10}/>{t.label}
                    </button>
                  )
                })}
              </div>
            </div>
            {/* Apply to shift */}
            <div>
              <label className="block text-[10px] font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Apply to shift (optional)</label>
              <select value={holidayForm.shift_id} onChange={e=>upH('shift_id',e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm border text-text-primary outline-none focus:border-brand-500 transition-all"
                style={{ background:'rgba(26,34,54,0.5)', borderColor:'rgba(99,102,241,0.2)' }}>
                <option value="">All shifts (global)</option>
                {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <Button variant="primary" size="sm" icon={addHolMut.isPending ? <Loader size={12} className="animate-spin"/> : <Plus size={12}/>}
            onClick={() => {
              if (!holidayForm.name.trim() || !holidayForm.date) return toast.error('Name and date required')
              addHolMut.mutate({ ...holidayForm, shift_id: holidayForm.shift_id || null })
            }}
            disabled={addHolMut.isPending}>
            Add Holiday
          </Button>
        </div>
      )}

      {/* ── Shifts list + holidays side by side ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Shifts (left, 2/3) */}
        <div className="xl:col-span-2 space-y-3">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">All Shifts</h2>

          {shiftsLoading && Array.from({length:3}).map((_,i)=>(
            <div key={i} className="glass-card h-20 animate-pulse" style={{ background:'rgba(99,102,241,0.07)' }} />
          ))}

          {!shiftsLoading && shifts.length === 0 && (
            <div className="glass-card p-8 text-center">
              <Clock size={28} className="mx-auto text-text-muted mb-2 opacity-40" />
              <p className="text-sm text-text-muted">No shifts yet — create one to get started</p>
            </div>
          )}

          {shifts.map(shift => {
            const isExpanded = expanded === shift.id
            const col = shift.color || '#6366f1'
            return (
              <div key={shift.id} className="glass-card overflow-hidden" style={{ borderLeft:`3px solid ${col}` }}>
                {/* Shift header */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background:col+'18', border:`1px solid ${col}30` }}>
                      <Clock size={16} style={{ color:col }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-bold text-text-primary">{shift.name}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                          style={{ background: shift.is_active ? 'rgba(16,185,129,0.12)':'rgba(71,85,105,0.15)', color: shift.is_active ? '#10b981':'#64748b' }}>
                          {shift.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded ml-auto"
                          style={{ background:`${col}18`, color:col }}>
                          {shift.member_count ?? 0} members
                        </span>
                      </div>
                      {shift.description && <p className="text-[10px] text-text-muted mb-1">{shift.description}</p>}
                      <div className="flex flex-wrap gap-3 text-[10px] text-text-muted">
                        <span><span className="text-text-secondary font-semibold">{fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}</span></span>
                        <span>{daysStr(shift.days_of_week)}</span>
                        <span>{shift.grace_minutes}min grace</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={()=>{ setAssignModal(shift); setExpanded(shift.id) }}
                        className="p-1.5 rounded-lg transition-all hover:scale-110"
                        style={{ background:'rgba(16,185,129,0.1)', color:'#10b981' }} title="Assign users">
                        <Users size={11}/>
                      </button>
                      <button onClick={()=>openEdit(shift)}
                        className="p-1.5 rounded-lg transition-all hover:scale-110"
                        style={{ background:'rgba(99,102,241,0.1)', color:'#818cf8' }} title="Edit">
                        <Edit3 size={11}/>
                      </button>
                      <button onClick={()=>{ if(confirm(`Delete "${shift.name}"?`)) deleteMut.mutate(shift.id) }}
                        className="p-1.5 rounded-lg transition-all hover:scale-110"
                        style={{ background:'rgba(239,68,68,0.1)', color:'#ef4444' }} title="Delete">
                        <Trash2 size={11}/>
                      </button>
                      <button onClick={()=>setExpanded(isExpanded ? null : shift.id)}
                        className="p-1.5 rounded-lg transition-all"
                        style={{ background:'rgba(99,102,241,0.07)', color:'#64748b' }}>
                        {isExpanded ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded: member list */}
                {isExpanded && (
                  <div className="border-t px-4 py-3" style={{ borderColor:'rgba(99,102,241,0.08)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Members ({members.length})</p>
                      <button onClick={()=>setAssignModal(shift)}
                        className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-all"
                        style={{ background:'rgba(16,185,129,0.1)', color:'#10b981' }}>
                        <Plus size={9}/> Assign
                      </button>
                    </div>
                    {members.length === 0 ? (
                      <p className="text-[10px] text-text-muted py-2">No employees assigned yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {members.map(m => (
                          <div key={m.id} className="flex items-center gap-2 py-1">
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                              style={{ background:col+'22', color:col }}>
                              {m.full_name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-semibold text-text-primary truncate">{m.full_name}</p>
                              <p className="text-[9px] text-text-muted truncate">{m.email}</p>
                            </div>
                            <span className="text-[9px] text-text-muted">{m.department}</span>
                            <button onClick={()=>unassignMut.mutate({ shiftId:shift.id, userId:m.id })}
                              className="p-1 rounded hover:bg-danger-500/10 text-text-muted hover:text-danger-400 transition-all flex-shrink-0"
                              title="Remove from shift">
                              <UserMinus size={10}/>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Holidays calendar (right, 1/3) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Holidays & Days Off</h2>
            <div className="flex items-center gap-1">
              <button onClick={()=>setHolYear(y=>y-1)} className="p-1 rounded text-text-muted hover:text-text-primary">‹</button>
              <span className="text-xs font-bold text-text-secondary">{holYear}</span>
              <button onClick={()=>setHolYear(y=>y+1)} className="p-1 rounded text-text-muted hover:text-text-primary">›</button>
            </div>
          </div>

          {holLoading && <div className="glass-card h-40 animate-pulse" style={{ background:'rgba(245,158,11,0.05)' }} />}

          {!holLoading && holidays.length === 0 && (
            <div className="glass-card p-6 text-center">
              <Sun size={22} className="mx-auto text-yellow-400 mb-2 opacity-50" />
              <p className="text-xs text-text-muted">No holidays for {holYear}</p>
              <button className="mt-2 text-[10px] text-brand-400 hover:underline" onClick={()=>setPanel('holiday')}>Add one</button>
            </div>
          )}

          {Object.entries(holByMonth).map(([month, hols]) => (
            <div key={month} className="glass-card overflow-hidden">
              <div className="px-3 py-2 flex items-center gap-2"
                style={{ background:'rgba(245,158,11,0.06)', borderBottom:'1px solid rgba(245,158,11,0.12)' }}>
                <Calendar size={11} className="text-yellow-400" />
                <span className="text-[10px] font-bold text-yellow-400">
                  {new Date(month+'-01').toLocaleString('en-GB',{month:'long',year:'numeric'})}
                </span>
              </div>
              <div className="divide-y" style={{ borderColor:'rgba(99,102,241,0.06)' }}>
                {hols.map(h => {
                  const col = HOLIDAY_COLORS[h.type] ?? '#f59e0b'
                  const TypeIcon = HOLIDAY_TYPES.find(t=>t.value===h.type)?.icon ?? Sun
                  return (
                    <div key={h.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background:col+'15', border:`1px solid ${col}25` }}>
                        <TypeIcon size={12} style={{ color:col }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-text-primary truncate">{h.name}</p>
                        <p className="text-[9px] text-text-muted">
                          {new Date(h.date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
                          {h.shift_id ? '' : ' · All shifts'}
                        </p>
                      </div>
                      <button onClick={()=>delHolMut.mutate(h.id)}
                        className="p-1 rounded text-text-muted hover:text-danger-400 hover:bg-danger-500/10 transition-all flex-shrink-0">
                        <X size={10}/>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Assign modal ── */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background:'rgba(6,9,18,0.8)', backdropFilter:'blur(8px)' }}>
          <div className="glass-strong rounded-2xl w-full max-w-lg overflow-hidden"
            style={{ border:'1px solid rgba(99,102,241,0.25)', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor:'rgba(99,102,241,0.12)' }}>
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: assignModal.color || '#6366f1' }} />
                  <h2 className="text-sm font-bold text-text-primary">Assign to: {assignModal.name}</h2>
                </div>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {fmtTime(assignModal.start_time)} – {fmtTime(assignModal.end_time)} · {daysStr(assignModal.days_of_week)}
                </p>
              </div>
              <button onClick={()=>{setAssignModal(null);setSelectedUsers([]);setSearchUser('')}}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3">
                <X size={14}/>
              </button>
            </div>

            {/* Email notice */}
            <div className="px-5 py-2.5 flex items-center gap-2"
              style={{ background:'rgba(16,185,129,0.05)', borderBottom:'1px solid rgba(16,185,129,0.1)' }}>
              <Mail size={11} className="text-success-400 flex-shrink-0" />
              <p className="text-[10px] text-success-400">Each assigned employee will receive a shift confirmation email.</p>
            </div>

            {/* Search */}
            <div className="p-4 border-b" style={{ borderColor:'rgba(99,102,241,0.08)' }}>
              <input value={searchUser} onChange={e=>setSearchUser(e.target.value)}
                placeholder="Search by name, email or ID…"
                className="w-full h-9 px-3 rounded-xl text-sm border text-text-primary placeholder:text-text-muted outline-none focus:border-brand-500 transition-all"
                style={{ background:'rgba(26,34,54,0.5)', borderColor:'rgba(99,102,241,0.15)' }} />
            </div>

            {/* User list */}
            <div className="overflow-y-auto flex-1 px-4 py-2">
              {filteredUsers.length === 0 && (
                <p className="text-xs text-text-muted text-center py-6">
                  {searchUser ? 'No users match your search' : 'All users already assigned to this shift'}
                </p>
              )}
              {filteredUsers.map(u => {
                const sel = selectedUsers.includes(u.id)
                return (
                  <button key={u.id} onClick={()=>setSelectedUsers(s=>sel?s.filter(x=>x!==u.id):[...s,u.id])}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-all"
                    style={{ background: sel ? 'rgba(99,102,241,0.1)' : 'transparent', border:`1px solid ${sel?'rgba(99,102,241,0.3)':'transparent'}` }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                      style={{ background:'rgba(99,102,241,0.15)', color:'#818cf8' }}>
                      {u.full_name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary truncate">{u.full_name}</p>
                      <p className="text-[10px] text-text-muted truncate">{u.email} · {u.department}</p>
                    </div>
                    {sel && <CheckCircle size={14} className="text-brand-400 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>

            {/* Confirm */}
            <div className="p-4 border-t flex items-center justify-between gap-3" style={{ borderColor:'rgba(99,102,241,0.1)' }}>
              <span className="text-xs text-text-muted">
                {selectedUsers.length > 0 ? `${selectedUsers.length} selected` : 'Select employees above'}
              </span>
              <Button variant="primary" size="sm"
                icon={assignMut.isPending ? <Loader size={12} className="animate-spin"/> : <Mail size={12}/>}
                onClick={()=>assignMut.mutate({ shiftId: assignModal.id, userIds: selectedUsers })}
                disabled={!selectedUsers.length || assignMut.isPending}>
                Assign & Send Email
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
