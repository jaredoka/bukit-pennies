import { describe, expect, it } from 'vitest';
import { categorizeMerchant } from '../src/merchants.ts';

describe('categorizeMerchant', () => {
  it('maps every merchant seen in the golden fixtures', () => {
    expect(categorizeMerchant('GALORIES SMOOTHIES BSB BN')).toBe('Food & Drink');
    expect(categorizeMerchant('HUA HO DEPARTME')).toBe('Groceries'); // BIBD-truncated
    expect(categorizeMerchant('HUA HO MANGGIS')).toBe('Groceries');
    expect(categorizeMerchant('SUPA SAVE GADONG')).toBe('Groceries');
    expect(categorizeMerchant('SUPA SAVE MATA-MATA')).toBe('Groceries');
    expect(categorizeMerchant('KFC GADONG')).toBe('Food & Drink');
    expect(categorizeMerchant('PIZZA HUT KIULAP')).toBe('Food & Drink');
    expect(categorizeMerchant('KOPI HOUSE')).toBe('Food & Drink');
    expect(categorizeMerchant('THE COFFEE BEAN')).toBe('Food & Drink');
    expect(categorizeMerchant('TIMES CINEPLEX')).toBe('Entertainment');
    expect(categorizeMerchant('7 ELEVEN 123 SG')).toBe('Groceries');
  });

  it('maps well-known Brunei merchants beyond the fixtures', () => {
    expect(categorizeMerchant('SHELL SG HJ MANAP')).toBe('Transport');
    expect(categorizeMerchant('DST PAYMENT')).toBe('Bills');
    expect(categorizeMerchant('GUARDIAN KIULAP')).toBe('Health');
    expect(categorizeMerchant('SHOPEE SINGAPORE')).toBe('Shopping');
    expect(categorizeMerchant('NETFLIX.COM')).toBe('Entertainment');
  });

  it('requires word boundaries — no substring false positives', () => {
    expect(categorizeMerchant('STEAMBOAT PALACE')).toBeNull();
    expect(categorizeMerchant('GOLDSTONE JEWELLERY')).toBeNull();
  });

  it('returns null for unknown merchants and empty input', () => {
    expect(categorizeMerchant('ZYX TRADING')).toBeNull();
    expect(categorizeMerchant(null)).toBeNull();
    expect(categorizeMerchant('')).toBeNull();
  });
});
