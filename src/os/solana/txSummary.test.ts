import { describe, expect, it } from 'vitest';
import { summarize } from './txSummary';
import type { ParsedTransaction, TokenBalance } from './rpc';

const ME = 'Me1111111111111111111111111111111111111111';
const YOU = 'You111111111111111111111111111111111111111';

function tx(opts: { keys: string[]; pre: number[]; post: number[]; fee?: number; err?: unknown; preTok?: TokenBalance[]; postTok?: TokenBalance[]; memo?: string }): ParsedTransaction {
  return {
    slot: 1,
    blockTime: 1,
    meta: {
      err: opts.err ?? null,
      fee: opts.fee ?? 5000,
      preBalances: opts.pre,
      postBalances: opts.post,
      preTokenBalances: opts.preTok ?? [],
      postTokenBalances: opts.postTok ?? [],
    },
    transaction: {
      signatures: ['x'],
      message: {
        accountKeys: opts.keys.map((pubkey, i) => ({ pubkey, signer: i === 0, writable: true })),
        instructions: opts.memo ? [{ programId: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', program: 'spl-memo', parsed: opts.memo }] : [],
        recentBlockhash: 'h',
      },
    },
  };
}

const tb = (owner: string, amount: string, i = 1): TokenBalance => ({ accountIndex: i, mint: 'MintA', owner, uiTokenAmount: { amount, decimals: 2, uiAmountString: '' } });

describe('transaction summaries', () => {
  it('describes received SOL', () => {
    const s = summarize(tx({ keys: [YOU, ME], pre: [5e9, 1e9], post: [4e9 - 5000, 2e9] }), ME);
    expect(s.direction).toBe('in');
    expect(s.subject).toBe('You received 1 SOL');
    expect(s.counterparty).toBe(YOU);
  });

  it('describes sent SOL without counting the fee', () => {
    const s = summarize(tx({ keys: [ME, YOU], pre: [5e9, 0], post: [4.5e9 - 5000, 0.5e9] }), ME);
    expect(s.direction).toBe('out');
    expect(s.subject).toBe('You sent 0.5 SOL');
    expect(s.counterparty).toBe(YOU);
  });

  it('describes received tokens with a label', () => {
    const s = summarize(
      tx({ keys: [YOU, ME], pre: [1e9, 1e9], post: [1e9 - 5000, 1e9], preTok: [tb(YOU, '1000', 2)], postTok: [tb(YOU, '750', 2), tb(ME, '250', 3)] }),
      ME,
      () => 'BONK',
    );
    expect(s.subject).toBe('You received 2.5 BONK');
    expect(s.counterparty).toBe(YOU);
  });

  it('shows memos and failures', () => {
    const s = summarize(tx({ keys: [ME], pre: [1e9], post: [1e9 - 5000], memo: 'hello there', err: { InstructionError: [0, 'Custom'] } }), ME);
    expect(s.failed).toBe(true);
    expect(s.subject).toBe('Failed: Message: hello there');
    expect(s.memo).toBe('hello there');
  });
});
