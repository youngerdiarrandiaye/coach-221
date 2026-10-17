'use client'

import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deletePaymentAction } from './actions'
import { toast } from 'sonner'

export function DeletePaymentButton({ paymentId }: { paymentId: string }) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      const result = await deletePaymentAction(paymentId)
      if (result?.error) toast.error(result.error)
    } catch {
      toast.error('Impossible de supprimer ce paiement.')
    } finally { setLoading(false) }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger className="flex items-center gap-1.5 rounded-2xl border border-destructive/40 bg-card px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
        <Trash2 size={15} />
        <span className="hidden sm:inline">Supprimer</span>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce paiement ?</AlertDialogTitle>
          <AlertDialogDescription className="text-muted">
            Cette action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-border">Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-destructive hover:bg-destructive/90 text-white"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : 'Supprimer'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
