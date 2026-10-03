import { describe, expect, it } from 'vitest';
import { createStakeInstructions, deactivateInstruction, stakeAddressFor, stakeStatus, toStakeAccount, withdrawInstruction, STAKE_PROGRAM } from './stake';

const OWNER = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const VOTE = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const u32 = (d: { buffer: ArrayBufferLike; byteOffset: number }) => new DataView(d.buffer, d.byteOffset).getUint32(0, true);

describe('staking instructions', () => {
  it('creates a seeded account, initializes it and delegates', async () => {
    const { stake, ixs } = await createStakeInstructions(OWNER, VOTE, 2_000_000_000n, 'solanaos-test');
    expect(stake).toBe(await stakeAddressFor(OWNER, 'solanaos-test'));
    expect(ixs.map((i) => i.programAddress)).toEqual(['11111111111111111111111111111111', STAKE_PROGRAM, STAKE_PROGRAM]);
    expect(u32(ixs[0].data!)).toBe(3); // CreateAccountWithSeed
    expect(ixs[0].accounts![1].address).toBe(stake);
    expect(u32(ixs[1].data!)).toBe(0); // Initialize
    expect(u32(ixs[2].data!)).toBe(2); // DelegateStake
    expect(ixs[2].accounts![1].address).toBe(VOTE);
  });

  it('deactivates and withdraws back to the owner', () => {
    expect(u32(deactivateInstruction(OWNER, VOTE).data!)).toBe(5);
    const w = withdrawInstruction(OWNER, VOTE, 123n);
    expect(u32(w.data!)).toBe(4);
    expect(w.accounts![1].address).toBe(OWNER);
  });

  it('derives status from epochs', () => {
    const a = toStakeAccount({
      pubkey: 'S',
      account: {
        lamports: 3e9,
        data: { parsed: { type: 'delegated', info: { meta: { rentExemptReserve: '2282880' }, stake: { delegation: { voter: VOTE, stake: '2997717120', activationEpoch: '100', deactivationEpoch: '18446744073709551615' } } } } },
      },
    });
    expect(a.deactivationEpoch).toBeNull();
    expect(stakeStatus(a, 100)).toBe('activating');
    expect(stakeStatus(a, 101)).toBe('active');
    expect(stakeStatus({ ...a, deactivationEpoch: 105 }, 105)).toBe('deactivating');
    expect(stakeStatus({ ...a, deactivationEpoch: 105 }, 106)).toBe('inactive');
  });
});
