import { cn } from '@/lib/cn'

export function Badge({ children, color, dot, className, style }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5',
        'text-xs font-semibold rounded-full border',
        'whitespace-nowrap',
        className
      )}
      style={{
        background: color?.bg ?? 'rgba(99,102,241,0.15)',
        color:      color?.text ?? '#818cf8',
        borderColor:color?.border ?? 'rgba(99,102,241,0.3)',
        ...style,
      }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: color?.dot ?? color?.text ?? '#818cf8' }}
        />
      )}
      {children}
    </span>
  )
}
