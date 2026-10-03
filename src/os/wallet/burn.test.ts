import { describe, expect, it } from 'vitest';
import { BATCH_SIZE, burnBatches, burnInstructions, planBurn } from './burn';
import { NATIVE_MINT, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, type ParsedTokenAccount } from '../solana/rpc';

const OWNER = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const OTHER = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
let n = 0;
const acct = (p: Partial<ParsedTokenAccount>): ParsedTokenAccount => ({
  pubkey: ['7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV', 'GrDMoeqMLFjeXQ24H56S1RLgT4R76jsuWCd6SvXyGPQ5', '5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG', 'HXtBm8XZbxaTt41uqaKhwUAa6Z1aPyvJdsZVENiWsetg'][n++ % 4],
  mint: MINT,
  owner: OWNER,
  programId: TOKEN_PROGRAM,
  amount: '0',
  decimals: 6,
  uiAmount: 0,
  isNative: false,
  state: 'initialized',
  lamports: 2_039_280,
  ...p,
});

describe('burn planning', () => {
  it('reclaims rent from empty accounts without burning', () => {
    const plan = planBurn([acct({}), acct({})], OWNER);
    expect(plan.accounts).toHaveLength(2);
    expect(plan.burns).toHaveLength(0);
    expect(plan.reclaimLamports).toBe(4_078_560);
  });

  it('skips frozen and foreign accounts', () => {
    const plan = planBurn([acct({ state: 'frozen' }), acct({ owner: OTHER }), acct({})], OWNER);
    expect(plan.accounts).toHaveLength(1);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['Frozen by the token issuer', 'Not owned by this wallet']);
  });

  it('never burns wrapped SOL, only closes it', () => {
    const wsol = acct({ mint: NATIVE_MINT, isNative: true, amount: '500000000', lamports: 502_039_280 });
    const plan = planBurn([wsol], OWNER);
    expect(plan.burns).toHaveLength(0);
    const ixs = burnInstructions(wsol, OWNER);
    expect(ixs).toHaveLength(1);
    expect(ixs[0].data![0]).toBe(9); // CloseAccount
  });

  it('burns the full balance, then closes, using the account program', () => {
    const a = acct({ amount: '1234567', programId: TOKEN_2022_PROGRAM });
    const [burn, close] = burnInstructions(a, OWNER);
    expect(burn.programAddress).toBe(TOKEN_2022_PROGRAM);
    expect(burn.data![0]).toBe(8); // Burn
    expect(new DataView(burn.data!.buffer, burn.data!.byteOffset).getBigUint64(1, true)).toBe(1234567n);
    expect(close.data![0]).toBe(9);
    expect(close.accounts![1].address).toBe(OWNER); // rent goes back to the owner
  });

  it('batches accounts into transactions', () => {
    const accounts = Array.from({ length: BATCH_SIZE * 2 + 1 }, () => acct({}));
    expect(burnBatches(planBurn(accounts, OWNER), OWNER).map((b) => b.length)).toEqual([BATCH_SIZE, BATCH_SIZE, 1]);
  });
});
