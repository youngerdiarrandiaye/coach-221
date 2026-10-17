import { CheckCircle2, AlertTriangle, XCircle, Info, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type AlertVariant = 'success' | 'warning' | 'danger' | 'info'

interface AlertProps {
  variant: AlertVariant
  title?: string
  message: string
  onClose?: () => void
  className?: string
}

const config: Record<AlertVariant, { cls: string; icon: LucideIcon }> = {
  success: { cls: 'tc-alert tc-alert-success', icon: CheckCircle2 },
  warning: { cls: 'tc-alert tc-alert-warning', icon: AlertTriangle },
  danger:  { cls: 'tc-alert tc-alert-danger',  icon: XCircle },
  info:    { cls: 'tc-alert tc-alert-info',     icon: Info },
}

export function Alert({ variant, title, message, onClose, className }: AlertProps) {
  const { cls, icon: Icon } = config[variant]

  return (
    <div className={cn(cls, className)} role="alert">
      <Icon size={18} strokeWidth={2.2} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold text-sm">{title}</p>}
        <p className={cn('text-sm', title ? 'opacity-85 mt-0.5' : '')}>{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 p-0.5 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Fermer"
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}
