// Single source of truth for the client-side password rule, shared by sign-up
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
