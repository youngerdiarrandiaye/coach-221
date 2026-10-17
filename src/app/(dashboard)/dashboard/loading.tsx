import { Spinner } from '@/components/ui/Spinner'

export default function Loading() {
  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      <div className="flex items-center justify-center py-10">
        <Spinner size="lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0,1,2,3].map((i) => (
          <div key={i} className="tc-card p-4 h-24 animate-pulse" />
        ))}
      </div>
      <div className="tc-card p-4 h-48 animate-pulse" />
      <div className="tc-card p-4 h-32 animate-pulse" />
    </div>
  )
}

