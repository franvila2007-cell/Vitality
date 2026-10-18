// PostgREST returns at most 1000 rows per request, no matter what `.limit()`
// says — so a long history (e.g. 8 habits × 180 days of ticks) silently comes
// back truncated. This pages through with .range() until a short page.
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  { pageSize = 1000, maxPages = 20 }: { pageSize?: number; maxPages?: number } = {},
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await page(i * pageSize, (i + 1) * pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}
