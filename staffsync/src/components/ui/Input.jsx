import { cn } from '@/lib/cn'
import { forwardRef } from 'react'

export const Input = forwardRef(function Input(
  { label, error, hint, icon, iconRight, className, containerClassName, ...props },
  ref
) {
  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label className="text-label text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full h-11 px-4 rounded-xl text-sm',
            'bg-surface-2 border border-border-subtle',
            'text-text-primary placeholder:text-text-muted',
            'transition-all duration-200',
            'focus:outline-none focus:border-brand-500 focus:bg-surface-3',
            'focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]',
            error && 'border-danger-500/50 focus:border-danger-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.12)]',
            icon && 'pl-10',
            iconRight && 'pr-10',
            className
          )}
          {...props}
        />
        {iconRight && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted">
            {iconRight}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-danger-400">{error}</p>}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  )
})

export const Textarea = forwardRef(function Textarea(
  { label, error, hint, className, containerClassName, ...props },
  ref
) {
  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && <label className="text-label text-text-secondary">{label}</label>}
      <textarea
        ref={ref}
        className={cn(
          'w-full px-4 py-3 rounded-xl text-sm',
          'bg-surface-2 border border-border-subtle',
          'text-text-primary placeholder:text-text-muted',
          'transition-all duration-200 resize-none',
          'focus:outline-none focus:border-brand-500 focus:bg-surface-3',
          'focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]',
          error && 'border-danger-500/50',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-danger-400">{error}</p>}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  )
})

export const Select = forwardRef(function Select(
  { label, error, hint, icon, className, containerClassName, children, ...props },
  ref
) {
  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && <label className="text-label text-text-secondary">{label}</label>}
      <div className="relative">
        {icon && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none z-10">
            {icon}
          </span>
        )}
        <select
          ref={ref}
          className={cn(
            'w-full h-11 px-4 pr-10 rounded-xl text-sm appearance-none',
            'bg-surface-2 border border-border-subtle',
            'text-text-primary',
            'transition-all duration-200 cursor-pointer',
            'focus:outline-none focus:border-brand-500 focus:bg-surface-3',
            'focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]',
            icon && 'pl-10',
            error && 'border-danger-500/50',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </div>
      {error && <p className="text-xs text-danger-400">{error}</p>}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  )
})
