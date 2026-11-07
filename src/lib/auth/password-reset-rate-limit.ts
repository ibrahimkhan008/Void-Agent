import { createHash } from "node:crypto";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";

const resetEmailScope = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

/**
 * Limit reset email delivery by normalized recipient, including requests for
 * unknown addresses. The database bucket stores only a SHA-256 scope, never the
 * address, and is shared across app instances.
 */
export async function isPasswordResetRateLimited(
  email: string,
  checkLimit: typeof checkApiRateLimit = checkApiRateLimit,
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return true;
  const result = await checkLimit({
    kind: "auth-password-reset-email",
    id: resetEmailScope(normalizedEmail),
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  return !result.allowed;
}
