/** All bank timestamps are Brunei local time (UTC+08:00, no DST). */
export const BRUNEI_OFFSET = '+08:00';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** Build an ISO string in Brunei time; returns null for impossible dates/times. */
export function buildBruneiIso(
  y: number, m: number, d: number,
  hh = 0, mm = 0, ss = 0,
): string | null {
  if (!isValidDate(y, m, d)) return null;
  if (hh > 23 || mm > 59 || ss > 59) return null;
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}${BRUNEI_OFFSET}`;
}

/** Two-digit years pivot into 2000–2099 (bank SMS never reference the 1900s). */
function expandYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/**
 * Multi-format date scan for the generic fallback. Day-first is assumed for
 * numeric forms (Brunei convention): dd-mm-yyyy, dd/mm/yy, d MMM yyyy, ISO.
 * Optional trailing time hh:mm(:ss) is captured for all forms.
 */
export function scanDate(text: string): string | null {
  const time = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;

  const iso = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (iso) {
    const r = buildBruneiIso(
      Number(iso[1]), Number(iso[2]), Number(iso[3]),
      Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0),
    );
    if (r) return r;
  }

  const dmyNum = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(text);
  if (dmyNum) {
    const y = expandYear(Number(dmyNum[3]));
    const t = time.exec(text.slice(dmyNum.index + dmyNum[0].length));
    const r = buildBruneiIso(
      y, Number(dmyNum[2]), Number(dmyNum[1]),
      t ? Number(t[1]) : 0, t ? Number(t[2]) : 0, t?.[3] ? Number(t[3]) : 0,
    );
    if (r) return r;
  }

  const dMmm = /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{2,4})/i.exec(text);
  if (dMmm) {
    const t = time.exec(text.slice(dMmm.index + dMmm[0].length));
    const r = buildBruneiIso(
      expandYear(Number(dMmm[3])), MONTHS[dMmm[2]!.toLowerCase()]!, Number(dMmm[1]),
      t ? Number(t[1]) : 0, t ? Number(t[2]) : 0, t?.[3] ? Number(t[3]) : 0,
    );
    if (r) return r;
  }

  return null;
}
