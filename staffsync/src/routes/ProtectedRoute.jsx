import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, faceVerified, getRole } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!faceVerified && location.pathname !== '/face-verify') {
    return <Navigate to="/face-verify" state={{ from: location }} replace />
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const role = getRole()
    if (!allowedRoles.includes(role)) {
      return <Navigate to="/unauthorized" replace />
    }
  }

  return children
}
