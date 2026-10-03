// Native staking: create a stake account (derived from the wallet with a seed, so no extra
// keypair is needed), delegate it, and later deactivate and withdraw.
import { address, createAddressWithSeed, createNoopSigner, type Instruction } from '@solana/kit';
import { getCreateAccountWithSeedInstruction } from '@solana-program/system';
import {
  STAKE_PROGRAM_ADDRESS,
  getDeactivateInstruction,
  getDelegateStakeInstruction,
  getInitializeInstruction,
  getWithdrawInstruction,
} from '@solana-program/stake';
import { rpc } from '../solana/rpc';

export const STAKE_PROGRAM = STAKE_PROGRAM_ADDRESS as string;
export const STAKE_ACCOUNT_SPACE = 200;
const DEFAULT_PUBKEY = '11111111111111111111111111111111';

export function newSeed(now = Date.now()): string {
  return `solanaos-${now.toString(36)}`;
}

export async function stakeAddressFor(owner: string, seed: string): Promise<string> {
  return createAddressWithSeed({ baseAddress: address(owner), programAddress: STAKE_PROGRAM_ADDRESS, seed });
}

/** Instructions to create, initialize and delegate a new stake account. */
export async function createStakeInstructions(owner: string, vote: string, lamports: bigint, seed: string): Promise<{ stake: string; ixs: Instruction[] }> {
  const signer = createNoopSigner(address(owner));
  const stake = await stakeAddressFor(owner, seed);
  const ixs: Instruction[] = [
    getCreateAccountWithSeedInstruction({
      payer: signer,
      newAccount: address(stake),
      baseAccount: signer,
      base: address(owner),
      seed,
      amount: lamports,
      space: STAKE_ACCOUNT_SPACE,
      programAddress: STAKE_PROGRAM_ADDRESS,
    }),
    getInitializeInstruction({
      stake: address(stake),
      arg0: { staker: address(owner), withdrawer: address(owner) },
      arg1: { unixTimestamp: 0, epoch: 0, custodian: address(DEFAULT_PUBKEY) },
    }),
    getDelegateStakeInstruction({ stake: address(stake), vote: address(vote), stakeAuthority: signer }),
  ];
  return { stake, ixs };
}

export function deactivateInstruction(owner: string, stake: string): Instruction {
  return getDeactivateInstruction({ stake: address(stake), stakeAuthority: createNoopSigner(address(owner)) });
}

export function withdrawInstruction(owner: string, stake: string, lamports: bigint): Instruction {
  return getWithdrawInstruction({
    stake: address(stake),
    recipient: address(owner),
    withdrawAuthority: createNoopSigner(address(owner)),
    args: lamports,
  });
}

export interface StakeAccount {
  address: string;
  lamports: number;
  rentReserve: number;
  voter: string | null;
  delegated: number;
  activationEpoch: number | null;
  deactivationEpoch: number | null;
  type: string;
}

export type StakeStatus = 'inactive' | 'activating' | 'active' | 'deactivating';

const U64_MAX = '18446744073709551615';

export function stakeStatus(a: StakeAccount, epoch: number): StakeStatus {
  if (a.voter === null || a.activationEpoch === null) return 'inactive';
  if (a.deactivationEpoch !== null) return a.deactivationEpoch >= epoch ? 'deactivating' : 'inactive';
  return a.activationEpoch >= epoch ? 'activating' : 'active';
}

interface ParsedStake {
  pubkey: string;
  account: {
    lamports: number;
    data: {
      parsed: {
        type: string;
        info: {
          meta: { rentExemptReserve: string };
          stake?: { delegation: { voter: string; stake: string; activationEpoch: string; deactivationEpoch: string } };
        };
      };
    };
  };
}

export function toStakeAccount(r: ParsedStake): StakeAccount {
  const info = r.account.data.parsed.info;
  const d = info.stake?.delegation;
  return {
    address: r.pubkey,
    lamports: r.account.lamports,
    rentReserve: Number(info.meta.rentExemptReserve),
    voter: d?.voter ?? null,
    delegated: d ? Number(d.stake) : 0,
    activationEpoch: d ? Number(d.activationEpoch) : null,
    deactivationEpoch: d && d.deactivationEpoch !== U64_MAX ? Number(d.deactivationEpoch) : null,
    type: r.account.data.parsed.type,
  };
}

/** Stake accounts whose withdraw authority is `owner` (byte offset 44 in the account). */
export async function getStakeAccounts(owner: string): Promise<StakeAccount[]> {
  const res = await rpc<ParsedStake[]>('getProgramAccounts', [
    STAKE_PROGRAM,
    { encoding: 'jsonParsed', filters: [{ dataSize: STAKE_ACCOUNT_SPACE }, { memcmp: { offset: 44, bytes: owner } }] },
  ]);
  return res.map(toStakeAccount).sort((a, b) => b.lamports - a.lamports);
}

export const getStakeMinimumDelegation = () => rpc<{ value: number }>('getStakeMinimumDelegation').then((r) => r.value);
export const getRentExemption = (space: number) => rpc<number>('getMinimumBalanceForRentExemption', [space]);
