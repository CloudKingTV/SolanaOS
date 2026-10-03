import { describe, expect, it } from 'vitest';
import { initialCalc, press, type CalcKey, type CalcState } from './engine';
import { rentExemptLamports } from './Calculator';

function run(keys: string): CalcState {
  let s = initialCalc;
  for (const ch of keys.split(' ')) {
    let k: CalcKey;
    if (/^\d$/.test(ch)) k = { t: 'digit', d: ch };
    else if (ch === '.') k = { t: 'dot' };
    else if (ch === '=') k = { t: 'equals' };
    else if (ch === 'C') k = { t: 'clear' };
    else if (ch === 'sqrt') k = { t: 'sqrt' };
    else if (ch === '%') k = { t: 'percent' };
    else k = { t: 'op', op: ch as '+' };
    s = press(s, k);
  }
  return s;
}

describe('calculator', () => {
  it('evaluates left to right like the classic calculator', () => {
    expect(run('2 + 3 * 4 =').display).toBe('20');
  });
  it('repeats the last operation on repeated equals', () => {
    expect(run('5 + 2 = = =').display).toBe('11');
  });
  it('handles decimals without float noise', () => {
    expect(run('0 . 1 + 0 . 2 =').display).toBe('0.3');
  });
  it('reports division by zero', () => {
    const s = run('1 / 0 =');
    expect(s.error).toBe(true);
    expect(s.display).toBe('Cannot divide by zero.');
  });
  it('computes percentages of the accumulator', () => {
    expect(run('2 0 0 + 1 0 %').display).toBe('20');
  });
  it('computes rent-exempt minimums', () => {
    // A 165-byte SPL token account needs 0.00203928 SOL.
    expect(rentExemptLamports(165)).toBe(2_039_280);
    expect(rentExemptLamports(0)).toBe(890_880);
  });
});
