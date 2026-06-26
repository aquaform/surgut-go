import { describe, it, expect } from 'vitest';
import { parseRussianPrice } from './price';

describe('parseRussianPrice', () => {
  it('"5500 - 8800" → minRub 5500, maxRub 8800, isFree false', () => {
    const p = parseRussianPrice('5500 - 8800');
    expect(p.minRub).toBe(5500);
    expect(p.maxRub).toBe(8800);
    expect(p.isFree).toBe(false);
  });

  it('"3500-7500" (no spaces around dash) → 3500 / 7500', () => {
    const p = parseRussianPrice('3500-7500');
    expect(p.minRub).toBe(3500);
    expect(p.maxRub).toBe(7500);
    expect(p.isFree).toBe(false);
  });

  it('"900" → minRub 900, maxRub null, displayText "от 900 ₽"', () => {
    const p = parseRussianPrice('900');
    expect(p.minRub).toBe(900);
    expect(p.maxRub).toBeNull();
    expect(p.displayText).toBe('от 900 ₽');
  });

  it('"300 руб." → minRub 300, maxRub null', () => {
    const p = parseRussianPrice('300 руб.');
    expect(p.minRub).toBe(300);
    expect(p.maxRub).toBeNull();
  });

  it('"33 000 ₽" → minRub 33000 (spaces inside number stripped)', () => {
    const p = parseRussianPrice('33 000 ₽');
    expect(p.minRub).toBe(33000);
    expect(p.maxRub).toBeNull();
  });

  it('"бесплатно" → isFree true, displayText "Бесплатно"', () => {
    const p = parseRussianPrice('бесплатно');
    expect(p.isFree).toBe(true);
    expect(p.displayText).toBe('Бесплатно');
  });

  it('"Вход свободный" → isFree true, displayText "Бесплатно"', () => {
    const p = parseRussianPrice('Вход свободный');
    expect(p.isFree).toBe(true);
    expect(p.displayText).toBe('Бесплатно');
  });

  it('"" (empty string) → minRub null, displayText "Цена не указана"', () => {
    const p = parseRussianPrice('');
    expect(p.minRub).toBeNull();
    expect(p.maxRub).toBeNull();
    expect(p.isFree).toBe(false);
    expect(p.displayText).toBe('Цена не указана');
  });

  it('string with no digits → minRub null, displayText "Цена не указана"', () => {
    const p = parseRussianPrice('цена не известна');
    expect(p.minRub).toBeNull();
    expect(p.displayText).toBe('Цена не указана');
  });

  it('never throws on any input', () => {
    expect(() => parseRussianPrice('!!!###')).not.toThrow();
    expect(() => parseRussianPrice('   ')).not.toThrow();
  });
});
