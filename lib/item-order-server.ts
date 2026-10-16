export type ItemDisplayOrder = { itemIds: string[]; revision: number; available: boolean };

export function isMissingItemOrderSchema(error: { code?: string } | null) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST202';
}

export async function loadItemDisplayOrder(supabase: any): Promise<ItemDisplayOrder> {
  const { data, error } = await supabase.from('item_display_order')
    .select('item_ids, revision').eq('singleton', true).single();
  if (isMissingItemOrderSchema(error)) return { itemIds: [], revision: 0, available: false };
  if (error) throw error;
  return { itemIds: data.item_ids, revision: data.revision, available: true };
}
