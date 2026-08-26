import { cookies } from "next/headers";
import { type NextRequest } from "next/server";

const COOKIE_NAME = "phobo_operator_session";
const SESSION_SECRET = "phobo-operator-authenticated-session-key";

export function getExpectedOperatorPin(): string {
  return process.env.PHOBO_OPERATOR_PIN || "1234";
}

export function validateOperatorPin(inputPin: string): boolean {
  const expectedPin = getExpectedOperatorPin();
  return typeof inputPin === "string" && inputPin.trim() === expectedPin.trim();
}

export async function isOperatorAuthenticated(request?: NextRequest): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    return token === SESSION_SECRET;
  } catch (err) {
    return false;
  }
}

export async function setOperatorSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, SESSION_SECRET, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  });
}

export async function clearOperatorSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}