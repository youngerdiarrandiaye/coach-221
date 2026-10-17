'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/Spinner'
import { notify } from '@/lib/toast'
import { deleteClientAction } from './actions'

export function DeleteClientButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    const id = notify.loading('Archivage en cours…')
    try {
      const result = await deleteClientAction(clientId)
      if (result?.error) throw new Error(result.error)
      notify.dismiss(id)
      notify.success('Client archivé', `${clientName} a été archivé avec succès.`)
    } catch {
      notify.dismiss(id)
      notify.error('Erreur', 'Impossible d\'archiver ce client.')
      setLoading(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        className="flex items-center gap-1.5 rounded-2xl border border-destructive/40 bg-card px-3 py-2 text-sm text-destructive transition-all hover:bg-destructive/10 hover:scale-[1.03] hover:-translate-y-px"
        style={{ transitionTimingFunction: 'cubic-bezier(0.25,0.46,0.45,0.94)' }}
      >
        <Trash2 size={15} />
        <span className="hidden sm:inline">Archiver</span>
      </AlertDialogTrigger>

      <AlertDialogContent
        className="border-border"
        style={{
          background: 'linear-gradient(145deg, #14143A 0%, #0D0D1C 100%)',
          borderRadius: '1.5rem',
          border: '1px solid rgba(255,59,92,0.20)',
          boxShadow: '0 0 40px rgba(255,59,92,0.08), 0 20px 60px rgba(0,0,0,0.70)',
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Archiver {clientName} ?</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            Ce client sera archivé et n&apos;apparaîtra plus dans la liste. Ses données (séances, paiements) sont conservées.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="rounded-2xl border-border text-muted-foreground hover:text-white"
          >
            Annuler
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="rounded-2xl bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50"
          >
            {loading ? <Spinner size="sm" className="border-white/20 border-t-white" /> : 'Archiver'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
