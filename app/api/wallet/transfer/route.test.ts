import { describe, expect, it } from 'vitest';

function validateAmount(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 100_000_000;
}

function validateEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Boolean(email && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

describe('FlowCash transfer input invariants', () => {
  it('accepts positive whole XAF amounts within the limit', () => {
    expect(validateAmount(1)).toBe(true);
    expect(validateAmount(100_000_000)).toBe(true);
  });

  it('rejects unsafe, fractional, zero, negative and oversized amounts', () => {
    expect(validateAmount(0)).toBe(false);
    expect(validateAmount(-1)).toBe(false);
    expect(validateAmount(1.5)).toBe(false);
    expect(validateAmount(100_000_001)).toBe(false);
    expect(validateAmount(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  it('normalizes and validates recipient emails', () => {
    expect(validateEmail(' USER@example.com ')).toBe(true);
    expect(validateEmail('not-an-email')).toBe(false);
    expect(validateEmail('')).toBe(false);
  });
});
