import { cn } from '@/lib/cn'
import { forwardRef } from 'react'

const variants = {
  primary: `
    bg-gradient-to-r from-brand-500 to-accent-500
    hover:from-brand-600 hover:to-accent-600
    text-white shadow-lg hover:shadow-brand-500/30
    border border-brand-400/20
  `,
  secondary: `
    bg-surface-3 hover:bg-surface-4
    text-text-primary border border-border-default
    hover:border-brand-500/40
  `,
  ghost: `
    bg-transparent hover:bg-surface-3
    text-text-secondary hover:text-text-primary
    border border-transparent hover:border-border-subtle
  `,
  danger: `
    bg-danger-500/10 hover:bg-danger-500/20
    text-danger-400 border border-danger-500/30
    hover:border-danger-500/60
  `,
  success: `
    bg-success-500/10 hover:bg-success-500/20
    text-success-400 border border-success-500/30
    hover:border-success-500/60
  `,
  glass: `
    glass hover:border-brand-500/40
    text-text-primary
  `,
  outline: `
    bg-transparent border border-brand-500/40
    text-brand-400 hover:bg-brand-500/10
    hover:border-brand-500/70
  `,
}

const sizes = {
  xs: 'h-7 px-3 text-xs gap-1.5 rounded-md',
  sm: 'h-8 px-4 text-sm gap-2 rounded-lg',
  md: 'h-10 px-5 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-xl',
  xl: 'h-14 px-8 text-base gap-3 rounded-2xl',
}

export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    className,
    children,
    loading,
    icon,
    iconRight,
    fullWidth,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={loading || props.disabled}
      className={cn(
        'inline-flex items-center justify-center font-medium',
        'transition-all duration-200 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'select-none whitespace-nowrap',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {loading ? (
        <span
          className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden
        />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && (
        <span className="flex-shrink-0">{iconRight}</span>
      )}
    </button>
  )
})
