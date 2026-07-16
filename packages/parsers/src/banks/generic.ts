import type { BankParser, FieldName, FieldStatus, ParsedTransaction, ParseOptions } from '../types.ts';
import { normalizeCurrency, normalizeMerchant, parseAmount } from '../normalize.ts';
import { scanDate } from '../dates.ts';
import { scoreConfidence, UNVERIFIED_CONFIDENCE_CAP } from '../confidence.ts';

// Last-resort extractor for unknown senders/formats. Everything it produces is
// heuristic and its confidence is capped, so rows always land in needs_review.
const AMOUNT = /(BND|B\$|SGD|USD|MYR)\s*([\d,]+\.\d{2})/i;
// Merchant names in bank messages are upper-case, so the capture is restricted
// to caps/digits — trailing lowercase words ("approved", "on") never bleed in.
const MERCHANT_AFTER = /(?:\bat\s+|Merchant\s*:?\s*|@\s+)([A-Z0-9][A-Z0-9&.'\- ]{2,}?)(?=\s+on\b|\s+using\b|\s+via\b|\s*[.,;]|\s+\d{1,2}[/-]|$)/m;
const ALL_CAPS_RUN = /\b([A-Z][A-Z0-9&.'-]*(?:\s+[A-Z0-9&.'-]+)*)\b/g;
const CARD = /(?:card(?:\s+no\.?)?(?:\s+ending)?(?:\s+in)?\s*:?\s*|[Xx*]{2,})(\d{4})\b/i;

function longestAllCapsRun(text: string): string | null {
  let best: string | null = null;
  for (const m of text.matchAll(ALL_CAPS_RUN)) {
    const candidate = m[1]!.trim();
    if (candidate.length >= 3 && (!best || candidate.length > best.length)) best = candidate;
  }
  return best;
}

export const generic: BankParser = {
  id: 'unknown',

  matches(): boolean {
    return true;
  },

  parse(text: string, opts?: ParseOptions): ParsedTransaction | null {
    const amountMatch = AMOUNT.exec(text);
    // No recognizable amount → not a transaction we can use at all.
    if (!amountMatch) return null;

    const fields: Record<FieldName, FieldStatus> = {
      amount: 'heuristic', date: 'missing', merchant: 'missing', card: 'missing',
    };
    const amount = parseAmount(amountMatch[2]!);
    const currency = normalizeCurrency(amountMatch[1]!);

    const merchMatch = MERCHANT_AFTER.exec(text);
    let merchant = merchMatch ? merchMatch[1]!.replace(/\s+/g, ' ').trim() : null;
    if (!merchant) merchant = longestAllCapsRun(text.replace(AMOUNT, ' '));
    if (merchant) fields.merchant = 'heuristic';

    let occurredAt = scanDate(text);
    if (occurredAt) {
      fields.date = 'heuristic';
    } else if (opts?.receivedAt) {
      occurredAt = opts.receivedAt;
      fields.date = 'heuristic';
    }

    const cardMatch = CARD.exec(text);
    const cardLast4 = cardMatch ? cardMatch[1]! : null;
    if (cardLast4) fields.card = 'heuristic';

    return {
      bank: 'unknown',
      amount,
      currency,
      merchant,
      merchantNormalized: merchant ? normalizeMerchant(merchant) : null,
      occurredAt,
      cardLast4,
      confidence: Math.min(scoreConfidence(fields), UNVERIFIED_CONFIDENCE_CAP),
      fields,
    };
  },
};
