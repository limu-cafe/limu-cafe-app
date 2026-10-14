type TransactionRow = {
  id: string;
  created_at: string;
};

type QueryResult = {
  data: unknown;
  error: unknown;
};

type PendingPageQuery = (from: number, to: number) => PromiseLike<QueryResult>;

const PENDING_PAGE_SIZE = 200;

async function readRows<T>(query: PromiseLike<QueryResult>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as T[];
}

async function readAllPendingRows<T>(query: PendingPageQuery): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const page = await readRows<T>(query(offset, offset + PENDING_PAGE_SIZE - 1));
    if (page.length === 0) return rows;
    rows.push(...page);
    // Advance by the returned size so a lower server row cap cannot skip rows.
    offset += page.length;
  }
}

// Keep the history window small without hiding older actionable transactions.
export async function fetchRecentAndPendingRows<T extends TransactionRow>(params: {
  recent: PromiseLike<QueryResult>;
  pending: PendingPageQuery[];
}): Promise<T[]> {
  const [recent, ...pending] = await Promise.all([
    readRows<T>(params.recent),
    ...params.pending.map((query) => readAllPendingRows<T>(query)),
  ]);

  const byId = new Map<string, T>();
  for (const row of [...recent, ...pending.flat()]) {
    byId.set(row.id, row);
  }

  return Array.from(byId.values()).sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime() ||
      right.id.localeCompare(left.id)
  );
}
