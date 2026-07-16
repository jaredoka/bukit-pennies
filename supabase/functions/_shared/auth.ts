/** Runs in both Deno (edge) and Node ≥20 (vitest) — Web Crypto only. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** "Bearer bp_xyz" → "bp_xyz"; null when absent/malformed. */
export function extractBearerToken(authorizationHeader: string | null | undefined): string | null {
  if (!authorizationHeader) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  return m ? m[1]! : null;
}
