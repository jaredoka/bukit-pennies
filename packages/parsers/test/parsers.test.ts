import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseBankMessage, detectBank, MAX_TEXT_BYTES, UNVERIFIED_CONFIDENCE_CAP } from '../src/index.ts';
import type { ParsedTransaction } from '../src/index.ts';

interface GoldenExpectedTx extends Partial<Omit<ParsedTransaction, 'confidence' | 'fields'>> {
  confidenceAtLeast?: number;
  confidenceAtMost?: number;
}

interface GoldenCase {
  note?: string;
  input: string;
  sender?: string;
  receivedAt?: string;
  expected: {
    isTransactional: boolean;
    tx: GoldenExpectedTx | null;
  };
}

const GOLDEN_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'golden');
const GOLDEN_DIRS = ['baiduri', 'bibd', 'scb', 'generic', 'negative'] as const;

for (const dir of GOLDEN_DIRS) {
  describe(`golden/${dir}`, () => {
    const files = readdirSync(join(GOLDEN_ROOT, dir)).filter((f) => f.endsWith('.json'));

    it('has at least one fixture', () => {
      expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
      const goldenCase = JSON.parse(
        readFileSync(join(GOLDEN_ROOT, dir, file), 'utf8'),
      ) as GoldenCase;

      it(file, () => {
        const result = parseBankMessage(goldenCase.input, {
          senderHint: goldenCase.sender,
          receivedAt: goldenCase.receivedAt,
        });

        expect(result.isTransactional).toBe(goldenCase.expected.isTransactional);

        if (goldenCase.expected.tx === null) {
          expect(result.tx).toBeNull();
          return;
        }

        expect(result.tx).not.toBeNull();
        const tx = result.tx!;
        const { confidenceAtLeast, confidenceAtMost, ...fieldExpectations } = goldenCase.expected.tx;

        for (const [key, value] of Object.entries(fieldExpectations)) {
          expect(tx[key as keyof ParsedTransaction], key).toEqual(value);
        }
        if (confidenceAtLeast !== undefined) {
          expect(tx.confidence).toBeGreaterThanOrEqual(confidenceAtLeast);
        }
        if (confidenceAtMost !== undefined) {
          expect(tx.confidence).toBeLessThanOrEqual(confidenceAtMost);
        }

        // Invariant: anything not parsed by a verified bank format must stay
        // under the needs_review threshold. (Verified formats' own fallback
        // paths are still capped by the generic parser itself.)
        const VERIFIED_BANKS = ['baiduri', 'bibd'];
        if (!VERIFIED_BANKS.includes(tx.bank)) {
          expect(tx.confidence).toBeLessThanOrEqual(UNVERIFIED_CONFIDENCE_CAP);
        }
      });
    }
  });
}

describe('parseBankMessage edge cases', () => {
  it('rejects empty and whitespace-only input', () => {
    expect(parseBankMessage('')).toEqual({ tx: null, isTransactional: false });
    expect(parseBankMessage('   \n ')).toEqual({ tx: null, isTransactional: false });
  });

  it('rejects oversized non-transactional noise without throwing', () => {
    const noise = 'lorem ipsum '.repeat(400);
    expect(parseBankMessage(noise).isTransactional).toBe(false);
  });

  it('refuses input over MAX_TEXT_BYTES, matching the server gate', () => {
    // A message that parses cleanly at normal size...
    const real =
      'Card No.: 4x0213 Amount: BND 21.00 Merchant: GALORIES SMOOTHIES BSB BN Date: 10-07-2026 17:37:59';
    expect(parseBankMessage(real).tx).not.toBeNull();

    // ...is refused once padding pushes it past the limit, because the ingest
    // function would answer 422 text_too_large rather than parse it.
    const padded = `${real} ${'x'.repeat(MAX_TEXT_BYTES)}`;
    expect(parseBankMessage(padded)).toEqual({ tx: null, isTransactional: false });

    // The gate is on BYTES, not characters: multi-byte input must not slip
    // past a naive length check.
    const multibyte = '€'.repeat(MAX_TEXT_BYTES / 2); // 3 bytes each
    expect(multibyte.length).toBeLessThan(MAX_TEXT_BYTES);
    expect(parseBankMessage(multibyte)).toEqual({ tx: null, isTransactional: false });
  });

  it('stays fast on input crafted to maximise fingerprint backtracking', () => {
    // The bank fingerprints are multi-wildcard patterns: text carrying many
    // label anchors and no terminator costs superlinear time (~46 ms at 4 KB,
    // 2.8 s at 16 KB unguarded). The size gate is what bounds it — without it
    // this input would take minutes. See HANDOFF §23 (SEC-7).
    const adversarial = `Card No.: ${'Amount: Merchant: '.repeat(4000)}`;
    const started = Date.now();
    expect(parseBankMessage(adversarial)).toEqual({ tx: null, isTransactional: false });
    expect(Date.now() - started).toBeLessThan(250);
  });
});

describe('detectBank', () => {
  it('prefers the sender hint over body fingerprints', () => {
    expect(detectBank('You have spent BND21.00 at X on 10/07/26', 'Baiduri')).toBe('baiduri');
  });

  it('falls back to the Baiduri body fingerprint without a sender', () => {
    expect(
      detectBank('Card No.: 4x0213 Amount: BND 21.00 Merchant: X Date: 10-07-2026'),
    ).toBe('baiduri');
  });

  it('returns unknown for unrecognized text', () => {
    expect(detectBank('BND 5.00 at SOMEWHERE')).toBe('unknown');
  });
});
