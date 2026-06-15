import { NavLink, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { ROLES, ROLE_LABELS, ROLE_COLORS } from '@/lib/constants'
import { cn } from '@/lib/cn'
import {
  LayoutDashboard, Clock, Calendar, CheckSquare, User, QrCode,
  Users, UserPlus, Shield, BarChart3, Settings, MapPin,
  ScanFace, Activity, AlertTriangle, RefreshCw, FileText,
  ChevronLeft, ChevronRight, LogOut, Bell, CalendarClock,
  DollarSign, CreditCard, Receipt, MessageCircle, Wallet,
} from 'lucide-react'

const NAV_CONFIG = {
  [ROLES.EMPLOYEE]: [
    { label: 'Dashboard',   icon: LayoutDashboard, to: '/dashboard/employee'            },
    { label: 'Check In',    icon: QrCode,          to: '/dashboard/employee/check-in'   },
    { label: 'Attendance',  icon: Clock,           to: '/dashboard/employee/attendance'  },
    { label: 'Leave',       icon: Calendar,        to: '/dashboard/employee/leave'       },
    { label: 'My Tasks',    icon: CheckSquare,     to: '/dashboard/employee/tasks'       },
    { label: 'Payslips',    icon: Receipt,         to: '/dashboard/employee/payslips'    },
    { label: 'Profile',     icon: User,            to: '/dashboard/employee/profile'     },
  ],
  [ROLES.MANAGER]: [
    { label: 'Dashboard',   icon: LayoutDashboard, to: '/dashboard/manager'             },
    { label: 'Team',        icon: Users,           to: '/dashboard/manager/team'         },
    { label: 'Approvals',   icon: CheckSquare,     to: '/dashboard/manager/approvals'    },
    { label: 'Tasks',       icon: CheckSquare,     to: '/dashboard/manager/tasks'        },
    { label: 'Presence',    icon: Activity,        to: '/dashboard/manager/presence'     },
    { label: 'Reports',     icon: BarChart3,       to: '/dashboard/manager/reports'      },
    { label: 'Payroll',     icon: DollarSign,      to: '/dashboard/manager/payroll'      },
  ],
  [ROLES.HR]: [
    { label: 'Dashboard',      icon: LayoutDashboard, to: '/dashboard/hr'               },
    { label: 'Users',          icon: Users,           to: '/dashboard/hr/users'         },
    { label: 'Invites',        icon: UserPlus,        to: '/dashboard/hr/invites'       },
    { label: 'Shifts',         icon: CalendarClock,   to: '/dashboard/hr/shifts'        },
    { label: 'Attendance',     icon: Clock,           to: '/dashboard/hr/attendance'    },
    { label: 'Leave',          icon: Calendar,        to: '/dashboard/hr/leave'         },
    { label: 'Face Profiles',  icon: ScanFace,        to: '/dashboard/hr/face-profiles' },
    { label: 'Presence Board', icon: Activity,        to: '/dashboard/hr/presence'      },
    { label: 'Policy',         icon: FileText,        to: '/dashboard/hr/policy'        },
    { label: 'Geofence',       icon: MapPin,          to: '/dashboard/hr/geofence'      },
    { label: 'QR Codes',       icon: QrCode,          to: '/dashboard/hr/qrcodes'       },
    { label: 'Reports',        icon: BarChart3,       to: '/dashboard/hr/reports'       },
    { label: 'Payroll',        icon: DollarSign,      to: '/dashboard/hr/payroll'       },
    { label: 'RBAC',           icon: Shield,          to: '/dashboard/hr/rbac'          },
    { label: 'Sync Engine',    icon: RefreshCw,       to: '/dashboard/hr/sync'          },
    { label: 'Audit Log',      icon: AlertTriangle,   to: '/dashboard/hr/audit'         },
  ],
  [ROLES.IT_ADMIN]: [
    { label: 'Dashboard',  icon: LayoutDashboard, to: '/dashboard/it-admin'             },
    { label: 'QR Codes',   icon: QrCode,          to: '/dashboard/it-admin/qrcodes'     },
    { label: 'Geofence',   icon: MapPin,          to: '/dashboard/it-admin/geofence'    },
    { label: 'Audit Log',  icon: AlertTriangle,   to: '/dashboard/it-admin/audit'       },
    { label: 'Security',   icon: Shield,          to: '/dashboard/it-admin/security'    },
  ],
  [ROLES.FINANCE]: [
    { label: 'Dashboard',   icon: LayoutDashboard, to: '/dashboard/finance'             },
    { label: 'Payroll',     icon: DollarSign,      to: '/dashboard/finance/payroll'     },
    { label: 'Salaries',    icon: Wallet,          to: '/dashboard/finance/salaries'    },
    { label: 'Payslips',    icon: Receipt,         to: '/dashboard/finance/payslips'    },
    { label: 'Deductions',  icon: CreditCard,      to: '/dashboard/finance/deductions'  },
    { label: 'Complaints',  icon: MessageCircle,   to: '/dashboard/finance/complaints'  },
  ],
}

export function Sidebar() {
  const { user, logout, getRole } = useAuthStore()
  const { sidebarCollapsed, collapseSidebar } = useUIStore()
  const location = useLocation()
  const role = getRole()
  const navItems = NAV_CONFIG[role] ?? []
  const roleColor = ROLE_COLORS[role]

  return (
    <aside
      className={cn(
        'flex flex-col h-full glass-strong border-r transition-all duration-300 ease-in-out relative z-20',
        sidebarCollapsed ? 'w-[72px]' : 'w-[240px]'
      )}
      style={{ borderColor: 'rgba(99,102,241,0.25)' }}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center h-16 px-4 border-b flex-shrink-0',
        'border-b',
      )} style={{ borderColor: 'rgba(99,102,241,0.22)' }}>
        <div className="relative w-9 h-9 flex-shrink-0">
          <div
            className="absolute inset-0 rounded-xl"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 16px rgba(99,102,241,0.4)' }}
          />
          <div className="absolute inset-0.5 rounded-[10px] flex items-center justify-center" style={{ background: '#0d1117' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L15 5.5V12.5L9 16L3 12.5V5.5L9 2Z" stroke="url(#sl)" strokeWidth="1.5" fill="none" />
              <path d="M9 2V16M3 5.5L15 12.5M15 5.5L3 12.5" stroke="url(#sl)" strokeWidth="0.75" opacity="0.4" />
              <defs>
                <linearGradient id="sl" x1="0" y1="0" x2="18" y2="18">
                  <stop stopColor="#818cf8" />
                  <stop offset="1" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {!sidebarCollapsed && (
          <div className="ml-3 overflow-hidden">
            <div className="font-bold text-sm gradient-text whitespace-nowrap">StaffSync</div>
            <div className="text-[10px] text-text-muted whitespace-nowrap">DevX Ltd</div>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => collapseSidebar(!sidebarCollapsed)}
          className={cn(
            'ml-auto w-6 h-6 rounded-lg flex items-center justify-center',
            'text-text-muted hover:text-text-primary hover:bg-surface-4',
            'transition-all duration-200 flex-shrink-0'
          )}
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Role badge */}
      {!sidebarCollapsed && (
        <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(99,102,241,0.18)' }}>
          <span
            className="text-[10px] font-bold px-2.5 py-1 rounded-full border tracking-widest uppercase"
            style={{
              background: roleColor?.bg,
              color: roleColor?.text,
              borderColor: roleColor?.border,
            }}
          >
            {ROLE_LABELS[role]}
          </span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.to ||
            (item.to !== `/dashboard/${role?.toLowerCase?.()}` && location.pathname.startsWith(item.to))

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium',
                'transition-all duration-200 group relative',
                isActive
                  ? 'text-brand-300 bg-brand-500/20 border border-brand-500/30'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-3/80 border border-transparent',
                sidebarCollapsed && 'justify-center px-2'
              )}
              title={sidebarCollapsed ? item.label : undefined}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                  style={{ background: '#6366f1', boxShadow: '0 0 8px rgba(99,102,241,0.6)' }}
                />
              )}
              <Icon
                size={17}
                className={cn(
                  'flex-shrink-0 transition-colors',
                  isActive ? 'text-brand-400' : 'text-text-muted group-hover:text-text-secondary'
                )}
              />
              {!sidebarCollapsed && (
                <span className="truncate">{item.label}</span>
              )}

              {/* Tooltip for collapsed state */}
              {sidebarCollapsed && (
                <div className={cn(
                  'absolute left-full ml-3 px-3 py-1.5 rounded-lg text-xs font-medium',
                  'bg-surface-4 border border-border-default text-text-primary',
                  'opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap',
                  'transition-opacity duration-200 z-50',
                  'shadow-lg'
                )}>
                  {item.label}
                </div>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* User footer */}
      <div
        className="border-t p-3"
        style={{ borderColor: 'rgba(99,102,241,0.22)' }}
      >
        <div className={cn(
          'flex items-center gap-3 p-2 rounded-xl',
          'hover:bg-surface-3 transition-colors cursor-pointer group',
          sidebarCollapsed && 'justify-center'
        )}>
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))',
                border: '1px solid rgba(99,102,241,0.3)',
                color: '#818cf8',
              }}
            >
              {user?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
            </div>
            {/* Online dot */}
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
              style={{ background: '#10b981', borderColor: '#0d1117' }}
            />
          </div>

          {!sidebarCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-text-primary truncate">
                  {user?.full_name ?? 'User'}
                </div>
                <div className="text-[10px] text-text-muted truncate">
                  {user?.email ?? ''}
                </div>
              </div>
              <button
                onClick={logout}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-danger-400 p-1 rounded-lg hover:bg-danger-500/10"
                title="Logout"
              >
                <LogOut size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
