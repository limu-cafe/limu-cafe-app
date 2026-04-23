import type { Item } from '@/types';
import type { UserLocale } from '@/components/user/UserLocaleProvider';

export function getItemDisplayName(
  item: Pick<Item, 'name' | 'english_name'> | null | undefined,
  locale: UserLocale
) {
  if (!item) return '';
  if (locale === 'en' && item.english_name?.trim()) {
    return item.english_name.trim();
  }
  return item.name;
}
