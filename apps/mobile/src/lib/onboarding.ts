// Onboarding state. The persistent flag (kvStore) means "completed the
// shortcut setup guide" — set only by the guide's Setup-complete button (or
// the returning-user heuristic in welcome.tsx). Deferral is deliberately
// in-memory: it lasts one app launch, so users who skipped setup are
// re-prompted every time they open the app until they complete it.

export function onboardedKey(userId: string): string {
  return `onboarded:${userId}`;
}

let deferred = false;

export function deferSetup(): void {
  deferred = true;
}

export function isSetupDeferred(): boolean {
  return deferred;
}

// The browse-without-setup pop-up should appear once per launch, not every
// time the setup screen mounts.
let prompted = false;

export function markSetupPromptShown(): void {
  prompted = true;
}

export function wasSetupPromptShown(): boolean {
  return prompted;
}
