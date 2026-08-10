import { NextResponse } from "next/server";
import {
  validateOperatorPin,
  setOperatorSessionCookie,
  clearOperatorSessionCookie,
  isOperatorAuthenticated,
} from "@/lib/payment/operator-auth";

export const runtime = "nodejs";

export async function GET() {
  const authenticated = await isOperatorAuthenticated();
  return NextResponse.json({ ok: true, authenticated });
}

export async function POST(request: Request) {
  try {
    const { pin } = await request.json();

    if (!validateOperatorPin(pin)) {
      return NextResponse.json({ ok: false, error: "PIN Operator salah" }, { status: 401 });
    }

    await setOperatorSessionCookie();
    return NextResponse.json({ ok: true, message: "Authenticated" });
  } catch (error) {
    console.error("[Operator Auth API] Login Error:", error);
    return NextResponse.json({ ok: false, error: "Failed to process auth" }, { status: 500 });
  }
}

export async function DELETE() {
  await clearOperatorSessionCookie();
  return NextResponse.json({ ok: true, message: "Logged out" });
}
