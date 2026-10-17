import { assertDatabaseSuccess } from '@/lib/databaseResult'

type Result<T> = { data: T[] | null; error: { code?: string; message: string } | null }
type PagedQuery<T> = PromiseLike<Result<T>> & { range(from: number, to: number): PagedQuery<T>; order(column: string, options?: { ascending?: boolean }): PagedQuery<T> }

/** Read to exhaustion; do not mistake the PostgREST row cap for a complete result. */
export async function fetchAll<T>(query: PagedQuery<T>): Promise<Result<T>> {
  const rows: T[] = []
  const size = 500
  query = query.order('id', { ascending: true })
  for (let offset = 0; ; offset += size) {
    const page = await query.range(offset, offset + size - 1)
    assertDatabaseSuccess(page.error)
    const data = page.data ?? []
    rows.push(...data)
    if (data.length === 0) return { data: rows, error: null }
    // Advance by the server's actual page size even with a lower configured cap.
    offset += data.length - size
  }
}
