import crypto from "node:crypto";

export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plainPassword, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(
  plainPassword: string,
  storedHash: string
): boolean {
  if (!storedHash || !storedHash.includes(":")) {
    return plainPassword === storedHash;
  }
  const [salt, key] = storedHash.split(":");
  const keyBuffer = Buffer.from(key, "hex");
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64);
  if (keyBuffer.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}