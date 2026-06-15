import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

const ROLE_HOME = {
  EMPLOYEE: '/dashboard/employee',
  MANAGER:  '/dashboard/manager',
  HR:       '/dashboard/hr',
  IT_ADMIN: '/dashboard/it-admin',
  FINANCE:  '/dashboard/finance',
}

export function RoleRedirect() {
  const { isAuthenticated, getRole } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  const home = ROLE_HOME[getRole()] ?? '/login'
  return <Navigate to={home} replace />
}
