import { brand } from '@tel/config/brand';

const GROUPED = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Display-only formatter for IQD amounts ("89,000 د.ع").
 * No arithmetic happens here: every amount must come from adapter/calc data.
 */
export function formatIQD(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`formatIQD: invalid amount ${amount}`);
  }
  return `${GROUPED.format(Math.trunc(amount))} ${brand.currency.symbolAr}`;
}

/** Two-letter Arabic initials for avatars ("سارة محمد" -> "سم"). */
export function initialsAr(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const second = parts[1]?.charAt(0) ?? '';
  return `${first}${second}` || '؟';
}
