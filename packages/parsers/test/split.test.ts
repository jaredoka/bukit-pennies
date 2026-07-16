import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { splitBankMessages } from '../src/index.ts';

interface SplitCase {
  note?: string;
  input: string;
  expected: string[];
}

const SPLIT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden', 'split');

describe('golden/split', () => {
  const files = readdirSync(SPLIT_DIR).filter((f) => f.endsWith('.json'));

  it('has at least one fixture', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const splitCase = JSON.parse(readFileSync(join(SPLIT_DIR, file), 'utf8')) as SplitCase;
    it(file, () => {
      expect(splitBankMessages(splitCase.input)).toEqual(splitCase.expected);
    });
  }
});

describe('splitBankMessages edge cases', () => {
  it('returns [] for empty and whitespace-only input', () => {
    expect(splitBankMessages('')).toEqual([]);
    expect(splitBankMessages('  \n\n  ')).toEqual([]);
  });

  it('handles Windows line endings', () => {
    expect(splitBankMessages('first message\r\n\r\nsecond message')).toEqual([
      'first message',
      'second message',
    ]);
  });
});
