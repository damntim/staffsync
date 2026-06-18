import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { ProtectedRoute } from './ProtectedRoute'
import { RoleRedirect } from './RoleRedirect'
import { ROLES } from '@/lib/constants'
import { AppShell } from '@/components/layout/AppShell'
import { PageLoader } from '@/components/ui/PageLoader'

/* ── Auth pages ── */
const LoginPage          = lazy(() => import('@/pages/auth/LoginPage'))
const FaceVerifyPage     = lazy(() => import('@/pages/auth/FaceVerifyPage'))
const RegisterPage       = lazy(() => import('@/pages/auth/RegisterPage'))
const FaceEnrollPage     = lazy(() => import('@/pages/auth/FaceEnrollPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const UnauthorizedPage   = lazy(() => import('@/pages/shared/UnauthorizedPage'))
const NotFoundPage       = lazy(() => import('@/pages/shared/NotFoundPage'))

/* ── Employee ── */
const EmployeeDashboard  = lazy(() => import('@/pages/employee/EmployeeDashboard'))
const EmployeeAttendance = lazy(() => import('@/pages/employee/EmployeeAttendance'))
const EmployeeLeave      = lazy(() => import('@/pages/employee/EmployeeLeave'))
const EmployeeTasks      = lazy(() => import('@/pages/employee/EmployeeTasks'))
const EmployeeProfile    = lazy(() => import('@/pages/employee/EmployeeProfile'))
const CheckInPage        = lazy(() => import('@/pages/employee/CheckInPage'))
const EmployeePayslips   = lazy(() => import('@/pages/employee/EmployeePayslips'))

/* ── Manager ── */
const ManagerDashboard   = lazy(() => import('@/pages/manager/ManagerDashboard'))
const ManagerTeam        = lazy(() => import('@/pages/manager/ManagerTeam'))
const ManagerApprovals   = lazy(() => import('@/pages/manager/ManagerApprovals'))
const ManagerTasks       = lazy(() => import('@/pages/manager/ManagerTasks'))
const ManagerPresence    = lazy(() => import('@/pages/manager/ManagerPresence'))
const ManagerReports     = lazy(() => import('@/pages/manager/ManagerReports'))
const ManagerPayroll     = lazy(() => import('@/pages/manager/ManagerPayrollApproval'))

/* ── HR (combined — all HR pages under /dashboard/hr) ── */
const HRDashboard        = lazy(() => import('@/pages/hr-admin/HRAdminDashboard'))
const HRUsers            = lazy(() => import('@/pages/hr-admin/HRAdminUsers'))
const HRInvites          = lazy(() => import('@/pages/hr-admin/HRAdminInvites'))
const HRPolicy           = lazy(() => import('@/pages/hr-admin/HRAdminPolicy'))
const HRGeofence         = lazy(() => import('@/pages/hr-admin/HRAdminGeofence'))
const HRQRCodes          = lazy(() => import('@/pages/hr-admin/HRAdminQRCodes'))
const HRReports          = lazy(() => import('@/pages/hr-admin/HRAdminReports'))
const HRRBAC             = lazy(() => import('@/pages/hr-admin/HRAdminRBAC'))
const HRSync             = lazy(() => import('@/pages/hr-admin/HRAdminSync'))
const HRAudit            = lazy(() => import('@/pages/hr-admin/HRAdminAudit'))
const HRShifts           = lazy(() => import('@/pages/hr-admin/HRAdminShifts'))
const HRPayroll          = lazy(() => import('@/pages/hr-admin/HRAdminPayrollApproval'))
const HRAttendance       = lazy(() => import('@/pages/hr-officer/HROfficerAttendance'))
const HRLeave            = lazy(() => import('@/pages/hr-officer/HROfficerLeave'))
const HRFaceProfiles     = lazy(() => import('@/pages/hr-officer/HROfficerFaceProfiles'))
const HRPresence         = lazy(() => import('@/pages/hr-officer/HROfficerPresence'))

/* ── IT Admin ── */
const ITAdminDashboard   = lazy(() => import('@/pages/it-admin/ITAdminDashboard'))
const ITAdminQRCodes     = lazy(() => import('@/pages/it-admin/ITAdminQRCodes'))
const ITAdminGeofence    = lazy(() => import('@/pages/it-admin/ITAdminGeofence'))
const ITAdminAudit       = lazy(() => import('@/pages/it-admin/ITAdminAudit'))
const ITAdminSecurity    = lazy(() => import('@/pages/it-admin/ITAdminSecurity'))

/* ── Chat (all roles) ── */
const ChatPage = lazy(() => import('@/pages/shared/ChatPage'))

/* ── Finance ── */
const FinanceDashboard = lazy(() => import('@/pages/finance/FinanceDashboard'))
const FinancePayroll   = lazy(() => import('@/pages/finance/FinancePayroll'))
const FinanceSalaries  = lazy(() => import('@/pages/finance/FinanceSalaries'))
const FinancePayslips  = lazy(() => import('@/pages/finance/FinancePayslips'))
const FinanceComplaints= lazy(() => import('@/pages/finance/FinanceComplaints'))
const FinanceDeductions= lazy(() => import('@/pages/finance/FinanceDeductions'))

const E   = [ROLES.EMPLOYEE]
const M   = [ROLES.MANAGER]
const HR  = [ROLES.HR]
const IT  = [ROLES.IT_ADMIN]
const FIN = [ROLES.FINANCE]
const ALL = [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.HR, ROLES.IT_ADMIN, ROLES.FINANCE]

function wrap(element, roles) {
  return (
    <ProtectedRoute allowedRoles={roles}>
      <Suspense fallback={<PageLoader />}>{element}</Suspense>
    </ProtectedRoute>
  )
}

const router = createBrowserRouter([
  /* ── PUBLIC ── */
  { path: '/login',           element: <Suspense fallback={<PageLoader />}><LoginPage /></Suspense> },
  { path: '/register',        element: <Suspense fallback={<PageLoader />}><RegisterPage /></Suspense> },
  { path: '/face-verify',     element: <Suspense fallback={<PageLoader />}><FaceVerifyPage /></Suspense> },
  { path: '/enroll-face',     element: <Suspense fallback={<PageLoader />}><FaceEnrollPage /></Suspense> },
  { path: '/forgot-password', element: <Suspense fallback={<PageLoader />}><ForgotPasswordPage /></Suspense> },
  { path: '/unauthorized',    element: <Suspense fallback={<PageLoader />}><UnauthorizedPage /></Suspense> },

  { path: '/', element: <RoleRedirect /> },

  /* ── PROTECTED SHELL ── */
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute allowedRoles={ALL}>
        <AppShell>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </AppShell>
      </ProtectedRoute>
    ),
    children: [
      /* Shared — every role can check in & see their own attendance */
      { path: 'check-in',            element: wrap(<CheckInPage />,        ALL) },
      { path: 'my-attendance',       element: wrap(<EmployeeAttendance />, ALL) },

      /* Employee */
      { path: 'employee',            element: wrap(<EmployeeDashboard />,  E) },
      { path: 'employee/attendance', element: wrap(<EmployeeAttendance />, E) },
      { path: 'employee/leave',      element: wrap(<EmployeeLeave />,      E) },
      { path: 'employee/tasks',      element: wrap(<EmployeeTasks />,      E) },
      { path: 'employee/profile',    element: wrap(<EmployeeProfile />,    E) },
      { path: 'employee/check-in',   element: wrap(<CheckInPage />,        E) },
      { path: 'employee/payslips',   element: wrap(<EmployeePayslips />,   E) },

      /* Manager */
      { path: 'manager',             element: wrap(<ManagerDashboard />,  M) },
      { path: 'manager/team',        element: wrap(<ManagerTeam />,       M) },
      { path: 'manager/approvals',   element: wrap(<ManagerApprovals />,  M) },
      { path: 'manager/tasks',       element: wrap(<ManagerTasks />,      M) },
      { path: 'manager/presence',    element: wrap(<ManagerPresence />,   M) },
      { path: 'manager/reports',     element: wrap(<ManagerReports />,    M) },
      { path: 'manager/payroll',    element: wrap(<ManagerPayroll />,    M) },

      /* HR — all HR features under /dashboard/hr */
      { path: 'hr',                  element: wrap(<HRDashboard />,       HR) },
      { path: 'hr/users',            element: wrap(<HRUsers />,           HR) },
      { path: 'hr/invites',          element: wrap(<HRInvites />,         HR) },
      { path: 'hr/attendance',       element: wrap(<HRAttendance />,      HR) },
      { path: 'hr/leave',            element: wrap(<HRLeave />,           HR) },
      { path: 'hr/face-profiles',    element: wrap(<HRFaceProfiles />,    HR) },
      { path: 'hr/presence',         element: wrap(<HRPresence />,        HR) },
      { path: 'hr/policy',           element: wrap(<HRPolicy />,          HR) },
      { path: 'hr/geofence',         element: wrap(<HRGeofence />,        HR) },
      { path: 'hr/qrcodes',          element: wrap(<HRQRCodes />,         HR) },
      { path: 'hr/reports',          element: wrap(<HRReports />,         HR) },
      { path: 'hr/rbac',             element: wrap(<HRRBAC />,            HR) },
      { path: 'hr/sync',             element: wrap(<HRSync />,            HR) },
      { path: 'hr/audit',            element: wrap(<HRAudit />,           HR) },
      { path: 'hr/shifts',           element: wrap(<HRShifts />,          HR) },
      { path: 'hr/payroll',          element: wrap(<HRPayroll />,         HR) },

      /* Finance */
      { path: 'finance',             element: wrap(<FinanceDashboard />,  FIN) },
      { path: 'finance/payroll',     element: wrap(<FinancePayroll />,    FIN) },
      { path: 'finance/salaries',    element: wrap(<FinanceSalaries />,   FIN) },
      { path: 'finance/payslips',    element: wrap(<FinancePayslips />,   FIN) },
      { path: 'finance/complaints',  element: wrap(<FinanceComplaints />, FIN) },
      { path: 'finance/deductions',  element: wrap(<FinanceDeductions />, FIN) },

      /* Chat — all roles */
      { path: 'chat',                element: wrap(<ChatPage />,          ALL) },

      /* IT Admin */
      { path: 'it-admin',            element: wrap(<ITAdminDashboard />,  IT) },
      { path: 'it-admin/shifts',     element: wrap(<HRShifts />,          IT) },
      { path: 'it-admin/qrcodes',    element: wrap(<ITAdminQRCodes />,    IT) },
      { path: 'it-admin/geofence',   element: wrap(<ITAdminGeofence />,   IT) },
      { path: 'it-admin/audit',      element: wrap(<ITAdminAudit />,      IT) },
      { path: 'it-admin/security',   element: wrap(<ITAdminSecurity />,   IT) },
    ],
  },

  { path: '*', element: <Suspense fallback={<PageLoader />}><NotFoundPage /></Suspense> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
