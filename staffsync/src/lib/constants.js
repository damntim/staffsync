export const ROLES = {
  EMPLOYEE: 'EMPLOYEE',
  MANAGER:  'MANAGER',
  HR:       'HR',
  IT_ADMIN: 'IT_ADMIN',
  FINANCE:  'FINANCE',
  SYSTEM:   'SYSTEM',
}

export const ROLE_LABELS = {
  EMPLOYEE: 'Employee',
  MANAGER:  'Manager',
  HR:       'HR',
  IT_ADMIN: 'IT Admin',
  FINANCE:  'Finance',
  SYSTEM:   'System',
}

export const ROLE_COLORS = {
  EMPLOYEE: { bg: 'rgba(99,102,241,0.15)',  text: '#818cf8', border: 'rgba(99,102,241,0.3)'  },
  MANAGER:  { bg: 'rgba(139,92,246,0.15)',  text: '#a78bfa', border: 'rgba(139,92,246,0.3)'  },
  HR:       { bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24', border: 'rgba(245,158,11,0.3)'  },
  IT_ADMIN: { bg: 'rgba(239,68,68,0.15)',   text: '#f87171', border: 'rgba(239,68,68,0.3)'   },
  FINANCE:  { bg: 'rgba(16,185,129,0.15)',  text: '#34d399', border: 'rgba(16,185,129,0.3)'  },
  SYSTEM:   { bg: 'rgba(71,85,105,0.15)',   text: '#94a3b8', border: 'rgba(71,85,105,0.3)'   },
}

export const ATTENDANCE_STATUS = {
  PRESENT:       'PRESENT',
  LATE:          'LATE',
  ABSENT:        'ABSENT',
  ON_LEAVE:      'ON_LEAVE',
  HALF_DAY:      'HALF_DAY',
  WORK_FROM_HOME:'WORK_FROM_HOME',
  HOLIDAY:       'HOLIDAY',
}

export const ATTENDANCE_STATUS_COLORS = {
  PRESENT:        { bg: 'rgba(16,185,129,0.15)', text: '#34d399', dot: '#10b981' },
  LATE:           { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', dot: '#f59e0b' },
  ABSENT:         { bg: 'rgba(239,68,68,0.15)',  text: '#f87171', dot: '#ef4444' },
  ON_LEAVE:       { bg: 'rgba(6,182,212,0.15)',  text: '#22d3ee', dot: '#06b6d4' },
  HALF_DAY:       { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa', dot: '#8b5cf6' },
  WORK_FROM_HOME: { bg: 'rgba(99,102,241,0.15)', text: '#818cf8', dot: '#6366f1' },
  HOLIDAY:        { bg: 'rgba(71,85,105,0.15)',  text: '#94a3b8', dot: '#475569' },
}

export const LEAVE_STATUS = {
  DRAFT:        'DRAFT',
  SUBMITTED:    'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED:     'APPROVED',
  REJECTED:     'REJECTED',
  CANCELLED:    'CANCELLED',
}

export const TASK_STATUS = {
  TODO:        'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED:     'BLOCKED',
  IN_REVIEW:   'IN_REVIEW',
  DONE:        'DONE',
}

export const TASK_PRIORITY = {
  LOW:    'LOW',
  MEDIUM: 'MEDIUM',
  HIGH:   'HIGH',
  URGENT: 'URGENT',
}

export const TASK_PRIORITY_COLORS = {
  LOW:    { bg: 'rgba(71,85,105,0.15)',  text: '#94a3b8', dot: '#475569'  },
  MEDIUM: { bg: 'rgba(6,182,212,0.15)',  text: '#22d3ee', dot: '#06b6d4'  },
  HIGH:   { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', dot: '#f59e0b'  },
  URGENT: { bg: 'rgba(239,68,68,0.15)',  text: '#f87171', dot: '#ef4444'  },
}

export const PRESENCE_STATUS = {
  CHECKED_IN:     'CHECKED_IN',
  INACTIVE_SIGNAL:'INACTIVE_SIGNAL',
  OUT_OF_ZONE:    'OUT_OF_ZONE',
  PRESENCE_DOUBT: 'PRESENCE_DOUBT',
  EXEMPT:         'EXEMPT',
  CHECKED_OUT:    'CHECKED_OUT',
}

export const PRESENCE_STATUS_COLORS = {
  CHECKED_IN:     { color: '#10b981', label: 'Active'         },
  INACTIVE_SIGNAL:{ color: '#f59e0b', label: 'Inactive'       },
  OUT_OF_ZONE:    { color: '#f87171', label: 'Out of Zone'    },
  PRESENCE_DOUBT: { color: '#ef4444', label: 'Flagged'        },
  EXEMPT:         { color: '#06b6d4', label: 'Exempt'         },
  CHECKED_OUT:    { color: '#475569', label: 'Checked Out'    },
}

export const INVITE_STATUS = {
  PENDING:  'PENDING',
  ACCEPTED: 'ACCEPTED',
  EXPIRED:  'EXPIRED',
  REVOKED:  'REVOKED',
}

export const CHECKIN_FLOW_STATES = [
  'QR_SCANNED',
  'GEOFENCE_VALIDATING',
  'GEOFENCE_PASSED',
  'FACE_VERIFYING',
  'VERIFIED',
  'ATTENDANCE_CREATED',
]
