import { cashCollection } from '@/lib/payment-api';

export function POST(request: Request, { params }: { params: { id: string } }) {
  return cashCollection(request, params.id, 'cash_order', false);
}

export function DELETE(request: Request, { params }: { params: { id: string } }) {
  return cashCollection(request, params.id, 'cash_order', true);
}
