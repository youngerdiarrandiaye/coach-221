'use client'

import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { deleteProgressAction } from './actions'
import { toast } from 'sonner'

interface Props {
  entryId:  string
  clientId: string
}

export function DeleteProgressButton({ entryId, clientId }: Props) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Supprimer cette mesure ?')) return
    setLoading(true)
    try {
      const result = await deleteProgressAction(entryId, clientId)
      if (result?.error) toast.error(result.error)
    } catch {
      toast.error('Impossible de supprimer cette mesure.')
    } finally { setLoading(false) }
  }

  return (
    <button
      onClick={handleDelete}
      aria-label="Supprimer cette mesure"
      disabled={loading}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
    </button>
  )
}
