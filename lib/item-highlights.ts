import type { Item, ItemShowcaseOverride } from '@/types';

type ShowcaseKind = 'popular' | 'new_arrival';

function getOverride(item: Item, kind: ShowcaseKind): ItemShowcaseOverride {
  return kind === 'popular' ? item.popular_override : item.new_arrival_override;
}

export function pickShowcaseItems(
  items: Item[],
  candidateIds: string[],
  kind: ShowcaseKind,
  limit = 4
) {
  const availableItems = items.filter((item) => item.is_available);
  const forced = availableItems.filter((item) => getOverride(item, kind) === 'show');
  const hiddenIds = new Set(
    availableItems
      .filter((item) => getOverride(item, kind) === 'hide')
      .map((item) => item.id)
  );
  const forcedIds = new Set(forced.map((item) => item.id));

  const autoItems = candidateIds
    .map((id) => availableItems.find((item) => item.id === id))
    .filter((item): item is Item => Boolean(item))
    .filter((item) => !hiddenIds.has(item.id) && !forcedIds.has(item.id));

  return [...forced, ...autoItems].slice(0, limit);
}
