import { describe, expect, it } from 'vitest';
import { compileTransaction, createNoopSigner, address, appendTransactionMessageInstructions, createTransactionMessage, pipe, setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, getTransactionEncoder } from '@solana/kit';
import { MAX_MESSAGE_BYTES, MEMO_PROGRAM, messageBytes, messageInstructions, parseChatMessage, peerOf, unreadCount, type ChatMessage } from './messenger';
import type { ParsedInstruction, ParsedTransaction } from '../solana/rpc';

const ME = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const YOU = 'Vote111111111111111111111111111111111111111';
const OTHER = 'Stake11111111111111111111111111111111111111';

function tx(instructions: ParsedInstruction[], keys: string[], err: unknown = null): ParsedTransaction {
  return {
    slot: 1,
    blockTime: 1700000000,
    meta: { err, fee: 5000, preBalances: [], postBalances: [] },
    transaction: {
      signatures: ['s'],
      message: { accountKeys: keys.map((pubkey, i) => ({ pubkey, signer: i === 0, writable: true })), instructions, recentBlockhash: 'h' },
    },
  };
}
const memo = (text: string): ParsedInstruction => ({ programId: MEMO_PROGRAM, program: 'spl-memo', parsed: text });
const transfer = (source: string, destination: string): ParsedInstruction => ({
  programId: '11111111111111111111111111111111',
  program: 'system',
  parsed: { type: 'transfer', info: { source, destination, lamports: 0 } },
});

describe('SolMessenger', () => {
  it('builds a memo signed by the sender plus a 0-lamport transfer that fits in a transaction', () => {
    const ixs = messageInstructions(ME, YOU, 'gm ☀️');
    expect(ixs).toHaveLength(2);
    expect(ixs[0].programAddress).toBe(MEMO_PROGRAM);
    expect(new TextDecoder().decode(ixs[0].data as Uint8Array)).toBe('gm ☀️');
    expect(ixs[0].accounts?.[0].address).toBe(ME);
    expect(ixs[1].programAddress).toBe('11111111111111111111111111111111');
    // Transfer data: u32 index 2, u64 amount 0.
    expect(Array.from(ixs[1].data as Uint8Array)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    // The longest allowed message still compiles under the 1232-byte limit (plus one signature).
    const long = 'x'.repeat(MAX_MESSAGE_BYTES);
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(createNoopSigner(address(ME)), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: '11111111111111111111111111111111' as never, lastValidBlockHeight: 1n }, m),
      (m) => appendTransactionMessageInstructions(messageInstructions(ME, YOU, long), m),
    );
    const bytes = getTransactionEncoder().encode(compileTransaction(message));
    expect(bytes.length).toBeLessThanOrEqual(1232);
  });

  it('counts UTF-8 bytes, not characters', () => {
    expect(messageBytes('abc')).toBe(3);
    expect(messageBytes('é')).toBe(2);
  });

  it('parses sent and received messages', () => {
    const out = parseChatMessage(tx([memo('hello'), transfer(ME, YOU)], [ME, YOU]), 'sig1', ME);
    expect(out).toMatchObject({ from: ME, to: YOU, text: 'hello', nudge: false, time: 1700000000 });
    const inc = parseChatMessage(tx([memo('/nudge'), transfer(YOU, ME)], [YOU, ME]), 'sig2', ME);
    expect(inc).toMatchObject({ from: YOU, to: ME, nudge: true });
    expect(peerOf(inc!, ME)).toBe(YOU);
  });

  it('accepts a memo someone else paid for that mentions us, but not our own memos without a recipient', () => {
    expect(parseChatMessage(tx([memo('hi')], [YOU, ME]), 's', ME)).toMatchObject({ from: YOU, to: ME });
    expect(parseChatMessage(tx([memo('note')], [ME]), 's', ME)).toBeNull();
  });

  it('ignores failed transactions, transactions without memos, and unrelated transfers', () => {
    expect(parseChatMessage(tx([memo('x'), transfer(ME, YOU)], [ME, YOU], { InstructionError: [0, 'x'] }), 's', ME)).toBeNull();
    expect(parseChatMessage(tx([transfer(ME, YOU)], [ME, YOU]), 's', ME)).toBeNull();
    expect(parseChatMessage(tx([memo('x'), transfer(OTHER, YOU)], [ME, OTHER, YOU]), 's', ME)).toBeNull();
    expect(parseChatMessage(tx([memo('x'), transfer(ME, ME)], [ME]), 's', ME)).toBeNull();
  });

  it('counts unread messages from a peer after the read marker', () => {
    const m = (from: string, to: string, time: number): ChatMessage => ({ signature: `${from}${time}`, from, to, text: 't', time, nudge: false });
    const msgs = [m(YOU, ME, 10), m(ME, YOU, 11), m(YOU, ME, 12), m(OTHER, ME, 13)];
    expect(unreadCount(msgs, {}, ME, YOU)).toBe(2);
    expect(unreadCount(msgs, { [YOU]: 10 }, ME, YOU)).toBe(1);
  });
});
