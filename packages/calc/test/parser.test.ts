import { describe, it, expect } from 'vitest';
import { parseIraqiNumber, normalizeDigits } from '../src/parser';

describe('Deterministic Iraqi Number & Currency Parser (parseIraqiNumber)', () => {
  it('parses basic unit words (واحد = 1)', () => {
    expect(parseIraqiNumber('واحد')).toBe(1);
  });

  it('parses tens in different grammatical forms (عشرين = 20, عشرون = 20)', () => {
    expect(parseIraqiNumber('عشرين')).toBe(20);
    expect(parseIraqiNumber('عشرون')).toBe(20);
  });

  it('parses thousands with dialect words (مية الف = 100000, خمسين الف = 50000)', () => {
    expect(parseIraqiNumber('مية الف')).toBe(100000);
    expect(parseIraqiNumber('خمسين الف')).toBe(50000);
  });

  it('parses mixed digits with Arabic thousand words (100 الف = 100000)', () => {
    expect(parseIraqiNumber('100 الف')).toBe(100000);
  });

  it('parses Arabic-Indic digits with thousands (١٠٠ ألف = 100000)', () => {
    expect(parseIraqiNumber('١٠٠ ألف')).toBe(100000);
  });

  it('parses pure digits (250000 = 250000)', () => {
    expect(parseIraqiNumber('250000')).toBe(250000);
  });

  it('parses fractional million expressions (مليون ونص = 1500000)', () => {
    expect(parseIraqiNumber('مليون ونص')).toBe(1500000);
  });

  it('parses compound millions with thousands (مليون وميتين الف = 1200000)', () => {
    expect(parseIraqiNumber('مليون وميتين الف')).toBe(1200000);
  });

  it('ensures plain words with a leading و that are not numbers are not altered or erroneously parsed', () => {
    // Normalization should never corrupt or strip non-numeric words starting with "و"
    expect(normalizeDigits('وصل')).toBe('وصل');
    expect(normalizeDigits('وين')).toBe('وين');

    // Text containing no number must return the contract-defined failure value (null)
    expect(parseIraqiNumber('وصل')).toBeNull();
    expect(parseIraqiNumber('وين')).toBeNull();
    expect(parseIraqiNumber('وصلني السعر')).toBeNull();
    expect(parseIraqiNumber('وين المحل')).toBeNull();
  });

  it('returns contract-defined failure value (null) when text contains no number', () => {
    expect(parseIraqiNumber('')).toBeNull();
    expect(parseIraqiNumber('   ')).toBeNull();
    expect(parseIraqiNumber('مرحبا شلونكم')).toBeNull();
    expect(parseIraqiNumber('اريد استفسر عن الهواتف')).toBeNull();
    expect(parseIraqiNumber('كفر شفاف وشاحن')).toBeNull();
  });
});
