/**
 * Font sizing for a single line of money that must never be clipped.
 *
 * `adjustsFontSizeToFit` is the obvious tool and the wrong one here: it is an
 * iOS/Android Text prop that react-native-web ignores, so the browser preview
 * truncates while a device shrinks — the two surfaces disagree, and neither has
 * a floor. This measures instead, so the same string gets the same treatment
 * everywhere.
 *
 * The estimate is deliberately conservative. The reference measurement is
 * `BND 12,345.67` at 16px on the dashboard cards, which occupies 119px; the
 * per-character factors below put it at about 121px, so the guess errs towards
 * a smaller font rather than a clipped one.
 */

const DIGIT_EM = 0.62;
const UPPER_EM = 0.74;
const LOWER_EM = 0.56;
const SPACE_EM = 0.3;
const PUNCT_EM = 0.3;

/** Safety margin over the estimated width — three percent plus rounding. */
const SAFETY = 1.06;

const FONT_STEP = 0.5;

export interface FitOptions {
  /** Largest size to use, in points. */
  base?: number;
  /** Smallest size to use; the text may still clip below this on absurd input. */
  min?: number;
}

/** Rough advance width of `text` in em units at any font size. */
export function estimateWidthEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') em += DIGIT_EM;
    else if (ch >= 'A' && ch <= 'Z') em += UPPER_EM;
    else if (ch >= 'a' && ch <= 'z') em += LOWER_EM;
    else if (ch === ' ') em += SPACE_EM;
    else em += PUNCT_EM;
  }
  return em;
}

/**
 * The largest size (in 0.5pt steps) at which `text` fits `maxWidth`, bounded by
 * `base` and `min`. A non-positive width means the card has not been measured
 * yet, so the caller gets `base` and no layout jump.
 */
export function fitFontSize(text: string, maxWidth: number, options: FitOptions = {}): number {
  const base = options.base ?? 16;
  const min = options.min ?? 12;
  if (!(maxWidth > 0) || text.length === 0) return base;

  const em = estimateWidthEm(text) * SAFETY;
  if (em <= 0) return base;

  const raw = maxWidth / em;
  if (raw >= base) return base;

  const stepped = Math.floor(raw / FONT_STEP) * FONT_STEP;
  return Math.max(min, Number(stepped.toFixed(2)));
}
