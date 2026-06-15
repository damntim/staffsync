/**
 * StaffSync API client
 * All requests go to /api/<module>.php?action=<action>
 * The Vite dev proxy rewrites /api → http://localhost/staff_cecile/api
 */
import { useAuthStore } from '@/store/authStore'

const BASE = '/api'

class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(module, action, { method = 'GET', body, params = {} } = {}) {
  const token = useAuthStore.getState().token

  const url = new URL(`${BASE}/${module}.php`, window.location.origin)
  url.searchParams.set('action', action)
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v))

  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const opts = { method, headers }
  if (body && method !== 'GET') opts.body = JSON.stringify(body)

  const res = await fetch(url.toString(), opts)

  let json
  try { json = await res.json() } catch { json = { success: false, error: 'Invalid response' } }

  // 401 → force logout only if token exists (not a background/optional call)
  if (res.status === 401 && token) {
    // Only hard-logout if it's not an auth-setup endpoint (face verify / enroll)
    const isSetupCall = ['face_verify','face_enroll','face_status'].includes(action)
    if (!isSetupCall) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    throw new ApiError(json.error ?? 'Unauthorized', 401)
  }

  // PHP returns { success: true, data: ... } or { success: false, error: ... }
  if (!res.ok || json.success === false) {
    throw new ApiError(json.error ?? `HTTP ${res.status}`, res.status)
  }

  return json.data ?? json
}

/* ── convenience wrappers ── */
const get  = (mod, action, params)   => request(mod, action, { method: 'GET',  params })
const post = (mod, action, body)     => request(mod, action, { method: 'POST', body  })

// For multipart/form-data (file uploads) — skips Content-Type so browser sets boundary
async function postForm(module, action, formData) {
  const token = useAuthStore.getState().token
  const url = new URL(`${BASE}/${module}.php`, window.location.origin)
  url.searchParams.set('action', action)
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(url.toString(), { method: 'POST', headers, body: formData })
  let json
  try { json = await res.json() } catch { json = { success: false, error: 'Invalid response' } }
  if (!res.ok || json.success === false) throw new ApiError(json.error ?? `HTTP ${res.status}`, res.status)
  return json.data ?? json
}

/* ────────────────────────────────────────────────────
   AUTH
──────────────────────────────────────────────────── */
export const authApi = {
  login:          (email, password)  => post('auth', 'login',          { email, password }),
  logout:         ()                 => post('auth', 'logout',         {}),
  me:             ()                 => get ('auth', 'me'),
  register:       (data)             => post('auth', 'register',       data),
  faceEnroll:     (descriptor)       => post('auth', 'face_enroll',    { descriptor }),
  faceVerify:     (descriptor)       => post('auth', 'face_verify',    { descriptor }),
  inviteVerify:   (token)            => get ('auth', 'invite_verify',  { token }),
  inviteSend:     (data)             => post('auth', 'invite_send',    data),
  inviteList:     ()                 => get ('auth', 'invite_list'),
  inviteResend:   (id)               => post('auth', 'invite_resend',  { invite_id: id }),
  inviteRevoke:   (id)               => post('auth', 'invite_revoke',  { invite_id: id }),
  forgotPassword: (email)            => post('auth', 'password_reset_request', { email }),
  resetPassword:  (token, password)  => post('auth', 'password_reset', { token, password }),
}

/* ────────────────────────────────────────────────────
   ATTENDANCE
──────────────────────────────────────────────────── */
export const attendanceApi = {
  myToday:            ()           => get ('attendance', 'my_today'),
  myList:             (params)     => get ('attendance', 'my_list',        params),
  list:               (params)     => get ('attendance', 'list',           params),
  checkIn:            (data)       => post('attendance', 'checkin',        data),
  checkOut:           (data)       => post('attendance', 'checkout',       data ?? {}),
  regularise:         (data)       => post('attendance', 'regularise',     data),
  approveRegularise:  (id, note)   => post('attendance', 'approve_regularisation', { request_id: id, note }),
  summary:            (params)     => get ('attendance', 'summary',        params),
  teamToday:          ()           => get ('attendance', 'team_today'),
  override:           (data)       => post('attendance', 'override',       data),
}

/* ────────────────────────────────────────────────────
   LEAVE
──────────────────────────────────────────────────── */
export const leaveApi = {
  myLeaves:   (params) => get ('leave', 'my_leaves', params),
  list:       (params) => get ('leave', 'list',      params),
  apply:      (data, file) => {
    if (file) {
      const fd = new FormData()
      Object.entries(data).forEach(([k, v]) => v != null && fd.append(k, v))
      fd.append('document', file)
      return postForm('leave', 'apply', fd)
    }
    return post('leave', 'apply', data)
  },
  approve:    (id, comment) => post('leave', 'approve', { leave_id: id, comment }),
  reject:     (id, comment) => post('leave', 'reject', { leave_id: id, comment }),
  cancel:     (id)     => post('leave', 'cancel',    { leave_id: id }),
  balance:    (userId) => get ('leave', 'balance',  userId ? { user_id: userId } : {}),
  types:      ()       => get ('leave', 'types'),
}

/* ────────────────────────────────────────────────────
   QR / GEOFENCE
──────────────────────────────────────────────────── */
export const qrApi = {
  listZones:    ()       => get ('qr', 'list_zones'),
  zonesPublic:  ()       => get ('qr', 'zones_public'),
  generate:     (zoneId) => post('qr', 'generate',   { zone_id: zoneId }),
  rotate:       (zoneId) => post('qr', 'rotate',     { zone_id: zoneId }),
  validate:     (data)   => post('qr', 'validate',   data),
  createZone:   (data)   => post('qr', 'create_zone', data),
  updateZone:   (data)   => post('qr', 'update_zone', data),
  toggleZone:   (id, active) => post('qr', 'toggle_zone', { zone_id: id, is_active: active }),
  scanLog:      (params) => get ('qr', 'scan_log',   params),
  geofenceCheck:(lat, lng, zoneId) => post('qr', 'geofence_check', { lat, lng, zone_id: zoneId }),
}

/* ────────────────────────────────────────────────────
   FACE
──────────────────────────────────────────────────── */
export const faceApi = {
  status:   ()           => get ('face', 'status'),
  enroll:   (descriptor) => post('face', 'enroll',  { descriptor, gdpr_consent: true }),
  verify:   (descriptor) => post('face', 'verify',  { descriptor }),
  delete:   (userId)     => post('face', 'delete',  { user_id: userId }),
  list:     ()           => get ('face', 'list'),
}

/* ────────────────────────────────────────────────────
   USERS
──────────────────────────────────────────────────── */
export const usersApi = {
  list:           (params) => get ('users', 'list',            params),
  get:            (id)     => get ('users', 'get',             { id }),
  update:         (data)   => post('users', 'update',          data),
  deactivate:     (id)     => post('users', 'deactivate',      { user_id: id }),
  reactivate:     (id)     => post('users', 'reactivate',      { user_id: id }),
  changeRole:     (id, role) => post('users', 'change_role',   { user_id: id, role }),
  changePassword: (data)   => post('users', 'change_password', data),
  bulkInvite:     (form)   => request('users', 'bulk_invite',  { method: 'POST', body: form }),
  pending:        ()       => get ('users', 'pending'),
  resetFace:      (id)     => post('users', 'reset_face',      { user_id: id }),
  deleteUser:     (id)     => post('users', 'delete_user',     { user_id: id }),
}

/* ────────────────────────────────────────────────────
   TASKS
──────────────────────────────────────────────────── */
export const tasksApi = {
  list:           (params) => get ('tasks', 'list',            params),
  get:            (id)     => get ('tasks', 'get',             { id }),
  create:         (data)   => post('tasks', 'create',          data),
  update:         (data)   => post('tasks', 'update',          data),
  delete:         (id)     => post('tasks', 'delete',          { task_id: id }),
  assign:         (taskId, assigneeId) => post('tasks', 'assign', { task_id: taskId, assignee_id: assigneeId }),
  subtaskUpdate:  (subtaskId, isDone)  => post('tasks', 'subtask_update',  { subtask_id: subtaskId, is_done: isDone }),
  progressUpdate: (taskId, pct)        => post('tasks', 'progress_update', { task_id: taskId, progress_pct: pct }),
  commentAdd:     (taskId, text)       => post('tasks', 'comment_add',     { task_id: taskId, text }),
  commentList:    (taskId)             => get ('tasks', 'comment_list',    { task_id: taskId }),
}

/* ────────────────────────────────────────────────────
   SHIFTS
──────────────────────────────────────────────────── */
export const shiftsApi = {
  list:          ()              => get ('shifts', 'list'),
  create:        (data)          => post('shifts', 'create',         data),
  update:        (data)          => post('shifts', 'update',         data),
  delete:        (id)            => post('shifts', 'delete',         { shift_id: id }),
  assign:        (shiftId, userIds) => post('shifts', 'assign',      { shift_id: shiftId, user_ids: userIds }),
  unassign:      (shiftId, userId)  => post('shifts', 'unassign',   { shift_id: shiftId, user_id: userId }),
  members:       (shiftId)       => get ('shifts', 'shift_members',  { shift_id: shiftId }),
  myShift:       ()              => get ('shifts', 'my_shift'),
  holidays:      (params)        => get ('shifts', 'holidays',       params),
  addHoliday:    (data)          => post('shifts', 'add_holiday',    data),
  deleteHoliday: (id)            => post('shifts', 'delete_holiday', { holiday_id: id }),
}

/* ────────────────────────────────────────────────────
   TEAMS
──────────────────────────────────────────────────── */
export const teamsApi = {
  list:         ()         => get ('teams', 'list'),
  get:          (id)       => get ('teams', 'get',           { id }),
  create:       (data)     => post('teams', 'create',        data),
  update:       (data)     => post('teams', 'update',        data),
  delete:       (id)       => post('teams', 'delete',        { team_id: id }),
  addMember:    (teamId, userId, roleTag) => post('teams', 'add_member',    { team_id: teamId, user_id: userId, role_tag: roleTag }),
  removeMember: (teamId, userId)          => post('teams', 'remove_member', { team_id: teamId, user_id: userId }),
  members:      (teamId)   => get ('teams', 'members',       { team_id: teamId }),
  tasks:        (teamId)   => get ('teams', 'tasks',         { team_id: teamId }),
}

/* ────────────────────────────────────────────────────
   REPORTS
──────────────────────────────────────────────────── */
export const reportsApi = {
  attendanceSummary: (params) => get('reports', 'attendance_summary', params),
  leaveSummary:      (params) => get('reports', 'leave_summary',      params),
  punctuality:       (params) => get('reports', 'punctuality',        params),
  faceStatus:        ()       => get('reports', 'face_status'),
  taskCompletion:    (params) => get('reports', 'task_completion',    params),
  geofenceBreaches:  (params) => get('reports', 'geofence_breaches',  params),
  exportCsv:         (type, from, to) => {
    const token = useAuthStore.getState().token
    const url = `/api/reports.php?action=export_csv&type=${type}&from=${from}&to=${to}`
    const a = document.createElement('a')
    a.href = url
    a.setAttribute('download', '')
    // Add auth header via fetch + blob for XAMPP
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(b => {
        a.href = URL.createObjectURL(b)
        a.click()
      })
  },
}

/* ────────────────────────────────────────────────────
   POLICY
──────────────────────────────────────────────────── */
export const policyApi = {
  list:   ()                      => get ('policy', 'list'),
  update: (policy_id, rules)      => post('policy', 'update', { policy_id, rules }),
}

/* ────────────────────────────────────────────────────
   AUDIT
──────────────────────────────────────────────────── */
export const auditApi = {
  list:   (params) => get('audit', 'list',   params),
  stats:  ()       => get('audit', 'stats'),
  export: (from, to) => {
    const token = useAuthStore.getState().token
    fetch(`/api/audit.php?action=export&from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.blob()).then(b => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `audit_${from}_${to}.csv`
      a.click()
    })
  },
}

/* ────────────────────────────────────────────────────
   PAYROLL
──────────────────────────────────────────────────── */
export const payrollApi = {
  /* salary */
  salaryList:        ()             => get ('payroll', 'salary_list'),
  salarySet:         (data)         => post('payroll', 'salary_set',        data),
  /* deductions */
  deductionList:     ()             => get ('payroll', 'deduction_list'),
  deductionAdd:      (data)         => post('payroll', 'deduction_add',     data),
  deductionDelete:   (id)           => post('payroll', 'deduction_delete',  { deduction_id: id }),
  /* runs */
  runList:           ()             => get ('payroll', 'run_list'),
  runCreate:         (data)         => post('payroll', 'run_create',        data),
  runProcess:        (runId)        => post('payroll', 'run_process',       { run_id: runId }),
  runSubmit:         (runId)        => post('payroll', 'run_submit',        { run_id: runId }),
  runApprove:        (runId)        => post('payroll', 'run_approve',       { run_id: runId }),
  runReject:         (runId, reason)=> post('payroll', 'run_reject',        { run_id: runId, reason }),
  runFinalize:       (runId)        => post('payroll', 'run_finalize',      { run_id: runId }),
  /* entries */
  entryList:         (runId)        => get ('payroll', 'entry_list',        { run_id: runId }),
  entryAdjust:       (data)         => post('payroll', 'entry_adjust',      data),
  /* payslips */
  payslipList:       (params)       => get ('payroll', 'payslip_list',      params),
  payslipGet:        (entryId)      => get ('payroll', 'payslip_get',       { entry_id: entryId }),
  payslipSend:       (entryId)      => post('payroll', 'payslip_send',      { entry_id: entryId }),
  payslipPdfUrl:     (entryId, token) => `/api/payroll.php?action=payslip_pdf&entry_id=${entryId}&_token=${token}`,
  /* complaints */
  complaintList:     ()             => get ('payroll', 'complaint_list'),
  complaintAdd:      (data)         => post('payroll', 'complaint_add',     data),
  complaintReply:    (id, reply)    => post('payroll', 'complaint_reply',   { complaint_id: id, reply }),
  complaintResolve:  (id)           => post('payroll', 'complaint_resolve', { complaint_id: id }),
  /* dashboard */
  dashboardStats:    ()             => get ('payroll', 'dashboard_stats'),
}

/* ────────────────────────────────────────────────────
   CHAT
──────────────────────────────────────────────────── */

/** multipart POST for file uploads — bypasses JSON wrapper */
async function postForm(module, action, formData) {
  const token = useAuthStore.getState().token
  const url   = new URL(`${BASE}/${module}.php`, window.location.origin)
  url.searchParams.set('action', action)
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res  = await fetch(url.toString(), { method: 'POST', headers, body: formData })
  let json
  try { json = await res.json() } catch { json = { success: false, error: 'Invalid response' } }
  if (!res.ok || json.success === false) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json.data ?? json
}

export const chatApi = {
  channelList:    ()                => get    ('chat', 'channel_list'),
  channelMembers: (chanId)          => get    ('chat', 'channel_members',  { channel_id: chanId }),
  channelCreate:  (data)            => post   ('chat', 'channel_create',  data),
  channelLeave:   (id)              => post   ('chat', 'channel_leave',   { channel_id: id }),
  dmOpen:         (peerId)          => post   ('chat', 'dm_open',         { peer_user_id: peerId }),
  messageList:    (chanId, params)  => get    ('chat', 'message_list',    { channel_id: chanId, ...params }),
  messageSend:    (data)            => post   ('chat', 'message_send',    data),
  messageSendFile:(formData)        => postForm('chat','message_send',    formData),
  messageDelete:  (id)              => post   ('chat', 'message_delete',  { message_id: id }),
  markRead:       (chanId, msgId)   => post   ('chat', 'mark_read',       { channel_id: chanId, last_message_id: msgId }),
  unreadCounts:   ()                => get    ('chat', 'unread_counts'),
  searchUsers:    (q)               => get    ('chat', 'search_users',    { q }),
  statusList:     ()                => get    ('chat', 'status_list'),
  statusPost:     (formData)        => postForm('chat','status_post',     formData),
  statusView:     (id)              => post   ('chat', 'status_view',     { status_id: id }),
  statusDelete:   (id)              => post   ('chat', 'status_delete',   { status_id: id }),
  react:          (msgId, emoji)    => post   ('chat', 'react',           { message_id: msgId, emoji }),
  removeReaction: (msgId, emoji)    => post   ('chat', 'remove_reaction', { message_id: msgId, emoji }),
}

/* ────────────────────────────────────────────────────
   SYNC
──────────────────────────────────────────────────── */
export const syncApi = {
  status:          () => get ('sync', 'status'),
  trigger:         () => post('sync', 'trigger',          {}),
  history:         () => get ('sync', 'history'),
  tableHealth:     () => get ('sync', 'table_health'),
  resolveConflict: (id, resolution) => post('sync', 'resolve_conflict', { conflict_id: id, resolution }),
}

/* ────────────────────────────────────────────────────
   NOTIFICATIONS
──────────────────────────────────────────────────── */
export const notificationsApi = {
  list:        (limit) => get ('notifications', 'list',        { limit }),
  unreadCount: ()      => get ('notifications', 'unread_count'),
  markRead:    (id)    => post('notifications', 'mark_read',   id ? { notification_id: id } : {}),
  send:        (data)  => post('notifications', 'send',        data),
}

/* ────────────────────────────────────────────────────
   PRESENCE (Module 13 — GPS heartbeat)
──────────────────────────────────────────────────── */
export const presenceApi = {
  heartbeat:  (lat, lng, accuracy) => post('presence', 'heartbeat', { lat, lng, accuracy }),
  liveList:   ()                   => get ('presence', 'live_list'),
  myStatus:   ()                   => get ('presence', 'my_status'),
  exempt:     (userId, reason)     => post('presence', 'exempt',     { user_id: userId, reason }),
  flag:       (userId)             => post('presence', 'flag',       { user_id: userId }),
  clearFlag:  (userId)             => post('presence', 'clear_flag', { user_id: userId }),
  history:    (userId, limit)      => get ('presence', 'history',    { user_id: userId, limit }),
}
