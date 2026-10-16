/** One scope applies to every transaction type, before pagination and pending-row retrieval. */
export class TransactionFilter {
  readonly userId: string | null;
  readonly page: number;
  hasNextPage = false;
  constructor(params: { user?: string | string[]; page?: string | string[] } = {}) {
    this.userId = typeof params.user === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.user) ? params.user : null;
    const page = Number(params.page);
    this.page = Number.isSafeInteger(page) && page > 0 && page <= 10000 ? page : 1;
  }
  apply<T extends { eq: (field: string, value: string) => T }>(query: T): T {
    return this.userId ? query.eq('user_id', this.userId) : query;
  }
  async recent(query: any) {
    const result = await query.range((this.page - 1) * 80, this.page * 80);
    if ((result.data?.length ?? 0) > 80) this.hasNextPage = true;
    return { ...result, data: result.data?.slice(0, 80) ?? null };
  }
}
