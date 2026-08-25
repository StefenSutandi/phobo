import { NextResponse } from 'next/server';
import { getPayments, savePayments } from '@/lib/payment-db';

export async function POST(req: Request) {
  const body = await req.json();
  
  // Validasi PIN dari env lokal kamu
  if (body.pin !== process.env.PHOBO_OPERATOR_PIN) {
    return NextResponse.json({ ok: false, error: 'PIN Salah' }, { status: 401 });
  }

  const payments = getPayments();
  const index = payments.findIndex((p: any) => p.orderId === body.orderId);
  
  if (index === -1) return NextResponse.json({ ok: false, error: 'Transaksi tidak ditemukan' });
  
  // Ubah status menjadi confirmed
  payments[index].status = 'confirmed';
  savePayments(payments);
  
  return NextResponse.json({ ok: true });
}