import { toast } from 'sonner'

export const notify = {
  success: (message: string, description?: string) =>
    toast.success(message, {
      description,
      style: {
        background: '#0F0F1E',
        border:     '1px solid rgba(0,255,133,0.35)',
        color:      '#00FF85',
        borderRadius: '1rem',
        boxShadow: '0 0 28px rgba(0,255,133,0.15), 0 8px 32px rgba(0,0,0,0.60)',
      },
    }),

  error: (message: string, description?: string) =>
    toast.error(message, {
      description,
      style: {
        background: '#180810',
        border:     '1px solid rgba(255,59,92,0.35)',
        color:      '#FF3B5C',
        borderRadius: '1rem',
        boxShadow: '0 0 28px rgba(255,59,92,0.15), 0 8px 32px rgba(0,0,0,0.60)',
      },
    }),

  warning: (message: string, description?: string) =>
    toast.warning(message, {
      description,
      style: {
        background: '#181008',
        border:     '1px solid rgba(255,214,0,0.35)',
        color:      '#FFD600',
        borderRadius: '1rem',
        boxShadow: '0 0 28px rgba(255,214,0,0.12), 0 8px 32px rgba(0,0,0,0.60)',
      },
    }),

  info: (message: string, description?: string) =>
    toast.info(message, {
      description,
      style: {
        background: '#08141A',
        border:     '1px solid rgba(0,207,255,0.35)',
        color:      '#00CFFF',
        borderRadius: '1rem',
        boxShadow: '0 0 28px rgba(0,207,255,0.12), 0 8px 32px rgba(0,0,0,0.60)',
      },
    }),

  loading: (message: string) =>
    toast.loading(message, {
      style: {
        background: '#0F0F1E',
        border:     '1px solid rgba(255,255,255,0.10)',
        color:      '#FFFFFF',
        borderRadius: '1rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.60)',
      },
    }),

  dismiss: (id?: string | number) => toast.dismiss(id),
}
