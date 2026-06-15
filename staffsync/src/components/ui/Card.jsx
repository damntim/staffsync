import { cn } from '@/lib/cn'

export function Card({ children, className, glow, hover = true, padding = true, ...props }) {
  return (
    <div
      className={cn(
        'glass-card relative overflow-hidden',
        hover && 'transition-all duration-300',
        padding && 'p-6',
        glow && `glow-${glow}`,
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className, ...props }) {
  return (
    <div className={cn('flex items-center justify-between mb-5', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className, ...props }) {
  return (
    <h3 className={cn('text-h3 text-text-primary', className)} {...props}>
      {children}
    </h3>
  )
}

export function CardContent({ children, className, ...props }) {
  return (
    <div className={cn(className)} {...props}>
      {children}
    </div>
  )
}

export function StatCard({ label, value, icon, trend, color = 'brand', sublabel, className }) {
  const colorMap = {
    brand:   { icon: 'text-brand-400',   bg: 'bg-brand-500/10',   border: 'border-brand-500/20'   },
    accent:  { icon: 'text-accent-400',  bg: 'bg-accent-500/10',  border: 'border-accent-500/20'  },
    success: { icon: 'text-success-400', bg: 'bg-success-500/10', border: 'border-success-500/20' },
    warning: { icon: 'text-warning-400', bg: 'bg-warning-500/10', border: 'border-warning-500/20' },
    danger:  { icon: 'text-danger-400',  bg: 'bg-danger-500/10',  border: 'border-danger-500/20'  },
    cyan:    { icon: 'text-neon-400',    bg: 'bg-neon-500/10',    border: 'border-neon-500/20'    },
  }
  const c = colorMap[color] ?? colorMap.brand

  return (
    <Card className={cn('group', className)} padding={false}>
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center border', c.bg, c.border)}>
            <span className={cn('text-xl', c.icon)}>{icon}</span>
          </div>
          {trend !== undefined && (
            <span
              className={cn(
                'text-xs font-semibold px-2 py-0.5 rounded-full',
                trend >= 0
                  ? 'text-success-400 bg-success-500/10'
                  : 'text-danger-400 bg-danger-500/10'
              )}
            >
              {trend >= 0 ? '+' : ''}{trend}%
            </span>
          )}
        </div>
        <div>
          <div className="text-2xl font-bold text-text-primary leading-none mb-1">{value}</div>
          <div className="text-sm text-text-secondary">{label}</div>
          {sublabel && <div className="text-xs text-text-muted mt-0.5">{sublabel}</div>}
        </div>
      </div>
      {/* Bottom accent bar */}
      <div className={cn('h-0.5 w-0 group-hover:w-full transition-all duration-500 rounded-b-3xl', c.bg.replace('bg-', 'bg-'))}
        style={{ background: `var(--color-${color === 'cyan' ? 'neon' : color}-500)`, opacity: 0.4 }}
      />
    </Card>
  )
}
