import type { SupabaseClient } from '@supabase/supabase-js';

type AdminAuditInput = {
  actor_id?: string | null;
  action_type: string;
  target_type: string;
  target_id?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
};

export async function logAdminAction(
  supabase: SupabaseClient<any, any, any>,
  input: AdminAuditInput
) {
  const { error } = await supabase.from('admin_audit_logs').insert({
    actor_id: input.actor_id ?? null,
    action_type: input.action_type,
    target_type: input.target_type,
    target_id: input.target_id ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });

  if (error) {
    throw error;
  }
}
