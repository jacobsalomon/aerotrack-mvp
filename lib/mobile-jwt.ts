// Shared JWT signing/verification key for the mobile login system.
// Used by both the login endpoint and the auth middleware.
// Single source of truth so the key derivation stays consistent.

export function getMobileSigningKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("No signing secret configured (set AUTH_SECRET)");
  return new TextEncoder().encode(secret);
}
