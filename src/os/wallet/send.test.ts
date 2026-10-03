import { describe, expect, it } from 'vitest';
import { solTransfer, tokenTransfer, recipientTokenAccount } from './send';
import { TOKEN_PROGRAM, type ParsedTokenAccount } from '../solana/rpc';

const FROM = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const TO = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('send instructions', () => {
  it('encodes a system transfer', () => {
    const [ix] = solTransfer(FROM, TO, 1_500_000_000n);
    const view = new DataView(ix.data!.buffer, ix.data!.byteOffset);
    expect(view.getUint32(0, true)).toBe(2); // Transfer
    expect(view.getBigUint64(4, true)).toBe(1_500_000_000n);
    expect(ix.accounts!.map((a) => a.address)).toEqual([FROM, TO]);
  });

  it('sends tokens to the recipient ATA, creating it when asked', async () => {
    const source: ParsedTokenAccount = {
      pubkey: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
      mint: USDC,
      owner: FROM,
      programId: TOKEN_PROGRAM,
      amount: '5000000',
      decimals: 6,
      uiAmount: 5,
      isNative: false,
      state: 'initialized',
      lamports: 2_039_280,
    };
    const ata = await recipientTokenAccount(TO, USDC, TOKEN_PROGRAM);
    const withCreate = await tokenTransfer(FROM, source, TO, 2_000_000n, true);
    expect(withCreate).toHaveLength(2);
    expect(withCreate[0].data![0]).toBe(1); // CreateIdempotent
    const xfer = withCreate[1];
    expect(xfer.data![0]).toBe(12); // TransferChecked
    expect(xfer.data![9]).toBe(6); // decimals
    expect(xfer.accounts![2].address).toBe(ata);
    expect(await tokenTransfer(FROM, source, TO, 1n, false)).toHaveLength(1);
  });
});
