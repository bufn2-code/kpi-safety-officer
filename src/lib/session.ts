import { cookies } from "next/headers";

export type UserRole = "super_admin" | "admin" | "safety_officer";

export interface SessionUser {
  uid: string;
  employeeId: string;
  name: string;
  role: UserRole;
  unit: string;
  exp: number;
}

export const SESSION_COOKIE_NAME = "kpi_safety_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 hari

function getSessionSecret(): string {
  const secret = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!secret) {
    throw new Error("FIREBASE_PRIVATE_KEY belum diatur untuk penandatanganan sesi.");
  }
  return secret;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function signPayload(encodedPayload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(encodedPayload)
  );
  return toBase64Url(new Uint8Array(signature));
}

export async function createSessionToken(
  user: Omit<SessionUser, "exp">
): Promise<string> {
  const payload: SessionUser = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };
  const encodedPayload = toBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const signature = await signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined
): Promise<SessionUser | null> {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  try {
    const expectedSignature = await signPayload(encodedPayload);
    if (signature !== expectedSignature) return null;

    const jsonStr = new TextDecoder().decode(fromBase64Url(encodedPayload));
    const user = JSON.parse(jsonStr) as SessionUser;

    if (!user.exp || user.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: Omit<SessionUser, "exp">) {
  const token = await createSessionToken(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}