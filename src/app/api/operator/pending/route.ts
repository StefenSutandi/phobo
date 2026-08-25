export const dynamic = 'force-dynamic'; // Mencegah caching
import { NextResponse } from 'next/server';
import { getPayments } from '@/lib/payment-db';

export async function GET() {
  const payments = getPayments();
  // Hanya ambil yang belum dibayar
  const pending = payments.filter((p: any) => p.status === 'pending');
  return NextResponse.json({ ok: true, data: pending });
}