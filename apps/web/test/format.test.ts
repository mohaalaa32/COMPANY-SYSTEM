import { describe, expect, it } from 'vitest';
import { brand } from '@tel/config/brand';
import { formatIQD, initialsAr } from '../src/lib/format';

describe('format helpers', () => {
  it('formats IQD numbers correctly with commas and Iraqi Dinar symbol', () => {
    expect(formatIQD(1000)).toBe(`1,000 ${brand.currency.symbolAr}`);
    expect(formatIQD(1850000)).toBe(`1,850,000 ${brand.currency.symbolAr}`);
    expect(formatIQD(0)).toBe(`0 ${brand.currency.symbolAr}`);
  });

  it('truncates fractional IQD numbers safely', () => {
    expect(formatIQD(99000.75)).toBe(`99,000 ${brand.currency.symbolAr}`);
  });

  it('throws on non-finite amounts', () => {
    expect(() => formatIQD(NaN)).toThrow(RangeError);
    expect(() => formatIQD(Infinity)).toThrow(RangeError);
  });

  it('generates Arabic initials properly', () => {
    expect(initialsAr('سارة محمد')).toBe('سم');
    expect(initialsAr('علي كريم')).toBe('عك');
    expect(initialsAr('زينب أحمد')).toBe('زأ');
    expect(initialsAr('مصطفى')).toBe('م');
    expect(initialsAr('')).toBe('؟');
  });
});
