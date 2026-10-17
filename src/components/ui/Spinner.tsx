import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'h-4 w-4 border-2',
  md: 'h-7 w-7 border-2',
  lg: 'h-12 w-12 border-[3px]',
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Chargement…"
      className={cn(
        'inline-block rounded-full border-solid animate-spin',
        'border-[#00FF85]/20 border-t-[#00FF85]',
        sizes[size],
        className,
      )}
      style={{ boxShadow: '0 0 12px rgba(0,255,133,0.25)' }}
    />
  )
}

export function FullPageSpinner() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
      <Spinner size="lg" />
      <p className="text-sm font-medium text-muted-foreground animate-pulse">
        Chargement…
      </p>
    </div>
  )
}
