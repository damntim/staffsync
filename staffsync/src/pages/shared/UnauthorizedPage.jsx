import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { ShieldOff } from 'lucide-react'

export default function UnauthorizedPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()

  return (
    <div className="min-h-screen mesh-bg flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', boxShadow: '0 0 30px rgba(239,68,68,0.15)' }}>
          <ShieldOff size={36} className="text-danger-400" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">Access Denied</h1>
        <p className="text-sm text-text-muted mb-8 leading-relaxed">
          You don't have permission to access this page. Contact your HR administrator if you believe this is an error.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={() => navigate(-1)}>Go Back</Button>
          <Button variant="ghost" onClick={() => navigate(isAuthenticated ? '/' : '/login')}>
            {isAuthenticated ? 'Dashboard' : 'Login'}
          </Button>
        </div>
      </div>
    </div>
  )
}
