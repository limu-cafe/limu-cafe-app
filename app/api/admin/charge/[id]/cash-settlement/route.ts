import { cashCollection } from '@/lib/payment-api';

export async function POST(request: Request, { params: pendingParams }: { params: Promise<{ id: string }> }) {
  const params = await pendingParams;
  return cashCollection(request, params.id, 'cash_charge', false);
}

export async function DELETE(request: Request, { params: pendingParams }: { params: Promise<{ id: string }> }) {
  const params = await pendingParams;
  return cashCollection(request, params.id, 'cash_charge', true);
}
