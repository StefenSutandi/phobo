import { cookies } from "next/headers";
import { type NextRequest } from "next/server";

export const COOKIE_NAME = "phobo_operator_session";
export const SESSION_SECRET = "phobo-operator-authenticated-session-key";

export function getExpectedOperatorPin(): string {
  return process.env.PHOBO_OPERATOR_PIN || "1234";
}

export function validateOperatorPin(inputPin: string): boolean {
  const expectedPin = getExpectedOperatorPin();
  return typeof inputPin === "string" && inputPin.trim() === expectedPin.trim();
}

/**
 * Pure exact cookie parser helper.
 * Parses a standard Cookie header string and returns the exact value for the given cookie name,
 * ensuring no prefix, suffix, or substring collisions.
 */
export function parseCookieValue(cookieHeader: string | null | undefined, cookieName: string): string | null {
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const equalIdx = trimmed.indexOf("=");
    if (equalIdx === -1) continue;

    const key = trimmed.slice(0, equalIdx).trim();
    if (key === cookieName) {
      return trimmed.slice(equalIdx + 1).trim();
    }
  }

  return null;
}

export async function isOperatorAuthenticated(request?: NextRequest | Request): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (token === SESSION_SECRET) return true;
  } catch {
    // Outside Next.js server async storage context (e.g. tests or direct requests)
  }

  if (request) {
    const cookieHeader = request.headers.get("cookie");
    const token = parseCookieValue(cookieHeader, COOKIE_NAME);
    if (token === SESSION_SECRET) {
      return true;
    }
  }

  return false;
}

export function isOperatorCookieSecure(): boolean {
  return process.env.PHOBO_OPERATOR_COOKIE_SECURE === "true";
}

export async function setOperatorSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, SESSION_SECRET, {
    httpOnly: true,
    secure: isOperatorCookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  });
}

export async function clearOperatorSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}