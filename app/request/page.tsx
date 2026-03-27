import UserLayout from '@/components/layout/UserLayout';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RequestForm from './RequestForm';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export default async function RequestPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: requests } = await supabase
    .from('item_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const statusConfig = {
    pending:  { label: '検討中', class: 'badge-pending' },
    approved: { label: '採用 🎉', class: 'badge-approved' },
    rejected: { label: '却下', class: 'badge-rejected' },
  };

  return (
    <UserLayout>
      <div className="max-w-lg mx-auto space-y-8 animate-fade-in">
        <div>
          <h1 className="font-display font-bold text-3xl text-espresso">商品の要望</h1>
          <p className="text-espresso-400 text-sm mt-1">
            欲しい商品をリクエストしましょう
          </p>
        </div>

        <RequestForm />

        {/* 要望履歴 */}
        {requests && requests.length > 0 && (
          <div className="card space-y-4">
            <h2 className="font-medium text-espresso">これまでの要望</h2>
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req.id} className="border border-cream-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-espresso">{req.item_name}</p>
                    <span className={statusConfig[req.status as keyof typeof statusConfig]?.class}>
                      {statusConfig[req.status as keyof typeof statusConfig]?.label}
                    </span>
                  </div>
                  {req.desired_price && (
                    <p className="text-sm text-espresso-400">
                      希望価格: ¥{req.desired_price.toLocaleString()}
                    </p>
                  )}
                  {req.reason && (
                    <p className="text-sm text-espresso-600">{req.reason}</p>
                  )}
                  {req.admin_note && (
                    <div className="bg-cream-100 rounded-lg p-3 text-sm text-espresso-600">
                      <span className="font-medium text-espresso-400 text-xs">管理者コメント: </span>
                      {req.admin_note}
                    </div>
                  )}
                  <p className="text-xs text-espresso-400">
                    {format(new Date(req.created_at), 'M月d日', { locale: ja })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </UserLayout>
  );
}
