import type { BankParser, FieldName, FieldStatus, ParsedTransaction, ParseOptions } from '../types.ts';
import { extractLast4, normalizeCurrency, normalizeMerchant, parseAmount } from '../normalize.ts';
import { buildBruneiIso } from '../dates.ts';
import { scoreConfidence } from '../confidence.ts';

// Designed from a real Baiduri SMS:
// "Card No.: 4x0213 Amount: BND 21.00 Merchant: GALORIES SMOOTHIES BSB BN
//  Date: 10-07-2026 17:37:59 If suspicious, please call 2449666."
// Label-anchored; merchant is terminated by the next label so names containing
// spaces/digits are safe. Date is DD-MM-YYYY (Brunei day-first).
const CARD = /Card\s*No\.?\s*:\s*([0-9Xx*]+)/i;
const AMOUNT = /Amount\s*:\s*([A-Z]{3})\s*([\d,]+(?:\.\d{1,2})?)/i;
const MERCH = /Merchant\s*:\s*(.+?)\s*(?=Date\s*:)/is;
const DATE = /Date\s*:\s*(\d{1,2})-(\d{1,2})-(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i;
const FINGERPRINT = /Card\s*No\.?\s*:.*Amount\s*:.*Merchant\s*:.*Date\s*:/is;

export const baiduri: BankParser = {
  id: 'baiduri',

  matches(text: string): boolean {
    return FINGERPRINT.test(text);
  },

  parse(text: string, opts?: ParseOptions): ParsedTransaction | null {
    const fields: Record<FieldName, FieldStatus> = {
      amount: 'missing', date: 'missing', merchant: 'missing', card: 'missing',
    };

    const amountMatch = AMOUNT.exec(text);
    const amount = amountMatch ? parseAmount(amountMatch[2]!) : null;
    const currency = amountMatch ? normalizeCurrency(amountMatch[1]!) : 'BND';
    if (amount !== null) fields.amount = 'exact';

    const merchMatch = MERCH.exec(text);
    const merchant = merchMatch ? merchMatch[1]!.replace(/\s+/g, ' ').trim() : null;
    if (merchant) fields.merchant = 'exact';

    const cardMatch = CARD.exec(text);
    const cardLast4 = cardMatch ? extractLast4(cardMatch[1]!) : null;
    if (cardLast4) fields.card = 'exact';

    let occurredAt: string | null = null;
    const dateMatch = DATE.exec(text);
    if (dateMatch) {
      occurredAt = buildBruneiIso(
        Number(dateMatch[3]), Number(dateMatch[2]), Number(dateMatch[1]),
        Number(dateMatch[4] ?? 0), Number(dateMatch[5] ?? 0), Number(dateMatch[6] ?? 0),
      );
      if (occurredAt) fields.date = 'exact';
    }
    if (!occurredAt && opts?.receivedAt) {
      occurredAt = opts.receivedAt;
      fields.date = 'heuristic';
    }

    if (amount === null && !merchant) return null;

    return {
      bank: 'baiduri',
      amount,
      currency,
      merchant,
      merchantNormalized: merchant ? normalizeMerchant(merchant) : null,
      occurredAt,
      cardLast4,
      confidence: scoreConfidence(fields),
      fields,
    };
  },
};
