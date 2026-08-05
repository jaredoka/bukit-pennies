import { kvGet, kvGetJson, kvSet, kvSetJson } from './kvStore';

// Onboarding state.
//
// `onboarded` means "completed the capture setup guide" and is set by the
// guide's Setup-complete button (or the returning-user heuristic in
// welcome.tsx).
//
// Setup used to be a gate: AuthGate redirected anyone not onboarded into the
// guide, and the "I'll do it later" escape lived in memory, so it lasted one
// app launch and the guide reappeared on every open. Automatic capture is the
// reason to use this app, so it stays prominent — but a user who cannot finish
// seven substeps inside the Shortcuts app was being nagged forever with no way
// out, which loses the user rather than winning the setup. It is now a
// dismissible card on the dashboard plus a permanent Settings entry, and the
// dismissal persists.

// Dots, not colons, and the `bukit.` prefix every other stored key uses
// (tokenStore, notifications, privacy, primaryCurrency). SecureStore rejects
// colons outright — see the note in kvStore — so the previous `onboarded:<id>`
// spelling persisted nothing on device. No migration: there is nothing on any
// phone under the old names to migrate.

export function onboardedKey(userId: string): string {
  return `bukit.onboarded.${userId}`;
}

function dismissedKey(userId: string): string {
  return `bukit.setup_dismissed.${userId}`;
}

function stepsKey(userId: string): string {
  return `bukit.setup_steps.${userId}`;
}

/** Steps in the capture setup guide, used for the progress readout. */
export const SETUP_STEP_COUNT = 5;

// ── dashboard card dismissal ───────────────────────────────────────────────

export async function dismissSetupCard(userId: string): Promise<void> {
  await kvSet(dismissedKey(userId), '1');
}

export async function isSetupCardDismissed(userId: string): Promise<boolean> {
  return (await kvGet(dismissedKey(userId))) === '1';
}

// ── resumable progress ─────────────────────────────────────────────────────
// Which step numbers the user has ticked off. Persisted so bailing out at
// step 4 — the iOS automation, the one people abandon — returns them to step 4
// rather than the top of a five-card page.

export async function getCompletedSteps(userId: string): Promise<number[]> {
  const raw = await kvGetJson<number[]>(stepsKey(userId), []);
  return Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n)) : [];
}

export async function setStepCompleted(
  userId: string,
  step: number,
  done: boolean,
): Promise<number[]> {
  const current = new Set(await getCompletedSteps(userId));
  if (done) current.add(step);
  else current.delete(step);
  const next = [...current].sort((a, b) => a - b);
  await kvSetJson(stepsKey(userId), next);
  return next;
}

export async function markAllStepsCompleted(userId: string): Promise<number[]> {
  const all = Array.from({ length: SETUP_STEP_COUNT }, (_, i) => i + 1);
  await kvSetJson(stepsKey(userId), all);
  return all;
}

/** Lowest step not yet ticked, or null when everything is done. */
export function nextIncompleteStep(completed: number[]): number | null {
  for (let n = 1; n <= SETUP_STEP_COUNT; n++) {
    if (!completed.includes(n)) return n;
  }
  return null;
}
