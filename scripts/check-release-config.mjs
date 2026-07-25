#!/usr/bin/env node
// Preflight for a production EAS build. Run before `eas build --profile
// production`; it catches the config mistakes that otherwise surface as a
// failed build 20 minutes in, or — worse — as a shipped build that is quietly
// missing something (HANDOFF §20).
//
//   node scripts/check-release-config.mjs
//
// Exits non-zero on an error. Warnings do not fail: some of them are
// legitimate choices (shipping without crash reporting, for instance) and
// this must not become a gate you learn to ignore.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const errors = [];
const warnings = [];

const eas = read('apps/mobile/eas.json');
const appJson = read('apps/mobile/app.json');
const app = appJson.expo ?? {};
const production = eas.build?.production ?? {};
const env = production.env ?? {};
const submit = eas.submit?.production?.ios ?? {};

// ── placeholders ───────────────────────────────────────────────────────────
// Both come from Apple enrolment; a build works without them but `eas submit`
// does not, so flag them as errors only when they are still literal FILL-MEs.
for (const [key, value] of Object.entries(submit)) {
  if (typeof value === 'string' && value.includes('FILL-ME')) {
    errors.push(`eas.json submit.production.ios.${key} is still a placeholder: ${value}`);
  }
}

// ── Supabase ───────────────────────────────────────────────────────────────
if (!env.EXPO_PUBLIC_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL.includes('127.0.0.1')) {
  errors.push('eas.json production env points at a local Supabase URL (or is missing one).');
}
if (!env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  errors.push('eas.json production env is missing EXPO_PUBLIC_SUPABASE_ANON_KEY.');
} else {
  // A service-role key here would be catastrophic: it bypasses RLS and would
  // be shipped inside the app binary, readable by anyone.
  try {
    const payload = JSON.parse(
      Buffer.from(env.EXPO_PUBLIC_SUPABASE_ANON_KEY.split('.')[1] ?? '', 'base64').toString(),
    );
    if (payload.role !== 'anon') {
      errors.push(`EXPO_PUBLIC_SUPABASE_ANON_KEY has role "${payload.role}", expected "anon". NEVER ship a service-role key.`);
    }
  } catch {
    warnings.push('EXPO_PUBLIC_SUPABASE_ANON_KEY could not be decoded as a JWT — check it is the anon key.');
  }
}

// ── Sentry ─────────────────────────────────────────────────────────────────
// Two independent switches, and both fail quietly by default:
//   • no DSN            → the app runs with crash reporting off, silently
//   • auto-upload on    → the build step needs SENTRY_AUTH_TOKEN or it fails
const dsnInEnv = Boolean(env.EXPO_PUBLIC_SENTRY_DSN);
const uploadDisabled = String(env.SENTRY_DISABLE_AUTO_UPLOAD ?? '').toLowerCase() === 'true';

if (!dsnInEnv) {
  warnings.push(
    'No EXPO_PUBLIC_SENTRY_DSN in eas.json production env. If it is not set as an EAS secret\n' +
      '    either (`eas secret:list`), this build ships with crash reporting DISABLED.\n' +
      '    Set one: eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value "https://..."',
  );
}
if (!uploadDisabled) {
  warnings.push(
    'SENTRY_DISABLE_AUTO_UPLOAD is not "true", so the Sentry plugin will try to upload\n' +
      '    source maps. That step fails the build unless SENTRY_AUTH_TOKEN exists as an EAS secret.',
  );
}

// ── app identity ───────────────────────────────────────────────────────────
if (!app.extra?.eas?.projectId) {
  warnings.push('app.json has no extra.eas.projectId — run `eas init` inside apps/mobile first.');
}
if (app.version === '0.1.0') {
  warnings.push(`app.json version is still ${app.version}; bump it before a store release.`);
}
for (const url of ['ios.bundleIdentifier', 'android.package']) {
  const [group, key] = url.split('.');
  if (!app[group]?.[key]) errors.push(`app.json is missing expo.${url}.`);
}

// ── report ─────────────────────────────────────────────────────────────────
for (const w of warnings) console.warn(`  warn  ${w}`);
for (const e of errors) console.error(`  ERROR ${e}`);

if (errors.length) {
  console.error(`\n${errors.length} error(s), ${warnings.length} warning(s). Fix the errors before building.`);
  process.exit(1);
}
console.log(
  warnings.length
    ? `\nNo blocking errors, ${warnings.length} warning(s) above — confirm each is intentional.`
    : '\nRelease config looks good.',
);
