import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseBankMessage, detectBank, UNVERIFIED_CONFIDENCE_CAP } from '../src/index.ts';
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
