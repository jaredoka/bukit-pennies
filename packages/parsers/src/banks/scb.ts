import type { BankParser, ParsedTransaction, ParseOptions } from '../types.ts';
import { generic } from './generic.ts';
import { UNVERIFIED_CONFIDENCE_CAP } from '../confidence.ts';

// UNVERIFIED SKELETON — no real Standard Chartered (Brunei) sample collected yet.
// TODO(sample-needed): replace the guessed fingerprint/extraction with
// label-anchored regexes once a real SCB message lands in the review inbox,
// add golden fixtures under test/golden/scb/, then remove the confidence cap.
// Guessed shape: "BND 21.00 spent on your card ending 0213 at MERCHANT on 10/07/26"
const FINGERPRINT = /standard\s*chartered|\bstanchart\b|\bSCB\b/i;

export const scb: BankParser = {
  id: 'scb',

  matches(text: string): boolean {
    return FINGERPRINT.test(text);
  },

  parse(text: string, opts?: ParseOptions): ParsedTransaction | null {
    const tx = generic.parse(text, opts);
    if (!tx) return null;
    return {
      ...tx,
      bank: 'scb',
      // Unverified format: never allow auto-accept until real samples exist.
      confidence: Math.min(tx.confidence, UNVERIFIED_CONFIDENCE_CAP),
    };
  },
};
