'use client'

import { useState } from 'react'
import { LogOut, Loader2 } from 'lucide-react'
import { signOutAction } from './actions'

export function SignOutButton() {
  const [loading, setLoading] = useState(false)

  const handleSignOut = async () => {
    setLoading(true)
    await signOutAction()
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="flex w-full items-center gap-3 rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
      Se déconnecter
    </button>
  )
}
