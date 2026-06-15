import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen mesh-bg flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        {/* Giant 404 */}
        <div className="relative mb-6">
          <div className="text-[120px] font-black leading-none select-none"
            style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              textShadow: 'none',
            }}>
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl font-black gradient-text opacity-80">404</span>
          </div>
        </div>

        <h1 className="text-xl font-bold text-text-primary mb-2">Page not found</h1>
        <p className="text-sm text-text-muted mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={() => navigate('/')}>Go to Dashboard</Button>
          <Button variant="ghost" onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </div>
    </div>
  )
}
