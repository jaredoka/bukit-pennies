import * as Crypto from 'expo-crypto';

// Single source of truth for the client-side password rules, shared by sign-up
// and password reset so the two can never drift apart.
//
// Length only, deliberately no composition rules (no "must contain a symbol").
// NIST SP 800-63B recommends against composition rules and forced rotation:
// they push users toward predictable mutations like Password1! while adding
// signup friction, which this app can least afford (see HANDOFF §17, the
// onboarding drop-off watch). Screening against known-breached passwords is
// the control that actually stops credential stuffing — see HANDOFF §18.
export const MIN_PASSWORD_LENGTH = 10;

export const PASSWORD_HINT = `min ${MIN_PASSWORD_LENGTH} characters`;

export function isPasswordLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

// ─────────────────────────────── breach screening ───────────────────────────
// Supabase's built-in leaked-password check is a Pro-plan feature and this
// project stays on the free tier until it has real users (HANDOFF §16.5), so
// the same protection is obtained directly from the Pwned Passwords range API.
//
// k-anonymity: only the FIRST FIVE hex characters of the password's SHA-1 are
// ever transmitted. The service returns every breached-hash suffix sharing
// that prefix (~800 of them) and the match happens locally, so the password
// itself — and any hash that could be reversed to it — never leaves the
// device. That property is why this is acceptable in a product whose pitch is
// that it does not ship your data anywhere.
//
// Two deliberate limits:
//  • It FAILS OPEN. A network error, a timeout, or a malformed response must
//    never block account creation; a reused password is a far smaller harm
//    than an unusable signup.
//  • It is ADVISORY. A client-side check cannot bind anyone calling the
//    Supabase auth API directly. That is fine: the purpose is protecting users
//    from their own password reuse, not stopping an attacker from choosing to
//    weaken their own account.

const PWNED_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const PREFIX_LENGTH = 5;
const REQUEST_TIMEOUT_MS = 4000;

export interface BreachCheckResult {
  /** True only on a definitive hit. Unknown/failed lookups are false. */
  breached: boolean;
  /** How many times the password appears in the corpus; 0 when not breached. */
  count: number;
  /** True when the lookup could not be completed (failed open). */
  inconclusive: boolean;
}

const NOT_BREACHED: BreachCheckResult = { breached: false, count: 0, inconclusive: false };
const INCONCLUSIVE: BreachCheckResult = { breached: false, count: 0, inconclusive: true };

/**
 * Parses a range-API body: lines of "<SUFFIX>:<COUNT>", suffix being the
 * remaining 35 hex chars of the SHA-1. Returns the count for `suffix`, or 0.
 */
export function countInRangeResponse(body: string, suffix: string): number {
  const target = suffix.toUpperCase();
  for (const line of body.split('\n')) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    if (line.slice(0, sep).trim().toUpperCase() !== target) continue;
    const count = Number.parseInt(line.slice(sep + 1).trim(), 10);
    return Number.isFinite(count) ? count : 0;
  }
  return 0;
}

/**
 * Checks `password` against the Pwned Passwords corpus. Never throws — a
 * failed lookup comes back as `inconclusive` so callers can proceed.
 */
export async function checkPasswordBreached(password: string): Promise<BreachCheckResult> {
  if (!password) return NOT_BREACHED;

  try {
    const digest = (
      await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, password)
    ).toUpperCase();
    const prefix = digest.slice(0, PREFIX_LENGTH);
    const suffix = digest.slice(PREFIX_LENGTH);

    // AbortSignal.timeout is not available on every RN runtime; drive it by hand.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let body: string;
    try {
      const res = await fetch(`${PWNED_RANGE_URL}${prefix}`, {
        headers: { 'Add-Padding': 'true' }, // uniform response size; hides the real bucket
        signal: controller.signal,
      });
      if (!res.ok) return INCONCLUSIVE;
      body = await res.text();
    } finally {
      clearTimeout(timer);
    }

    const count = countInRangeResponse(body, suffix);
    // Padding records are returned with a count of 0 — treat only >0 as a hit.
    return count > 0 ? { breached: true, count, inconclusive: false } : NOT_BREACHED;
  } catch {
    return INCONCLUSIVE;
  }
}

/** User-facing copy for a confirmed hit. */
export function breachWarning(count: number): string {
  const times = count === 1 ? 'once' : `${count.toLocaleString()} times`;
  return `This password has appeared ${times} in known data breaches. It is not safe to use here — please choose a different one.`;
}
