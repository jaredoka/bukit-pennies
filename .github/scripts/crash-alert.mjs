/**
 * Crash alerts: Sentry issue -> Discord.
 *
 * Runs in the PUBLIC repo because the Sentry auth token is already a secret
 * there and GitHub-hosted minutes are free for public repositories. It reads
 * only the issue list (title, count, permalink); events, breadcrumbs and user
 * context stay in Sentry. Nothing about a crash is written back here.
 *
 * Dedupe uses a state file on the `automation-state` branch, pushed only when
 * a genuinely new issue appears. A 15-minute schedule with an overlap window
 * would double-ping after a delayed run; a persisted id set cannot.
 *
 * If the Discord webhook is not configured the script exits 0 without touching
 * the state, so alerts start from the moment it is added rather than replaying
 * history.
 */

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const TOKEN = process.env.SENTRY_AUTH_TOKEN?.trim() || '';
const API = (process.env.SENTRY_API_BASE?.trim() || 'https://us.sentry.io/api/0').replace(/\/+$/, '');
const ORG = process.env.SENTRY_ORG?.trim() || 'bukit-pennies';
const PROJECT = process.env.SENTRY_PROJECT?.trim() || 'mobile';
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL?.trim() || '';
const STATE_FILE = process.env.STATE_FILE?.trim() || 'state.json';
const TEST = process.env.TEST === '1';
const MAX_PER_RUN = 5;
const MAX_REMEMBERED = 500;

function env(name, value) {
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
}

function loadState() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return { issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [] };
  } catch {
    return { issues: [] };
  }
}

async function post(content) {
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Discord -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function main() {
  if (!WEBHOOK) {
    console.log('DISCORD_WEBHOOK_URL is not set; crash alerts are idle.');
    return;
  }

  if (TEST) {
    await post('Bukit Pennies crash alerts are wired up. This is a test message.');
    console.log('Sent a test message to Discord.');
    return;
  }

  if (!TOKEN) {
    console.log('SENTRY_AUTH_TOKEN is not set; crash alerts are idle.');
    return;
  }

  const query = encodeURIComponent('is:unresolved');
  const res = await fetch(`${API}/projects/${ORG}/${PROJECT}/issues/?query=${query}&sort=date&limit=50`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
      'User-Agent': 'bukit-pennies-crash-alerts',
    },
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    // A token without event:read cannot list issues. Say so once per run, in a
    // warning, rather than failing a scheduled job every 15 minutes.
    console.log(`::warning title=Crash alerts::Sentry issue list returned ${res.status}. ${body}`);
    return;
  }

  const issues = await res.json();
  const state = loadState();
  const seen = new Set(state.issues);
  const fresh = (Array.isArray(issues) ? issues : []).filter((issue) => !seen.has(String(issue.id)));

  if (fresh.length === 0) {
    console.log(`No new crash issues (${issues.length} unresolved, ${seen.size} remembered).`);
    return;
  }

  // Oldest first, so a burst reads in the order things broke.
  const ordered = fresh.slice().reverse();
  for (const issue of ordered.slice(0, MAX_PER_RUN)) {
    const count = issue.count ? ` — ${issue.count} event${issue.count === 1 ? '' : 's'}` : '';
    const line = `New crash in Bukit Pennies: **${issue.title}**${count}\n${issue.permalink}`;
    try {
      await post(line);
    } catch (err) {
      // Stop and keep the state unchanged: the next run retries cleanly.
      console.error(`Discord notification failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
      return;
    }
  }
  if (ordered.length > MAX_PER_RUN) {
    await post(`${ordered.length - MAX_PER_RUN} more new crash issues are waiting in Sentry.`);
  }

  const remembered = [...new Set([...fresh.map((issue) => String(issue.id)), ...state.issues])].slice(
    0,
    MAX_REMEMBERED,
  );
  writeFileSync(STATE_FILE, `${JSON.stringify({ issues: remembered }, null, 2)}\n`, 'utf8');
  env('STATE_CHANGED', '1');
  console.log(`Alerted on ${Math.min(fresh.length, MAX_PER_RUN)} new crash issue(s).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
