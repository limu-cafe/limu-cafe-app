import type { Item } from '@/types';

function toKatakana(text: string) {
  return text.replace(/[\u3041-\u3096]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  );
}

export function normalizeSearchText(text: string) {
  return toKatakana(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[・･\-_]/g, '');
}

export function getItemSearchableText(item: Item) {
  return normalizeSearchText(
    [
      item.name,
      item.description ?? '',
      item.category?.name ?? '',
      item.category?.icon ?? '',
    ].join(' ')
  );
}

export function isQueryMatch(item: Item, query: string) {
  if (!query) return true;
  return getItemSearchableText(item).includes(normalizeSearchText(query));
}
