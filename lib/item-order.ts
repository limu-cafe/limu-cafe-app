export type OrderedItem = { id: string; created_at: string };

export function sortItemsByDisplayOrder<T extends OrderedItem>(items: T[], itemIds: string[]) {
  const positions = new Map(itemIds.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const left = positions.get(a.id) ?? Infinity;
    const right = positions.get(b.id) ?? Infinity;
    if (left !== right) return left - right;
    return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
  });
}

export function moveItemId(ids: string[], id: string, to: number) {
  const from = ids.indexOf(id);
  if (from < 0 || !Number.isInteger(to) || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export function parseItemOrderInput(body: unknown): { itemIds: string[]; expectedRevision: number } | null {
  if (!body || typeof body !== 'object') return null;
  const { itemIds, expectedRevision } = body as Record<string, unknown>;
  if (!Array.isArray(itemIds) || !Number.isInteger(expectedRevision) || Number(expectedRevision) < 0) return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (itemIds.some((id) => typeof id !== 'string' || !uuid.test(id))) return null;
  const normalized = itemIds.map((id: string) => id.toLowerCase());
  if (new Set(normalized).size !== normalized.length) return null;
  return { itemIds: normalized, expectedRevision: Number(expectedRevision) };
}
