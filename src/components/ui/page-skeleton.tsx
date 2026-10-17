import { Skeleton } from './skeleton'

export function CardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="tc-card p-4 space-y-2.5">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === 0 ? 'w-2/3' : 'w-1/2'}`} />
      ))}
    </div>
  )
}

export function ListItemSkeleton() {
  return (
    <div className="tc-card flex items-center gap-3 p-3">
      <Skeleton className="h-11 w-11 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-5 w-14 rounded-full shrink-0" />
    </div>
  )
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${count === 4 ? 'sm:grid-cols-4' : ''}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="tc-card p-4 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

export function ListPageSkeleton({ items = 6 }: { items?: number }) {
  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: items }).map((_, i) => (
          <ListItemSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

export function DetailPageSkeleton() {
  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24 lg:pb-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
        <Skeleton className="h-7 flex-1 rounded" />
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>
      <CardSkeleton lines={3} />
      <CardSkeleton lines={4} />
    </div>
  )
}
