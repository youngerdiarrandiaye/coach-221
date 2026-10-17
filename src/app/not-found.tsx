import Link from 'next/link'
import { Dumbbell } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center bg-background">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Dumbbell size={30} className="text-primary" strokeWidth={2} />
      </div>
      <div className="space-y-2">
        <h1 className="text-4xl font-black text-foreground">404</h1>
        <p className="text-lg font-semibold text-foreground">Page introuvable</p>
        <p className="text-sm text-muted max-w-xs">
          Cette page n&apos;existe pas ou a été déplacée.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
      >
        Retour au tableau de bord
      </Link>
    </div>
  )
}
