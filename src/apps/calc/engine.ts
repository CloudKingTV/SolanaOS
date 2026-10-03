// Calculator state machine modeled on the classic desktop calculator's
// "immediate execution" behavior (no operator precedence).

export type Op = '+' | '-' | '*' | '/';

export interface CalcState {
  display: string;
  acc: number | null;
  op: Op | null;
  /** True when the next digit starts a new number. */
  fresh: boolean;
  memory: number;
  error: boolean;
  lastOp: { op: Op; operand: number } | null;
}

export const initialCalc: CalcState = {
  display: '0',
  acc: null,
  op: null,
  fresh: true,
  memory: 0,
  error: false,
  lastOp: null,
};

export function format(n: number): string {
  if (!Number.isFinite(n)) return 'Cannot divide by zero.';
  const s = Number.parseFloat(n.toPrecision(15)).toString();
  if (s.length <= 32) return s;
  return n.toExponential(10);
}

function apply(a: number, op: Op, b: number): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return a / b;
  }
}

const value = (s: CalcState) => Number.parseFloat(s.display);

export type CalcKey =
  | { t: 'digit'; d: string }
  | { t: 'dot' }
  | { t: 'op'; op: Op }
  | { t: 'equals' }
  | { t: 'clear' }
  | { t: 'clearEntry' }
  | { t: 'back' }
  | { t: 'negate' }
  | { t: 'sqrt' }
  | { t: 'percent' }
  | { t: 'inverse' }
  | { t: 'mc' }
  | { t: 'mr' }
  | { t: 'ms' }
  | { t: 'mplus' }
  | { t: 'set'; value: number };

export function press(s: CalcState, k: CalcKey): CalcState {
  if (s.error && k.t !== 'clear' && k.t !== 'clearEntry') return s;
  switch (k.t) {
    case 'digit': {
      if (s.fresh) return { ...s, display: k.d, fresh: false };
      if (s.display.replace(/[-.]/g, '').length >= 16) return s;
      return { ...s, display: s.display === '0' ? k.d : s.display + k.d };
    }
    case 'dot':
      if (s.fresh) return { ...s, display: '0.', fresh: false };
      return s.display.includes('.') ? s : { ...s, display: `${s.display}.` };
    case 'op': {
      if (s.op && s.acc !== null && !s.fresh) {
        const r = apply(s.acc, s.op, value(s));
        if (!Number.isFinite(r)) return { ...initialCalc, memory: s.memory, display: format(r), error: true };
        return { ...s, acc: r, display: format(r), op: k.op, fresh: true };
      }
      return { ...s, acc: value(s), op: k.op, fresh: true };
    }
    case 'equals': {
      let r: number;
      let lastOp = s.lastOp;
      if (s.op && s.acc !== null) {
        const operand = value(s);
        r = apply(s.acc, s.op, operand);
        lastOp = { op: s.op, operand };
      } else if (s.lastOp) {
        // Repeated "=" re-applies the last operation.
        r = apply(value(s), s.lastOp.op, s.lastOp.operand);
      } else {
        return { ...s, fresh: true };
      }
      if (!Number.isFinite(r)) return { ...initialCalc, memory: s.memory, display: format(r), error: true };
      return { ...s, display: format(r), acc: null, op: null, fresh: true, lastOp };
    }
    case 'clear':
      return { ...initialCalc, memory: s.memory };
    case 'clearEntry':
      return s.error ? { ...initialCalc, memory: s.memory } : { ...s, display: '0', fresh: true };
    case 'back':
      if (s.fresh) return s;
      return { ...s, display: s.display.length > 1 && s.display !== '-0' ? s.display.slice(0, -1).replace(/^-$/, '0') : '0' };
    case 'negate':
      if (s.display === '0') return s;
      return { ...s, display: s.display.startsWith('-') ? s.display.slice(1) : `-${s.display}` };
    case 'sqrt': {
      const v = value(s);
      if (v < 0) return { ...initialCalc, memory: s.memory, display: 'Invalid input for function.', error: true };
      return { ...s, display: format(Math.sqrt(v)), fresh: true };
    }
    case 'percent': {
      const base = s.acc ?? 0;
      return { ...s, display: format((base * value(s)) / 100), fresh: true };
    }
    case 'inverse': {
      const v = value(s);
      if (v === 0) return { ...initialCalc, memory: s.memory, display: 'Cannot divide by zero.', error: true };
      return { ...s, display: format(1 / v), fresh: true };
    }
    case 'mc':
      return { ...s, memory: 0 };
    case 'mr':
      return { ...s, display: format(s.memory), fresh: true };
    case 'ms':
      return { ...s, memory: value(s), fresh: true };
    case 'mplus':
      return { ...s, memory: s.memory + value(s), fresh: true };
    case 'set':
      return { ...s, display: format(k.value), fresh: true };
  }
}
